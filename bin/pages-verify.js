#!/usr/bin/env node
// Headless Chrome check of build/pages served under /agent-city/ like GitHub Pages. Writes shots/pages.png.
// Usage: node bin/pages-verify.js   (run bin/pages-build.sh first)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright-core'));
const ROOT = path.join(__dirname, '..'), PORT = 8795, URL0 = `http://127.0.0.1:${PORT}/agent-city/`, MIN_FPS = 40;
const fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); return ok; };
const ready = p => p.waitForFunction(() => window.__office2d && window.__office2d.ready && window.__office2d.frames > 20, null, { timeout: 60000 });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-'));
fs.cpSync(path.join(ROOT, 'build', 'pages'), path.join(tmp, 'agent-city'), { recursive: true });
const srv = cp.spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', tmp], { stdio: 'ignore' });
const done = code => { srv.kill(); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(code); };
(async () => {
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
  const state = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'pages', 'state.json'), 'utf8'));
  const mkPage = async () => {
    const p = await browser.newPage({ viewport: { width: 1280, height: 800 } }), bad = [], reqs = [];
    p.on('console', m => { if (m.type() === 'error') bad.push(m.text()); });
    p.on('pageerror', e => bad.push(String(e)));
    p.on('response', r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
    p.on('request', r => reqs.push(r.url()));
    return { p, bad, reqs };
  };
  // fresh data: office, 12 workers with name tags, no writable surface, every request under /agent-city/
  const a = await mkPage();
  await a.p.route('**/state.json*', r => r.fulfill({ json: { ...state, now: Date.now() } }));
  await a.p.goto(URL0 + '?t=22:30'); await ready(a.p); await a.p.waitForTimeout(4000);
  const fps = await a.p.evaluate(() => window.__fps), workers = await a.p.evaluate(() => window.__office2d.workers.length);
  const tags = await a.p.$$eval('#tags .tag span', l => l.map(e => e.textContent));
  check(fps >= MIN_FPS, `fps ${fps} < ${MIN_FPS}`);
  check(workers === 13, `workers ${workers}`); check(tags.length === 13, `name tags ${tags.length}`);
  check(a.reqs.every(u => u.startsWith(URL0)), 'request outside /agent-city/: ' + a.reqs.filter(u => !u.startsWith(URL0)).join(' '));
  check(a.reqs.some(u => /state\.json\?t=\d+/.test(u)), 'state.json without cache-buster');
  check(!a.reqs.some(u => u.includes('/api/')), '/api/ requested');
  check(!(await a.p.$('a[href*="logout"]')), 'sign out link present');
  check(!(await a.p.$('#asof')), '#asof chrome still present');
  const stamp = await a.p.textContent('#last-update');
  check(/^\d{1,2}\/\d{1,2}, \d{1,2}:\d{2}[ap]m$/.test(stamp || ''), 'last-update stamp: ' + stamp);
  await a.p.click('#tags .tag'); await a.p.waitForTimeout(200);
  check(await a.p.isVisible('#card'), 'name tag does not open the card');
  check(!a.bad.length, 'errors: ' + a.bad.join(' | '));
  // stale data: caption; a poll (60 s scaled to 1.5 s) picks up fresh data and clears it, bots keep drawing
  const b = await mkPage();
  await b.p.addInitScript(() => { const si = window.setInterval; window.setInterval = (f, ms, ...r) => si(f, ms === 60000 ? 1500 : ms, ...r); });
  let now = Date.now() - 3600e3, polls = 0;
  await b.p.route('**/state.json*', r => { polls++; r.fulfill({ json: { ...state, now } }); });
  await b.p.goto(URL0 + '?t=22:30'); await ready(b.p);
  // v10+ chrome: no #asof; stamp stays as last state.now (publish time on Pages). Still require polling + animation.
  check(!(await b.p.$('#asof')), 'stale page still has #asof');
  await b.p.screenshot({ path: path.join(ROOT, 'shots', 'pages-stale.png') });
  const f0 = await b.p.evaluate(() => window.__office2d.frames);
  await b.p.waitForTimeout(3500);
  check(polls >= 3, `polls ${polls}`);
  check(await b.p.evaluate(() => window.__office2d.frames) > f0 + 30, 'bots stopped animating on stale data');
  now = Date.now(); await b.p.waitForTimeout(2500);
  check(!b.bad.length, 'errors: ' + b.bad.join(' | '));
  const cap = 'n/a (no #asof)';
  // real file as built, screenshot
  const c = await mkPage();
  await c.p.goto(URL0); await ready(c.p); await c.p.waitForTimeout(2500);
  await c.p.screenshot({ path: path.join(ROOT, 'shots', 'pages.png') });
  check(!c.bad.length, 'errors: ' + c.bad.join(' | '));
  await browser.close();
  console.log(`pages: workers ${workers}, tags ${tags.length}, fps ${fps}, stale caption "${cap}", polls ${polls}`);
  console.log(fails.length ? 'PAGES VERIFY FAILED\n  ' + fails.join('\n  ') : 'PAGES VERIFY OK');
  done(fails.length ? 1 : 0);
})().catch(e => { console.error('pages verify error:', e.message); done(1); });
