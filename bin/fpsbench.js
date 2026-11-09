// fps bench: node bin/fpsbench.js [label]  -> measures page-reported fps (window.__fps) and raw frame times over 6s on 8788
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
  const out = {};
  for (const q of ['?t=12:00', '?t=22:30', '?t=22:30&demo=1']) {
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
    await p.goto('http://127.0.0.1:8788/' + q, { waitUntil: 'load' });
    await p.waitForTimeout(3000);
    const r = await p.evaluate(() => new Promise(res => {
      // count frames the page actually renders (window.__office2d.frames) over 6s
      const f0 = (window.__office2d && window.__office2d.frames) || 0, t0 = performance.now();
      setTimeout(() => { const f1 = (window.__office2d && window.__office2d.frames) || 0; res({ rendered: +((f1 - f0) / ((performance.now() - t0) / 1000)).toFixed(1), pageFps: window.__fps }); }, 6000);
    }));
    out[q] = r; await p.close();
  }
  console.log((process.argv[2] || '') + ' ' + JSON.stringify(out)); await b.close();
})();
