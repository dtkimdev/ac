#!/usr/bin/env node
// Headless Chrome check of the painted office (the only view since v7).
// Logs in on 8787, asserts no console errors, real bot names, one worker per live bot (window.__office2d.workers), fps,
// auth behaviour (8787 needs login, 8788 local view does not), optional screenshots.
// Usage: node bin/verify.js [--shots]   (env AGENT_CITY_URL, default http://127.0.0.1:8787)
'use strict';
const fs = require('fs'), path = require('path');
const { chromium } = require(path.join(__dirname, '..', '..', 'node_modules', 'playwright-core'));
const ROOT = path.join(__dirname, '..', '..');
const STAGE = true; // v10 copy of bin/verify.js: stage only (bin/v10-stage.sh)
const URL0 = process.env.AGENT_CITY_URL || `http://127.0.0.1:${STAGE ? 8797 : 8787}`;
const LOCAL = `http://127.0.0.1:${STAGE ? 8798 : 8788}`, PUBL = `http://127.0.0.1:${STAGE ? 8799 : 8789}`;
const pw = fs.readFileSync(path.join(ROOT, '.secret', 'password.txt'), 'utf8').trim();
const shots = process.argv.includes('--shots');
const MIN_FPS = 40; // office at 1280x800 (renders at display rate; adaptive quality steps down below 50 fps)
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); return ok; };
const ready = page => page.waitForFunction(() => window.__office2d && window.__office2d.ready && window.__office2d.frames > 20, null, { timeout: 60000 });
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));

  // --- 8787: login required, wrong password rejected ---
  await page.goto(URL0 + '/', { waitUntil: 'load' });
  check(page.url().includes('/login'), 'expected login redirect on 8787');
  await page.fill('#pw', 'definitely-wrong'); await page.click('button[type=submit]'); await page.waitForURL(/e=1/);
  errors.length = 0; // the failed login itself is expected
  await page.fill('#pw', pw); await page.click('button[type=submit]');
  await ready(page);
  const apiUnauth = (await fetch(URL0 + '/api/state')).status;
  const office = await page.evaluate(() => ({ ...window.__office2d }));
  const state = await page.evaluate(() => fetch('/api/state').then(r => r.json()));
  const HIDDEN = ['a80017dc-128b-4534-8cde-674d5b094b4f']; // display-only hidden bots (bot11 Notes, v8)
  const live = state.bots.filter(b => b.status !== 'moved_out' && !HIDDEN.includes(b.id));
  check(!live.some(b => b.name === 'Notes'), 'Notes (bot11) should be hidden');
  const names = await page.$$eval('#roster li', ls => ls.map(l => l.textContent));
  const tagTexts = await page.$$eval('#tags .tag span', ls => ls.map(l => l.textContent));
  const tagNames = tagTexts.map(t => t.split(' · ')[0]);
  // v6/v10: every label carries a last-active suffix (`Grok · 1d`, `2h`, `15m`, `now`, `—`; whole numbers only)
  check(tagTexts.length && tagTexts.every(t => / · (now|\d+m|\d+[hd]|—)( · \d+%)?$/.test(t)), 'labels without a last-active suffix: ' + tagTexts.join(','));
  const v6 = await page.evaluate(() => { const D = window.__office2d; return { fronts: [...document.images].length, corgi: D.corgi, glass: D.glassClip }; });
  check(v6.corgi && typeof v6.corgi.x === 'number' && v6.corgi.mode, 'corgi missing (window.__office2d.corgi)');
  check(v6.glass && v6.glass.panes >= 2 && v6.glass.masks.includes('fg'), 'city FX glass clip / fg mask missing');
  // v8 assets decoded (turn atlases, chair-less patches, Dashboards art, Ferris wheel) + the v7 ones that stayed
  const assets = await page.evaluate(() => window.__office2d.assets);
  for (const a of ['legs', 'corgi', 'turnBodies', 'turnHeads', 'nochair', 'dashLaptop', 'dashMug', 'dashFront']) check(assets[a] > 0, `asset not loaded: ${a}`);
  for (const f of ['kitchen.png', 'trees-mask.png']) check((await fetch(PUBL + '/office2d/assets/' + f)).status === 404, `${f} still served`);
  // v9: harbour boats instead of the Ferris wheel (the live build keeps its wheel until bin/v9-promote.sh)
  const harbour = await page.evaluate(() => window.__office2d.city ? window.__office2d.city() : null);
  if (harbour) {
    check(assets.boats > 0 && assets.boatsLit > 0, 'boat sheets not loaded');
    check(harbour.boatTypes >= 5 && harbour.boats >= 2, `boats: ${harbour.boats} on the water, ${harbour.boatTypes} types`);
    check((await fetch(PUBL + '/office2d/assets/ferris-wheel.png')).status === 404, 'ferris-wheel.png still served');
    const screens = await page.evaluate(() => [...new Set((window.__office2d.screens || []))]);
    check(screens.includes('portfolio') && screens.includes('nfl'), 'numbers desk screens: ' + screens.join(','));
  }
  // v10: no title/kpi chrome, 2 boss screens, wall monitors with real data only, both corgis, Grok pinned to row 1
  const v10 = await page.evaluate(() => { const D = window.__office2d; return { chrome: ['kpi', 'title', 'clock', 'asof'].filter(i => document.getElementById(i)), wall: D.wall, screens: D.screens, c2: D.corgi2, c2img: D.assets.corgi2, grok: D.workers.find(w => w.num === 1), tonks: D.workers.find(w => w.num === 2), row7: D.workers.filter(w => /w07/.test(w.sprite)).length, musicTitle: document.getElementById('music').title, music: document.getElementById('music').textContent }; });
  check(!v10.chrome.length, 'old chrome still in the DOM: ' + v10.chrome);
  check(v10.screens.includes('usage') && v10.screens.includes('router') && !v10.screens.includes('team'), 'boss screens: ' + v10.screens);
  check(v10.screens.filter(s => s === 'usage' || s === 'router').length === 2, 'Grok must have exactly 2 screens');
  check(v10.wall && 'grok' in v10.wall && 'claude' in v10.wall, 'wall monitors did not draw');
  check(v10.c2 && typeof v10.c2.x === 'number' && v10.c2img > 0, 'second corgi missing');
  check(v10.grok && /w01/.test(v10.grok.sprite), 'Grok not on sprite row 1: ' + (v10.grok && v10.grok.sprite));
  check(v10.tonks && /w07/.test(v10.tonks.sprite), '$tonks not on sprite row 7: ' + (v10.tonks && v10.tonks.sprite));
  check(v10.row7 === 1, 'sprite row 7 must be $tonks alone, on it: ' + v10.row7);
  check(/lofi/i.test(v10.musicTitle) && /off/.test(v10.music), 'music button: ' + v10.musicTitle + ' / ' + v10.music);
  const kpi = JSON.stringify(v10.wall);
  // v11
  const v11 = await page.evaluate(async () => { const D = window.__office2d, sp = n => (D.workers.find(w => w.name === n) || {}).sprite, L = await fetch('/office2d/assets/layout.json?v=20').then(r => r.json()), src = await fetch('/office2d/main.js').then(r => r.text()), time = await import('/office2d/time.js');
    const env = (h, m) => time.skyAt(h + m / 60), q = L.wall.map(w => w.q); return { media: sp('Media'), lf: sp('LF'), v: /V = '\?v=20'/.test(src), clock: D.clock, stamp: document.getElementById('last-update').textContent, stacked: q[1][0][1] > q[0][2][1] && q[1][0][0] === q[0][0][0], right: Math.max(q[0][1][0], q[1][1][0]), steam: L.steam.length }; });
  check(/w08/.test(v11.media) && /w03/.test(v11.lf), 'Media/LF not on the hatless rows: ' + v11.media + ' ' + v11.lf);
  check(v11.v, 'stage V is not ?v=20');
  check(/^\d{1,2}:\d{2}[ap]m$/.test(v11.clock || ''), 'left-wall clock: ' + v11.clock);
  check(/^\d{1,2}\/\d{1,2}, \d{1,2}:\d{2}[ap]m$/.test(v11.stamp), 'last-update stamp: ' + v11.stamp);
  check(v11.stacked && v11.right > 0.955 && v11.right <= 1, 'wall monitors not stacked on the right wall, past the window: ' + v11.right);
  check(v11.steam >= 4, 'steam spots: ' + v11.steam);
  // v11 follow-up: no sign panels in the FX, no fridge heart, clock top left with even margins, charts below the chrome, Archives hatless and alone on row 4
  const fu = await page.evaluate(async () => { const D = window.__office2d, L = await fetch('/office2d/assets/layout.json?v=20').then(r => r.json()), src = await fetch('/office2d/main.js').then(r => r.text()), ch = document.getElementById('refresh').getBoundingClientRect(), st = document.getElementById('last-update').getBoundingClientRect();
    const pink = (im, x, y, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(im, -x, -y); const a = g.getImageData(0, 0, w, h).data; let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i + 3] > 128 && a[i] > 150 && a[i] > a[i + 1] * 1.5 && a[i + 2] > a[i + 1]) n++; return n; };
    const load = u => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = u; }), [w4, f4, th] = await Promise.all(['w04.png', 'f04.png', 'turn-heads.webp'].map(f => load('/office2d/assets/' + f + '?v=20')));
    return { sign: (L.neon || []).filter(n => (n[2] - n[0]) * (n[3] - n[1]) > 0.0003).length, neon: (L.neon || []).length, heart: /lng\.heart|heartG/.test(src), clockBox: D.clockBox, clockY: +/const CK = \{ x: 3, y: (\d+)/.exec(src)[1], arch: (D.workers.find(w => w.name === 'Archives') || {}).sprite, row4: D.workers.filter(w => /w04/.test(w.sprite)).length, pink: [pink(w4, 0, 0, 137, 110), pink(f4, 0, 0, 137, 90), ...[0, 1, 2, 3, 4, 5].map(c => pink(th, c * 220, 232 * 4, 220, 150))], wallTop: Math.min(...L.wall.map(w => w.q[0][1])), wallBot: Math.max(...L.wall.map(w => w.q[2][1])), chrome: Math.max(ch.bottom, st.bottom), vh: innerHeight, vw: innerWidth }; });
  check(!fu.sign && fu.neon === 0, 'sign panels still in layout neon: ' + fu.sign + ' of ' + fu.neon);
  check(!fu.heart, 'fridge heart glow still in main.js');
  const cb = fu.clockBox; check(cb && Math.abs(cb.l - cb.r) <= 2 && Math.abs(cb.t - cb.b) <= 2, 'clock digits off centre: ' + JSON.stringify(cb));
  check(fu.clockY < 100, 'clock is not top left: y=' + fu.clockY);
  check(/w04/.test(fu.arch) && fu.row4 === 1, 'Archives must be alone on hatless row 4: ' + fu.arch + ' ' + fu.row4);
  check(fu.pink.every(n => n < 12), 'beret paint left on row 4 (w, f, yaws 0-5): ' + fu.pink);
  for (const h of [720, 800, 900, 1080]) check(fu.wallTop * h >= 46 + 20, `wall charts within 20px of the chrome at ${h}px high: top ${fu.wallTop}`); // the ↻ ends 46 CSS px down
  check(fu.wallTop * fu.vh >= fu.chrome + 20, `wall charts within 20px of the chrome: ${fu.wallTop * fu.vh} vs ${fu.chrome}`);
  console.log('v11 followup:', JSON.stringify(fu));
  // v11 follow-up 2: the boss desk is matte black on both plates, and the audio is music only
  const fu2 = await page.evaluate(async () => {
    const load = u => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = u; }), desk = {};
    for (const n of ['dusk', 'night']) { const im = await load(`/office2d/assets/plate-${n}-hi.webp?v=20`), read = (x, y, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(im, -x, -y); return g.getImageData(0, 0, w, h).data; };
      const stat = a => { let l = 0, c = 0, o = 0; const N = a.length / 4; for (let i = 0; i < a.length; i += 4) { l += (a[i] + a[i + 1] + a[i + 2]) / 3; c += Math.max(a[i], a[i + 1], a[i + 2]) - Math.min(a[i], a[i + 1], a[i + 2]); if (a[i] - a[i + 2] > 62) o++; } return { lum: +(l / N).toFixed(1), chroma: +(c / N).toFixed(1), orange: +(o / N).toFixed(3) }; };
      desk[n] = { top: stat(read(1650, 1800, 160, 50)), slab: stat(read(1460, 1864, 340, 12)), slabR: stat(read(2030, 1864, 150, 12)), legL: stat(read(1442, 1900, 16, 120)), legR: stat(read(2172, 1900, 16, 120)) }; }
    const au = await fetch('/audio.js').then(r => r.text()), idx = await fetch('/').then(r => r.text()), looped = []; const st = AudioBufferSourceNode.prototype.start; AudioBufferSourceNode.prototype.start = function (...a) { if (this.loop) looped.push(this.buffer.duration); return st.apply(this, a); };
    const b = await window.AC.music._render(4); AudioBufferSourceNode.prototype.start = st; const d = b.getChannelData(0); let pk = 0; for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
    return { desk, beds: (au.match(/\bambient\b|\brain\b|RAIN|crackle|\bdust\b|\bbed\(|\.loop = true|\bbrown\b/g) || []).length, title: /rain/i.test(idx), looped: looped.length, peak: +pk.toFixed(3) }; });
  for (const n of ['dusk', 'night']) for (const [k, v] of Object.entries(fu2.desk[n])) check(v.lum < 48 && v.chroma < 16 && v.orange < 0.02, `boss desk not matte black: ${n} ${k} ${JSON.stringify(v)}`);
  check(!fu2.beds && !fu2.title && !fu2.looped, `audio beds remain: ${fu2.beds} refs, ${fu2.looped} looped sources, title ${fu2.title}`);
  check(fu2.peak > 0.05, 'music render is silent: peak ' + fu2.peak);
  console.log('v11 followup2:', JSON.stringify(fu2));
  // v11 follow-up 3: the lit panels are off the facades on both plates, at full and at lo res, and nothing in the FX brings them back
  const fu3 = await page.evaluate(async () => {
    const load = u => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = u; }), BOX = [[496, 984, 68, 116], [1072, 958, 54, 60], [3014, 542, 82, 126], [3398, 184, 65, 66]], out = {}, L = await fetch('/office2d/assets/layout.json?v=20').then(r => r.json());
    for (const f of ['dusk-hi', 'night-hi', 'dusk', 'night']) { const im = await load(`/office2d/assets/plate-${f}.webp?v=20`), s = im.naturalWidth / 3840; out[f] = BOX.map(([x, y, w, h]) => { const W = Math.round(w * s), H = Math.round(h * s), c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.drawImage(im, -Math.round(x * s), -Math.round(y * s)); const a = g.getImageData(0, 0, W, H).data; let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] > 130 && a[i + 2] > 100 && a[i] > a[i + 1] * 1.6 && a[i + 2] > a[i + 1] * 1.25) n++; return +(n / (W * H)).toFixed(4); }); }
    const inBox = l => BOX.some(([x, y, w, h]) => l[0] * 3840 > x && l[0] * 3840 < x + w && l[1] * 2160 > y && l[1] * 2160 < y + h);
    return { pink: out, lights: L.lights.filter(inBox).length, fxNeon: window.__office2d.city ? window.__office2d.city().neon : null }; });
  check(Object.values(fu3.pink).flat().every(v => v < 0.01), 'pink panel paint left on a facade: ' + JSON.stringify(fu3.pink));
  check(!fu3.lights, 'window lights still sampled off the panels: ' + fu3.lights);
  check(fu3.fxNeon === 0, 'neon FX still running: ' + fu3.fxNeon);
  console.log('v11 followup3:', JSON.stringify(fu3));
  console.log('v11:', JSON.stringify(v11));
  const expect = ['Grok', '$tonks', 'Ops', 'Archives', 'Cyber', 'Sports']; // bot 8 is named Archives in data/bots.json since 6 Nov 04:45
  const missing = expect.filter(n => !tagNames.includes(n));
  check(!missing.length, 'missing name tags: ' + missing.join(','));
  check(office.workers.length === live.length, `worker count ${office.workers.length} != live bots ${live.length}`);
  check(office.workers.length === 13, `expected 13 bots displayed, got ${office.workers.length}`);
  check(!office.workers.some(w => HIDDEN.includes(w.id)), 'Notes (bot11) is drawn');
  const dash = office.workers.find(w => w.id.startsWith('fa5eb849-'));
  check(dash && dash.desk === 'Lounge', `Dashboards should live in the lounge: ${dash && dash.desk}`);
  const deskOf = n => office.workers.find(w => w.name === n)?.desk;
  check(deskOf('Grok') === 'Boss' && office.workers.filter(w => w.desk === 'Boss').length === 1, 'Boss must be Grok alone');
  check(office.workers.filter(w => w.desk === 'Housekeeping').map(w => w.num).sort((a, b) => a - b).join() === '0,8', 'Housekeeping must be bot0 + bot8');
  check(office.workers.every(w => w.name && live.some(b => b.name === w.name)), 'a worker has no live bot name');
  check(new Set(office.workers.map(w => w.sprite)).size === office.workers.length, 'two workers share a sprite');
  check(tagNames.length === live.length, `name tags ${tagNames.length} != live bots ${live.length}`);
  const moved = state.bots.filter(b => b.status === 'moved_out' && !live.some(l => l.name === b.name)).map(b => b.name); // same-name successor (bot11 Notes) may sit
  check(!moved.some(n => tagNames.includes(n)), 'a moved-out bot is seated');
  check(!office.workers.some(w => state.bots.some(b => b.id === w.id && b.status === 'moved_out')), 'a moved-out bot id is seated');
  // fps at 1280x800 on the local view (rendered frames/s measured by the page itself)
  const fp = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  fp.on('pageerror', e => errors.push('fps: ' + e));
  const fpsBy = {};
  let quality;
  for (const t of ['12:00', '22:30']) {
    await fp.goto(LOCAL + '/?t=' + t); await ready(fp); await fp.waitForTimeout(4000);
    fpsBy[t] = await fp.evaluate(() => window.__fps); quality = await fp.evaluate(() => window.__office2d.quality);
    check(fpsBy[t] >= MIN_FPS, `fps ${fpsBy[t]} < ${MIN_FPS} at ?t=${t}`);
  }
  const fps = JSON.stringify(fpsBy);
  // ?demo=1: a worker gets up and walks within 6 s, and someone turns around (front sprite) within 6 s
  await fp.goto(LOCAL + '/?t=22:30&demo=1'); await ready(fp);
  const walked = await fp.waitForFunction(() => window.__office2d.walking > 0, null, { timeout: 6000 }).then(() => true, () => false);
  check(walked, '?demo=1: no walk within 6 s');
  const turned = await fp.waitForFunction(() => window.__office2d.turned > 0, null, { timeout: 6000, polling: 100 }).then(() => true, () => false);
  check(turned, '?demo=1: no worker turned around within 6 s');
  const frontOk = await fp.evaluate(() => [...performance.getEntriesByType('resource')].filter(r => /\/f\d\d\.png/.test(r.name)).length);
  check(frontOk >= 12, `front sprites loaded: ${frontOk}`);
  const apiIx = await fp.evaluate(() => fetch('/api/state').then(r => r.json()).then(s => Array.isArray(s.interactions)));
  check(apiIx, '/api/state has no interactions array');
  await fp.close();
  await page.click('#tags .tag'); await page.waitForTimeout(200);
  check(await page.isVisible('#card'), 'clicking a name tag did not open the card');

  // --- ambient life: a forced lounge trip reaches the lounge, neighbours chat, the corgi takes a forced mood ---
  const ap = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  ap.on('pageerror', e => errors.push('ambient: ' + e));
  await ap.goto(LOCAL + '/?t=22:30'); await ready(ap);
  const tripName = await ap.evaluate(() => { const D = window.__office2d, i = D.workers.findIndex(w => w.status !== 'working' && w.status !== 'error' && w.desk !== 'Lounge'); return i >= 0 && D.loungeTrip(i) ? D.workers[i].name : null; });
  check(tripName, 'loungeTrip could not start');
  const reached = await ap.waitForFunction(n => window.__office2d.ambient.lounge.includes(n), tripName, { timeout: 45000 }).then(() => true, () => false);
  check(reached, `lounge trip: ${tripName} never reached the lounge`);
  const chat = await ap.evaluate(n => { const D = window.__office2d, w = D.workers.find(w => w.desk !== 'Lounge' && w.desk !== 'Boss' && w.status === 'idle' && !D.ambient.away.includes(w.name) && D.workers.filter(o => o.desk === w.desk).every(o => o.status === 'idle' && !D.ambient.away.includes(o.name))); return w ? D.neighbourChat(w.name) : null; }, tripName);
  check(chat !== false, 'neighbour chat could not start');
  const moods = {};
  for (const m of ['beg', 'nap', 'zoomies', 'belly']) {
    await ap.evaluate(m => window.__office2d.dogMood(m), m);
    moods[m] = await ap.waitForFunction(m => window.__office2d.corgi.mood === m || (m === 'belly' && window.__office2d.corgi.mood === 'wander'), m, { timeout: 3000 }).then(() => true, () => false);
    check(moods[m], `corgi did not take mood ${m}`);
  }
  await ap.close();
  // removed views stay gone (the old URLs just open the office)
  for (const f of ['/office.html', '/city.html', '/app.js', '/office/ui.js', '/vendor/three.module.min.js']) check((await fetch(PUBL + f)).status === 404, `${f} still served`);
  const legacy = await fetch(PUBL + '/?view=3d').then(r => r.text());
  check(legacy.includes('canvas id="office"'), '?view=3d should open the office');

  // --- 8788 local view: no login ---
  const lp = await browser.newPage({ viewport: { width: 800, height: 450 } });
  lp.on('pageerror', e => errors.push('8788: ' + e));
  const lr = await lp.goto(LOCAL + '/');
  check(lr.status() === 200 && !lp.url().includes('/login'), '8788 local view should open without login');
  const localApi = (await fetch(LOCAL + '/api/state')).status;
  check(localApi === 200, '8788 /api/state should be 200');
  // claude_usage on 8788 + the public 8789 listener; 8789 healthz
  const cu88 = await fetch(LOCAL + '/api/state').then(r => r.json()).then(s => s.claude_usage, () => null);
  const cu89 = await fetch(PUBL + '/api/state').then(r => r.json()).then(s => s.claude_usage, () => null);
  check(cu88 && cu88.source && cu88.tokens_week, '8788 /api/state has no claude_usage');
  check(cu89 && cu89.source, '8789 /api/state has no claude_usage');
  const hz = await fetch(PUBL + '/healthz').then(r => r.text(), () => '');
  check(hz === 'ok', '8789 /healthz not ok');
  check((await fetch(PUBL + '/office2d/assets/corgi.png')).status === 200, '8789 does not serve corgi.png');
  await lp.close();

  if (shots) {
    fs.mkdirSync(path.join(ROOT, 'shots'), { recursive: true });
    for (const [f, qs] of [['v8-dusk.png', '?t=17:45'], ['v8-night.png', '?t=22:30']]) {
      await page.goto(URL0 + '/' + qs); await ready(page); await page.waitForTimeout(2500);
      const n = await page.evaluate(() => window.__office2d.workers.length);
      check(n === live.length, `${f}: ${n} workers`);
      await page.screenshot({ path: path.join(ROOT, 'shots', f) });
    }
    // tag colours: fakeages spreads the ages for the screenshot only
    await page.goto(URL0 + '/?t=22:30&fakeages=1'); await ready(page); await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(ROOT, 'shots', 'v8-tags.png'), clip: { x: 340, y: 450, width: 1260, height: 240 } });
    // big canvas (2560x1440 at DPR 2 -> 3840x2880 is too heavy headless; 1600x900 @2x with ?q=0 = 3200x1800) -> hi plate set
    const hq = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
    await hq.goto(LOCAL + '/?t=18:30&q=0'); await ready(hq);
    const hiOk = await hq.waitForFunction(() => window.__office2d.plates === 'hi', null, { timeout: 20000 }).then(() => true, () => false);
    check(hiOk, 'hi-res plate set not used on a 3200x1800 canvas'); await hq.close();
  }
  await browser.close();
  check(!errors.length, 'console errors');
  check(apiUnauth === 401, 'unauthenticated /api/state on 8787 should be 401');
  console.log('roster:', names.length); names.forEach(n => console.log('  ' + n));
  console.log('workers:', office.workers.length, '| live bots:', live.length, '| seats:', office.workers.map(w => `${w.name}@${w.desk}#${w.seat}(${w.sprite})`).join(' '));
  console.log('wall bars [pool, time]:', kpi);
  console.log(`claude_usage: ${cu88 && cu88.source} week_pct=${cu88 && cu88.week_pct} | turned in demo: ${turned} | front sprites: ${frontOk} | corgi: ${JSON.stringify(v6.corgi)} | labels: ${tagTexts.slice(0, 3).join(', ')}`);
  console.log(`harbour: ${JSON.stringify(harbour)}`);
  console.log(`fps office 1280x800 (headless): ${fps} (min ${MIN_FPS}, quality ${JSON.stringify(quality)}) | demo walk: ${walked} | lounge trip: ${tripName} reached=${reached} | corgi moods: ${JSON.stringify(moods)} | 8787 unauth /api/state -> ${apiUnauth} | 8788 /api/state -> ${localApi}`);
  if (errors.length) console.log('console errors:\n  ' + errors.join('\n  '));
  console.log(fails.length ? 'VERIFY FAILED\n  ' + fails.join('\n  ') : 'VERIFY OK');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('verify error:', e.message); process.exit(1); });
