#!/usr/bin/env node
// Agent City server: deterministic, read-only view of David's bots. No LLM calls, no npm deps.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const lib = require('./lib/city');

const ROOT = __dirname;
const PORT = +process.env.AGENT_CITY_PORT || 8787;
const HOST = process.env.AGENT_CITY_HOST || '0.0.0.0';
const PUB = path.join(ROOT, 'public');

// ---------- auth ----------
const auth = lib.ensureAuth(); // creates .secret/{auth.json,password.txt} on first run; never logs the password
const SESSION_MAX_S = 30 * 24 * 3600;

function sign(v) { return crypto.createHmac('sha256', auth.session_key).update(v).digest('base64url'); }
function makeSession(kind) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_S;
  const v = `${kind}.${exp}.${crypto.randomBytes(8).toString('hex')}`;
  return `${v}.${sign(v)}`;
}
function checkSession(tok) {
  if (!tok) return false;
  const i = tok.lastIndexOf('.');
  if (i < 0) return false;
  const v = tok.slice(0, i), s = tok.slice(i + 1);
  const good = sign(v);
  if (s.length !== good.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(good))) return false;
  const exp = +v.split('.')[1];
  return exp > Date.now() / 1000;
}
function cookies(req) {
  const out = {};
  for (const p of (req.headers.cookie || '').split(';')) {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  }
  return out;
}
function setSessionCookie(res, kind) {
  res.setHeader('Set-Cookie', `ac_session=${makeSession(kind)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_S}`);
}
function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// login rate limit (per IP, simple)
const fails = new Map();
function limited(ip) { const f = fails.get(ip); return f && f.n >= 8 && Date.now() - f.t < 10 * 60e3; }
function fail(ip) { const f = fails.get(ip) || { n: 0, t: 0 }; f.n++; f.t = Date.now(); fails.set(ip, f); }

// ---------- state ----------
let state = lib.buildAll();
let lastDiscovery = Date.now();
function log(...a) { console.log(new Date().toISOString(), ...a); }
log(`agent-city: ${state.bots.length} bots, ${state.bots.filter(b => b.status !== 'moved_out').length} present`);

setInterval(() => {
  try {
    if (Date.now() - lastDiscovery >= 5 * 60e3) { lib.discover(); lastDiscovery = Date.now(); }
    state.bots = lib.statusAll();
    state.now = Date.now();
    broadcast('status', { now: state.now, bots: state.bots, kpi: lib.kpi(state), interactions: interactions() });
  } catch (e) { log('status tick error', e.message); }
}, 5000);
setInterval(() => {
  try {
    state.usage = lib.usage(); state.portfolio = lib.portfolio();
    broadcast('usage', state.usage); broadcast('portfolio', state.portfolio); broadcast('claude', claudeUsage());
  } catch (e) { log('slow tick error', e.message); }
}, 60000);

// ---------- interactions feed (data/interactions.jsonl, appended by bin/interact.sh) ----------
// Read-only: the last 20 entries from the last 10 minutes. The file is re-read only when its mtime/size changes,
// and only its tail (64 KB) is parsed.
const IX_FILE = path.join(ROOT, 'data', 'interactions.jsonl');
let ixCache = { key: '', list: [] };
function interactions() {
  let st; try { st = fs.statSync(IX_FILE); } catch { return []; }
  const key = st.mtimeMs + ':' + st.size;
  if (key !== ixCache.key) {
    let list = [];
    try {
      const fd = fs.openSync(IX_FILE, 'r'), n = Math.min(st.size, 65536), buf = Buffer.alloc(n);
      fs.readSync(fd, buf, 0, n, st.size - n); fs.closeSync(fd);
      for (const line of buf.toString('utf8').split('\n')) {
        try {
          const o = JSON.parse(line), t = Date.parse(o.ts);
          if (!isFinite(t) || typeof o.from !== 'string' || typeof o.to !== 'string') continue;
          list.push({ ts: String(o.ts).slice(0, 40), t, from: o.from.slice(0, 40), to: o.to.slice(0, 40), ...(typeof o.note === 'string' && o.note ? { note: o.note.slice(0, 80) } : {}) });
        } catch {}
      }
    } catch {}
    ixCache = { key, list: list.sort((a, b) => a.t - b.t) };
  }
  const since = Date.now() - 10 * 60e3;
  return ixCache.list.filter(o => o.t >= since).slice(-20);
}

// ---------- Claude usage (data/claude_usage.json, written by bin/claude-usage.js: zero model calls) ----------
// Collector runs once at start and hourly as a detached child (non-blocking, errors swallowed); the file is
// re-read only when its mtime changes.
const CU_FILE = path.join(ROOT, 'data', 'claude_usage.json');
let cuCache = { m: 0, v: null };
function claudeUsage() {
  try { const st = fs.statSync(CU_FILE); if (st.mtimeMs !== cuCache.m) cuCache = { m: st.mtimeMs, v: JSON.parse(fs.readFileSync(CU_FILE, 'utf8')) }; } catch {}
  return cuCache.v;
}
function collectClaude() {
  try {
    const cp = require('child_process').spawn(process.execPath, [path.join(ROOT, 'bin', 'claude-usage.js')], { stdio: 'ignore', timeout: 120e3 });
    cp.on('error', () => {}); cp.unref();
  } catch {}
}
setTimeout(collectClaude, 3000); setInterval(collectClaude, 3600e3);
const fullState = () => ({ ...state, now: Date.now(), kpi: lib.kpi(state), interactions: interactions(), claude_usage: claudeUsage() });

// ---------- SSE ----------
const clients = new Set();
function sse(res, ev, data) { res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`); }
function broadcast(ev, data) { for (const c of clients) { try { sse(c, ev, data); } catch {} } }
setInterval(() => { for (const c of clients) { try { c.write(': ping\n\n'); } catch {} } }, 25000);

// ---------- http ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json' };
function send(res, code, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(body);
}
function serveFile(res, f) {
  fs.readFile(path.join(PUB, f), (err, buf) => {
    if (err) return send(res, 404, 'not found');
    send(res, 200, buf, MIME[path.extname(f)] || 'application/octet-stream', f.startsWith('office2d/assets/') ? { 'Cache-Control': 'private, max-age=3600' } : {});
  });
}
function readBody(req, cb) {
  let b = '';
  req.on('data', d => { b += d; if (b.length > 1e4) req.destroy(); });
  req.on('end', () => cb(new URLSearchParams(b)));
}

const LOCAL_VIEW_PORT = 8788;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  const ip = req.socket.remoteAddress;
  const c = cookies(req);
  let authed = checkSession(c.ac_session);
  // local viewer: 127.0.0.1:8788 is only reachable from this box itself (for the box desktop browser)
  if (req.socket.localPort === LOCAL_VIEW_PORT && req.socket.localAddress === '127.0.0.1') authed = true;

  // embed token: /embed?token=... sets an embed session cookie, then redirects to the clean URL
  if ((p === '/embed' || p === '/') && u.searchParams.get('token')) {
    if (safeEq(u.searchParams.get('token'), auth.embed_token)) {
      setSessionCookie(res, 'embed');
      u.searchParams.delete('token');
      if (p === '/embed') u.searchParams.set('embed', '1');
      const qs = u.searchParams.toString();
      res.writeHead(302, { Location: `/${qs ? '?' + qs : ''}`, 'Cache-Control': 'no-store' });
      return res.end();
    }
    fail(ip);
  }

  if (p === '/healthz') return send(res, 200, 'ok');
  if (p === '/login' && req.method === 'GET') return serveFile(res, 'login.html');
  if (p === '/login' && req.method === 'POST') {
    if (limited(ip)) return send(res, 429, 'Too many attempts; wait 10 minutes.');
    return readBody(req, f => {
      if (lib.verifyPassword(f.get('password') || '', auth)) {
        fails.delete(ip);
        setSessionCookie(res, 'user');
        const next = (f.get('next') || '/').startsWith('/') && !(f.get('next') || '').startsWith('//') ? f.get('next') : '/';
        res.writeHead(303, { Location: next || '/' }); return res.end();
      }
      fail(ip);
      res.writeHead(303, { Location: '/login?e=1' }); res.end();
    });
  }
  if (p === '/logout') {
    res.writeHead(303, { 'Set-Cookie': 'ac_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0', Location: '/login' });
    return res.end();
  }
  if (p === '/style.css' || p === '/favicon.svg') return serveFile(res, p.slice(1));

  if (!authed) {
    if (p.startsWith('/api/')) return send(res, 401, '{"error":"auth"}', 'application/json');
    res.writeHead(302, { Location: '/login?next=' + encodeURIComponent(req.url) }); return res.end();
  }

  if (p === '/' || p === '/index.html' || p === '/city') return serveFile(res, 'office2d/index.html');
  if (p === '/embed') { res.writeHead(302, { Location: '/?embed=1' }); return res.end(); }
  if (p === '/audio.js' || /^\/office2d\/[a-z0-9_.-]+\.js$/.test(p) || /^\/office2d\/assets\/[a-z0-9_-]+\.(webp|png|json)$/.test(p)) return serveFile(res, p.slice(1));
  if (p === '/api/state') { state.bots = lib.statusAll(); return send(res, 200, JSON.stringify(fullState()), 'application/json'); }
  if (p === '/api/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 5000\n\n');
    state.bots = lib.statusAll();
    sse(res, 'init', fullState());
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  send(res, 404, 'not found');
});

http.createServer((q, r) => server.emit('request', q, r)).listen(LOCAL_VIEW_PORT, '127.0.0.1');

// ---------- public view-only listener (127.0.0.1:8789, exposed only via bin/public.sh tunnel) ----------
// GET-only allowlist: viewer pages, static assets, /api/state, /api/stream. No login, no sign-out, nothing else (404).
const PUBLIC_PORT = +process.env.AGENT_CITY_PUBLIC_PORT || 8789;
const PUBLIC_MAX_SSE = 40;
let publicSse = 0;
function servePublicPage(res, f) {
  fs.readFile(path.join(PUB, f), 'utf8', (err, html) => {
    if (err) return send(res, 404, 'not found');
    html = html.replace(/<a class="m" href="\/logout">sign out<\/a>/g, '');
    send(res, 200, html, MIME['.html'], { 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' });
  });
}
// Pages site may POST here with the refresh token to force a state.json publish (max once per hour).
const PAGES_REFRESH_MIN = 3600;
const PAGES_REFRESH_TOKEN_FILE = path.join(ROOT, '.secret', 'pages-refresh-token');
const PAGES_LAST_PUSH = path.join(ROOT, 'logs', 'pages-lastpush');
const PAGES_REFRESH_LOCK = path.join(ROOT, 'logs', 'pages-refresh.lock');
let pagesRefreshRunning = false;
function pagesRefreshToken() {
  try { return fs.readFileSync(PAGES_REFRESH_TOKEN_FILE, 'utf8').trim(); } catch { return ''; }
}
function pagesCors(req) {
  const o = req.headers.origin || '';
  const ok = !o || o === 'https://dtkimdev.github.io' || o === 'http://127.0.0.1:8788' || o === 'http://127.0.0.1:8789';
  return {
    'Access-Control-Allow-Origin': ok ? (o || 'https://dtkimdev.github.io') : 'https://dtkimdev.github.io',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
function handlePagesRefresh(req, res) {
  const cors = pagesCors(req);
  if (req.method === 'OPTIONS') return send(res, 204, '', 'text/plain; charset=utf-8', cors);
  if (req.method !== 'POST') return send(res, 405, 'POST only', 'text/plain; charset=utf-8', { Allow: 'POST, OPTIONS', ...cors });
  const want = pagesRefreshToken();
  const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!want || !got || !safeEq(got, want)) return send(res, 401, JSON.stringify({ ok: false, error: 'bad token' }), 'application/json', cors);
  const now = Math.floor(Date.now() / 1000);
  let last = 0;
  try { last = parseInt(fs.readFileSync(PAGES_LAST_PUSH, 'utf8').trim(), 10) || 0; } catch {}
  const wait = PAGES_REFRESH_MIN - (now - last);
  if (wait > 0) {
    return send(res, 429, JSON.stringify({ ok: false, error: 'cooldown', wait_sec: wait, next_at: (last + PAGES_REFRESH_MIN) * 1000 }), 'application/json', cors);
  }
  if (pagesRefreshRunning) {
    return send(res, 409, JSON.stringify({ ok: false, error: 'busy' }), 'application/json', cors);
  }
  pagesRefreshRunning = true;
  try { fs.writeFileSync(PAGES_REFRESH_LOCK, String(now)); } catch {}
  const cp = require('child_process').spawn('bash', [path.join(ROOT, 'bin', 'pages.sh'), 'publish'], {
    cwd: ROOT, stdio: 'ignore', detached: true, env: process.env,
  });
  cp.on('exit', () => { pagesRefreshRunning = false; try { fs.unlinkSync(PAGES_REFRESH_LOCK); } catch {} });
  cp.on('error', () => { pagesRefreshRunning = false; try { fs.unlinkSync(PAGES_REFRESH_LOCK); } catch {} });
  cp.unref();
  return send(res, 202, JSON.stringify({ ok: true, publishing: true }), 'application/json', cors);
}

function publicHandler(req, res) {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  if (p === '/api/pages-refresh') return handlePagesRefresh(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'view only', 'text/plain; charset=utf-8', { Allow: 'GET' });
  if (p === '/healthz') return send(res, 200, 'ok');
  if (p === '/robots.txt') return send(res, 200, 'User-agent: *\nDisallow: /\n');
  if (p === '/' || p === '/index.html' || p === '/city') return servePublicPage(res, 'office2d/index.html');
  if (p === '/style.css' || p === '/favicon.svg') return serveFile(res, p.slice(1));
  if (p === '/audio.js' || /^\/office2d\/[a-z0-9_.-]+\.js$/.test(p) || /^\/office2d\/assets\/[a-z0-9_-]+\.(webp|png|json)$/.test(p)) return serveFile(res, p.slice(1));
  if (p === '/api/state') { state.bots = lib.statusAll(); return send(res, 200, JSON.stringify(fullState()), 'application/json'); }
  if (p === '/api/stream') {
    if (publicSse >= PUBLIC_MAX_SSE) return send(res, 503, 'busy');
    publicSse++;
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 5000\n\n');
    state.bots = lib.statusAll();
    sse(res, 'init', fullState());
    clients.add(res);
    req.on('close', () => { clients.delete(res); publicSse--; });
    return;
  }
  send(res, 404, 'not found');
}
http.createServer(publicHandler).listen(PUBLIC_PORT, '127.0.0.1', () => log(`agent-city public view-only on http://127.0.0.1:${PUBLIC_PORT}`));
server.listen(PORT, HOST, () => log(`agent-city listening on http://${HOST}:${PORT}`));
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { log('shutdown'); process.exit(0); });
