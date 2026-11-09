#!/usr/bin/env node
// v11 follow-up shots from the staged build (bin/v10-stage.sh): full frames, clock, wall charts under the chrome, fridge, both groves, Archives, the black desk. Jpgs go to /workspace/tmp/v11-followup-preview/.
'use strict';
const path = require('path'), fs = require('fs'), ROOT = path.join(__dirname, '..', '..'), { chromium } = require(path.join(ROOT, 'node_modules', 'playwright-core'));
const U = 'http://127.0.0.1:8798', PV = '/workspace/tmp/v11-followup-preview'; fs.mkdirSync(PV, { recursive: true });
const K = 1600 / 1280, box = (x0, y0, x1, y1) => ({ x: x0 * K, y: y0 * K, width: (x1 - x0) * K, height: (y1 - y0) * K });
const shot = (p, n, clip) => p.screenshot({ path: `${PV}/${n}.jpg`, type: 'jpeg', quality: 88, ...(clip ? { clip } : {}) });
const open = async (b, qs, vp) => { const p = await b.newPage({ viewport: vp || { width: 1600, height: 900 }, deviceScaleFactor: 2 }); p.on('pageerror', e => console.log('ERR', e.message)); await p.goto(`${U}/?q=0&${qs}`); await p.waitForFunction(() => window.__office2d && window.__office2d.ready && window.__office2d.frames > 20, null, { timeout: 60000 }); await p.waitForFunction(() => window.__office2d.plates === 'hi', null, { timeout: 20000 }).catch(() => {}); await p.evaluate(() => document.body.classList.add('pages')); await p.waitForTimeout(1500); return p; };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
  for (const [n, t] of [['dusk', '18:30'], ['night', '22:30']]) {
    const p = await open(b, `t=${t}`); await shot(p, `${n}-full`);
    await shot(p, `${n}-clock`, box(0, 20, 140, 110)); await shot(p, `${n}-wall`, box(1120, 0, 1280, 430)); await shot(p, `${n}-fridge`, box(0, 410, 180, 560)); await shot(p, `${n}-bamboo-l`, box(0, 420, 300, 720)); await shot(p, `${n}-bamboo-r`, box(960, 420, 1280, 720));
    await shot(p, n === 'dusk' ? 'v11-fu-office-full' : 'v11-fu-office-full-night'); await shot(p, n === 'dusk' ? 'v11-fu-facade' : 'v11-fu-facade-night', box(150, 60, 1200, 400));
    await shot(p, n === 'dusk' ? 'v11-fu-desk-full' : 'v11-fu-desk-full-night', box(440, 490, 770, 715)); await shot(p, n === 'dusk' ? 'v11-fu-desk-crop' : 'v11-fu-desk-crop-night', box(480, 500, 735, 640));
    const w = await p.evaluate(() => { const D = window.__office2d, a = D.workers.find(w => w.name === 'Archives'); return a && { x: a.x, y: a.y, seat: a.seat, sprite: a.sprite }; }); console.log(n, 'Archives', JSON.stringify(w));
    await p.close();
  }
  { const p = await open(b, 't=18:30', { width: 1280, height: 800 }); await shot(p, 'dusk-16x10'); await p.close(); }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
