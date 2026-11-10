// Harbour boats, drawn in code at the size they appear on screen (David, 2026-11-10: the painted sheet looked cheap; no cargo ships; more
// exciting boats, some with LEDs). Side view, bow to the right, cut at the waterline. Each kind is drawn in a box 100 units wide and
// 39 units tall (the waterline is the bottom edge), the same shape as the old sheet cells, so speeds and lanes did not change.
// buildBoat() returns the hull picture, a picture of its fixed lights (windows, lamps: shown at dusk and night) and a list of LED runs
// that fx.js animates every frame. To add a kind: write a draw function below, add it to KINDS with its size, speed and wake.

const U = 100, UH = 39; // the box: x 0..100 (bow at 100), y 0..39 (waterline at 39)

function grad(g, y0, y1, stops) { const gr = g.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; }
function poly(g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); }
function windows(g, x0, x1, y, h, n, gap, col, r = 0.6) { const w = (x1 - x0 - gap * (n - 1)) / n; g.fillStyle = col; for (let i = 0; i < n; i++) { g.beginPath(); g.roundRect(x0 + i * (w + gap), y, w, h, r); g.fill(); } }
function rail(g, x0, x1, y, h, posts, col, lw = 0.35) { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); for (let i = 0; i <= posts; i++) { const x = x0 + (x1 - x0) * i / posts; g.moveTo(x, y); g.lineTo(x, y + h); } g.stroke(); }
function sheen(g, pts, a = 0.35) { g.save(); poly(g, pts); g.clip(); g.fillStyle = grad(g, 0, UH, [[0, `rgba(255,255,255,${a})`], [0.45, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, U, UH); g.restore(); }

// ---------- the boats. Each draws the hull on g, the fixed lights on l, and returns LED runs [{ pts, colors, mode }] ----------
const KINDS = {
  longtail: { w: 0.92, v: 7, wake: 0.8, draw(g, l) { // Thai longtail: slim teak hull, upswept bow with garlands, striped canopy, the long engine pole astern
    const hull = [[6, 31], [70, 31], [88, 27], [97, 15], [99, 13], [96, 22], [86, 36], [60, 39], [14, 39], [6, 35]];
    g.fillStyle = grad(g, 13, 39, [[0, '#b0703c'], [0.5, '#7a4521'], [1, '#3e2210']]); poly(g, hull); g.fill();
    g.strokeStyle = 'rgba(255,220,170,.55)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(8, 32.2); g.lineTo(70, 32.2); g.quadraticCurveTo(88, 29, 97.5, 14.5); g.stroke();
    g.strokeStyle = 'rgba(40,20,8,.5)'; g.lineWidth = 0.3; for (const y of [34.5, 36.8]) { g.beginPath(); g.moveTo(10, y); g.lineTo(78, y - (y - 33) * 0.4); g.stroke(); }
    for (const [x, c] of [[93, '#ff4f8b'], [95, '#ffd23f'], [96.8, '#4fd1ff']]) { g.strokeStyle = c; g.lineWidth = 0.9; g.beginPath(); g.moveTo(x, 18 + (96.8 - x)); g.quadraticCurveTo(x - 2, 24, x - 1, 28); g.stroke(); } // ribbons
    g.fillStyle = '#5b3a20'; for (const x of [26, 44, 62]) g.fillRect(x, 20, 0.7, 11); // canopy posts
    const can = [[22, 20], [66, 20], [64, 17.2], [24, 17.2]]; g.fillStyle = '#2d6fb5'; poly(g, can); g.fill();
    g.fillStyle = '#e8463c'; for (let i = 0; i < 6; i++) { g.fillRect(24 + i * 7, 17.4, 3.5, 2.5); }
    sheen(g, can, 0.3);
    g.fillStyle = '#3a3f4a'; g.beginPath(); g.roundRect(6, 22, 9, 7, 1.2); g.fill(); g.fillStyle = '#9aa3b2'; g.fillRect(7, 23, 7, 1.2); // engine
    g.strokeStyle = '#2b2f36'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(8, 27); g.lineTo(-2, 38.5); g.stroke(); // tail pole into the water
    g.fillStyle = '#26323f'; g.beginPath(); g.arc(18, 24.2, 2.1, 0, 7); g.fill(); g.fillRect(16.4, 25.8, 3.3, 5.5); // the boatman
    l.fillStyle = '#ffd08a'; l.beginPath(); l.arc(66, 21.5, 1.4, 0, 7); l.fill(); l.beginPath(); l.arc(97.6, 14.4, 0.9, 0, 7); l.fill();
    return [];
  } },
  speedboat: { w: 0.72, v: 15, wake: 1.6, draw(g, l) { // sport boat: white deep-V hull, navy stripe, raked glass, cyan underglow
    const hull = [[4, 26], [80, 26], [98, 24.5], [92, 31], [74, 39], [10, 39], [4, 33]];
    g.fillStyle = grad(g, 24, 39, [[0, '#ffffff'], [0.6, '#dfe6ee'], [1, '#aab6c4']]); poly(g, hull); g.fill();
    g.fillStyle = '#1b2b52'; poly(g, [[5, 30], [86, 28.6], [80, 32.4], [6, 33.4]]); g.fill();
    g.fillStyle = '#e04a3a'; poly(g, [[6, 34], [78, 33], [76, 34.2], [6, 35.2]]); g.fill();
    g.fillStyle = grad(g, 16, 26, [[0, '#8fd3ff'], [1, '#2a5a86']]); poly(g, [[40, 26], [58, 26], [52, 18], [44, 18.5]]); g.fill(); // windshield
    g.strokeStyle = '#d7dde6'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(44, 18.5); g.lineTo(52, 18); g.lineTo(58, 26); g.stroke();
    g.fillStyle = '#f3efe6'; g.beginPath(); g.roundRect(14, 21, 22, 5, 1.5); g.fill(); g.fillStyle = '#c9c2b4'; g.fillRect(16, 22, 18, 1); // seats
    rail(g, 60, 92, 24.5, 1.4, 5, '#cfd6df', 0.35);
    g.fillStyle = '#2a2f38'; g.beginPath(); g.roundRect(1, 25, 5, 9, 1); g.fill(); // outboard
    sheen(g, hull, 0.45);
    l.fillStyle = '#ff3b30'; l.beginPath(); l.arc(90, 26, 0.8, 0, 7); l.fill(); l.fillStyle = '#fff6e0'; l.beginPath(); l.arc(50, 17.6, 0.8, 0, 7); l.fill();
    return [{ pts: [[8, 37.6], [74, 37.6], [90, 31]], colors: ['#33e6ff', '#3b7bff'], mode: 'pulse' }];
  } },
  ferry: { w: 1.1, v: 4.5, wake: 0.6, draw(g, l) { // Chao Phraya style river ferry: two decks, orange stripe, rows of windows
    const hull = [[3, 28], [92, 28], [99, 24], [95, 33], [86, 39], [8, 39], [3, 34]];
    g.fillStyle = grad(g, 24, 39, [[0, '#f6f3ec'], [1, '#b9b3a6']]); poly(g, hull); g.fill();
    g.fillStyle = '#ef7d22'; poly(g, [[3, 31.5], [96, 30], [94.5, 32.2], [3, 33.4]]); g.fill();
    g.fillStyle = '#28323f'; poly(g, [[3, 35.6], [90, 35.2], [87, 37.4], [6, 37.6]]); g.fill();
    const d1 = [[8, 28], [86, 28], [84, 18], [10, 18]]; g.fillStyle = grad(g, 18, 28, [[0, '#ffffff'], [1, '#d9d4c8']]); poly(g, d1); g.fill();
    windows(g, 12, 82, 20.5, 4.5, 11, 1.4, '#304356');
    const d2 = [[22, 18], [72, 18], [70, 11.5], [24, 11.5]]; g.fillStyle = grad(g, 11, 18, [[0, '#ffffff'], [1, '#dcd7cc']]); poly(g, d2); g.fill();
    windows(g, 26, 68, 13.2, 3.4, 8, 1.3, '#304356');
    g.fillStyle = '#2a7bbf'; g.fillRect(20, 10.6, 54, 1.4); // roof edge
    g.fillStyle = '#9aa4b0'; g.fillRect(60, 3, 0.8, 8); g.fillStyle = '#e84a3a'; poly(g, [[60.8, 3], [66, 4.4], [60.8, 5.8]]); g.fill(); // mast and flag
    rail(g, 86, 97, 27, 1.2, 3, '#bfc5cc');
    sheen(g, d1, 0.3); sheen(g, hull, 0.25);
    l.fillStyle = '#ffcf86'; windows(l, 12, 82, 20.5, 4.5, 11, 1.4, '#ffcf86'); windows(l, 26, 68, 13.2, 3.4, 8, 1.3, '#ffd99c');
    l.fillStyle = '#ffffff'; l.beginPath(); l.arc(60.4, 2.6, 0.8, 0, 7); l.fill();
    return [];
  } },
  sailboat: { w: 0.92, v: 3, wake: 0.2, draw(g, l) { // sloop: white hull with a teak rubbing strake, full main and jib, masthead light
    const hull = [[10, 31], [88, 31], [99, 27.5], [92, 35], [80, 39], [18, 39], [10, 35]];
    g.fillStyle = grad(g, 27, 39, [[0, '#ffffff'], [1, '#c5ccd6']]); poly(g, hull); g.fill();
    g.fillStyle = '#1d3d6b'; poly(g, [[10, 35.5], [92, 35], [89, 36.6], [12, 37]]); g.fill();
    g.fillStyle = '#a8794d'; poly(g, [[10, 31], [88, 31], [97, 28.2], [88, 32.2], [10, 32.2]]); g.fill();
    g.fillStyle = '#eef1f4'; g.beginPath(); g.roundRect(34, 27, 26, 4, 1.5); g.fill(); windows(g, 37, 57, 28.3, 1.4, 4, 1.5, '#3d5168', 0.6); // cabin
    g.fillStyle = '#c7ccd3'; g.fillRect(49, 0.5, 0.9, 30.5); // mast
    g.fillStyle = grad(g, 1, 29, [[0, '#ffffff'], [1, '#e4e7ec']]); poly(g, [[48.6, 1.5], [48.6, 26.5], [20, 27]]); g.fill(); // main
    g.strokeStyle = 'rgba(120,130,150,.35)'; g.lineWidth = 0.3; for (let i = 1; i < 5; i++) { const y = 1.5 + i * 5; g.beginPath(); g.moveTo(48.6, y); g.lineTo(48.6 - (y - 1.5) * 1.1, y + 0.6); g.stroke(); }
    g.fillStyle = grad(g, 4, 30, [[0, '#f6f2ea'], [1, '#dcd6ca']]); poly(g, [[50.4, 3], [94, 29], [51, 29]]); g.fill(); // jib
    g.fillStyle = '#7a8496'; g.fillRect(20, 26.6, 29, 0.9); // boom
    sheen(g, hull, 0.4);
    l.fillStyle = '#fff4d8'; l.beginPath(); l.arc(49.4, 0.8, 0.9, 0, 7); l.fill(); l.fillStyle = '#ffcf86'; windows(l, 37, 57, 28.3, 1.4, 4, 1.5, '#ffcf86', 0.6);
    return [{ pts: [[49.4, 1.2], [94, 29]], colors: ['#ffe9b0'], mode: 'twinkle' }, { pts: [[49.4, 1.2], [12, 31]], colors: ['#ffe9b0'], mode: 'twinkle' }]; // string lights on the stays
  } },
  yacht: { w: 1.18, v: 5, wake: 0.7, draw(g, l) { // superyacht: long white hull, three stepped decks, dark glass bands, blue LED trim
    const hull = [[2, 27], [86, 27], [99.5, 22.5], [95, 31], [84, 39], [8, 39], [2, 33]];
    g.fillStyle = grad(g, 22, 39, [[0, '#ffffff'], [0.55, '#e3e8ee'], [1, '#9ba7b6']]); poly(g, hull); g.fill();
    g.fillStyle = '#121a26'; poly(g, [[6, 31], [84, 30], [92, 27.2], [86, 32], [8, 32.6]]); g.fill(); // hull windows band
    const d1 = [[10, 27], [84, 27], [78, 20], [16, 20]]; g.fillStyle = grad(g, 20, 27, [[0, '#ffffff'], [1, '#dde3ea']]); poly(g, d1); g.fill();
    g.fillStyle = '#1a2533'; poly(g, [[18, 21.6], [76, 21.6], [79.5, 25], [17, 25]]); g.fill();
    const d2 = [[22, 20], [72, 20], [66, 14], [28, 14]]; g.fillStyle = grad(g, 14, 20, [[0, '#ffffff'], [1, '#e0e5eb']]); poly(g, d2); g.fill();
    g.fillStyle = '#1a2533'; poly(g, [[30, 15.3], [64, 15.3], [68.5, 18.6], [27, 18.6]]); g.fill();
    const d3 = [[34, 14], [60, 14], [55, 9.5], [39, 9.5]]; g.fillStyle = '#f7f9fb'; poly(g, d3); g.fill();
    g.fillStyle = '#1a2533'; poly(g, [[41, 10.6], [54, 10.6], [57, 13], [38.5, 13]]); g.fill();
    g.fillStyle = '#cfd5dc'; g.fillRect(46, 3.5, 0.8, 6); g.beginPath(); g.arc(46.4, 6, 2.2, Math.PI, 0); g.fill(); // radar arch
    rail(g, 84, 98, 22.2, 1.3, 4, '#c8cfd8'); rail(g, 4, 14, 26.2, 1.1, 3, '#c8cfd8');
    sheen(g, hull, 0.4); sheen(g, d1, 0.3);
    l.fillStyle = 'rgba(255,214,150,.95)'; for (const [x0, x1, y, h] of [[20, 75, 22.2, 2.2], [31, 63, 16, 2], [42, 53, 11.1, 1.4], [10, 82, 30.6, 1]]) for (let x = x0; x < x1; x += 3.4) l.fillRect(x, y, 2.2, h);
    return [{ pts: [[10, 27], [84, 27], [99, 22.6]], colors: ['#4aa8ff', '#7fe0ff'], mode: 'flow' }, { pts: [[10, 38.4], [82, 38.4]], colors: ['#2f7dff'], mode: 'pulse' }];
  } },
  partycat: { w: 1.05, v: 3.5, wake: 0.5, draw(g, l) { // dinner-cruise catamaran: twin hulls, open deck under a canopy, colour bulbs that chase
    for (const [x0, x1] of [[4, 96]]) { const hull = [[x0, 29], [x1 - 6, 29], [x1, 26], [x1 - 3, 35], [x1 - 10, 39], [x0 + 4, 39], [x0, 34]]; g.fillStyle = grad(g, 26, 39, [[0, '#2b2f3b'], [1, '#12151d']]); poly(g, hull); g.fill(); sheen(g, hull, 0.25); }
    g.fillStyle = '#d8dde6'; g.fillRect(4, 28.2, 90, 1.2);
    g.fillStyle = '#5a3a26'; g.fillRect(8, 27, 82, 1.4); // deck
    g.fillStyle = '#c0c6cf'; for (const x of [10, 30, 50, 70, 88]) g.fillRect(x, 15, 0.7, 12.2); // canopy posts
    const can = [[6, 15], [92, 15], [88, 11.5], [10, 11.5]]; g.fillStyle = grad(g, 11, 15, [[0, '#f4f1ea'], [1, '#cfc8ba']]); poly(g, can); g.fill();
    g.fillStyle = 'rgba(30,24,40,.85)'; for (const x of [14, 22, 36, 44, 58, 66, 78]) { g.beginPath(); g.arc(x, 23.2, 1.6, 0, 7); g.fill(); g.fillRect(x - 1.3, 24.4, 2.6, 2.8); } // guests
    g.fillStyle = '#e9e2d4'; for (const x of [17, 40, 62]) g.fillRect(x, 24.6, 7, 1); // tables
    l.fillStyle = 'rgba(255,200,130,.6)'; l.fillRect(8, 15.2, 82, 11.8);
    return [
      { pts: [[7, 15.6], [26, 17.6], [48, 15.6], [70, 17.6], [91, 15.6]], colors: ['#ff4f6d', '#ffd93d', '#4dff88', '#45c8ff', '#c56bff'], mode: 'chase' },
      { pts: [[6, 33.5], [90, 33.5], [95, 28]], colors: ['#ff3fd8', '#7b5cff', '#33e6ff'], mode: 'cycle' },
    ];
  } },
  neonfoil: { w: 0.82, v: 11, wake: 1.3, draw(g, l) { // cyberpunk hydrofoil: dark faceted hull lifted on struts, flowing magenta and cyan lines
    g.fillStyle = '#2c3340'; g.fillRect(30, 30, 1.6, 9); g.fillRect(70, 30, 1.6, 9); g.fillRect(24, 37.6, 54, 1.2); // foils
    const hull = [[6, 22], [70, 21], [99, 25], [86, 30.5], [12, 31], [6, 28]];
    g.fillStyle = grad(g, 20, 31, [[0, '#3a4252'], [0.5, '#1b2029'], [1, '#0b0e14']]); poly(g, hull); g.fill();
    const cab = [[26, 21.4], [66, 21.2], [82, 23.6], [60, 13.5], [34, 13.8]]; g.fillStyle = grad(g, 13, 22, [[0, '#4d5a70'], [1, '#1c2230']]); poly(g, cab); g.fill();
    g.fillStyle = grad(g, 14, 21, [[0, 'rgba(120,220,255,.75)'], [1, 'rgba(30,60,110,.9)']]); poly(g, [[36, 15], [60, 14.8], [76, 22], [30, 21.6]]); g.fill();
    sheen(g, hull, 0.25); sheen(g, cab, 0.35);
    return [
      { pts: [[7, 27.5], [86, 27], [97, 25.2]], colors: ['#ff2fd1', '#2fe6ff'], mode: 'flow' },
      { pts: [[34, 13.8], [60, 13.5], [82, 23.6]], colors: ['#2fe6ff'], mode: 'pulse' },
      { pts: [[24, 38.2], [78, 38.2]], colors: ['#ff2fd1'], mode: 'pulse' },
    ];
  } },
};
export const BOAT_KINDS = Object.entries(KINDS).map(([id, k]) => ({ id, w: k.w, v: k.v, wake: k.wake }));

// hull + fixed lights at pixel width W; LED runs in box units, sampled into evenly spaced dots
export function buildBoat(id, W, mk) {
  const K = KINDS[id], H = Math.max(4, Math.round(W * UH / U)), s = W / U;
  const c = mk(W, H), g = c.getContext('2d'), lc = mk(W, H), l = lc.getContext('2d');
  g.scale(s, s); l.scale(s, s); g.lineJoin = l.lineJoin = 'round';
  const runs = K.draw(g, l) || [];
  const leds = runs.map(r => { // dots along the polyline, roughly every 2.2 units
    const dots = []; let acc = 0, every = r.mode === 'twinkle' ? 4.4 : 2.2;
    for (let i = 1; i < r.pts.length; i++) { const [x0, y0] = r.pts[i - 1], [x1, y1] = r.pts[i], d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(d / every)); for (let j = i === 1 ? 0 : 1; j <= n; j++) { dots.push([(x0 + (x1 - x0) * j / n) / U, (y0 + (y1 - y0) * j / n) / UH, acc + d * j / n]); } acc += d; }
    return { dots, colors: r.colors, mode: r.mode, len: acc };
  });
  return { sp: c, lit: lc, leds };
}

// one frame of a boat's LEDs, in the boat's own frame (origin at the waterline centre, w x h, already mirrored for direction)
export function drawLeds(ctx, leds, w, h, t, ph, alpha, dot) {
  if (!leds.length || alpha <= 0.01) return;
  const r = Math.max(0.5, w * 0.014);
  for (const L of leds) {
    const n = L.colors.length;
    for (let i = 0; i < L.dots.length; i++) {
      const [u, v, s] = L.dots[i];
      let a = 1, ci = 0;
      if (L.mode === 'chase') { ci = (i + Math.floor(t * 4 + ph)) % n; a = 0.75 + 0.25 * Math.sin(t * 6 + i); }
      else if (L.mode === 'cycle') { ci = Math.floor((t * 0.8 + ph + s / L.len) * n) % n; a = 0.85; }
      else if (L.mode === 'flow') { const q = (s / L.len - t * 0.35 - ph) % 1, f = q < 0 ? q + 1 : q; ci = f < 0.5 ? 0 : 1 % n; a = 0.45 + 0.55 * Math.pow(Math.sin(f * Math.PI * 2) * 0.5 + 0.5, 2); }
      else if (L.mode === 'pulse') { ci = 0; a = 0.55 + 0.45 * Math.sin(t * 2.4 + ph); }
      else { ci = 0; a = 0.25 + 0.25 * Math.sin(t * 3 + i * 1.7 + ph); } // twinkle: soft string lights
      ctx.globalAlpha = alpha * a; ctx.drawImage(dot(L.colors[ci]), -w / 2 + u * w - r * 2, -h + v * h - r * 2, r * 4, r * 4);
    }
  }
}
