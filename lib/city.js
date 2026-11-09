// Agent City data layer. Pure deterministic code; reads /home/box/agent-data read-only.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const AGENTS = process.env.AGENT_CITY_AGENTS || '/home/box/agent-data/agents';
const BOTS_MD = process.env.AGENT_CITY_BOTS_MD || '/workspace/david-stack/BOTS.md';
const DATA = path.join(ROOT, 'data');
const REG = path.join(DATA, 'bots.json');
const HB_DIR = path.join(DATA, 'heartbeats');
const SECRET = path.join(ROOT, '.secret');
const SNAPSHOTS = path.join(process.env.HOME || '/home/box', 'usage', 'snapshots.jsonl');
const SPLIT = path.join(DATA, 'usage_split.json');
const PORTFOLIO = path.join(DATA, 'portfolio.json');
const PORTFOLIO_DIR = '/workspace/david-stack/out';
const WORKING_S = 90;
const GONE_MS = 24 * 3600e3;
const BKK_OFF = 7 * 3600e3; // Asia/Bangkok has no DST

// ---------- districts ----------
const DISTRICTS = {
  0: 'Waterworks', 1: 'Castle Hill', 2: 'Bank Quarter & Observatory', 3: 'Post Office Docks',
  4: 'Lantern Film Lot', 5: 'Canal Darkrooms', 6: 'Pallet Yards', 7: 'Neon Garden Promenade',
  8: 'Library Stacks', 9: 'Watchtower Wall', 10: 'Stadium Fields', 12: 'Roundtable Teahouse',
};
const SPARE_DISTRICTS = ['Ferry Wharf', 'Windmill Ridge', 'Lighthouse Point', 'Tram Terminal Heights', 'Teahouse Terraces'];
const ALL_DISTRICTS = [...Object.values(DISTRICTS), ...SPARE_DISTRICTS];

// ---------- auth ----------
function ensureAuth() {
  fs.mkdirSync(SECRET, { recursive: true, mode: 0o700 });
  fs.chmodSync(SECRET, 0o700);
  const af = path.join(SECRET, 'auth.json');
  if (fs.existsSync(af)) { fs.chmodSync(af, 0o600); return JSON.parse(fs.readFileSync(af, 'utf8')); }
  const password = crypto.randomBytes(15).toString('base64url');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  const a = { algo: 'scrypt', N: 16384, r: 8, p: 1, salt, hash, session_key: crypto.randomBytes(32).toString('hex'),
    embed_token: crypto.randomBytes(24).toString('base64url'), created: new Date().toISOString() };
  fs.writeFileSync(path.join(SECRET, 'password.txt'), password + '\n', { mode: 0o600 });
  fs.writeFileSync(af, JSON.stringify(a, null, 1), { mode: 0o600 });
  return a;
}
function verifyPassword(pw, a) {
  if (!pw || pw.length > 200) return false;
  const h = crypto.scryptSync(pw, a.salt, 64, { N: a.N, r: a.r, p: a.p });
  const want = Buffer.from(a.hash, 'hex');
  return h.length === want.length && crypto.timingSafeEqual(h, want);
}

// ---------- helpers ----------
const readJSON = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const mtime = f => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };
function writeJSONAtomic(f, obj) {
  const t = f + '.tmp' + process.pid;
  fs.writeFileSync(t, JSON.stringify(obj, null, 1));
  fs.renameSync(t, f);
}
const seedOf = s => parseInt(crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 8), 16);

// BOTS.md registry: | # | alias | name | id | job |
function parseBotsMd() {
  const out = [];
  let txt = '';
  try { txt = fs.readFileSync(BOTS_MD, 'utf8'); } catch { return out; }
  for (const line of txt.split('\n')) {
    const c = line.split('|').map(s => s.trim());
    if (c.length < 6 || !/^\d+$/.test(c[1])) continue;
    const id = (c[4].match(/[0-9a-f]{8}-[0-9a-f-]{27}/) || [])[0];
    if (!id || /RETIRED|stale/i.test(c[3])) continue;
    out.push({ num: +c[1], name: c[3].replace(/\s*\(.*?\)\s*/g, '').trim(), id, job: c[5] });
  }
  return out;
}

// Schedules: automations/* files (cron or JSON with schedule/cron) + phrases in profile description.
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
function parseSchedules(text) {
  const rules = [];
  if (!text) return rules;
  let m;
  const reEvery = /every\s+(\d+)\s*(h|hr|hours?|m|min|minutes?)\b/gi;
  while ((m = reEvery.exec(text))) rules.push({ kind: 'every', ms: +m[1] * (/^m/i.test(m[2]) ? 60e3 : 3600e3), label: `every ${m[1]}${/^m/i.test(m[2]) ? 'm' : 'h'}` });
  const reDaily = /\bdaily\s+(?:at\s+)?(\d{1,2}):(\d{2})/gi;
  while ((m = reDaily.exec(text))) rules.push({ kind: 'daily', h: +m[1], mi: +m[2], label: `daily ${m[1]}:${m[2]}` });
  const reWeekly = /\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\.?\s+(?:at\s+)?(\d{1,2}):(\d{2})/gi;
  while ((m = reWeekly.exec(text))) rules.push({ kind: 'weekly', dow: DAYS.indexOf(m[1].toLowerCase()), h: +m[2], mi: +m[3], label: `${m[1][0].toUpperCase()}${m[1].slice(1, 3).toLowerCase()} ${m[2]}:${m[3]}` });
  const reCron = /(?:^|\s|")((?:[\d*\/,-]+\s+){4}[\d*\/,-]+)(?=\s|"|$)/gm;
  while ((m = reCron.exec(text))) { const c = parseCron(m[1]); if (c) rules.push(c); }
  return rules;
}
function parseCron(expr) {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) return null;
  const field = (s, lo, hi) => {
    const set = new Set();
    for (const part of s.split(',')) {
      const [r, st] = part.split('/');
      let a = lo, b = hi;
      if (r !== '*') { const [x, y] = r.split('-'); a = +x; b = y !== undefined ? +y : (st ? hi : +x); }
      if (isNaN(a) || isNaN(b)) return null;
      for (let i = a; i <= b; i += +(st || 1)) set.add(i);
    }
    return set;
  };
  const [mi, h, dom, mon, dow] = [field(f[0], 0, 59), field(f[1], 0, 23), field(f[2], 1, 31), field(f[3], 1, 12), field(f[4], 0, 7)];
  if (!mi || !h || !dom || !mon || !dow) return null;
  if (dow.has(7)) dow.add(0);
  return { kind: 'cron', mi, h, dom, mon, dow, domStar: f[2] === '*', dowStar: f[4] === '*', label: `cron ${expr.trim()}` };
}
function nextRun(rule, now) {
  const b = new Date(now + BKK_OFF); // UTC fields == Bangkok wall clock
  const wall = (d, h, mi) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, mi) - BKK_OFF;
  if (rule.kind === 'every') return nextEvery(rule.ms, now);
  if (rule.kind === 'daily') { let t = wall(b, rule.h, rule.mi); if (t <= now) t += 86400e3; return t; }
  if (rule.kind === 'weekly') {
    for (let i = 0; i <= 7; i++) { const d = new Date(b.getTime() + i * 86400e3); if (d.getUTCDay() !== rule.dow) continue; const t = wall(d, rule.h, rule.mi); if (t > now) return t; }
    return null;
  }
  if (rule.kind === 'cron') {
    let t = Math.ceil((now + 1) / 60e3) * 60e3;
    for (let i = 0; i < 60 * 24 * 8; i++, t += 60e3) {
      const d = new Date(t + BKK_OFF);
      if (!rule.mi.has(d.getUTCMinutes()) || !rule.h.has(d.getUTCHours()) || !rule.mon.has(d.getUTCMonth() + 1)) continue;
      const domOk = rule.dom.has(d.getUTCDate()), dowOk = rule.dow.has(d.getUTCDay());
      if (rule.domStar || rule.dowStar ? domOk && dowOk : domOk || dowOk) return t;
    }
  }
  return null;
}
// Fix 'every' alignment to Bangkok midnight for clean hour multiples.
function nextEvery(ms, now) { const base = -BKK_OFF; return base + Math.ceil((now - base + 1) / ms) * ms; }

function scheduleFor(dir, desc) {
  let text = '';
  const ad = path.join(dir, 'automations');
  try {
    for (const f of fs.readdirSync(ad)) {
      const p = path.join(ad, f);
      if (fs.statSync(p).isFile() && fs.statSync(p).size < 2e5) text += '\n' + fs.readFileSync(p, 'utf8');
    }
  } catch {}
  const rules = [...parseSchedules(text), ...parseSchedules(desc)];
  const seen = new Set();
  return rules.filter(r => !seen.has(r.label) && seen.add(r.label));
}

// ---------- registry / discovery ----------
let registry = null;
let regMtime = 0;
const profiles = new Map(); // id -> {dir, desc, rules}

function loadRegistry() {
  const m = mtime(REG);
  if (!registry || m !== regMtime) { registry = readJSON(REG, { version: 1, bots: [] }); regMtime = m; }
  return registry;
}
function saveRegistry() { writeJSONAtomic(REG, registry); regMtime = mtime(REG); }

function discover() {
  loadRegistry();
  const now = Date.now();
  const md = parseBotsMd();
  const mdById = new Map(md.map(b => [b.id, b]));
  const present = new Set();
  let dirs = [];
  try { dirs = fs.readdirSync(AGENTS, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch {}
  for (const id of dirs) {
    const dir = path.join(AGENTS, id);
    const prof = readJSON(path.join(dir, 'profile.json'), {}) || {};
    const live = String(prof.name || '').trim();
    const desc = String(prof.description || '');
    let num = null, name = null;
    const mm = live.match(/^(\d+)\.\s*(.+)$/);
    if (mm) { num = +mm[1]; name = mm[2].trim(); }
    else {
      const ref = mdById.get(id); const dm = desc.match(/^\s*bot(\d+)\b/i);
      num = ref ? ref.num : dm ? +dm[1] : null;
      name = ref ? ref.name : (desc.match(/^\s*bot\d+\s*\(([^)]+)\)/i) || [])[1] || live || id.slice(0, 8);
    }
    present.add(id);
    profiles.set(id, { dir, desc, rules: scheduleFor(dir, desc) });
    let b = registry.bots.find(x => x.id === id);
    if (!b) {
      b = { id, num, name, live_name: live, type: null, schedule: null, district: null, sprite_seed: seedOf(id), pinned: false, renamed: false, first_seen: now, last_seen: now, status: 'idle', new: true };
      registry.bots.push(b);
    }
    if (!b.renamed) b.name = name;
    b.num = b.num ?? num;
    b.live_name = live !== `${num}. ${name}` ? live : null;
    b.last_seen = now;
    b.schedule = profiles.get(id).rules.map(r => r.label).join(', ') || null;
  }
  // known-but-missing bots from BOTS.md (e.g. bot12 Notes) are residents who moved out
  for (const r of md) {
    if (present.has(r.id) || registry.bots.find(x => x.id === r.id)) continue;
    registry.bots.push({ id: r.id, num: r.num, name: r.name, live_name: null, type: null, schedule: null, district: null, sprite_seed: seedOf(r.id), pinned: false, renamed: false, first_seen: null, last_seen: null, status: 'moved_out' });
  }
  // districts: pinned > approved by number > first free spare
  const used = new Set(registry.bots.filter(b => b.district).map(b => b.district));
  for (const b of registry.bots.sort((a, z) => (a.num ?? 999) - (z.num ?? 999))) {
    if (b.district) continue;
    let d = DISTRICTS[b.num];
    if (!d || used.has(d)) d = SPARE_DISTRICTS.find(x => !used.has(x)) || `Outskirts ${used.size + 1}`;
    b.district = d; used.add(d);
  }
  for (const b of registry.bots) {
    if (!b.type) { const t = ['walker', 'walker', 'rider', 'flyer'][b.sprite_seed % 4]; b.type = b.num === 9 || b.num === 1 ? 'flyer' : t; }
    if (!present.has(b.id) && (!b.last_seen || now - b.last_seen > GONE_MS)) b.status = 'moved_out';
    else if (!present.has(b.id)) b.status = 'away';
    else if (b.status === 'moved_out' || b.status === 'away') b.status = 'idle';
    if (b.new && b.first_seen && now - b.first_seen > 3600e3) delete b.new;
  }
  saveRegistry();
  return registry;
}

function heartbeat(b) {
  const tries = [b.id, b.num != null ? `bot${b.num}` : null].filter(Boolean);
  for (const k of tries) {
    const f = path.join(HB_DIR, `${k}.json`);
    const h = readJSON(f);
    if (h) return { ...h, _mtime: mtime(f) };
  }
  return null;
}
const ts = v => (v == null || v === '' ? null : typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v) || null);

let split = null, splitM = 0;
function usageSplit() { const m = mtime(SPLIT); if (m !== splitM) { split = readJSON(SPLIT); splitM = m; histAppend(split); } return split; }
// ---------- per-bot usage history (zero-token; appended when usage_split.json changes) ----------
const HIST = path.join(DATA, 'usage_history.jsonl');
let hist = null;
function histLoad() {
  if (hist) return hist;
  try { hist = fs.readFileSync(HIST, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { hist = []; }
  return hist;
}
function histAppend(sp) {
  if (!sp || !Array.isArray(sp.bots) || !sp.ts) return;
  const h = histLoad(); if (h.some(e => e.ts === sp.ts)) return;
  const e = { ts: sp.ts, used_pct: sp.used_pct, reset: sp.reset, bots: {} };
  for (const b of sp.bots) if (b.id) e.bots[b.id] = +b.pct_of_pool || 0;
  h.push(e); h.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const cut = Date.now() - 31 * 864e5; hist = h.filter(x => Date.parse(x.ts) >= cut);
  try { fs.writeFileSync(HIST + '.tmp', hist.map(x => JSON.stringify(x)).join('\n') + '\n'); fs.renameSync(HIST + '.tmp', HIST); } catch {}
}
const bkkDay = t => Math.floor((t + 7 * 3600e3) / 864e5);
let u7Key = '', u7 = null;
function usage7d() {
  const h = histLoad(), today = bkkDay(Date.now()), key = h.length + ':' + today;
  if (key === u7Key) return u7;
  const first = h.length ? bkkDay(Date.parse(h[0].ts)) : null, out = {}, prev = {};
  let prevReset = null;
  for (const e of h) {
    const d = today - bkkDay(Date.parse(e.ts)), newWeek = prevReset != null && e.reset !== prevReset;
    for (const [id, v] of Object.entries(e.bots)) {
      const p = prev[id], inc = p == null ? 0 : (newWeek || v < p) ? v : v - p;
      prev[id] = v;
      if (d >= 0 && d < 7) { (out[id] ||= {})[d] = ((out[id] || {})[d] || 0) + inc; }
    }
    prevReset = e.reset;
  }
  const arr = id => Array.from({ length: 7 }, (_, i) => { const d = 6 - i; if (first == null || today - d < first) return null; const v = out[id] && out[id][d]; return v != null ? Math.round(v * 100) / 100 : (h.some(e => e.bots[id] != null) ? 0 : null); });
  u7 = { arr, since: h.length ? h[0].ts : null }; u7Key = key; return u7;
}

// name-tag counters refresh once an hour: the value from the plain file reads above is frozen per bot between refreshes (no AI, no extra polling)
const LA_EVERY = 3600e3, laCache = new Map();
function hourly(id, v, now) {
  const c = laCache.get(id);
  if (c && now - c.ts < LA_EVERY) return c.v;
  laCache.set(id, { v, ts: now }); return v;
}

function statusAll() {
  loadRegistry();
  const now = Date.now();
  const sp = usageSplit(), U7 = usage7d();
  return registry.bots.map(b => {
    const p = profiles.get(b.id);
    const o = { id: b.id, num: b.num, name: b.name, live_name: b.live_name, district: b.district, type: b.type, sprite_seed: b.sprite_seed,
      pinned: b.pinned, desk: b.desk ?? null, first_seen: b.first_seen, last_seen: b.last_seen, is_new: !!b.new, schedule: b.schedule, status: b.status,
      task: null, last_active: null, next_run: null, last_alert: null, usage_pct: null, usage_share: null, error: null, model: null, usage_7d: U7.arr(b.id), usage_since: U7.since };
    if (sp && Array.isArray(sp.bots)) {
      const e = sp.bots.find(x => x.id === b.id);
      if (e) { o.usage_pct = +e.pct_of_pool || 0; o.usage_share = sp.used_pct ? o.usage_pct / sp.used_pct : null; }
    }
    if (b.status === 'moved_out' || !p) return o;
    const wal = mtime(path.join(p.dir, 'store.db-wal')), db = mtime(path.join(p.dir, 'store.db'));
    const act = wal || db;
    let la = Math.max(wal, db) || null;
    let st = act && now - act < WORKING_S * 1000 ? 'working' : 'idle';
    const h = heartbeat(b);
    if (h) {
      o.task = h.task || null; o.model = h.model || null;
      o.last_alert = h.last_alert || null;
      o.tokens_in = h.tokens_in ?? null; o.tokens_out = h.tokens_out ?? null;
      const lr = ts(h.last_run), nr = ts(h.next_run);
      if (lr) la = Math.max(la || 0, lr);
      if (nr) o.next_run = nr;
      if (h.state === 'working' && now - h._mtime < 15 * 60e3) st = 'working';
      if (h.state === 'error') { st = 'error'; o.error = h.task || 'reported error'; }
      else if (lr && nr && nr > lr && now - lr > 2 * (nr - lr)) { st = 'error'; o.error = 'heartbeat stale'; }
    }
    if (!o.next_run && p.rules.length) {
      const ns = p.rules.map(r => nextRun(r, now)).filter(Boolean);
      if (ns.length) o.next_run = Math.min(...ns);
    }
    if (b.status === 'away') st = 'away';
    o.status = st;
    o.last_active = hourly(b.id, la, now);
    return o;
  });
}

// ---------- usage (port of ~/usage/burn.py build()) ----------
function usage() {
  const rows = [];
  try {
    for (const line of fs.readFileSync(SNAPSHOTS, 'utf8').split('\n')) {
      try { const r = JSON.parse(line); const t = ts(r.ts), rs = parseResetTs(r.reset); if (t && rs && isFinite(+r.used_pct)) rows.push([t, +r.used_pct, rs]); } catch {}
    }
  } catch {}
  const sp = usageSplit();
  if (sp && sp.ts && isFinite(+sp.used_pct) && sp.reset) { const t = ts(sp.ts); if (t && !rows.find(r => r[0] === t)) rows.push([t, +sp.used_pct, parseResetTs(sp.reset)]); }
  rows.sort((a, b) => a[0] - b[0]);
  if (!rows.length) return { available: false };
  let start = 0;
  for (let i = 1; i < rows.length; i++) if (rows[i][1] < rows[i - 1][1] - 0.05 || Math.abs(rows[i][2] - rows[i - 1][2]) > 3600e3) start = i;
  const cyc = rows.slice(start);
  const [nowTs, cur, reset] = cyc[cyc.length - 1];
  const target = nowTs - 24 * 3600e3;
  const older = cyc.slice(0, -1).filter(r => r[0] <= nowTs - 3600e3);
  let rate = null, span_h = null;
  if (older.length) {
    const ref = older.reduce((a, r) => Math.abs(r[0] - target) < Math.abs(a[0] - target) ? r : a);
    span_h = (nowTs - ref[0]) / 3600e3;
    rate = (cur - ref[1]) / span_h * 24; // pts/day
  }
  const elapsed_d = (nowTs - (reset - 7 * 86400e3)) / 86400e3;
  const toReset = Math.max(reset - nowTs, 0);
  let proj = null, empty_by = null;
  if (rate != null) {
    proj = cur + rate * toReset / 86400e3;
    if (rate > 0 && cur < 100) { const eta = nowTs + (100 - cur) / rate * 86400e3; if (eta < reset) empty_by = eta; }
  }
  return { available: true, ts: nowTs, used_pct: cur, reset, rate_per_day: rate, span_h, cycle_avg: elapsed_d > 0.04 ? cur / elapsed_d : null,
    projected_at_reset: proj, empty_by, level: cur < 60 ? 'green' : cur <= 85 ? 'amber' : 'red',
    bots: sp && Array.isArray(sp.bots) ? sp.bots.map(b => ({ id: b.id || null, name: b.name, pct_of_pool: +b.pct_of_pool || 0 })) : [] };
}
function parseResetTs(s) {
  if (!s) return null;
  const hasTz = /[zZ]|[+-]\d\d:?\d\d$/.test(String(s));
  return hasTz ? Date.parse(s) : Date.parse(String(s) + '+07:00'); // naive reset times are Bangkok-local
}

// ---------- portfolio ----------
function portfolio() {
  let p = readJSON(PORTFOLIO), source = 'data/portfolio.json';
  if (p && isFinite(+p.total)) {
    p = { ts: ts(p.ts), total: +p.total, day_change: +p.day_change || 0, day_change_pct: +p.day_change_pct || 0, history: Array.isArray(p.history) ? p.history.map(Number).filter(isFinite) : [] };
  } else {
    p = null;
    let files = [];
    try { files = fs.readdirSync(PORTFOLIO_DIR).filter(f => /^latest-portfolio-\d{4}-\d\d-\d\d\.json$/.test(f)).sort(); } catch {}
    if (files.length) {
      const all = files.map(f => readJSON(path.join(PORTFOLIO_DIR, f))).filter(Boolean);
      const d = all[all.length - 1];
      const pos = Array.isArray(d.positions) ? d.positions : [];
      const dc = pos.reduce((a, x) => a + ((+x.marketValue || 0) - (+x.prevValue || 0)), 0);
      const total = +d.netEquity || +d.totalValue || 0;
      source = files[files.length - 1];
      p = { ts: ts(d.at), total, day_change: dc, day_change_pct: total - dc ? dc / (total - dc) * 100 : 0, history: all.map(x => +x.netEquity || +x.totalValue).filter(isFinite) };
    }
  }
  if (!p) return { available: false };
  const age = p.ts ? Date.now() - p.ts : null;
  return { available: true, source, ...p, age_min: age != null ? Math.round(age / 60e3) : null, stale: age == null || age > 30 * 60e3 };
}

function kpi(s) {
  const bots = s.bots.filter(b => b.status !== 'moved_out' && b.status !== 'away');
  const working = bots.filter(b => b.status === 'working');
  const errors = bots.filter(b => b.status === 'error');
  const last = bots.filter(b => b.last_active).sort((a, b) => b.last_active - a.last_active)[0];
  const next = bots.filter(b => b.next_run).sort((a, b) => a.next_run - b.next_run)[0];
  return { working: working.length, total: bots.length, errors: errors.map(b => b.name),
    last_activity: last ? { at: last.last_active, name: last.name } : null,
    next_job: next ? { at: next.next_run, name: next.name, schedule: next.schedule } : null };
}

function buildAll() {
  fs.mkdirSync(HB_DIR, { recursive: true });
  discover();
  return { now: Date.now(), bots: statusAll(), usage: usage(), portfolio: portfolio(), districts: ALL_DISTRICTS };
}

module.exports = { ensureAuth, verifyPassword, discover, statusAll, usage, portfolio, kpi, buildAll, loadRegistry, saveRegistry,
  ALL_DISTRICTS, parseSchedules, parseCron, nextRun, nextEvery, REG, get registry() { return loadRegistry(); } };
