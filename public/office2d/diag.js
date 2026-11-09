// Device check, opened with ?diag=1 instead of the office. Measures what this browser can draw, so a slow device
// (David's Toshiba TV) can be diagnosed from a photo of the screen. Draws nothing of the office and sends nothing anywhere.
import { LITE } from './config.js';

const A = (window.AC_STATIC ? '' : '/') + 'office2d/assets/', V = '?v=20';
const cv = document.getElementById('office'), g = cv.getContext('2d', { alpha: false });
document.getElementById('loading')?.remove();
const box = document.createElement('pre');
box.style.cssText = 'position:fixed;left:2vw;top:2vh;right:2vw;z-index:9;margin:0;padding:1.2vw 1.6vw;background:rgba(8,6,16,.86);color:#f6ecd6;font:600 max(16px,1.9vw)/1.45 ui-monospace,monospace;white-space:pre-wrap;border-radius:12px';
document.body.appendChild(box);
const lines = [], D = window.__office2d || (window.__office2d = {}); // D.frames and D.stats let portable/tv-bench.js read the results
D.frames = 0;
const show = () => { box.textContent = lines.join('\n'); D.stats = lines.slice(); };
const out = (s) => { lines.push(s); show(); };
const set = (s) => { lines[lines.length - 1] = s; show(); };
const load = (f) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = A + f + V; });
// frames per second over ms, calling step(n) before each frame
const fpsFor = (ms, step) => new Promise((done) => {
  let n = 0, t0 = 0;
  const f = (now) => { if (!t0) t0 = now; if (step) step(n); n++; D.frames++; if (now - t0 < ms) requestAnimationFrame(f); else done(n * 1000 / (now - t0)); };
  requestAnimationFrame(f);
});
const r1 = (v) => v.toFixed(1);

async function run() {
  out('Agent City device check. Please photograph this screen when it says DONE.');
  out(`browser: ${navigator.userAgent}`);
  out(`screen ${screen.width}x${screen.height}, window ${innerWidth}x${innerHeight}, pixel ratio ${devicePixelRatio}, cores ${navigator.hardwareConcurrency || '?'}, memory ${navigator.deviceMemory || '?'} GB`);
  out(`detected as a TV: ${LITE.tvBrowsers.test(navigator.userAgent) ? 'yes' : 'no'}`);
  const t0 = performance.now(), plate = await load('plate-dusk.webp'), sprite = await load('w00.png');
  out(`loading 2 pictures took ${r1((performance.now() - t0) / 1000)} s`);
  const T = 4000;

  out('A. empty animation loop (the most this browser allows): measuring…');
  set(`A. empty animation loop (the most this browser allows): ${r1(await fpsFor(T))} fps`);

  for (const [w, h, tag] of [[1280, 720, 'B'], [960, 540, 'C'], [640, 360, 'D']]) {
    cv.width = w; cv.height = h;
    out(`${tag}. whole picture redrawn every frame, ${w}x${h}: measuring…`);
    set(`${tag}. whole picture redrawn every frame, ${w}x${h}: ${r1(await fpsFor(T, (n) => { g.drawImage(plate, 0, 0, w, h); g.fillStyle = '#fc6'; g.fillRect((n * 9) % (w - 40), 20, 40, 40); }))} fps`);
  }

  cv.width = 1280; cv.height = 720; g.drawImage(plate, 0, 0, 1280, 720);
  out('E. small patch changed each frame, 1280x720 (what lite does): measuring…');
  set(`E. small patch changed each frame, 1280x720 (what lite does): ${r1(await fpsFor(T, (n) => { const x = (n * 9) % 1180; g.drawImage(plate, x * 2, 400, 200, 200, x, 200, 100, 100); g.drawImage(sprite, x, 220, 60, 80); }))} fps`);

  const el = sprite.cloneNode(); el.style.cssText = 'position:fixed;left:0;top:60vh;width:6vw;z-index:8;will-change:transform';
  document.body.appendChild(el); cv.style.visibility = 'hidden';
  out('F. picture moved by the page layout instead of the canvas: measuring…');
  set(`F. picture moved by the page layout instead of the canvas: ${r1(await fpsFor(T, (n) => { el.style.transform = `translateX(${(n * 9) % innerWidth}px)`; }))} fps`);
  el.remove(); cv.style.visibility = '';

  out('DONE. Send the photo to Claude. Reload without ?diag=1 to return to the office.');
}
run().catch((e) => out('check failed: ' + (e && e.message ? e.message : e)));
