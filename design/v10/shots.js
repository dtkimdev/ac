#!/usr/bin/env node
// v10 preview shots from the staged build (bin/v10-stage.sh): shots/v10-{dusk,night}.png + crops of each change, Grok turning, wall demo, audio check.
'use strict';
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..'), { chromium } = require(path.join(ROOT, 'node_modules', 'playwright-core'));
const U = 'http://127.0.0.1:8798', OUT = path.join(__dirname, 'shots'); fs.mkdirSync(OUT, { recursive: true });
const ready = p => p.waitForFunction(() => window.__office2d && window.__office2d.ready && window.__office2d.frames > 20, null, { timeout: 60000 });
const K = 1600 / 1280, box = (x0, y0, x1, y1) => ({ x: x0 * K, y: y0 * K, width: (x1 - x0) * K, height: (y1 - y0) * K }), v = (f, g) => [f * 1280, g * 720];
const open = async (b, qs, route) => { const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 }); p.on('pageerror', e => console.log('ERR', e.message));
  if (route) await p.route('**/api/state', async r => { const res = await r.fetch(), j = await res.json(); route(j); await r.fulfill({ response: res, json: j }); }), await p.route('**/api/stream', r => r.abort());
  await p.goto(`${U}/?q=0&${qs}`); await ready(p); await p.waitForFunction(() => window.__office2d.plates === 'hi', null, { timeout: 20000 }).catch(() => {}); return p; };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
  for (const [n, t] of [['dusk', '18:30'], ['night', '22:30']]) {
    const p = await open(b, `t=${t}`); await p.waitForTimeout(2500);
    await p.screenshot({ path: `${OUT}/v10-${n}.png` });
    await p.screenshot({ path: `${OUT}/v10-${n}-boss.png`, clip: box(490, 480, 800, 650) });
    await p.screenshot({ path: `${OUT}/v10-${n}-numbers.png`, clip: box(800, 480, 1100, 640) });
    await p.screenshot({ path: `${OUT}/v10-${n}-wall.png`, clip: box(1130, 40, 1280, 260) });
    await p.close();
  }
  // both dogs side by side in the lounge, forced for the picture only
  { const p = await open(b, 't=22:30&notags=1'); await p.waitForTimeout(800); await p.evaluate(() => { window.__office2d.dogMood('nap'); }); await p.waitForTimeout(16000);
    const c = await p.evaluate(() => [window.__office2d.corgi, window.__office2d.corgi2]); console.log('dogs', JSON.stringify(c));
    await p.screenshot({ path: `${OUT}/v10-corgis.png` }); await p.close(); }
  // Grok up and about, front sprite: a forced lounge trip, for the picture only
  { const p = await open(b, 't=18:30'); await p.evaluate(() => window.__office2d.loungeTrip('Grok')); await p.waitForFunction(() => window.__office2d.ambient.lounge.includes('Grok'), null, { timeout: 60000 }).catch(() => console.log('Grok never reached the lounge')); await p.waitForTimeout(1500);
    await p.screenshot({ path: `${OUT}/v10-grok-lounge.png`, clip: box(60, 420, 520, 720) }); await p.close(); }
  // Grok's turn: every yaw, read straight from the atlas at about the on-screen size + big
  { const p = await open(b, 't=22:30'); const s = await p.evaluate(async () => { const a = new Image(); a.src = '/office2d/assets/turn-heads.webp?v=13'; await a.decode(); const c = document.createElement('canvas'); c.width = 1320; c.height = 232; const g = c.getContext('2d'); g.fillStyle = '#2a2233'; g.fillRect(0, 0, 1320, 232); g.drawImage(a, 0, 232, 1320, 232, 0, 0, 1320, 232); return c.toDataURL('image/png'); });
    fs.writeFileSync(`${OUT}/v10-grok-yaws.png`, Buffer.from(s.split(',')[1], 'base64')); await p.close(); }
  // the brief's own example with demo data (route rewrites /api/state in this page only): 50% used, 1 day of 7 left, on both wall monitors
  { const now = Date.now(); const p = await open(b, 't=22:30', j => { j.usage.used_pct = 50; j.usage.reset = now + 864e5; j.claude_usage = { ...j.claude_usage, source: 'ratelimit', week_pct: 15, resets_at: new Date(now + 5 * 864e5).toISOString(), window_start: new Date(now - 2 * 864e5).toISOString() }; });
    await p.waitForTimeout(1800); console.log('demo wall', JSON.stringify(await p.evaluate(() => window.__office2d.wall))); await p.screenshot({ path: `${OUT}/v10-wall-demo-data.png`, clip: box(1130, 40, 1280, 260) }); await p.close(); }
  // audio: 40 s rendered offline (nothing played): level, clipping, and whether it keeps going across the loop lengths
  { const p = await b.newPage(); await p.goto(`${U}/?t=22:30`); await ready(p);
    const r = await p.evaluate(async () => { const buf = await window.AC.music._render(40), d = buf.getChannelData(0), sr = buf.sampleRate; let peak = 0, sum = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += a * a; }
      const sec = []; for (let s = 0; s < 40; s += 4) { let e = 0; for (let i = s * sr; i < (s + 4) * sr; i++) e += d[i] * d[i]; sec.push(+Math.sqrt(e / (4 * sr)).toFixed(3)); }
      let jump = 0, at = 0; for (let i = sr * 2; i < d.length - 1; i++) { const j = Math.abs(d[i + 1] - d[i]); if (j > jump) { jump = j; at = i / sr; } }
      return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(3), rms4s: sec, maxStep: +jump.toFixed(3), at: +at.toFixed(2) }; });
    console.log('audio', JSON.stringify(r));
    const btn = await p.evaluate(async () => { const m = document.getElementById('music'); m.click(); await new Promise(r => setTimeout(r, 2500)); const on = m.textContent; m.click(); return on + ' -> ' + m.textContent; }); console.log('toggle', btn); await p.close(); }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
