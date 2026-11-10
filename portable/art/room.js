// One-off art repaint of the room pictures, run in a browser page by portable/art/run-room.js. Not loaded by the site.
// David, 2026-11-10: remove the foreground bamboo; every desk minimalist, dark walnut, no drawers, cleanly cut, nothing distorted.
// Replaces the first desk repaint (desks.js), whose drawer boxes were painted over the bean bags and left black bars under the front desk.
// Works on the ORIGINAL pictures (the commit that seeded main), at the 3x plate, then derives the 2x plate from it:
//  1. bamboo: both corner plants are filled in from the floor, rug, fridge and desk around them (inpaint.js)
//  2. drawers: each drawer stack is filled in from the open space under its desk; a slim walnut slab leg stays at the outer end
//  3. walnut: the desk tops and front edges become dark walnut (only wood-coloured pixels: monitors, plants, mugs and chairs keep theirs)
//  4. chair-less floor patches (shown while a bot turns in its chair) are rebuilt from the new pictures, without the old smears
// Night pictures get exactly the same fills as dusk (the dusk picture guides the search). Coordinates: plate px (1280 x 720).
import { inpaint } from './inpaint.js';

const PW = 1280, PH = 720, S = 3, SLAB = 4;
export const DESKS = [
  { id: 'video', top: [[268, 465], [491, 464], [493, 478], [492, 489], [259, 489], [259, 479]], peds: [[262, 488, 306, 536, 'L'], [444, 488, 490, 541, 'R']] },
  { id: 'sbp', top: [[541, 465], [752, 464], [761, 481], [761, 491], [531, 492], [531, 481]], peds: [[534, 490, 576, 513, 'L'], [716, 490, 757, 513, 'R']] },
  { id: 'messages', top: [[795, 460], [1012, 459], [1012, 488], [787, 488], [786, 476]], peds: [[790, 487, 837, 541, 'L'], [971, 487, 996, 506, 'R']] },
  { id: 'housekeeping', top: [[1000, 493], [1280, 492], [1280, 532], [1044, 532], [1044, 525], [1000, 525]], peds: [] },
  { id: 'numbers', top: [[831, 575], [1066, 575], [1076, 617], [1076, 627], [820, 627], [820, 617]], peds: [[821, 626, 859, 691, 'L'], [1024, 626, 1062, 691, 'R']] },
];
// The corner plants: the bamboo (its overlay mask) plus the darker plant behind it (traced here). Each corner is filled zone by zone, every zone
// from its own kind of source, so a bean bag continues as bean bag, a chair as chair, the desk as desk and the floor as floor.
// zone: clip (what part of the hole), src (where it may copy from) or copy: [dx, dy] (straight copy of the same thing dx, dy plate px away).
// the round lounge rug, traced: inside it the fill is rug, outside it wood floor
const RUG = g => { g.beginPath(); g.ellipse(305, 640, 170, 72, 0, 0, 7); g.fill(); };
const BAMBOO = [
  { mask: 'room-l', win: [0, 300, 430, 720], extra: [[[0, 538], [50, 538], [56, 530], [95, 527], [116, 540], [115, 566], [104, 606], [84, 646], [0, 656]], [[98, 611], [114, 611], [114, 627], [98, 627]], [[0, 640], [118, 640], [118, 720], [0, 720]]],
    zones: [
      { clip: 'bag-r', src: 'bag-r' },
      { clip: RUG, src: RUG, noBags: true },
      { clip: [16, 524, 50, 533], copy: [0, -21] },                     // the lower door's handle: a copy of the matching upper one
      { clip: [0, 500, 83, 566], stretch: [520, 526], base: 562 },       // the fridge's lower door (colour of rows 520-526, above its handle), continued down to its foot
      { clip: [83, 500, 222, 566], stretch: [519, 526], base: 562 },     // the counter's end panel and drawer front, continued down to its plinth
      { clip: null, floor: { shadow: [0, 222, 566], edge: [0, 150] }, src: [0, 567, 520, 717], noBags: true, noChairs: true, not: [RUG, [480, 540, 520, 720]] },
    ] },
  { mask: 'room-r', win: [860, 380, 1280, 720], extra: [[[1186, 506], [1280, 498], [1280, 668], [1196, 668], [1182, 602]], [[1063, 632], [1100, 632], [1100, 690], [1280, 690], [1280, 720], [1063, 720]]],
    zones: [
      { clip: 'chair:h1', copy: 'chair:h0', dark: 70 },                  // only the chair itself (dark), not what stands around it
      { clip: [1150, 474, 1280, 495], stretch: [470, 476], base: 9999 },  // the wall behind the desk end
      { clip: [1150, 495, 1280, 542], rows: [1050, 1198], wood: true },                // the desk top and its front edge run on to the picture's edge
      { clip: null, floor: true, src: [860, 556, 1280, 717], noChairs: true, not: [[815, 565, 1080, 696]] },
    ] },
];

export const img = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('load ' + src)); i.src = src; });
export const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
export const ctx = c => c.getContext('2d', { willReadFrequently: true });
function rgb2hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return [0, 0, l]; const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, s, l]; }
function hsl2rgb(h, s, l) { h /= 360; const f = (p, q, t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; if (!s) return [l * 255, l * 255, l * 255]; const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255]; }
const walnut = (r, g, b) => { const [, s, l] = rgb2hsl(r, g, b); return hsl2rgb(22, Math.min(0.5, s) * 0.85, l * 0.5 + 0.015); };
export const isWood = (r, g, b) => { const [h, s, l] = rgb2hsl(r, g, b); return h >= 8 && h <= 46 && s > 0.22 && l > 0.1 && l < 0.85; };
export const poly = (g, p) => { g.beginPath(); p.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); };

// a bitmap over window w (plate px) at 3x, painted in plate coordinates
export function bitmap(w, paint, thr = 128) {
  const W = (w[2] - w[0]) * S, H = (w[3] - w[1]) * S, c = canvas(W, H), g = ctx(c);
  g.setTransform(S, 0, 0, S, -w[0] * S, -w[1] * S); paint(g);
  const d = g.getImageData(0, 0, W, H).data, m = new Uint8Array(W * H);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] >= thr ? 1 : 0;
  return m;
}
export function dilate(m, W, H, r) {
  const t = new Uint8Array(W * H), o = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let a = 0; for (let d = -r; d <= r && !a; d++) { const xx = x + d; if (xx >= 0 && xx < W && m[y * W + xx]) a = 1; } t[y * W + x] = a; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let a = 0; for (let d = -r; d <= r && !a; d++) { const yy = y + d; if (yy >= 0 && yy < H && t[yy * W + x]) a = 1; } o[y * W + x] = a; }
  return o;
}
// fill `hole` inside window w of the given 3x canvases (all with the same fill); writes back unless `keep`
export function fill(cvs, w, hole, valid, keep) {
  const W = (w[2] - w[0]) * S, H = (w[3] - w[1]) * S;
  const datas = cvs.map(c => ctx(c).getImageData(w[0] * S, w[1] * S, W, H)), F = datas.map(d => { const f = new Float32Array(W * H * 3); for (let i = 0; i < W * H; i++) { f[i * 3] = d.data[i * 4]; f[i * 3 + 1] = d.data[i * 4 + 1]; f[i * 3 + 2] = d.data[i * 4 + 2]; } return f; });
  inpaint(F, W, H, hole, valid);
  datas.forEach((d, k) => { for (let i = 0; i < W * H; i++) if (hole[i]) { d.data[i * 4] = F[k][i * 3]; d.data[i * 4 + 1] = F[k][i * 3 + 1]; d.data[i * 4 + 2] = F[k][i * 3 + 2]; d.data[i * 4 + 3] = 255; } });
  if (!keep) datas.forEach((d, k) => ctx(cvs[k]).putImageData(d, w[0] * S, w[1] * S));
  return datas;
}

// Wood floor where too little real floor is left to copy from: the floor's own colours spread smoothly over the hole (from the known floor
// pixels only), then the painting's plank pattern on top: long boards running left-right, closer together further back, faint seams and
// end joints, a little grain. Deterministic, so dusk and night get the same boards. The plate's dark bottom edge (y >= 717) is kept.
const VP = [640, 330], BOARD = 15; // floor perspective, plate px: vanishing point, board width at the bottom edge
export function floorFill(cvs, w, hole, known, o = {}) {
  const W = (w[2] - w[0]) * S, H = (w[3] - w[1]) * S, R = 16;
  const hash = (a, b) => { let h = Math.imul(a, 374761393) + Math.imul(b, 668265263) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; };
  for (const c of cvs) {
    const d = ctx(c).getImageData(w[0] * S, w[1] * S, W, H), D = d.data, F = new Float32Array(W * H * 3), k = known.slice();
    for (let i = 0; i < W * H; i++) if (k[i] && D[i * 4] < D[i * 4 + 1] * 1.3) k[i] = 0; // floor colours only (red-brown): no leaf greens or bamboo-stalk yellows
    for (let i = 0; i < W * H; i++) if (k[i]) { F[i * 3] = D[i * 4]; F[i * 3 + 1] = D[i * 4 + 1]; F[i * 3 + 2] = D[i * 4 + 2]; }
    // the room's light on the floor: a smooth fit (1, x, y, x*y, x*x, y*y per channel) to the lit floor samples, shadows left out
    const sm = []; for (let i = 0; i < W * H; i += 3) if (k[i]) sm.push(i);
    const lum = sm.map(i => D[i * 4] + D[i * 4 + 1] + D[i * 4 + 2]).sort((a, b) => a - b), med = lum[lum.length >> 1] || 1;
    const fitIdx = sm.filter(i => { const v = D[i * 4] + D[i * 4 + 1] + D[i * 4 + 2]; return v > med * 0.5 && v < med * 1.4; }), basis = i => { const x = (i % W) / W, y = ((i / W) | 0) / H; return [1, x, y, x * y, x * x, y * y]; };
    const coef = [0, 1, 2].map(ch => { const A = Array.from({ length: 6 }, () => new Float64Array(6)), b = new Float64Array(6);
      for (const i of fitIdx) { const p = basis(i), v = D[i * 4 + ch]; for (let r = 0; r < 6; r++) { b[r] += p[r] * v; for (let c = 0; c < 6; c++) A[r][c] += p[r] * p[c]; } }
      for (let r = 0; r < 6; r++) A[r][r] += 1e-3 * fitIdx.length; // a little ridge: no wild bends where samples are few
      return solve(A, b); });
    const fitAt = (i, ch) => { const p = basis(i); let v = 0; for (let r = 0; r < 6; r++) v += coef[ch][r] * p[r]; return v; };
    const dist = new Float32Array(W * H); let ringNo = 0;
    let ring = []; for (let i = 0; i < W * H; i++) if (!k[i]) { const x = i % W; if ((x > 0 && k[i - 1]) || (x < W - 1 && k[i + 1]) || (i >= W && k[i - W]) || (i + W < W * H && k[i + W])) ring.push(i); }
    while (ring.length) {
      const v = ring.map(i => { const x = i % W; let r = 0, g = 0, b = 0, n = 0; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < W * H && k[j]) { r += F[j * 3]; g += F[j * 3 + 1]; b += F[j * 3 + 2]; n++; } return [r / n, g / n, b / n]; });
      ringNo++; ring.forEach((i, q) => { F[i * 3] = v[q][0]; F[i * 3 + 1] = v[q][1]; F[i * 3 + 2] = v[q][2]; k[i] = 1; dist[i] = ringNo; });
      const nx = new Set(); for (const i of ring) { const x = i % W; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < W * H && !k[j]) nx.add(j); }
      ring = [...nx];
    }
    for (let pass = 0; pass < 3; pass++) { // smooth the spread colours (box blur, x then y)
      const T = new Float32Array(F.length);
      for (let y = 0; y < H; y++) for (let ch = 0; ch < 3; ch++) { let acc = 0, n = 0; for (let x = -R; x < W + R; x++) { if (x + R < W) { acc += F[(y * W + x + R) * 3 + ch]; n++; } if (x - R - 1 >= 0) { acc -= F[(y * W + x - R - 1) * 3 + ch]; n--; } if (x >= 0 && x < W) T[(y * W + x) * 3 + ch] = acc / n; } }
      for (let x = 0; x < W; x++) for (let ch = 0; ch < 3; ch++) { let acc = 0, n = 0; for (let y = -R; y < H + R; y++) { if (y + R < H) { acc += T[((y + R) * W + x) * 3 + ch]; n++; } if (y - R - 1 >= 0) { acc -= T[((y - R - 1) * W + x) * 3 + ch]; n--; } if (y >= 0 && y < H) F[(y * W + x) * 3 + ch] = acc / n; } }
    }
    for (let i = 0; i < W * H; i++) if (hole[i]) { // near the edge the real neighbours' colours, further in the fitted light
      const t = Math.min(1, dist[i] / (14 * S)), e = t * t * (3 - 2 * t);
      for (let ch = 0; ch < 3; ch++) F[i * 3 + ch] = F[i * 3 + ch] * (1 - e) + fitAt(i, ch) * e;
    }
    for (let i = 0; i < W * H; i++) {
      if (!hole[i]) continue;
      const px = w[0] + (i % W) / S, py = w[1] + ((i / W) | 0) / S;
      if (py >= 717.3) { D[i * 4] = 18; D[i * 4 + 1] = 10; D[i * 4 + 2] = 8; continue; }
      // boards run front to back, towards the vanishing point VP, as in the painted floor; xb: where this board meets the bottom edge
      const dy = Math.max(8, py - VP[1]), xb = VP[0] + (px - VP[0]) * (720 - VP[1]) / dy, u = xb / BOARD, b = Math.floor(u), fr = u - b;
      const pxPerBoard = BOARD * dy / (720 - VP[1]);
      let m = 1 + (hash(b, 7) - 0.5) * 0.1;                                     // each board a little lighter or darker
      const seamW = 0.7 / pxPerBoard; if (fr < seamW) m *= 0.8 + 0.2 * fr / seamW; // the seam between boards
      const z = 3600 / dy / 3 + hash(b, 3), dz = 3600 / dy / dy / 3; if (z - Math.floor(z) < dz * 0.8) m *= 0.86; // end joints
      m *= 1 + 0.03 * Math.sin(xb * 0.9 + hash(b, 5) * 40) * (0.6 + 0.4 * Math.sin(z * 5.3 + b));          // grain along the board
      if (o.edge) m *= 1 - 0.3 * Math.max(0, 1 - Math.abs(px - o.edge[0]) / o.edge[1]); // the room darkens towards the picture's edge
      if (o.shadow && px >= o.shadow[0] && px < o.shadow[1]) { const d = py - o.shadow[2]; if (d < 3.2) m *= 0.3; else { const t = (d - 3.2) / 16; if (t < 1) m *= 0.5 + 0.5 * t ** 0.8; } } // recessed kick plate, then the contact shadow // contact shadow under the counter and fridge
      D[i * 4] = F[i * 3] * m; D[i * 4 + 1] = F[i * 3 + 1] * m; D[i * 4 + 2] = F[i * 3 + 2] * m;
    }
    ctx(c).putImageData(d, w[0] * S, w[1] * S);
  }
}

function solve(A, b) { // Gauss-Jordan, small systems
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-9; for (let k = c; k <= n; k++) M[c][k] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; } }
  return M.map(r => r[n]);
}

// first guess for a hole: the colours around it grown inwards, ring by ring
function prefill(cvs, w, hole) {
  const W = (w[2] - w[0]) * S, H = (w[3] - w[1]) * S;
  for (const c of cvs) {
    const d = ctx(c).getImageData(w[0] * S, w[1] * S, W, H), D = d.data, known = hole.map(v => v ? 0 : 1);
    let ring = []; for (let i = 0; i < W * H; i++) if (!known[i]) { const x = i % W, y = (i / W) | 0; if ((x > 0 && known[i - 1]) || (x < W - 1 && known[i + 1]) || (y > 0 && known[i - W]) || (y < H - 1 && known[i + W])) ring.push(i); }
    while (ring.length) {
      const vals = ring.map(i => { const x = i % W, y = (i / W) | 0; let r = 0, g = 0, b = 0, n = 0; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) if (j >= 0 && known[j]) { r += D[j * 4]; g += D[j * 4 + 1]; b += D[j * 4 + 2]; n++; } return [r / n, g / n, b / n]; });
      ring.forEach((i, k) => { D[i * 4] = vals[k][0]; D[i * 4 + 1] = vals[k][1]; D[i * 4 + 2] = vals[k][2]; known[i] = 1; });
      const next = new Set(); for (const i of ring) { const x = i % W, y = (i / W) | 0; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) if (j >= 0 && !known[j]) next.add(j); }
      ring = [...next];
    }
    ctx(c).putImageData(d, w[0] * S, w[1] * S);
  }
}

export async function run(orig, assets, only) {
  const t0 = performance.now(), log = [];
  const L = await fetch(assets + 'layout.json').then(r => r.json());
  const masks = {}; for (const m of ['room-l', 'room-r', 'bag-r', 'bag-b', 'bag-m', 'table']) masks[m] = await img(assets + m + '-mask.png');
  const P = { dusk: await img(orig + 'plate-dusk-hi.webp'), night: await img(orig + 'plate-night-hi.webp') }, LO = { dusk: await img(orig + 'plate-dusk.webp'), night: await img(orig + 'plate-night.webp') };
  const NC = await img(orig + 'nochair-dusk.webp'); // the patch shapes (alpha); both atlases share them
  const hi = {}; for (const k of ['dusk', 'night']) { hi[k] = canvas(P[k].width, P[k].height); ctx(hi[k]).drawImage(P[k], 0, 0); }
  const cv = [hi.dusk, hi.night];
  const drawMask = (g, name) => { const [a, b, c, d] = L.masks[name]; g.drawImage(masks[name], a * PW, b * PH, (c - a) * PW, (d - b) * PH); };
  const seats = L.desks.flatMap(d => d.seats);
  const chairPolys = seats.map(s => s.chair.map(([x, y]) => [x * PW, y * PH]));
  // below each chair back: its post (narrow) and its five-star base with wheels (wide, near the floor line)
  const chairBases = seats.flatMap(s => { const p = s.chair.map(([x, y]) => [x * PW, y * PH]), xs = p.map(q => q[0]), x0 = Math.min(...xs), x1 = Math.max(...xs), cx = (x0 + x1) / 2, hw = (x1 - x0) * 0.68, yb = Math.max(...p.map(q => q[1])), bs = s.base * PH, top = Math.max(yb, bs - (bs - yb) * 0.6); return [[cx - 5, yb - 2, cx + 5, top], [cx - hw, top, cx + hw, bs + 3]]; });
  const monitors = [...L.desks.flatMap(d => d.monitors), ...L.boss.monitors].map(q => q.map(([x, y]) => [x * PW, y * PH]));
  const paintChairs = g => { for (const p of chairPolys) { poly(g, p); g.fill(); } for (const [a, b, c, d] of chairBases) g.fillRect(a, b, c - a, d - b); };
  const paintMonitors = g => { g.lineWidth = 12; g.lineJoin = 'round'; for (const p of monitors) { poly(g, p); g.fill(); g.stroke(); } };
  const paintBags = g => { for (const m of ['bag-r', 'bag-b', 'bag-m', 'table']) drawMask(g, m); };
  const allPeds = DESKS.flatMap(d => d.peds);

  // 1. bamboo
  const seatOf = id => seats.findIndex(q => q.id === id);
  const paintChair = (g, i) => { poly(g, chairPolys[i]); g.fill(); for (const [a, b, c, d] of chairBases.slice(i * 2, i * 2 + 2)) g.fillRect(a, b, c - a, d - b); };
  if (!only || only.includes('bamboo')) for (const b of BAMBOO) {
    const w = b.win, W = (w[2] - w[0]) * S, H = (w[3] - w[1]) * S;
    const rem = dilate(bitmap(w, g => { drawMask(g, b.mask); for (const p of b.extra) { poly(g, p); g.fill(); } }, 10), W, H, 7);
    prefill(cv, w, rem); // smooth first guess, so leftover leaf colours never steer the search
    for (const z of b.zones) {
      const clip = z.clip == null ? null : bitmap(w, g => typeof z.clip === 'function' ? z.clip(g) : typeof z.clip === 'string' ? z.clip.startsWith('chair:') ? paintChair(g, seatOf(z.clip.slice(6))) : drawMask(g, z.clip) : g.fillRect(z.clip[0], z.clip[1], z.clip[2] - z.clip[0], z.clip[3] - z.clip[1]));
      const hole = rem.map((v, i) => v && (!clip || clip[i]) ? 1 : 0);
      if (!hole.some(v => v)) continue;
      if (z.rows) { // each row continues with the average colour of its own pixels at x rows[0]..rows[1]
        const ds = cv.map(c => ctx(c).getImageData(w[0] * S, w[1] * S, W, H)), a = Math.round((z.rows[0] - w[0]) * S), b = Math.round((z.rows[1] - w[0]) * S);
        for (const d of ds) { let prev = null; for (let y = 0; y < H; y++) { let r = 0, g = 0, bl = 0, n = 0; for (let x = a; x <= b; x++) { const j = y * W + x; if (!rem[j] && (!z.wood || isWood(d.data[j * 4], d.data[j * 4 + 1], d.data[j * 4 + 2]))) { r += d.data[j * 4]; g += d.data[j * 4 + 1]; bl += d.data[j * 4 + 2]; n++; } } let c = n > 4 ? [r / n, g / n, bl / n] : null; if (!c && z.wood) { r = g = bl = n = 0; for (let x = a; x <= b; x++) { const j = y * W + x; if (!rem[j]) { r += d.data[j * 4]; g += d.data[j * 4 + 1]; bl += d.data[j * 4 + 2]; n++; } } if (n) c = [r / n, g / n, bl / n]; } c = c || prev; /* no wood in a row (the dark front edge): its plain average */ prev = c; if (!c) continue; for (let x = 0; x < W; x++) { const i = y * W + x; if (hole[i]) { d.data[i * 4] = c[0]; d.data[i * 4 + 1] = c[1]; d.data[i * 4 + 2] = c[2]; } } } }
        for (let i = 0; i < hole.length; i++) if (hole[i]) rem[i] = 0;
        ds.forEach((d, k) => ctx(cv[k]).putImageData(d, w[0] * S, w[1] * S));
        continue;
      }
      if (z.stretch) { // each column continues its last known colour downward, darkening a little towards the floor
        const ds = cv.map(c => ctx(c).getImageData(w[0] * S, w[1] * S, W, H));
        for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) { const i = y * W + x; if (!hole[i]) continue; const py = w[1] + y / S, m = py > z.base ? 0.45 : 1 - 0.1 * Math.max(0, py - 530) / 26; for (const d of ds) for (let ch = 0; ch < 3; ch++) { let a = 0, n = 0; for (let yy = Math.round((z.stretch[0] - w[1]) * S); yy <= Math.round((z.stretch[1] - w[1]) * S); yy++) { a += d.data[(yy * W + x) * 4 + ch]; n++; } d.data[i * 4 + ch] = a / n * m; } } }
        for (let i = 0; i < hole.length; i++) if (hole[i]) rem[i] = 0;
        ds.forEach((d, k) => ctx(cv[k]).putImageData(d, w[0] * S, w[1] * S));
        continue;
      }
      if (z.copy) { // the twin chair moved over, or the same thing continued from dx, dy plate px away
        let dx, dy; if (Array.isArray(z.copy)) { dx = -z.copy[0] * S; dy = -z.copy[1] * S; } else { const a = seats[seatOf(z.clip.slice(6))], o = seats[seatOf(z.copy.slice(6))]; dx = Math.round((a.x - o.x) * PW * S); dy = Math.round((a.ctop - o.ctop) * PH * S); }
        const ds = cv.map(c => ctx(c).getImageData(w[0] * S, w[1] * S, W, H));
        for (let i = 0; i < hole.length; i++) {
          if (!hole[i]) continue; const x = i % W - dx, y = ((i / W) | 0) - dy; if (x < 0 || y < 0 || x >= W || y >= H) continue; const j = y * W + x; if (rem[j]) continue; if (z.dark) { const q = ds[0].data; if (q[j * 4] + q[j * 4 + 1] + q[j * 4 + 2] > z.dark * 3 || isWood(q[j * 4], q[j * 4 + 1], q[j * 4 + 2])) continue; }
          for (const d of ds) { d.data[i * 4] = d.data[j * 4]; d.data[i * 4 + 1] = d.data[j * 4 + 1]; d.data[i * 4 + 2] = d.data[j * 4 + 2]; }
          rem[i] = 0;
        }
        ds.forEach((d, k) => ctx(cv[k]).putImageData(d, w[0] * S, w[1] * S));
        continue;
      }
      const src = bitmap(w, g => typeof z.src === 'function' ? z.src(g) : typeof z.src === 'string' ? drawMask(g, z.src) : g.fillRect(z.src[0], z.src[1], z.src[2] - z.src[0], z.src[3] - z.src[1]));
      const no = bitmap(w, g => { if (z.noBags) paintBags(g); if (z.noChairs) paintChairs(g); paintMonitors(g); for (const n of z.not || []) if (typeof n === "function") n(g); else g.fillRect(n[0], n[1], n[2] - n[0], n[3] - n[1]); });
      const known = src.map((v, i) => v && !rem[i] && !no[i] ? 1 : 0);
      if (z.floor) floorFill(cv, w, hole, known, z.floor); else fill(cv, w, hole, known);
      for (let i = 0; i < rem.length; i++) if (hole[i]) rem[i] = 0;
    }
    log.push(`${b.mask} ${Math.round(performance.now() - t0)}ms`);
  }
  // 2. drawer stacks -> open space + slab leg
  if (!only || only.includes('desks')) {
    for (const [x0, y0, x1, y1, side] of allPeds) {
      const w = [Math.max(0, x0 - 60), Math.max(0, y0 - 45), Math.min(PW, x1 + 60), Math.min(PH, y1 + 45)], W = (w[2] - w[0]) * S, H = (w[3] - w[1]) * S;
      const sx0 = side === 'L' ? x0 + SLAB : x0, sx1 = side === 'L' ? x1 : x1 - SLAB;
      const keepOut = bitmap(w, g => { paintChairs(g); paintMonitors(g); paintBags(g); });
      const hole = bitmap(w, g => g.fillRect(sx0, y0, sx1 - sx0, y1 - y0)).map((v, i) => v && !keepOut[i] ? 1 : 0);
      const busy = bitmap(w, g => { for (const [a, b, c, d] of allPeds) g.fillRect(a - 1, b, c - a + 2, d - b + 1); });
      const valid = hole.map((v, i) => v || busy[i] || keepOut[i] ? 0 : 1);
      fill(cv, w, hole, valid);
      for (const c of cv) { // the desktop's shadow over the open space: darkest right under the top, fading towards the floor
        const g = ctx(c), id = g.getImageData(w[0] * S, w[1] * S, W, H), D = id.data;
        for (let i = 0; i < hole.length; i++) { if (!hole[i]) continue; const y = w[1] + ((i / W) | 0) / S, t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0))), m = 0.42 + 0.5 * t * t * (3 - 2 * t); D[i * 4] *= m; D[i * 4 + 1] *= m; D[i * 4 + 2] *= m; }
        g.putImageData(id, w[0] * S, w[1] * S);
      }
      // the slab leg: walnut, lit on its outer face, a soft contact shadow at its foot
      for (const c of cv) {
        const g = ctx(c); g.save(); g.setTransform(S, 0, 0, S, 0, 0);
        const lx = side === 'L' ? x0 : x1 - SLAB, gr = g.createLinearGradient(lx, 0, lx + SLAB, 0), lit = side === 'L';
        gr.addColorStop(0, lit ? '#523221' : '#2c1a10'); gr.addColorStop(0.5, '#3e2617'); gr.addColorStop(1, lit ? '#2c1a10' : '#523221');
        g.beginPath(); g.rect(lx, y0, SLAB, y1 - y0); g.clip();
        g.fillStyle = gr; g.fillRect(lx, y0, SLAB, y1 - y0);
        const sh = g.createLinearGradient(0, y0, 0, y0 + 6); sh.addColorStop(0, 'rgba(0,0,0,.45)'); sh.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sh; g.fillRect(lx, y0, SLAB, 6);
        g.restore(); g.save(); g.setTransform(S, 0, 0, S, 0, 0);
        const fy = y1 - 0.5, foot = g.createRadialGradient(lx + SLAB / 2, fy, 0, lx + SLAB / 2, fy, 7); foot.addColorStop(0, 'rgba(10,5,3,.42)'); foot.addColorStop(1, 'rgba(10,5,3,0)');
        g.fillStyle = foot; g.beginPath(); g.ellipse(lx + SLAB / 2, fy, 7, 2.2, 0, 0, 7); g.fill(); g.restore();
      }
      // bean bags, chairs and monitors that overlapped the leg are put back on top from the original picture
      for (const k of ['dusk', 'night']) {
        const c = hi[k], g = ctx(c), tmp = canvas(c.width, c.height), tg = ctx(tmp);
        tg.drawImage(P[k], 0, 0); tg.globalCompositeOperation = 'destination-in';
        const m = canvas(c.width, c.height), mg = ctx(m); mg.setTransform(S, 0, 0, S, 0, 0); mg.beginPath(); mg.rect(side === 'L' ? x0 - 1 : x1 - SLAB - 1, y0, SLAB + 2, y1 - y0 + 4); mg.clip(); paintChairs(mg); paintMonitors(mg); paintBags(mg);
        tg.drawImage(m, 0, 0); g.drawImage(tmp, 0, 0);
      }
      log.push(`ped ${x0},${y0} ${Math.round(performance.now() - t0)}ms`);
    }
    // 3. walnut tops
    const W = hi.dusk.width, H = hi.dusk.height, top = canvas(W, H), tg = ctx(top);
    tg.setTransform(S, 0, 0, S, 0, 0); tg.fillStyle = '#fff'; tg.filter = 'blur(0.5px)'; for (const d of DESKS) { poly(tg, d.top); tg.fill(); }
    tg.filter = 'none'; tg.globalCompositeOperation = 'destination-out'; tg.fillStyle = '#000'; for (const p of chairPolys) { poly(tg, p); tg.fill(); } paintMonitors(tg); paintBags(tg); // chair backs only: a base box of a chair behind a desk would cut a hole in that desk
    const box = [250 * S, 455 * S, 1270 * S, 630 * S], tm = tg.getImageData(box[0], box[1], box[2] - box[0], box[3] - box[1]).data;
    for (const c of cv) {
      const g = ctx(c), id = g.getImageData(box[0], box[1], box[2] - box[0], box[3] - box[1]), D = id.data;
      for (let i = 0; i < D.length; i += 4) {
        const a = tm[i + 3] / 255; if (!a) continue;
        const r = D[i], gg = D[i + 1], b = D[i + 2]; if (!isWood(r, gg, b)) continue;
        const [nr, ng, nb] = walnut(r, gg, b); D[i] = r + (nr - r) * a; D[i + 1] = gg + (ng - gg) * a; D[i + 2] = b + (nb - b) * a;
      }
      g.putImageData(id, box[0], box[1]);
    }
    log.push(`walnut ${Math.round(performance.now() - t0)}ms`);
  }
  // 4. chair-less patches from the finished pictures (on copies: the chairs stay in the room pictures)
  const ncOut = { dusk: canvas(NC.width, NC.height), night: canvas(NC.width, NC.height) };
  if (!only || only.includes('nochair')) for (const s of seats) {
    if (s.nc == null) continue;
    const [ax, ay, w2, h2, x, y] = L.nochair[s.nc], pw = w2 / 2, ph = h2 / 2, w = [Math.max(0, Math.floor(x - 50)), Math.max(0, Math.floor(y - 40)), Math.min(PW, Math.ceil(x + pw + 50)), Math.min(PH, Math.ceil(y + ph + 40))];
    const W = (w[2] - w[0]) * S, H = (w[3] - w[1]) * S;
    const shape = bitmap(w, g => g.drawImage(NC, ax, ay, w2, h2, x, y, pw, ph), 8), hole = dilate(shape, W, H, 2);
    const other = bitmap(w, g => { paintChairs(g); paintMonitors(g); paintBags(g); });
    const valid = hole.map((v, i) => v || other[i] ? 0 : 1);
    const out = fill(cv, w, hole, valid, true);
    ['dusk', 'night'].forEach((k, i) => {
      const t = canvas(W, H); ctx(t).putImageData(out[i], 0, 0);
      const a = ctx(ncOut[k]); a.drawImage(t, (x - w[0]) * S, (y - w[1]) * S, pw * S, ph * S, ax, ay, w2, h2);
    });
    log.push(`nochair ${s.id} ${Math.round(performance.now() - t0)}ms`);
  }
  for (const k of ['dusk', 'night']) { const a = ctx(ncOut[k]); a.globalCompositeOperation = 'destination-in'; a.drawImage(NC, 0, 0); }
  // 2x plates: the original 2x picture, with every changed 3x pixel brought down
  const lo = {};
  for (const k of ['dusk', 'night']) {
    const W = hi[k].width, H = hi[k].height, A = ctx(hi[k]).getImageData(0, 0, W, H).data, o = canvas(W, H); ctx(o).drawImage(P[k], 0, 0);
    const B = ctx(o).getImageData(0, 0, W, H).data, m = new ImageData(W, H);
    for (let i = 0; i < A.length; i += 4) if (A[i] !== B[i] || A[i + 1] !== B[i + 1] || A[i + 2] !== B[i + 2]) { m.data[i] = A[i]; m.data[i + 1] = A[i + 1]; m.data[i + 2] = A[i + 2]; m.data[i + 3] = 255; }
    const ch = canvas(W, H); ctx(ch).putImageData(m, 0, 0);
    const l = lo[k] = canvas(LO[k].width, LO[k].height), lg = ctx(l); lg.drawImage(LO[k], 0, 0); lg.imageSmoothingQuality = 'high'; lg.drawImage(ch, 0, 0, l.width, l.height);
  }
  const out = {
    'plate-dusk-hi.webp': hi.dusk.toDataURL('image/webp', 0.9), 'plate-night-hi.webp': hi.night.toDataURL('image/webp', 0.9),
    'plate-dusk.webp': lo.dusk.toDataURL('image/webp', 0.9), 'plate-night.webp': lo.night.toDataURL('image/webp', 0.9),
  };
  if (!only || only.includes('nochair')) { out['nochair-dusk.webp'] = ncOut.dusk.toDataURL('image/webp', 0.9); out['nochair-night.webp'] = ncOut.night.toDataURL('image/webp', 0.9); }
  window.__roomOut = out;
  return { log, sizes: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])) };
}
