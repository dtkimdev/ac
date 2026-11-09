#!/usr/bin/env node
'use strict';
/**
 * Visual check: opens a page in headless Chrome, optionally runs JavaScript (for example to make a bot turn or chat),
 * waits, then saves a screenshot, optionally cropped and enlarged. Node built-ins only (Node 22+). Throwaway profile.
 *
 *   node portable/shot.js --url http://127.0.0.1:8791/?q=0 --out shot.png
 *     --size 1600x900   viewport (default 1600x900)      --dpr 2      device pixel ratio (default 1)
 *     --wait 6          seconds after the first frame     --js "..."   JavaScript run after that wait
 *     --after 2         seconds after the JavaScript      --clip x,y,w,h   crop, in CSS pixels
 *     --print "..."     JavaScript whose JSON result is printed (after --after)
 *     --frames N        save N screenshots, --gap seconds apart (default 0.15), as out-1.png .. out-N.png (for motion)
 *     --clipjs "..."    JavaScript returning [x,y,w,h] in CSS pixels, evaluated before every screenshot (follows a moving bot),
 *                       e.g. "__office2d.boxOf('SBP', 40)"
 */
const { spawn } = require('child_process');
const fs = require('fs'), http = require('http'), os = require('os'), path = require('path');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://127.0.0.1:8791/'), out = path.resolve(opt('out', 'shot.png'));
const [W, H] = opt('size', '1600x900').split('x').map(Number), dpr = +opt('dpr', 1);
const wait = +opt('wait', 6), after = +opt('after', 0), js = opt('js'), print = opt('print'), frames = +opt('frames', 1);
const clipArg = opt('clip'), clipJs = opt('clipjs'), gap = +opt('gap', 0.15), PORT = 9533 + (process.pid % 200);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = (u) => new Promise((ok, no) => http.get(u, (res) => { let s = ''; res.on('data', (d) => (s += d)); res.on('end', () => { try { ok(JSON.parse(s)); } catch (e) { no(e); } }); }).on('error', no));
function findChrome() {
  const a = process.env.LOCALAPPDATA || '', b = process.env.ProgramFiles || '', c = process.env['ProgramFiles(x86)'] || '';
  return [opt('chrome'), process.env.CHROME_PATH, path.join(a, 'Google/Chrome/Application/chrome.exe'), path.join(b, 'Google/Chrome/Application/chrome.exe'), path.join(c, 'Microsoft/Edge/Application/msedge.exe'), '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => p && fs.existsSync(p));
}
(async () => {
  const chrome = findChrome(); if (!chrome) throw new Error('no Chrome or Edge found');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-'));
  const child = spawn(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--mute-audio', '--allow-file-access-from-files', `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
  try {
    let page = null;
    for (let i = 0; i < 60 && !page; i++) { await sleep(250); try { page = (await getJson(`http://127.0.0.1:${PORT}/json/list`)).find((t) => t.type === 'page'); } catch {} }
    if (!page) throw new Error('browser did not start');
    const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
    let id = 0; const pend = new Map(), errors = [];
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.split('\n')[0]); };
    const send = (method, params = {}) => new Promise((ok) => { const n = ++id; pend.set(n, ok); ws.send(JSON.stringify({ id: n, method, params })); });
    const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: dpr, mobile: false });
    await send('Page.navigate', { url });
    for (let i = 0; i < 120; i++) { await sleep(250); if (await ev('document.readyState==="complete" && (!window.__office2d || window.__office2d.frames > 0)')) break; }
    await sleep(wait * 1000);
    if (js) await ev(js);
    await sleep(after * 1000);
    if (print) console.log(JSON.stringify(await ev(print)));
    const toClip = (a) => a && ({ x: Math.max(0, a[0]), y: Math.max(0, a[1]), width: a[2], height: a[3], scale: 1 });
    for (let f = 1; f <= frames; f++) {
      const clip = clipJs ? toClip(await ev(clipJs)) : clipArg ? toClip(clipArg.split(',').map(Number)) : undefined;
      const r = await send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: false });
      const file = frames > 1 ? out.replace(/\.png$/i, `-${f}.png`) : out;
      fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); console.log('saved ' + file);
      if (f < frames) await sleep(gap * 1000);
    }
    if (errors.length) console.log('page errors: ' + [...new Set(errors)].join(' | '));
    ws.close();
  } finally { child.kill(); await sleep(600); try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } catch {} }
})().catch((e) => { console.error('SHOT_FAIL ' + e.message); process.exit(1); });
