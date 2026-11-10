// The office rebuilt (David, 2026-11-10, evening): run in a browser page by portable/art/run-scene.js. Not loaded by the site.
//  - one clean wood floor everywhere at floor level (boards toward the vanishing point, the room's light as a smooth fit of the painted
//    floor); the kitchen, the lounge rug, bean bags, table and floor lamp are kept and stand on it
//  - every desk the same black minimalist desk (the boss desk's look): charcoal top, lighter front edge, four plain legs, open beneath,
//    so whatever walks behind a desk shows through; a bigger desk is just a wider one
//  - one monitor per bot; chairs at every seat; the chair-less patches and the front desks' cut-outs made to match
//  - Studio, Media, LF at the back-left desk; Ops, Usage, Archives, Dash at the back-right desk; one small bamboo in the left corner
// Input: the corner-fixed pictures from room.js (bamboo step) in `base`, the seed pictures in `orig`. Coordinates: plate px (1280 x 720).
import { inpaint } from './inpaint.js';
import { img, canvas, ctx, poly, bitmap, dilate, fill } from './room.js';

const PW = 1280, PH = 720, S = 3;
const VP = [640, 330], BOARD = 15;
// desks: x0, x1; yb back edge of the top, yf its front edge, ye bottom of the front edge, yfl where the front legs meet the floor; leg width
export const DESKS = {
  // each desk just covers its monitors and seats, with a small margin (David, 2026-11-10: no empty desk space)
  video: { x0: 262, x1: 488, yb: 465, yf: 480, ye: 487, yfl: 545, leg: 4 },
  sbp: { x0: 676, x1: 1026, yb: 463, yf: 480, ye: 487, yfl: 545, leg: 4 }, // 120 px right of where it was: Grok's view of the window stays clear
  housekeeping: { x0: 1026, x1: 1250, yb: 493, yf: 518, ye: 527, yfl: 600, leg: 5 },
  numbers: { x0: 828, x1: 1050, yb: 575, yf: 617, ye: 627, yfl: 691, leg: 6 },
  boss: { x0: 512, x1: 708, yb: 572, yf: 617, ye: 627, yfl: 688, leg: 6 },
};
// who sits where (bot numbers: 0 Usage, 1 Grok, 2 $tonks, 3 Ops, 4 Studio, 5 Media, 6 SBP, 7 LF, 8 Archives, 9 Cyber, 10 Sports, 14 Dash)
// seats: [x, chair template seat id]; monitors: [centre x, monitor template] or 'keep' (the painted ones stay where they are)
export const PLAN = [
  { id: 'video', label: 'Studio · Media · LF', theme: 'video', accent: '#e8806e', bots: [4, 5, 7], seats: [[302, 'v0'], [375, 'v0'], [448, 'v0']], mon: { from: ['video', 0], at: [302, 375, 448] } },
  { id: 'sbp', label: 'Ops · Usage · Archives · Dash', theme: 'house', accent: '#6fbfd0', bots: [3, 0, 8, 14], seats: [[715, 's0'], [808, 's1'], [901, 's1'], [994, 's1']], mon: { from: ['sbp', 1], at: [715, 808, 901, 994] } },
  { id: 'housekeeping', label: 'SB Pallet', theme: 'sbp', accent: '#a6d67e', bots: [6, 9], seats: [[1094, 'h0'], [1208, 'h0']], mon: 'keep:housekeeping' },
  { id: 'numbers', label: 'Numbers', theme: 'numbers', accent: '#f2b85c', bots: [2, 10], seats: [[884.7, 'n0'], [992, 'n1']], mon: 'paste:numbers' },
  { id: 'boss', label: 'Boss', theme: 'boss', accent: '#ecc67c', bots: [1], seats: [[638, 'b0']], mon: 'paste:boss' },
];
// what is floor (everything inside, unless kept below); the dark bottom edge of the picture stays
const FLOOR = [[0, 567], [224, 567], [224, 470], [1040, 470], [1040, 497], [1268, 497], [1268, 560], [1280, 560], [1280, 717], [0, 717]];
const RUG = [305, 640, 170, 72]; // the lounge rug (kept)
const LAMP_POLE = [225, 430, 237, 548];
const LIGHTS = [[232, 560, 150], [690, 610, 170], [1150, 560, 200]]; // warm pools on the floor (lounge lamp, boss lamp, window light on the right)

const lum = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b;
function hash(a, b) { let h = Math.imul(a, 374761393) + Math.imul(b, 668265263) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; }
function solve(A, b) { const n = b.length, M = A.map((r, i) => [...r, b[i]]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]]; const d = M[c][c] || 1e-9; for (let k = c; k <= n; k++) M[c][k] /= d; for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; } } return M.map(r => r[n]); }
// a gentle fit (quadratic plus the light pools), evaluated only inside the area the painted floor was sampled from, so it cannot run off at the edges
const basis = (x0, y0) => { const x = Math.max(120, Math.min(1010, x0)), y = Math.max(472, Math.min(714, y0)), u = x / PW, v = (y - 460) / 260; return [1, u, v, u * u, u * v, v * v, ...LIGHTS.map(([cx, cy, r]) => Math.exp(-((x - cx) ** 2 + ((y - cy) * 1.8) ** 2) / (r * r)))]; };

export async function run(base, orig, assets, src = assets) { // src: the layout from before this tool (run-scene.js takes it from git), so it can run again
  const L = await fetch(src + 'layout.json').then(r => r.json()), waterOld = await img(src + 'water-mask.png');
  const P = { dusk: await img(base + 'plate-dusk-hi.webp'), night: await img(base + 'plate-night-hi.webp') };
  const O = { dusk: await img(orig + 'plate-dusk-hi.webp'), night: await img(orig + 'plate-night-hi.webp') };
  const M = {}; for (const m of ['bag-r', 'bag-b', 'bag-m', 'table', 'room-l']) M[m] = await img(assets + m + '-mask.png');
  const drawMask = (g, n) => { const [a, b, c, d] = L.masks[n]; g.drawImage(M[n], a * PW, b * PH, (c - a) * PW, (d - b) * PH); };
  const seatById = Object.fromEntries(L.desks.flatMap(d => d.seats.map(s => [s.id, s])));
  const deskById = Object.fromEntries(L.desks.map(d => [d.id, d]));
  const W3 = PW * S, H3 = PH * S, full = (k, src) => { const c = canvas(W3, H3), g = ctx(c); g.drawImage(src[k], 0, 0); return c; };
  const hi = { dusk: full('dusk', P), night: full('night', P) }, od = {};
  for (const k of ['dusk', 'night']) od[k] = ctx(full(k, O)).getImageData(0, 0, W3, H3).data;
  const layer = paint => { const c = canvas(W3, H3), g = ctx(c); g.setTransform(S, 0, 0, S, 0, 0); g.fillStyle = '#fff'; g.strokeStyle = '#fff'; paint(g); return g.getImageData(0, 0, W3, H3).data; };
  const keepPaint = g => { g.beginPath(); g.ellipse(RUG[0], RUG[1], RUG[2], RUG[3], 0, 0, 7); g.fill(); for (const m of ['bag-r', 'bag-b', 'bag-m', 'table']) drawMask(g, m); g.fillRect(LAMP_POLE[0], LAMP_POLE[1], LAMP_POLE[2] - LAMP_POLE[0], LAMP_POLE[3] - LAMP_POLE[1]); };
  const floorM = layer(g => { poly(g, FLOOR); g.fill(); g.globalCompositeOperation = 'destination-out'; keepPaint(g); });
  const log = [];

  // ---- 1. the floor: the room's light fitted to the painted floor (planks only), boards and grain on top ----
  const sampleM = layer(g => { poly(g, FLOOR); g.fill(); g.globalCompositeOperation = 'destination-out'; keepPaint(g); g.beginPath(); g.ellipse(RUG[0], RUG[1], RUG[2] + 8, RUG[3] + 6, 0, 0, 7); g.fill();
    g.fillRect(455, 552, 600, 170); drawMask(g, 'room-l'); g.fillRect(1000, 420, 280, 300); // the boss rug, the bamboo corners
    for (const d of L.desks) for (const s of d.seats) { poly(g, s.chair.map(([x, y]) => [x * PW, y * PH])); g.fill(); g.fillRect(s.x * PW - 40, s.ctop * PH, 80, (s.base - s.ctop) * PH + 6); }
    for (const D of Object.values(DESKS)) g.fillRect(D.x0 - 6, D.yb - 6, D.x1 - D.x0 + 12, D.yfl - D.yb + 10); });
  for (const k of ['dusk', 'night']) {
    const D0 = od[k], pts = [];
    for (let y = 470; y < 716; y += 2) for (let x = 0; x < PW; x += 2) { const o = ((y * S) * W3 + x * S) * 4; if (sampleM[o + 3] < 128) continue; const r = D0[o], g = D0[o + 1], b = D0[o + 2]; if (r < g * 1.25 || r < 30) continue; pts.push([x, y, r, g, b]); }
    const lv = pts.map(p => lum(p[2], p[3], p[4])).sort((a, b) => a - b), med = lv[lv.length >> 1];
    const use = pts.filter(p => { const l = lum(p[2], p[3], p[4]); return l > med * 0.55 && l < med * 1.5; });
    const nb = basis(0, 0).length, coef = [2, 3, 4].map(ch => { const A = Array.from({ length: nb }, () => new Float64Array(nb)), b = new Float64Array(nb);
      for (const p of use) { const f = basis(p[0], p[1]); for (let r = 0; r < nb; r++) { b[r] += f[r] * p[ch]; for (let c = 0; c < nb; c++) A[r][c] += f[r] * f[c]; } }
      for (let r = 0; r < nb; r++) A[r][r] += 2e-3 * use.length; return solve(A, b); });
    const c = hi[k], g = ctx(c), id = g.getImageData(0, 0, W3, H3), D = id.data;
    for (let Y = 470 * S; Y < 717 * S; Y++) for (let X = 0; X < W3; X++) {
      const o = (Y * W3 + X) * 4; if (floorM[o + 3] < 128) continue;
      const px = X / S, py = Y / S, f = basis(px, py), col = [0, 1, 2].map(ch => { let v = 0; for (let r = 0; r < nb; r++) v += coef[ch][r] * f[r]; return v; });
      const dy = Math.max(8, py - VP[1]), xb = VP[0] + (px - VP[0]) * (720 - VP[1]) / dy, u = xb / BOARD, bi = Math.floor(u), fr = u - bi, ppb = BOARD * dy / (720 - VP[1]);
      let m = 1 + (hash(bi, 7) - 0.5) * 0.08;
      const sw = 0.7 / ppb; if (fr < sw) m *= 0.82 + 0.18 * fr / sw;
      const z = 3600 / dy / 3 + hash(bi, 3), dz = 3600 / dy / dy / 3; if (z - Math.floor(z) < dz * 0.8) m *= 0.88;
      m *= 1 + 0.025 * Math.sin(xb * 0.9 + hash(bi, 5) * 40) * (0.6 + 0.4 * Math.sin(z * 5.3 + bi));
      // contact shade where the floor meets the back wall and the kitchen, a soft darkening towards the picture's left and right edges
      const wall = px < 224 ? 567 : px < 1040 ? 470 : 497, a = Math.min(1, (py - wall) / 14); m *= 0.62 + 0.38 * a * (2 - a);
      m *= 1 - 0.22 * Math.max(0, 1 - px / 160) - 0.18 * Math.max(0, (px - 1150) / 130);
      D[o] = col[0] * m; D[o + 1] = col[1] * m; D[o + 2] = col[2] * m;
    }
    g.putImageData(id, 0, 0);
  }
  log.push('floor');
  // ---- 1b. the kitchen corner drawn new (David, 2026-11-10): a retro two-door fridge and the wooden stand beside it in one consistent
  // three-quarter view. Every receding edge runs along the same depth vector DV (a stand's depth: 14 px right, 22 px up), so the fridge
  // shows its front, its right side and its top, and the stand its top and right end. The fridge is a little deeper than the stand and
  // both stand against the back wall. The coffee machine and the canisters are kept and stand on the new top; the floor lamp's pole is redrawn.
  const krgb = (c, m = 1) => `rgb(${c.map(v => Math.max(0, Math.min(255, v * m)) | 0).join(",")})`, DV = [14, -22], FR = { x0: 3, x1: 79, top: 449, base: 565, d: 1.12 }, CT = { x0: 81, x1: 216, top: 500, lip: 505, kick: 556, base: 562 };
  const fd = [DV[0] * FR.d, DV[1] * FR.d], mv = (p, v, f = 1) => [p[0] + v[0] * f, p[1] + v[1] * f];
  const frFront = [[FR.x0, FR.top], [FR.x1, FR.top], [FR.x1, FR.base], [FR.x0, FR.base]];
  const frSide = [[FR.x1, FR.top], mv([FR.x1, FR.top], fd), mv([FR.x1, FR.base], fd), [FR.x1, FR.base]];
  const frTop = [[FR.x0, FR.top], [FR.x1, FR.top], mv([FR.x1, FR.top], fd), mv([FR.x0, FR.top], fd)];
  const ctTop = [[CT.x0, CT.top], [CT.x1, CT.top], mv([CT.x1, CT.top], DV), mv([CT.x0, CT.top], DV)];
  const ctSide = [[CT.x1, CT.top], mv([CT.x1, CT.top], DV), mv([CT.x1, CT.base], DV), [CT.x1, CT.base]];
  const ctFront = [[CT.x0, CT.top], [CT.x1, CT.top], [CT.x1, CT.base], [CT.x0, CT.base]];
  const ITEMS = [ // what stands on the stand, traced on the painting (plate px)
    [[107, 428], [111, 421], [119, 420], [121, 409], [141, 409], [143, 420], [163, 420], [167, 426], [167, 447], [163, 452], [163, 480], [166, 482], [166, 492], [112, 492], [112, 482], [115, 480], [115, 452], [108, 449]],
    [[168, 452], [176, 446], [190, 446], [199, 451], [203, 458], [203, 491], [168, 491]],
  ];
  const POLE = { x: 229.3, y0: 457, y1: 547 };
  const kitWin = [0, 404, 246, 572], newKit = g => { for (const p of [frFront, frSide, frTop, ctTop, ctSide, ctFront, ...ITEMS]) { poly(g, p); g.fill(); } g.fillRect(203, 404, 50, 54); }; // + the lamp shade
  const itemsCut = {};
  for (const k of ['dusk', 'night']) { const m = canvas(W3, H3), mg = ctx(m); mg.setTransform(S, 0, 0, S, 0, 0); mg.fillStyle = '#fff'; for (const p of ITEMS) { poly(mg, p); mg.fill(); }
    mg.globalCompositeOperation = 'source-in'; mg.setTransform(1, 0, 0, 1, 0, 0); mg.drawImage(hi[k], 0, 0); itemsCut[k] = m; }
  const kpal = {}; // the painting's own fridge and wood colours
  for (const k of ['dusk', 'night']) { const g = ctx(hi[k]), avg = (x0, y0, x1, y1) => { const d = g.getImageData(x0 * S, y0 * S, (x1 - x0) * S, (y1 - y0) * S).data; let r = 0, gg = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; } return [r / n, gg / n, b / n]; };
    kpal[k] = { fr: avg(48, 458, 72, 486), wood: avg(150, 512, 206, 534), top: avg(176, 486, 212, 496) }; }
  { // whatever of the old fridge, stand, jar and pole the new ones do not cover: filled from the wall and floor round them
    const W = (kitWin[2] - kitWin[0]) * S, H = (kitWin[3] - kitWin[1]) * S;
    const hole = bitmap(kitWin, g => { g.fillStyle = '#fff'; g.fillRect(0, 426, 86, 141); poly(g, [[82, 474], [236, 474], [236, 567], [82, 567]]); g.fill(); g.fillRect(222, 455, 16, 96); g.globalCompositeOperation = 'destination-out'; newKit(g); });
    fill([hi.dusk, hi.night], kitWin, hole, hole.map(v => v ? 0 : 1)); }
  for (const k of ['dusk', 'night']) {
    const g = ctx(hi[k]), p = kpal[k], nt = k === 'night', F = p.fr, Wd = p.wood, warm = nt ? 0.75 : 1;
    g.save(); g.setTransform(S, 0, 0, S, 0, 0);
    const lin = (x0, y0, x1, y1, stops) => { const gr = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
    // floor shadows: the fridge and the stand sit on the boards
    g.fillStyle = lin(0, FR.base - 3, 0, FR.base + 12, [[0, 'rgba(6,3,2,.6)'], [1, 'rgba(6,3,2,0)']]); poly(g, [[FR.x0 - 3, FR.base - 2], [FR.x1 + fd[0], FR.base - 2], [FR.x1 + fd[0] + 10, FR.base + 12], [FR.x0, FR.base + 12]]); g.fill();
    g.fillStyle = lin(0, CT.base - 3, 0, CT.base + 10, [[0, 'rgba(6,3,2,.5)'], [1, 'rgba(6,3,2,0)']]); poly(g, [[CT.x0, CT.base - 2], [CT.x1 + DV[0], CT.base - 2 + DV[1] * 0.2], [CT.x1 + DV[0] + 8, CT.base + 10], [CT.x0, CT.base + 10]]); g.fill();
    // fridge: side (warmed by the floor lamp beside the stand), top, then the front with its two doors, chrome handles and kick plate
    g.fillStyle = lin(FR.x1, 0, FR.x1 + fd[0], 0, [[0, krgb(F, 0.86)], [1, krgb(F, 0.62)]]); poly(g, frSide); g.fill();
    g.fillStyle = `rgba(255,178,110,${0.16 * warm})`; poly(g, frSide); g.fill();
    g.fillStyle = 'rgba(0,0,0,.35)'; poly(g, [mv([FR.x1, FR.base - 7], fd, 0), mv([FR.x1, FR.base - 7], fd), mv([FR.x1, FR.base], fd), [FR.x1, FR.base]]); g.fill(); // its kick plate runs round the side
    g.fillStyle = lin(0, FR.top + fd[1], 0, FR.top, [[0, krgb(F, 0.98)], [1, krgb(F, 1.18)]]); poly(g, frTop); g.fill();
    const fh = FR.base - FR.top, split = FR.top + Math.round(fh * 0.36), kick = FR.base - 7;
    g.fillStyle = lin(FR.x0, 0, FR.x1, 0, [[0, krgb(F, 0.84)], [0.55, krgb(F, 1)], [1, krgb(F, 1.1)]]); g.beginPath(); g.roundRect(FR.x0, FR.top, FR.x1 - FR.x0, kick - FR.top, [5, 5, 1, 1]); g.fill();
    g.fillStyle = lin(0, FR.top, 0, kick, [[0, 'rgba(255,240,228,.14)'], [0.3, 'rgba(255,240,228,0)'], [0.7, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.18)']]); g.beginPath(); g.roundRect(FR.x0, FR.top, FR.x1 - FR.x0, kick - FR.top, [5, 5, 1, 1]); g.fill();
    g.fillStyle = 'rgba(255,236,220,.22)'; g.beginPath(); g.roundRect(FR.x0 + 3, FR.top + 0.6, FR.x1 - FR.x0 - 6, 1.2, 0.6); g.fill(); // light along the rounded top edge
    g.fillStyle = `rgba(255,196,140,${0.3 * warm})`; g.fillRect(FR.x1 - 1.6, FR.top + 4, 1.6, kick - FR.top - 5); // rim light on the right edge
    g.fillStyle = krgb(F, 0.32); g.fillRect(FR.x0 + 1, split - 0.8, FR.x1 - FR.x0 - 2, 1.6); g.fillStyle = 'rgba(255,240,228,.16)'; g.fillRect(FR.x0 + 1, split + 0.9, FR.x1 - FR.x0 - 2, 0.7); // the door gap
    g.fillStyle = krgb(F, 0.3); g.fillRect(FR.x0, kick, FR.x1 - FR.x0, FR.base - kick); g.fillStyle = krgb(F, 0.22); g.fillRect(FR.x0 + 2, kick + 1.5, FR.x1 - FR.x0 - 4, FR.base - kick - 1.5);
    for (const [x, y] of [[6, FR.base - 1.5], [FR.x1 - 6, FR.base - 1.5]]) { g.fillStyle = '#17120f'; g.beginPath(); g.roundRect(x - 3, y - 1, 6, 3, 1); g.fill(); }
    for (const hy of [split - 8, split + 9]) { // chrome bar handles on the left of each door
      g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.roundRect(11, hy + 1.4, 22, 3, 1.5); g.fill();
      g.fillStyle = lin(0, hy - 1.5, 0, hy + 1.5, [[0, nt ? '#b9b6c4' : '#efe2d6'], [0.5, nt ? '#7c7886' : '#a8978c'], [1, nt ? '#4c4854' : '#6e5f58']]); g.beginPath(); g.roundRect(11, hy - 1.5, 22, 3, 1.5); g.fill();
      g.fillStyle = nt ? '#5c5864' : '#7d6c62'; g.fillRect(12.5, hy - 1, 2, 3.4); g.fillRect(29.5, hy - 1, 2, 3.4); }
    // the stand: right end, top, front with nine drawers, kick
    g.fillStyle = lin(CT.x1, 0, CT.x1 + DV[0], 0, [[0, krgb(Wd, 0.72)], [1, krgb(Wd, 0.52)]]); poly(g, ctSide); g.fill();
    g.fillStyle = 'rgba(0,0,0,.3)'; poly(g, [[CT.x1, CT.kick], mv([CT.x1, CT.kick], DV), mv([CT.x1, CT.base], DV), [CT.x1, CT.base]]); g.fill();
    g.fillStyle = lin(0, CT.top + DV[1], 0, CT.top, [[0, krgb(p.top, 0.8)], [1, krgb(p.top, 1.06)]]); poly(g, ctTop); g.fill();
    for (let i = 1; i < 6; i++) { g.strokeStyle = `rgba(40,18,8,${0.06 + 0.03 * (i % 2)})`; g.lineWidth = 0.5; const f = i / 6; g.beginPath(); g.moveTo(CT.x0 + DV[0] * f, CT.top + DV[1] * f); g.lineTo(CT.x1 + DV[0] * f, CT.top + DV[1] * f); g.stroke(); } // grain along the top
    g.fillStyle = lin(0, CT.top, 0, CT.lip, [[0, krgb(p.top, 1.3)], [0.35, krgb(p.top, 1.08)], [1, krgb(Wd, 0.7)]]); g.fillRect(CT.x0, CT.top, CT.x1 - CT.x0, CT.lip - CT.top);
    g.fillStyle = krgb(Wd, 0.9); g.fillRect(CT.x0, CT.lip, CT.x1 - CT.x0, CT.kick - CT.lip);
    g.fillStyle = lin(0, CT.lip, 0, CT.lip + 3, [[0, 'rgba(0,0,0,.35)'], [1, 'rgba(0,0,0,0)']]); g.fillRect(CT.x0, CT.lip, CT.x1 - CT.x0, 3);
    const cols = 3, rows = 3, cw = (CT.x1 - CT.x0 - 4) / cols, rh = (CT.kick - CT.lip - 3) / rows;
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const x = CT.x0 + 2 + c * cw + 1, y = CT.lip + 2 + r * rh + 0.8, w = cw - 2, h = rh - 1.6, lit = 0.94 + 0.08 * c / (cols - 1);
      g.fillStyle = krgb(Wd, 0.55); g.fillRect(x - 0.7, y - 0.7, w + 1.4, h + 1.4);
      g.fillStyle = lin(0, y, 0, y + h, [[0, krgb(Wd, 1.08 * lit)], [1, krgb(Wd, 0.9 * lit)]]); g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,226,190,.12)'; g.fillRect(x, y, w, 0.8);
      for (let j = 0; j < 3; j++) { g.fillStyle = 'rgba(50,22,8,.08)'; g.fillRect(x + 1, y + 2 + j * h / 3.2 + ((c * 7 + r * 3 + j) % 3) * 0.6, w - 2, 0.5); }
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.roundRect(x + w / 2 - 4.5, y + h * 0.42 + 0.6, 9, 2.2, 1); g.fill();
      g.fillStyle = nt ? '#9a8a6a' : '#d9b77a'; g.beginPath(); g.roundRect(x + w / 2 - 4.5, y + h * 0.42 - 0.4, 9, 2, 1); g.fill(); }
    g.fillStyle = krgb(Wd, 0.32); g.fillRect(CT.x0, CT.kick, CT.x1 - CT.x0, CT.base - CT.kick);
    g.fillStyle = `rgba(255,178,110,${0.1 * warm})`; poly(g, ctSide); g.fill();
    // what stands on top, with a soft contact shadow
    g.fillStyle = 'rgba(20,8,2,.35)'; for (const [cx, cy, rx] of [[139, 492, 30], [186, 491, 19]]) { g.beginPath(); g.ellipse(cx, cy, rx, 3, 0, 0, 7); g.fill(); }
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(itemsCut[k], 0, 0); g.setTransform(S, 0, 0, S, 0, 0);
    // the floor lamp's brass pole and foot, beside the stand's right end
    g.fillStyle = 'rgba(6,3,2,.4)'; g.beginPath(); g.ellipse(POLE.x + 3, POLE.y1 + 1, 12, 3, 0, 0, 7); g.fill();
    g.fillStyle = lin(POLE.x - 1.6, 0, POLE.x + 1.6, 0, [[0, nt ? '#4a3a26' : '#6b4d2a'], [0.6, nt ? '#a8865a' : '#e2b678'], [1, nt ? '#6a5236' : '#9b7244']]); g.fillRect(POLE.x - 1.6, POLE.y0, 3.2, POLE.y1 - POLE.y0);
    g.fillStyle = nt ? '#3c2f20' : '#5a4024'; g.beginPath(); g.ellipse(POLE.x, POLE.y1, 8, 2.4, 0, 0, 7); g.fill(); g.fillStyle = nt ? '#8a6e4a' : '#c89c62'; g.beginPath(); g.ellipse(POLE.x, POLE.y1 - 0.8, 7, 1.6, 0, 0, 7); g.fill();
    g.restore();
    // the bean bags stand in front of the stand: put them back over it
    const bb = canvas(W3, H3), bg = ctx(bb); bg.setTransform(S, 0, 0, S, 0, 0); for (const n of ['bag-r', 'bag-b', 'bag-m', 'table']) drawMask(bg, n); bg.globalCompositeOperation = 'source-in'; bg.setTransform(1, 0, 0, 1, 0, 0); bg.drawImage(P[k], 0, 0, W3, H3); g.drawImage(bb, 0, 0);
  }
  log.push('kitchen');

  // ---- 2. the back-left desk gets three monitors: the two painted ones are cleared off the window sill first ----
  const vMon = deskById.video.monitors.map(q => q.map(([x, y]) => [x * PW, y * PH]));
  { const w = [240, 405, 520, 470], W = (w[2] - w[0]) * S, H = (w[3] - w[1]) * S;
    const hole = dilate(bitmap(w, g => { g.lineWidth = 8; for (const q of vMon) { poly(g, q); g.fill(); g.stroke(); } g.fillRect(262, 436, 50, 34); g.fillRect(440, 436, 52, 34); }), W, H, 3); // monitors and the two desk plants
    fill([hi.dusk, hi.night], w, hole, hole.map(v => v ? 0 : 1)); }
  { const mMon = deskById.messages.monitors.map(q => q.map(([x, y]) => [x * PW, y * PH]));
    for (const [w, paint] of [
      [[740, 405, 1045, 474], g => { g.lineWidth = 8; for (const q of mMon) { poly(g, q); g.fill(); g.stroke(); } g.fillRect(820, 452, 160, 12); g.fillRect(905, 455, 112, 16); }],
      [[240, 452, 520, 474], g => { g.fillRect(254, 457, 10, 14); g.fillRect(486, 457, 10, 14); }],
      [[1220, 480, 1275, 500], g => g.fillRect(1250, 488, 20, 10)],
    ]) { const W = (w[2] - w[0]) * S, H = (w[3] - w[1]) * S, hole = dilate(bitmap(w, paint), W, H, 3); fill([hi.dusk, hi.night], w, hole, hole.map(v => v ? 0 : 1)); } }
  log.push('sill');
  // ---- 2b. the window's lower band behind the back-right desk, painted new (David, 2026-11-10: it was smeared where the old desks had
  // been cut out). The river runs on from the painted water down to an outdoor balcony rail and the window's bottom frame: each column
  // carries the colour and the light streaks of the painted water above it, spreading and darkening towards the viewer, with fine
  // horizontal ripple lines. The mullions run down to the frame. The viewer animates this water as well (water-mask.png). ----
  const VB = { x0: 515, x1: 1040, rail: 442, mid: 453.5, sill: 464, floor: 470, posts: 42 };
  const vbTop = x => x < 720 ? 398 : x < 760 ? 398 + (x - 720) / 40 * 7 : 405;
  const MULL = [[552, 560], [732, 740], [896, 904]], inMull = x => MULL.some(([a, b]) => x >= a - 0.5 && x < b + 0.5);
  const vbPoly = [[VB.x0, 398], [720, 398], [760, 405], [VB.x1, 405], [VB.x1, VB.floor], [VB.x0, VB.floor]];
  for (const k of ['dusk', 'night']) {
    const g = ctx(hi[k]), X0 = VB.x0 * S, X1 = VB.x1 * S, Y0 = 380 * S, Y1 = VB.floor * S, Wb = X1 - X0, Hb = Y1 - Y0;
    const id = g.getImageData(X0, Y0, Wb, Hb), D = id.data, old = new Uint8ClampedArray(D);
    // the painted water's colour just above the band, per column (mullion columns bridged from their neighbours)
    const top = new Float32Array(Wb * 3);
    for (let X = 0; X < Wb; X++) { const x = (X0 + X) / S, ty = vbTop(x); let r = 0, gg = 0, b = 0, n = 0;
      for (let Y = Math.round((ty - 6) * S) - Y0; Y < Math.round((ty - 1) * S) - Y0; Y++) { const o = (Y * Wb + X) * 4; r += D[o]; gg += D[o + 1]; b += D[o + 2]; n++; }
      top[X * 3] = r / n; top[X * 3 + 1] = gg / n; top[X * 3 + 2] = b / n; }
    for (const [a, b] of MULL) { const A = Math.round((a - 2) * S) - X0, B = Math.round((b + 2) * S) - X0; if (A < 0 || B >= Wb) continue;
      for (let X = A + 1; X < B; X++) { const f = (X - A) / (B - A); for (let c = 0; c < 3; c++) top[X * 3 + c] = top[A * 3 + c] * (1 - f) + top[B * 3 + c] * f; } }
    const cum = new Float64Array((Wb + 1) * 3); for (let X = 0; X < Wb; X++) for (let c = 0; c < 3; c++) cum[(X + 1) * 3 + c] = cum[X * 3 + c] + top[X * 3 + c];
    const blurAt = (X, r, c) => { const a = Math.max(0, X - r), b = Math.min(Wb, X + r + 1); return (cum[b * 3 + c] - cum[a * 3 + c]) / (b - a); };
    const deep = [0, 1, 2].map(c => blurAt(Wb >> 1, Wb, c) * (k === 'night' ? 0.62 : 0.56));
    const mullC = MULL.map(([a, b]) => { const cols = []; for (let X = Math.round(a * S) - X0; X < Math.round(b * S) - X0; X++) { let r = 0, gg = 0, bb = 0, n = 0; for (let Y = 384 * S - Y0; Y < 396 * S - Y0; Y++) { const o = (Y * Wb + X) * 4; r += D[o]; gg += D[o + 1]; bb += D[o + 2]; n++; } cols.push([r / n, gg / n, bb / n]); } return { a, cols }; });
    for (let Y = 0; Y < Hb; Y++) for (let X = 0; X < Wb; X++) {
      const x = (X0 + X) / S, y = (Y0 + Y) / S, ty = vbTop(x); if (y < ty) continue;
      const o = (Y * Wb + X) * 4, t = Math.min(1, (y - ty) / (VB.sill - ty));
      const r = Math.round((1 + 9 * t) * S), mix = 0.12 + 0.5 * t;
      const rip = 1 + 0.07 * Math.sin(y * 2 * Math.PI / (2 + 2.6 * t) + Math.sin(x * 0.045 + y * 0.3) * 2.2) * (0.55 + 0.45 * Math.sin(x * 0.11 + y * 1.7));
      let c = [0, 1, 2].map(ch => (blurAt(X, r, ch) * (1 - mix) + deep[ch] * mix) * rip);
      const fe = Math.min(1, (y - ty) / 3, (x - VB.x0) / 8, (VB.x1 - x) / 8); // blend into the painting at the top and the ends
      for (let ch = 0; ch < 3; ch++) D[o + ch] = old[o + ch] * (1 - fe) + c[ch] * fe;
    }
    // mullions down to the frame
    for (const { a, cols } of mullC) for (let i = 0; i < cols.length; i++) { const X = Math.round(a * S) - X0 + i; if (X < 0 || X >= Wb) continue;
      for (let Y = 396 * S - Y0; Y < VB.floor * S - Y0; Y++) { const o = (Y * Wb + X) * 4, f = 1 - 0.18 * (Y - (396 * S - Y0)) / (Hb - (396 * S - Y0)); for (let c = 0; c < 3; c++) D[o + c] = cols[i][c] * f; } }
    g.putImageData(id, X0, Y0);
    // the balcony rail outside the glass, then the window's bottom frame; mullions stay in front of the rail
    const ml = mullC[1].cols[Math.floor(mullC[1].cols.length / 2)], frame = ml.map(v => v * 0.85), nt = k === 'night';
    g.save(); g.setTransform(S, 0, 0, S, 0, 0); g.beginPath(); g.rect(VB.x0, 380, VB.x1 - VB.x0, 100); g.clip();
    const railC = `rgb(${frame.map(v => v * 0.9 | 0)})`;
    for (let x = VB.x0 + 6; x < VB.x1; x += VB.posts) if (!inMull(x) && !inMull(x + 2)) { g.fillStyle = railC; g.fillRect(x, VB.rail, 2, VB.sill - VB.rail); g.fillStyle = 'rgba(255,220,180,.08)'; g.fillRect(x + 1.3, VB.rail, 0.7, VB.sill - VB.rail); }
    g.fillStyle = railC; g.fillRect(VB.x0, VB.mid, VB.x1 - VB.x0, 1.4);
    g.fillRect(VB.x0, VB.rail, VB.x1 - VB.x0, 3); g.fillStyle = nt ? 'rgba(170,180,230,.22)' : 'rgba(255,196,140,.42)'; g.fillRect(VB.x0, VB.rail, VB.x1 - VB.x0, 0.8); // the rail's top catches the sky
    g.fillStyle = `rgb(${frame.map(v => v | 0)})`; g.fillRect(VB.x0, VB.sill, VB.x1 - VB.x0, VB.floor - VB.sill);
    g.fillStyle = nt ? 'rgba(160,170,220,.12)' : 'rgba(255,200,150,.2)'; g.fillRect(VB.x0, VB.sill, VB.x1 - VB.x0, 0.8);
    g.restore();
    g.save(); g.setTransform(S, 0, 0, S, 0, 0); for (const { a, cols } of mullC) { g.fillStyle = `rgb(${cols[Math.floor(cols.length / 2)].map(v => v * 0.92 | 0)})`; g.fillRect(a, VB.rail - 1, cols.length / S, VB.sill - VB.rail + 1); } g.restore();
  }
  log.push('window band');

  // ---- 3. desks ----
  const pal = {}; // the boss desk's own colours in each picture
  for (const k of ['dusk', 'night']) { const D0 = od[k], avg = (x0, y0, x1, y1) => { let r = 0, g = 0, b = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const o = ((y * S) * W3 + x * S) * 4; r += D0[o]; g += D0[o + 1]; b += D0[o + 2]; n++; } return [r / n, g / n, b / n]; };
    pal[k] = { top: avg(500, 600, 520, 612), top2: avg(700, 606, 740, 614), edge: avg(560, 619, 600, 622), edge2: avg(560, 623, 600, 626), leg: avg(484, 632, 488, 670) }; }
  const rgb = (c, m = 1) => `rgb(${c.map(v => Math.max(0, Math.min(255, v * m)) | 0).join(',')})`;
  const drawDesk = (g, D, p) => {
    const { x0, x1, yb, yf, ye, yfl, leg } = D, depth = yf - yb, ins = 3, bx = x => x + (VP[0] - x) * 0.04;
    // shadow on the floor beneath the top, then the back legs (further away, so shorter and darker), the top, the front legs
    const sh = g.createLinearGradient(0, ye, 0, yfl); sh.addColorStop(0, 'rgba(6,3,2,.48)'); sh.addColorStop(1, 'rgba(6,3,2,.12)');
    g.fillStyle = sh; g.beginPath(); g.moveTo(bx(x0) + 2, ye - depth * 0.2); g.lineTo(bx(x1) - 2, ye - depth * 0.2); g.lineTo(x1 + 2, yfl); g.lineTo(x0 - 2, yfl); g.closePath(); g.fill();
    for (const lx of [bx(x0 + ins), bx(x1 - ins - leg)]) { g.fillStyle = rgb(p.leg, 0.7); g.fillRect(lx, ye - 2, leg * 0.85, yfl - depth * 0.85 - ye + 2); }
    const tg = g.createLinearGradient(0, yb, 0, yf); tg.addColorStop(0, rgb(p.top, 0.88)); tg.addColorStop(1, rgb(p.top2, 1.05));
    g.fillStyle = tg; g.beginPath(); g.moveTo(bx(x0), yb); g.lineTo(bx(x1), yb); g.lineTo(x1, yf); g.lineTo(x0, yf); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,240,225,.06)'; g.fillRect(bx(x0) + 2, yb, bx(x1) - bx(x0) - 4, Math.max(1, depth * 0.08)); // the far edge catches a little light
    const eg = g.createLinearGradient(0, yf, 0, ye); eg.addColorStop(0, rgb(p.edge, 1.35)); eg.addColorStop(0.18, rgb(p.edge, 1.05)); eg.addColorStop(1, rgb(p.edge2, 0.95));
    g.fillStyle = eg; g.fillRect(x0, yf, x1 - x0, ye - yf);
    for (const [lx, lit] of [[x0 + ins, 1], [x1 - ins - leg, 0]]) {
      const lg = g.createLinearGradient(lx, 0, lx + leg, 0); lg.addColorStop(0, rgb(p.leg, lit ? 1.35 : 0.85)); lg.addColorStop(1, rgb(p.leg, lit ? 0.9 : 1.2));
      g.fillStyle = lg; g.fillRect(lx, ye, leg, yfl - ye);
      const ft = g.createRadialGradient(lx + leg / 2, yfl, 0, lx + leg / 2, yfl, leg * 1.8); ft.addColorStop(0, 'rgba(6,3,2,.55)'); ft.addColorStop(1, 'rgba(6,3,2,0)'); g.fillStyle = ft; g.beginPath(); g.ellipse(lx + leg / 2, yfl, leg * 1.8, leg * 0.6, 0, 0, 7); g.fill();
    }
  };
  for (const k of ['dusk', 'night']) { const g = ctx(hi[k]); g.save(); g.setTransform(S, 0, 0, S, 0, 0); for (const id of ['video', 'sbp', 'housekeeping', 'boss', 'numbers']) drawDesk(g, DESKS[id], pal[k]); g.restore(); }
  log.push('desks');

  // ---- 4. monitors: the screens' bezels copied from the painted ones; neck and foot drawn on the new tops ----
  const quadsOut = {}; // desk id -> monitor quads (plate px)
  const pasteMon = (k, q, dx, D) => { // copy one painted monitor (bezel and screen area) dx px along, then its stand
    const xs = q.map(p => p[0]), ys = q.map(p => p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2 + dx, qb = Math.max(...ys), foot = D.yb + (D.yf - D.yb) * 0.35;
    const m = canvas(W3, H3), mg = ctx(m); mg.setTransform(S, 0, 0, S, 0, 0); mg.fillStyle = '#fff'; mg.strokeStyle = '#fff'; mg.lineWidth = 6; mg.lineJoin = 'round'; poly(mg, q); mg.fill(); mg.stroke();
    mg.globalCompositeOperation = 'source-in'; mg.setTransform(1, 0, 0, 1, 0, 0); mg.drawImage(O[k], 0, 0, W3, H3);
    const g = ctx(hi[k]); g.save(); g.setTransform(S, 0, 0, S, 0, 0);
    const w = Math.max(6, (Math.max(...xs) - Math.min(...xs)) * 0.1), p = pal[k];
    if (foot > qb) { g.fillStyle = rgb(p.leg, 0.75); g.fillRect(cx - w / 2, qb - 2, w, foot - qb + 2); g.fillStyle = rgb(p.leg, 0.9); g.beginPath(); g.ellipse(cx, foot, w * 2.2, Math.max(1.5, (D.yf - D.yb) * 0.1), 0, 0, 7); g.fill(); }
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(m, dx * S, 0); g.restore();
  };
  for (const d of PLAN) {
    const D = DESKS[d.id];
    if (d.mon === 'keep:sbp+add') { const keep = deskById.sbp.monitors.map(q => q.map(([x, y]) => [x * PW, y * PH])), src = keep[d.add.from[1]], scx = (Math.min(...src.map(p => p[0])) + Math.max(...src.map(p => p[0]))) / 2;
      quadsOut[d.id] = [...keep, ...d.add.at.map(cx => src.map(([x, y]) => [x + cx - scx, y]))]; for (const k of ['dusk', 'night']) for (const cx of d.add.at) pasteMon(k, src, cx - scx, D); }
    else if (d.mon === 'keep:housekeeping') quadsOut[d.id] = deskById.housekeeping.monitors.map(q => q.map(([x, y]) => [x * PW, y * PH]));
    else if (typeof d.mon === 'string' && d.mon.startsWith('paste:')) { const qs = (d.id === 'boss' ? L.boss.monitors : deskById[d.id].monitors).map(q => q.map(([x, y]) => [x * PW, y * PH])); for (const k of ['dusk', 'night']) for (const q of qs) pasteMon(k, q, 0, D); quadsOut[d.id] = qs; }
    else { const src = deskById[d.mon.from[0]].monitors[d.mon.from[1]].map(([x, y]) => [x * PW, y * PH]), scx = (Math.min(...src.map(p => p[0])) + Math.max(...src.map(p => p[0]))) / 2;
      quadsOut[d.id] = d.mon.at.map(cx => src.map(([x, y]) => [x + cx - scx, y])); for (const k of ['dusk', 'night']) for (const cx of d.mon.at) pasteMon(k, src, cx - scx, D); }
  }
  // a slim keyboard in front of every seat
  for (const k of ['dusk', 'night']) { const g = ctx(hi[k]); g.save(); g.setTransform(S, 0, 0, S, 0, 0);
    for (const d of PLAN) { const D = DESKS[d.id], kh = Math.max(1.5, (D.yf - D.yb) * 0.14), ky = D.yb + (D.yf - D.yb) * 0.55, kw = (D.yfl - D.ye) * 0.55;
      for (const [x] of d.seats) { g.fillStyle = 'rgba(14,15,19,.95)'; g.beginPath(); g.roundRect(x - kw / 2, ky, kw, kh, 1); g.fill(); g.fillStyle = 'rgba(160,170,190,.12)'; g.fillRect(x - kw / 2 + 1, ky, kw - 2, Math.max(0.6, kh * 0.3)); } }
    g.restore(); }
  log.push('monitors');

  // ---- 5. chairs: the painted backrest (exactly its traced outline) and a drawn post, five-star base, wheels and armrests ----
  const seatsOut = [], before = { dusk: ctx(hi.dusk).getImageData(0, 0, W3, H3), night: ctx(hi.night).getImageData(0, 0, W3, H3) };
  const bagsM = layer(g => { for (const m of ['bag-r', 'bag-b', 'bag-m', 'table']) drawMask(g, m); });
  for (const d of PLAN) d.seats.forEach(([x, tid], i) => {
    const t = seatById[tid], dx = x - t.x * PW, back = t.chair.map(([cx, cy]) => [cx * PW + dx, cy * PH]), H = (t.base - t.ctop) * PH, ys = back.map(p => p[1]), yb = Math.max(...ys), xs = back.map(p => p[0]), cw = Math.max(...xs) - Math.min(...xs);
    const parts = g => { // seen from behind: the seat under the backrest, armrests either side, the gas column, the five-star base on casters
      const base = t.base * PH, seatY = yb + H * 0.015, colTop = seatY + H * 0.05, starY = base - H * 0.085, R = cw * 0.82, col = Math.max(3, cw * 0.13);
      g.beginPath(); g.ellipse(x, seatY, cw * 0.62, H * 0.055, 0, 0, 7); g.fill();
      for (const sd of [-1, 1]) { g.beginPath(); g.roundRect(x + sd * cw * 0.56 - cw * 0.11, yb - H * 0.14, cw * 0.22, H * 0.045, 2); g.fill(); g.fillRect(x + sd * cw * 0.56 - 1.2, yb - H * 0.12, 2.4, H * 0.14); }
      g.fillRect(x - col / 2, colTop, col, starY - colTop);
      for (let i = 0; i < 5; i++) { const an = -Math.PI / 2 + i * 2 * Math.PI / 5 + 0.3, ex = x + Math.cos(an) * R, ey = starY + Math.sin(an) * R * 0.3, th = Math.max(1.6, H * 0.03);
        g.beginPath(); g.moveTo(x - th, starY - th * 0.4); g.lineTo(x + th, starY - th * 0.4); g.lineTo(ex + th * 0.4, ey); g.lineTo(ex - th * 0.4, ey + th * 0.6); g.closePath(); g.fill();
        g.beginPath(); g.ellipse(ex, ey + H * 0.03, H * 0.032, H * 0.026, 0, 0, 7); g.fill(); }
      g.beginPath(); g.ellipse(x, starY, col * 1.3, col * 0.55, 0, 0, 7); g.fill(); };
    for (const k of ['dusk', 'night']) {
      const g = ctx(hi[k]), shade = k === 'night' ? 0.55 : 1;
      g.save(); g.setTransform(S, 0, 0, S, 0, 0);
      g.fillStyle = 'rgba(6,3,2,.4)'; g.beginPath(); g.ellipse(x, t.base * PH, cw * 0.8, H * 0.05, 0, 0, 7); g.fill(); // its shadow
      const cg2 = g.createLinearGradient(x - cw, 0, x + cw, 0); cg2.addColorStop(0, `rgb(${40 * shade + 6},${41 * shade + 6},${47 * shade + 7})`); cg2.addColorStop(0.5, `rgb(${26 * shade + 5},${27 * shade + 5},${32 * shade + 6})`); cg2.addColorStop(1, `rgb(${18 * shade + 4},${19 * shade + 4},${23 * shade + 5})`); g.fillStyle = cg2; parts(g);
      g.restore();
      // the backrest itself, copied from the painted chair inside its traced outline
      const m = canvas(W3, H3), mg = ctx(m); mg.setTransform(S, 0, 0, S, 0, 0); mg.fillStyle = '#fff'; poly(mg, t.chair.map(([cx, cy]) => [cx * PW, cy * PH])); mg.fill();
      mg.globalCompositeOperation = 'source-in'; mg.setTransform(1, 0, 0, 1, 0, 0); mg.drawImage(O[k], 0, 0, W3, H3);
      const keepBags = canvas(W3, H3); { const kg = ctx(keepBags); kg.drawImage(m, dx * S, 0); kg.globalCompositeOperation = 'destination-out'; kg.setTransform(S, 0, 0, S, 0, 0); for (const n of ['bag-r', 'bag-b', 'bag-m', 'table']) drawMask(kg, n); }
      g.drawImage(keepBags, 0, 0);
      // bean bags and the table stand in front of the back-left chairs: put them back over the chair
      const bb = canvas(W3, H3), bg = ctx(bb); bg.setTransform(S, 0, 0, S, 0, 0); for (const n of ['bag-r', 'bag-b', 'bag-m', 'table']) drawMask(bg, n); bg.globalCompositeOperation = 'source-in'; bg.setTransform(1, 0, 0, 1, 0, 0); bg.drawImage(P[k], 0, 0, W3, H3); g.drawImage(bb, 0, 0);
    }
    seatsOut.push({ desk: d.id, i, x, t, dx, back, parts });
  });
  log.push('chairs');

  // ---- 6. chair-less patches (floor and desk behind each chair, shown while a bot turns) and the front desks' cut-outs ----
  let ax = 0; const atlasParts = [];
  for (const s of seatsOut) {
    const xs = s.back.map(p => p[0]), x0 = Math.floor(Math.min(...xs) - (Math.max(...xs) - Math.min(...xs)) * 0.75), x1 = Math.ceil(Math.max(...xs) + (Math.max(...xs) - Math.min(...xs)) * 0.75), y0 = Math.floor(s.t.ctop * PH - 2), y1 = Math.ceil(s.t.base * PH + 6);
    atlasParts.push({ s, x0, y0, w: x1 - x0, h: y1 - y0, ax }); ax += (x1 - x0) * 2 + 4;
  }
  const atlas = { dusk: canvas(ax, Math.max(...atlasParts.map(p => p.h * 2))), night: null }; atlas.night = canvas(atlas.dusk.width, atlas.dusk.height);
  for (const k of ['dusk', 'night']) { const src = canvas(W3, H3); ctx(src).putImageData(before[k], 0, 0); const ag = ctx(atlas[k]);
    for (const p of atlasParts) { const m = canvas(p.w * 2, p.h * 2), mg = ctx(m); mg.drawImage(src, p.x0 * S, p.y0 * S, p.w * S, p.h * S, 0, 0, p.w * 2, p.h * 2);
      mg.globalCompositeOperation = 'destination-in'; mg.setTransform(2, 0, 0, 2, -p.x0 * 2, -p.y0 * 2); mg.filter = 'blur(1px)'; mg.fillStyle = '#fff'; mg.lineWidth = 3; poly(mg, p.s.back); mg.fill(); mg.strokeStyle = '#fff'; mg.stroke(); p.s.parts(mg);
      ag.drawImage(m, p.ax, 0); } }
  const frontMask = id => { const D = DESKS[id], qs = quadsOut[id], top = Math.min(...qs.flatMap(q => q.map(p => p[1]))) - 4, r = [D.x0 - 6, top, D.x1 + 6, D.yfl + 6], m = canvas((r[2] - r[0]) * 2, (r[3] - r[1]) * 2), g = ctx(m);
    g.setTransform(2, 0, 0, 2, -r[0] * 2, -r[1] * 2); g.fillStyle = '#fff'; g.strokeStyle = '#fff';
    g.fillRect(D.x0, D.yb, D.x1 - D.x0, D.ye - D.yb); for (const lx of [D.x0 + 3, D.x1 - 3 - D.leg]) g.fillRect(lx - 0.5, D.ye, D.leg + 1, D.yfl - D.ye + 1);
    g.lineWidth = 6; for (const q of qs) { poly(g, q); g.fill(); g.stroke(); const xs = q.map(p => p[0]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, qb = Math.max(...q.map(p => p[1])); g.fillRect(cx - 4, qb, 8, D.yb - qb + 2); }
    return { rect: [r[0] / PW, r[1] / PH, r[2] / PW, r[3] / PH], png: m.toDataURL('image/png') }; };
  const masksOut = { boss: frontMask('boss'), 'desk-fr': frontMask('numbers') };

  // ---- 7. one small bamboo in the left corner: the old corner plant, half size, standing on the new floor ----
  const plantRect = (() => { const [a, b, c, d] = L.masks['room-l']; return [a * PW, b * PH, (c - a) * PW, (d - b) * PH]; })(), PS = 0.34, px0 = 6, py1 = 717; // small, and below the fridge so its whole bottom stays in view
  const pr = [px0, py1 - plantRect[3] * PS, plantRect[2] * PS, plantRect[3] * PS];
  for (const k of ['dusk', 'night']) { const m = canvas(W3, H3), mg = ctx(m); mg.setTransform(S, 0, 0, S, 0, 0); drawMask(mg, 'room-l'); mg.globalCompositeOperation = 'source-in'; mg.setTransform(1, 0, 0, 1, 0, 0); mg.drawImage(O[k], 0, 0, W3, H3);
    const g = ctx(hi[k]); g.save(); g.setTransform(S, 0, 0, S, 0, 0); g.fillStyle = 'rgba(6,3,2,.4)'; g.beginPath(); g.ellipse(pr[0] + pr[2] * 0.42, py1 - 2, pr[2] * 0.45, 5, 0, 0, 7); g.fill();
    g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingQuality = 'high'; g.drawImage(m, plantRect[0] * S, plantRect[1] * S, plantRect[2] * S, plantRect[3] * S, pr[0] * S, pr[1] * S, pr[2] * S, pr[3] * S); g.restore(); }
  const plantMask = (() => { const m = canvas(Math.round(pr[2] * 2), Math.round(pr[3] * 2)), g = ctx(m); g.drawImage(M['room-l'], 0, 0, m.width, m.height); return { rect: [pr[0] / PW, pr[1] / PH, (pr[0] + pr[2]) / PW, (pr[1] + pr[3]) / PH], png: m.toDataURL('image/png') }; })();
  log.push('plant');

  // ---- 7b. where the viewer animates water: the painted river (the old mask) and the new band, minus rail, posts, mullions and monitors ----
  const waterOut = (() => { const r = [392, 352, VB.x1, VB.sill], m = canvas((r[2] - r[0]) * 2, (r[3] - r[1]) * 2), g = ctx(m); g.setTransform(2, 0, 0, 2, -r[0] * 2, -r[1] * 2);
    const [a, b, c, d] = L.masks.water; g.drawImage(waterOld, a * PW, b * PH, (c - a) * PW, (d - b) * PH);
    g.fillStyle = '#fff'; poly(g, [[VB.x0, 398], [720, 398], [760, 405], [VB.x1, 405], [VB.x1, VB.sill], [VB.x0, VB.sill]]); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.strokeStyle = '#000';
    g.fillRect(r[0], VB.rail - 0.6, r[2] - r[0], 4.2); g.fillRect(r[0], VB.mid - 0.6, r[2] - r[0], 2.6);
    for (let x = VB.x0 + 6; x < VB.x1; x += VB.posts) g.fillRect(x - 0.6, VB.rail, 3.2, VB.sill - VB.rail);
    for (const [a2, b2] of MULL) g.fillRect(a2 - 0.6, 396, b2 - a2 + 1.2, VB.sill - 396);
    g.lineWidth = 5; g.lineJoin = 'round'; for (const qs of Object.values(quadsOut)) for (const q of qs) { poly(g, q); g.fill(); g.stroke(); }
    return { rect: [r[0] / PW, r[1] / PH, r[2] / PW, r[3] / PH], png: m.toDataURL('image/png') }; })();

  // ---- 8. the viewer's layout ----
  const lay = JSON.parse(JSON.stringify(L)), nav = L.nav.nodes.map(([x, y]) => [x * PW, y * PH]);
  // a back-row seat joins the walkway behind the desks at the walkway point nearest to it (the seats moved since the template's own)
  const AISLE = L.nav.nodes.map((p, i) => [i, p]).filter(([, p]) => Math.abs(p[1] - 0.7861) < 0.004);
  const seatNode = (t, x) => t.feet[1] > 0.78 && t.feet[1] < 0.8 ? AISLE.reduce((b, a) => Math.abs(a[1][0] * PW - x) < Math.abs(b[1][0] * PW - x) ? a : b)[0] : t.node;
  lay.desks = PLAN.map(d => ({ id: d.id, label: d.label, theme: d.theme, accent: d.accent, bots: d.bots,
    monitors: quadsOut[d.id].map(q => q.map(([x, y]) => [+(x / PW).toFixed(4), +(y / PH).toFixed(4)])),
    seats: seatsOut.filter(s => s.desk === d.id).map(s => ({ ...JSON.parse(JSON.stringify(s.t)), id: `${d.id[0]}${s.i}`, x: s.x / PW, chair: s.back.map(([x, y]) => [x / PW, y / PH]), feet: [s.t.feet[0] + s.dx / PW, s.t.feet[1]], node: seatNode(s.t, s.x), nc: `${d.id[0]}${s.i}` })) }));
  lay.desks.push({ ...JSON.parse(JSON.stringify(deskById.lounge)), bots: [] });
  lay.nochair = Object.fromEntries(atlasParts.map(p => [`${p.s.desk[0]}${p.s.i}`, [p.ax, 0, p.w * 2, p.h * 2, p.x0, p.y0]]));
  lay.boss.monitors = L.boss.monitors;
  lay.steam = L.steam.filter(c => c.x < 0.4); // the mugs on the boss and front-right desks are gone with the old desks
  lay.lamps = L.lamps.filter(l => l.desk !== 'boss'); // and so is the boss desk lamp
  lay.masks.boss = masksOut.boss.rect; lay.masks['desk-fr'] = masksOut['desk-fr'].rect; lay.masks['plant-l'] = plantMask.rect;
  delete lay.masks['room-l']; delete lay.masks['room-r'];
  lay.masks.water = waterOut.rect; lay.nearGlass = [VB.x0 / PW, VB.x1 / PW, VB.sill / PH]; // the animated water reaches down into the window band
  lay.sun = [771 / PW, 304 / PH]; lay.moon = [634 / PW, 128 / PH]; // where the painted sun and moon are: their light paths on the water
  lay.note = (L.note || '') + '; v11: office rebuilt by portable/art/scene.js (clean floor, black four-leg desks, one monitor per bot, team desks)';
  const lo = {}; for (const k of ['dusk', 'night']) { lo[k] = canvas(2560, 1440); const g = ctx(lo[k]); g.imageSmoothingQuality = 'high'; g.drawImage(hi[k], 0, 0, 2560, 1440); }
  window.__sceneOut = { 'layout.json': JSON.stringify(lay), 'plate-dusk-hi.webp': hi.dusk.toDataURL('image/webp', 0.9), 'plate-night-hi.webp': hi.night.toDataURL('image/webp', 0.9), 'plate-dusk.webp': lo.dusk.toDataURL('image/webp', 0.9), 'plate-night.webp': lo.night.toDataURL('image/webp', 0.9),
    'nochair-dusk.webp': atlas.dusk.toDataURL('image/webp', 0.92), 'nochair-night.webp': atlas.night.toDataURL('image/webp', 0.92), 'boss-mask.png': masksOut.boss.png, 'desk-fr-mask.png': masksOut['desk-fr'].png, 'plant-l-mask.png': plantMask.png, 'water-mask.png': waterOut.png };
  return log;
}
