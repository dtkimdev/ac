#!/usr/bin/env node
// Claude usage collector for the Agent City top bar. Zero model calls, no network, no deps.
//   node bin/claude-usage.js        -> writes data/claude_usage.json (server.js runs it hourly)
// Sources, in priority order:
//  (a) REAL %: data/claude_ratelimit.json (written by bin/claude-run.sh / bin/claude-statusline.sh from Claude Code
//      rate-limit readings) if it is younger than 7 days.
//  (b) ESTIMATE: tokens from ~/.claude/projects/**/*.jsonl assistant messages on THIS box (read-only), deduped by
//      message id / requestId, since the weekly window start (resets_at - 7d when known, else rolling 7 days).
//      Per-file results are cached by mtime+size in data/claude_usage_cache.json so the hourly run is cheap.
// Output: {ts, source:'ratelimit'|'local-estimate', week_pct, resets_at, five_hour_pct, five_hour_resets_at,
//          ratelimit_ts, tokens_week:{in,out,cache_write,cache_read,total_billable}, note}
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const OUT = path.join(DATA, 'claude_usage.json');
const CACHE = path.join(DATA, 'claude_usage_cache.json');
const RL = path.join(DATA, 'claude_ratelimit.json');
const PROJ = path.join(os.homedir(), '.claude', 'projects');
const WEEK = 7 * 86400e3;

const tms = v => (v == null ? null : typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : (Date.parse(v) || null));
const pctOf = o => (o && typeof (o.used_pct ?? o.used_percentage ?? o.utilization) === 'number'
  ? (v => (v <= 1.5 && o.utilization != null ? v * 100 : v))(o.used_pct ?? o.used_percentage ?? o.utilization) : null);

function readRatelimit(now) {
  try {
    const st = fs.statSync(RL), j = JSON.parse(fs.readFileSync(RL, 'utf8'));
    const ts = tms(j.ts) || st.mtimeMs;
    if (now - ts > WEEK) return null;
    const sd = j.seven_day || {}, fh = j.five_hour || {};
    let reset = tms(sd.resets_at ?? sd.resetsAt);
    while (reset && reset < now) reset += WEEK; // window rolled over since the reading: keep the cadence
    const rolled = reset && tms(sd.resets_at ?? sd.resetsAt) < now;
    return { ts, week_pct: rolled ? null : pctOf(sd), resets_at: reset, five_hour_pct: tms(fh.resets_at ?? fh.resetsAt) > now ? pctOf(fh) : null,
      five_hour_resets_at: tms(fh.resets_at ?? fh.resetsAt), rolled };
  } catch { return null; }
}

function walk(dir, out) {
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

// per file: {key:'mtime:size', msgs:{id:[t,in,out,cw,cr]}} (only messages from the last 8 days are kept)
function scanFile(f, since) {
  const msgs = {};
  let txt; try { txt = fs.readFileSync(f, 'utf8'); } catch { return msgs; }
  for (const line of txt.split('\n')) {
    if (line.indexOf('"usage"') < 0 || line.indexOf('"assistant"') < 0) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (o.type !== 'assistant' || !o.message || !o.message.usage) continue;
    const t = Date.parse(o.timestamp); if (!(t >= since)) continue;
    const u = o.message.usage, id = o.message.id || o.requestId || o.uuid;
    const row = [t, u.input_tokens | 0, u.output_tokens | 0, u.cache_creation_input_tokens | 0, u.cache_read_input_tokens | 0];
    const prev = msgs[id];
    if (!prev || row[2] >= prev[2]) msgs[id] = row; // streamed chunks repeat the id; keep the most complete one
  }
  return msgs;
}

function estimate(now, start) {
  let cache = {}; try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch {}
  const keep = now - 8 * 86400e3, next = {}, all = new Map();
  for (const f of walk(PROJ, [])) {
    let st; try { st = fs.statSync(f); } catch { continue; }
    if (st.mtimeMs < keep) continue; // nothing in the window can be in an older file
    const key = st.mtimeMs + ':' + st.size;
    const c = cache[f] && cache[f].key === key ? cache[f] : { key, msgs: scanFile(f, keep) };
    next[f] = c;
    for (const id in c.msgs) { const r = c.msgs[id], p = all.get(id); if (!p || r[2] >= p[2]) all.set(id, r); }
  }
  try { fs.writeFileSync(CACHE + '.tmp', JSON.stringify(next)); fs.renameSync(CACHE + '.tmp', CACHE); } catch {}
  const tok = { in: 0, out: 0, cache_write: 0, cache_read: 0, total_billable: 0, messages: 0 };
  for (const r of all.values()) {
    if (r[0] < start) continue;
    tok.in += r[1]; tok.out += r[2]; tok.cache_write += r[3]; tok.cache_read += r[4]; tok.messages++;
  }
  tok.total_billable = tok.in + tok.out + tok.cache_write;
  return tok;
}

function run() {
  const now = Date.now(), rl = readRatelimit(now);
  const start = rl && rl.resets_at ? rl.resets_at - WEEK : now - WEEK;
  const tokens = estimate(now, start);
  const real = rl && rl.week_pct != null;
  const out = {
    ts: new Date(now).toISOString(),
    source: real ? 'ratelimit' : 'local-estimate',
    week_pct: real ? +rl.week_pct.toFixed(1) : null,
    resets_at: rl && rl.resets_at ? new Date(rl.resets_at).toISOString() : null,
    five_hour_pct: rl && rl.five_hour_pct != null ? +rl.five_hour_pct.toFixed(1) : null,
    five_hour_resets_at: rl && rl.five_hour_resets_at ? new Date(rl.five_hour_resets_at).toISOString() : null,
    ratelimit_ts: rl ? new Date(rl.ts).toISOString() : null,
    window_start: new Date(start).toISOString(),
    tokens_week: tokens,
    note: real
      ? 'Weekly % from the last Claude Code rate-limit reading (account-wide, incl. other machines as of that reading).'
      : 'Estimate from this box\'s ~/.claude/projects transcripts only; Claude Code on David\'s PC (DPro) is not visible from this box.',
  };
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(OUT + '.tmp', JSON.stringify(out, null, 1) + '\n'); fs.renameSync(OUT + '.tmp', OUT);
  return out;
}

module.exports = { run };
if (require.main === module) {
  try { const o = run(); console.log(`${o.source} week_pct=${o.week_pct} billable=${o.tokens_week.total_billable} msgs=${o.tokens_week.messages}`); }
  catch (e) { console.error('claude-usage:', e.message); process.exit(1); }
}
