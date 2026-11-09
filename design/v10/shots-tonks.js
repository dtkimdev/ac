#!/usr/bin/env node
// v10 addendum shots of $tonks's face from the staged build (bin/v10-stage.sh): turned at the desk and on a lounge trip, dusk + night, plus the row 7 yaws from the atlas. Forced for the picture only.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..'), { chromium } = require(path.join(ROOT, 'node_modules', 'playwright-core'));
const U = 'http://127.0.0.1:8798', OUT = path.join(__dirname, 'shots'), N = '$tonks', fs = require('fs');
const ready = p => p.waitForFunction(() => window.__office2d && window.__office2d.ready && window.__office2d.frames > 20, null, { timeout: 60000 });
const open = async (b, t) => { const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 3 }); p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(`${U}/?q=0&t=${t}`); await ready(p); await p.waitForFunction(() => window.__office2d.plates === 'hi', null, { timeout: 20000 }).catch(() => {}); await p.waitForTimeout(800); return p; };
// the name tag sits over the head, so the crop hangs off it
const around = (p, w, h) => p.evaluate(N => { const e = [...document.querySelectorAll('body *')].filter(e => !e.children.length && e.textContent.startsWith(N) && e.getBoundingClientRect().width)[0], r = e && e.getBoundingClientRect(); return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, N).then(c => { if (!c) throw new Error('no tag for ' + N); return { x: Math.max(0, c.x - w / 2), y: Math.max(0, c.y - 30), width: w, height: h }; });
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
  for (const [n, t] of [['dusk', '18:30'], ['night', '22:30']]) {
    { const p = await open(b, t); console.log(n, JSON.stringify(await p.evaluate(N => window.__office2d.workers.find(w => w.name === N), N)));
      await p.evaluate(N => window.__office2d.turn(N), N); await p.waitForTimeout(1300); await p.screenshot({ path: `${OUT}/v10-tonks-${n}.png` }); await p.screenshot({ path: `${OUT}/v10-tonks-${n}-desk.png`, clip: await around(p, 260, 200) }); await p.close(); }
    { const p = await open(b, t); await p.evaluate(N => window.__office2d.loungeTrip(N), N); await p.waitForFunction(N => window.__office2d.ambient.lounge.includes(N), N, { timeout: 60000 }).catch(() => console.log(N + ' never reached the lounge')); await p.waitForTimeout(1500);
      await p.screenshot({ path: `${OUT}/v10-tonks-${n}-lounge.png`, clip: await around(p, 260, 240) }); await p.close(); }
  }
  const p = await open(b, '22:30'), s = await p.evaluate(async () => { const a = new Image(); a.src = '/office2d/assets/turn-heads.webp?v=13'; await a.decode(); const c = document.createElement('canvas'); c.width = 1320; c.height = 232; const g = c.getContext('2d'); g.fillStyle = '#2a2233'; g.fillRect(0, 0, 1320, 232); g.drawImage(a, 0, 1624, 1320, 232, 0, 0, 1320, 232); return c.toDataURL('image/png'); });
  fs.writeFileSync(`${OUT}/v10-tonks-yaws.png`, Buffer.from(s.split(',')[1], 'base64')); await p.close();
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
