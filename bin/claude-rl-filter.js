#!/usr/bin/env node
// Pass-through filter for `claude -p ... --output-format stream-json --verbose` (used by bin/claude-run.sh).
// Every line goes to stdout unchanged; the latest rate-limit reading (`rate_limit_event` / `rate_limit_info`) is
// normalised and merged into data/claude_ratelimit.json:
//   {ts, seven_day:{used_pct, resets_at}, five_hour:{used_pct, resets_at}, source:'stream'}
// Also usable as a module: normalize(info) / save(norm). No network, no model calls, no deps.
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'data', 'claude_ratelimit.json');

const iso = v => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  const t = Date.parse(v); return isFinite(t) ? new Date(t).toISOString() : null;
};
const pct = v => (typeof v === 'number' && isFinite(v) ? +(v <= 1.5 ? v * 100 : v).toFixed(1) : null);
const win = o => o && (pct(o.utilization ?? o.used_percentage ?? o.used_pct) != null)
  ? { used_pct: pct(o.utilization ?? o.used_percentage ?? o.used_pct), resets_at: iso(o.resetsAt ?? o.resets_at) } : null;

function normalize(info) {
  if (!info || typeof info !== 'object') return null;
  const out = {};
  const w = info.unifiedWindows || info.windows || info.rate_limits || {};
  for (const k of ['seven_day', 'five_hour']) { const v = win(w[k] || info[k]); if (v) out[k] = v; }
  // single-window form: {utilization, resetsAt, rateLimitType}
  const t = info.rateLimitType || info.rate_limit_type;
  if ((t === 'seven_day' || t === 'five_hour') && !out[t]) { const v = win(info); if (v) out[t] = v; }
  return Object.keys(out).length ? out : null;
}
function save(norm, source) {
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch {}
  const o = { ...prev, ...norm, ts: new Date().toISOString(), source: source || 'stream' };
  const tmp = OUT + '.tmp' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(o) + '\n'); fs.renameSync(tmp, OUT);
  return o;
}
module.exports = { normalize, save, OUT };

if (require.main === module) {
  let buf = '', latest = null;
  const take = line => {
    if (line.indexOf('rate_limit') < 0) return;
    try {
      const o = JSON.parse(line);
      const n = normalize(o.rate_limit_info || (o.type === 'rate_limit_event' ? o : null));
      if (n) latest = n;
    } catch {}
  };
  process.stdin.on('data', d => {
    process.stdout.write(d);
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) { take(buf.slice(0, i)); buf = buf.slice(i + 1); }
  });
  process.stdin.on('end', () => { if (buf) take(buf); if (latest) { try { save(latest, 'stream'); } catch {} } });
  process.stdout.on('error', () => {});
}
