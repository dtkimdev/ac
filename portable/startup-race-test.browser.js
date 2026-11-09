// Startup race test for the portable preview. Browser only; not a Node script.
//
// How to run:
//   1. node portable/rebuild.js, then node portable/serve.js
//   2. Open http://127.0.0.1:8791/state.json (a blank same-origin page)
//   3. Paste this whole file into the DevTools console or an agent's page-JS tool
//
// PASS: both runs report errors: [] and framesPerTick close to 1.
// FAIL: TypeError "reading 'hi'" means frame ran before load() finished.
//       framesPerTick close to 2 means a second render loop is running.
//
// framesPerTick is a ratio, so it still works in a hidden, throttled tab, but
// do not trust it if ticks is well below 30. Keep the page open until it
// returns: each run can take up to about 40 seconds.
async function startupRaceTest({ poke }) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:600px;border:0';
  f.src = '/?q=0&startup-race-test=' + Date.now();
  document.body.appendChild(f);

  const errors = [];
  let hookedDoc = null, pokes = 0, ready = false;
  const started = performance.now();
  while (performance.now() - started < 20000) {
    const d = f.contentDocument, w = f.contentWindow;
    if (d && d.location.href !== 'about:blank') {
      if (d !== hookedDoc) { hookedDoc = d; w.addEventListener('error', (e) => errors.push(e.message)); }
      if (w.__office2d && w.__office2d.ready) { ready = true; break; }
      if (poke) { d.dispatchEvent(new Event('visibilitychange')); pokes++; }
    }
    await wait(5);
  }

  // Compare app frames with screen refresh ticks: 30 ticks, or 20 seconds if throttled.
  const w = f.contentWindow, D = w.__office2d;
  const frames0 = D ? D.frames : 0;
  let ticks = 0;
  await new Promise((done) => {
    const until = performance.now() + 20000;
    const tick = () => { ticks++; ticks < 30 && performance.now() < until ? w.requestAnimationFrame(tick) : done(); };
    w.requestAnimationFrame(tick);
  });
  const frames = (D ? D.frames : 0) - frames0;
  f.remove();
  return { poke, pokes, ready, errors: [...new Set(errors)], errorCount: errors.length, ticks, frames, framesPerTick: ticks ? +(frames / ticks).toFixed(2) : null };
}
({ withEvents: await startupRaceTest({ poke: true }), control: await startupRaceTest({ poke: false }) });
