#!/usr/bin/env node
'use strict';
/**
 * Weak-device benchmark. Runs the preview in headless Chrome with GPU acceleration
 * off and the CPU slowed down, then reports real frames per second.
 * Node built-ins only (Node 22+ for the global WebSocket). Uses a throwaway Chrome profile.
 *
 *   node portable/serve.js                         (in another terminal)
 *   node portable/tv-bench.js [options]
 *
 * --throttle N   CPU slowdown factor (default 12)
 * --size WxH     CSS viewport (default 1920x1080)
 * --dpr N        device pixel ratio (default 1; 2 mimics a 4K TV)
 * --seconds N    measured seconds after settling (default 20)
 * --settle N     seconds to wait after the first frame (default 20)
 * --query S      extra query string, e.g. q=3
 * --url URL      page to test (default http://127.0.0.1:8791/)
 * --chrome PATH  browser to use (default: search, or CHROME_PATH)
 *
 * This is a simulation. The final proof is the real TV: open the site with ?stats=1.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; };
const throttle = +opt('throttle', 12);
const [W, H] = opt('size', '1920x1080').split('x').map(Number);
const dpr = +opt('dpr', 1), seconds = +opt('seconds', 20), settle = +opt('settle', 20);
const base = opt('url', 'http://127.0.0.1:8791/'), query = opt('query', '');
const PORT = 9333 + (process.pid % 200);

function findChrome() {
  const a = process.env.LOCALAPPDATA || '', b = process.env.ProgramFiles || '', c = process.env['ProgramFiles(x86)'] || '';
  const list = [opt('chrome'), process.env.CHROME_PATH, path.join(a, 'Google/Chrome/Application/chrome.exe'), path.join(b, 'Google/Chrome/Application/chrome.exe'), path.join(c, 'Google/Chrome/Application/chrome.exe'), path.join(c, 'Microsoft/Edge/Application/msedge.exe'), '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return list.find((p) => p && fs.existsSync(p));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = (url) => new Promise((ok, no) => {
  http.get(url, (res) => { let s = ''; res.on('data', (d) => (s += d)); res.on('end', () => { try { ok(JSON.parse(s)); } catch (e) { no(e); } }); }).on('error', no);
});

async function main() {
  const chrome = findChrome();
  if (!chrome) throw new Error('no Chrome or Edge found; pass --chrome PATH');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-bench-'));
  const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--disable-gpu-compositing', '--disable-accelerated-2d-canvas', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--no-first-run', '--no-default-browser-check', '--mute-audio', `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
  try {
    let pages = null;
    for (let i = 0; i < 60 && !pages; i++) { await sleep(250); try { pages = (await getJson(`http://127.0.0.1:${PORT}/json/list`)).filter((t) => t.type === 'page'); if (!pages.length) pages = null; } catch {} }
    if (!pages) throw new Error('browser did not start');
    const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
    await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
    let id = 0; const wait = new Map(), errors = [];
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); }
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.split('\n')[0] || m.params.exceptionDetails.text);
    };
    const send = (method, params = {}) => new Promise((ok) => { const n = ++id; wait.set(n, ok); ws.send(JSON.stringify({ id: n, method, params })); });
    const evalJs = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;

    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: dpr, mobile: false });
    await send('Emulation.setCPUThrottlingRate', { rate: throttle });
    const url = base + (query ? (base.includes('?') ? '&' : '?') + query : '');
    const t0 = Date.now();
    await send('Page.navigate', { url });

    let firstFrame = null;
    for (let i = 0; i < 600 && firstFrame == null; i++) { await sleep(500); if (await evalJs('(window.__office2d?.frames||0)>0')) firstFrame = (Date.now() - t0) / 1000; }
    if (firstFrame == null) throw new Error('no frame within 5 minutes; errors: ' + errors.join(' | '));
    await sleep(settle * 1000);

    const read = () => evalJs('({f:__office2d.frames,q:__office2d.quality&&__office2d.quality.level,scale:__office2d.quality&&__office2d.quality.scale,cv:[document.getElementById("office").width,document.getElementById("office").height],stats:__office2d.stats||null})');
    const prof = args.includes('--profile');
    if (prof) { await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 2000 }); await send('Profiler.start'); }
    const a = await read(), ta = Date.now();
    if (args.includes('--series')) { // fps every 5 seconds, with what was moving
      let p = a, tp = ta;
      for (let n = 0; n < Math.ceil(seconds / 5); n++) {
        await sleep(5000);
        const c = await evalJs('({f:__office2d.frames,w:__office2d.walking,ls:__office2d.liteStats})'), tc = Date.now();
        console.log(`${String((n + 1) * 5).padStart(4)}s  ${((c.f - p.f) / ((tc - tp) / 1000)).toFixed(1).padStart(6)} fps  walking ${c.w}  ${JSON.stringify(c.ls || {})}`);
        p = c; tp = tc;
      }
    } else await sleep(seconds * 1000);
    const b = await read(), tb = Date.now();
    if (prof) { // where the main thread's time went, by function
      const p = (await send('Profiler.stop')).result.profile, self = new Map(), byId = new Map(p.nodes.map((n) => [n.id, n]));
      p.samples.forEach((id, i) => { const n = byId.get(id).callFrame, key = `${n.functionName || '(anonymous)'} ${n.url.split('/').pop()}:${n.lineNumber + 1}`; self.set(key, (self.get(key) || 0) + (p.timeDeltas[i] || 0)); });
      const total = [...self.values()].reduce((x, y) => x + y, 0);
      [...self.entries()].sort((x, y) => y[1] - x[1]).slice(0, 14).forEach(([n, v]) => console.log(`${(v / total * 100).toFixed(1).padStart(5)}%  ${n}`));
    }
    const heap = await evalJs('performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):null');
    ws.close();
    console.log(JSON.stringify({ throttle, size: `${W}x${H}`, dpr, query, fps: +((b.f - a.f) / ((tb - ta) / 1000)).toFixed(1), firstFrameSec: +firstFrame.toFixed(1), quality: b.q, scale: b.scale, canvas: b.cv.join('x'), heapMB: heap, stats: b.stats, errors: [...new Set(errors)] }));
  } finally {
    child.kill();
    await sleep(800);
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } catch {}
  }
}
main().catch((e) => { console.error('TV_BENCH_FAIL', e.message); process.exit(1); });
