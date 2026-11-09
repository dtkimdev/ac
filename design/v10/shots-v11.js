#!/usr/bin/env node
// v11 preview shots from the staged build (bin/v10-stage.sh): full frames, a crop per change, the 3-hour sky steps. Jpgs go to shots/ and /workspace/tmp/v10b-preview/.
'use strict';
const path = require('path'), fs = require('fs'), ROOT = path.join(__dirname, '..', '..'), { chromium } = require(path.join(ROOT, 'node_modules', 'playwright-core'));
const U = 'http://127.0.0.1:8798', OUT = path.join(__dirname, 'shots'), PV = '/workspace/tmp/v10b-preview'; fs.mkdirSync(PV, { recursive: true });
const K = 1600 / 1280, box = (x0, y0, x1, y1) => ({ x: x0 * K, y: y0 * K, width: (x1 - x0) * K, height: (y1 - y0) * K });
const ready = p => p.waitForFunction(() => window.__office2d && window.__office2d.ready && window.__office2d.frames > 20, null, { timeout: 60000 });
const shot = async (p, n, clip) => { const f = `${OUT}/v11-${n}.jpg`; await p.screenshot({ path: f, type: 'jpeg', quality: 88, ...(clip ? { clip } : {}) }); fs.copyFileSync(f, `${PV}/v11-${n}.jpg`); };
const open = async (b, qs, vp) => { const p = await b.newPage({ viewport: vp || { width: 1600, height: 900 }, deviceScaleFactor: 2 }); p.on('pageerror', e => console.log('ERR', e.message)); await p.goto(`${U}/?q=0&${qs}`); await ready(p); await p.waitForFunction(() => window.__office2d.plates === 'hi', null, { timeout: 20000 }).catch(() => {}); await p.evaluate(() => document.body.classList.add('pages')); await p.waitForTimeout(1500); return p; };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
  for (const [n, t] of [['dusk', '18:30'], ['night', '22:30']]) {
    const p = await open(b, `t=${t}`); await shot(p, n);
    await shot(p, `${n}-skyline`, box(60, 30, 1190, 340)); await shot(p, `${n}-boss`, box(450, 470, 860, 720)); await shot(p, `${n}-wall`, box(1090, 20, 1230, 410)); await shot(p, `${n}-bamboo-l`, box(0, 380, 300, 720)); await shot(p, `${n}-bamboo-r`, box(900, 480, 1280, 720));
    await shot(p, `${n}-clock`, box(30, 250, 170, 340)); await shot(p, `${n}-updated`, { x: 1340, y: 0, width: 260, height: 56 }); await shot(p, `${n}-steam-coffee`, box(60, 380, 260, 540)); await shot(p, `${n}-steam-mug`, box(200, 560, 340, 650)); await shot(p, `${n}-steam-desk`, box(960, 540, 1110, 620));
    await p.close();
  }
  { const p = await open(b, 't=18:30&notags=1'); const w = await p.evaluate(() => { const D = window.__office2d; return D.workers.map(x => x.name + ':' + x.sprite); }); console.log(w.join(' '));
    await p.evaluate(() => window.__office2d.turn('Media')); await p.waitForTimeout(2200); await shot(p, 'hats-media-turned', box(260, 380, 520, 560)); await p.close(); }
  { const p = await open(b, 't=22:30&notags=1'); await p.evaluate(() => window.__office2d.turn('LF')); await p.waitForTimeout(2200); await shot(p, 'hats-lf-turned', box(760, 380, 1040, 560)); await p.close(); }
  { const p = await open(b, 't=18:30&notags=1'); await p.evaluate(() => window.__office2d.turn('Archives')); await p.waitForTimeout(2200); await shot(p, 'face-archives-front', box(1090, 400, 1280, 600));
    await p.close(); }
  for (let i = 0; i < 2; i++) { const p = await open(b, 't=22:30&notags=1'); await p.evaluate(() => window.__office2d.neighbourChat('Archives')); await p.waitForTimeout(3000 + i * 3000); await shot(p, `face-chat-${i}`, box(1050, 400, 1280, 600)); await p.close(); }
  { const p = await open(b, 't=18:30', { width: 1280, height: 800 }); await shot(p, 'dusk-16x10'); await p.close(); }
  for (const [n, t] of [['1500', '15:30'], ['1806', '18:05'], ['1830', '18:30'], ['2105', '21:05']]) { const p = await open(b, `t=${t}&tsnap=1`); console.log(t, JSON.stringify(await p.evaluate(() => window.__office2d.sky))); await shot(p, `sky-step-${n}`); await p.close(); }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
