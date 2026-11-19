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
// the left wall in perspective (round 5, David 2026-11-19): the nook (wainscot, bookcase, kitchen) is drawn front-on as before, then laid
// onto a side wall that runs to the same vanishing point as the right wall. Source x (front-on, plate px) at depth z = 1 + x / ds lands at
// screen x = VP.x (1 - 1/z); heights shrink by 1/z towards VP. The near edge (x 0) keeps its size; the wall meets the window wall at `corner`,
// where its floor line (567 at the picture's edge) reaches the window wall's 470.
export const WARP = { ds: 500, corner: 262 };
// round 6 (David, 2026-11-19): how far the bookcase, fridge and stand stand out from the wall (u, plate px at the picture's edge), and where
// the floor lamp stands. A face u out from the wall lands at screen x = VP.x - (VP.x - u) s, so the fronts move right and the side and top
// faces between them and the wall show.
export const DEPTH = { bookcase: 18, fridge: 36, stand: 30, lamp: 16 };
const wS = x => 1 / (1 + x / WARP.ds);
export const wFwd = (x, y, u = 0) => { const s = wS(x); return [VP[0] - (VP[0] - u) * s, VP[1] + (y - VP[1]) * s]; };
const XC = WARP.ds * (VP[0] / (VP[0] - WARP.corner) - 1); // source x of the corner
const wallFloor = px => VP[1] + (567 - VP[1]) * (1 - px / VP[0]); // the left wall's floor line on screen
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
const FLOOR = [[0, 567], [WARP.corner, 470], [1040, 470], [1040, 497], [1268, 497], [1268, 560], [1280, 560], [1280, 717], [0, 717]];
const RUG = [305, 640, 170, 72]; // the lounge rug (kept)
const LAMP_POLE = [225, 430, 237, 548];
const LIGHTS = [[232, 560, 150], [690, 610, 170], [1150, 560, 200]]; // warm pools on the floor (lounge lamp, boss lamp, window light on the right)

const krgb = (c, m = 1) => `rgb(${c.map(v => Math.max(0, Math.min(255, v * m)) | 0).join(",")})`;
const lum = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b;
function hash(a, b) { let h = Math.imul(a, 374761393) + Math.imul(b, 668265263) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; }
function solve(A, b) { const n = b.length, M = A.map((r, i) => [...r, b[i]]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]]; const d = M[c][c] || 1e-9; for (let k = c; k <= n; k++) M[c][k] /= d; for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; } } return M.map(r => r[n]); }
// a gentle fit (quadratic plus the light pools), evaluated only inside the area the painted floor was sampled from, so it cannot run off at the edges
const basis = (x0, y0) => { const x = Math.max(120, Math.min(1010, x0)), y = Math.max(472, Math.min(714, y0)), u = x / PW, v = (y - 460) / 260; return [1, u, v, u * u, u * v, v * v, ...LIGHTS.map(([cx, cy, r]) => Math.exp(-((x - cx) ** 2 + ((y - cy) * 1.8) ** 2) / (r * r)))]; };

export async function run(base, orig, assets, src = assets, art = '/scene-art/') { // src: the layout from before this tool (run-scene.js takes it from git), so it can run again
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
  const floorM = layer(g => { poly(g, FLOOR); g.fill(); }); // one floor everywhere: the rug, bean bags, table and floor lamp are drawn new on top (round 2)
  const log = [];
  const warpLeft = (src, u = 0) => { // the front-on nook layer onto the slanted left wall (WARP), or onto a plane u out from it: each screen
    // pixel left of the corner samples the layer where it came from, 2 x 2 samples per pixel (the far end is squeezed about 2:1)
    const sd = ctx(src).getImageData(0, 0, W3, H3).data, XW = Math.ceil(WARP.corner * S) + 1, out = canvas(W3, H3), og = ctx(out), id = og.createImageData(XW, H3), D = id.data;
    const at = (x, y, acc) => { if (x < 0 || y < 0 || x >= W3 - 1 || y >= H3 - 1) return; const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
      for (const [dx, dy, f] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) { const o = ((y0 + dy) * W3 + x0 + dx) * 4, a = sd[o + 3] * f; acc[0] += sd[o] * a; acc[1] += sd[o + 1] * a; acc[2] += sd[o + 2] * a; acc[3] += a; } };
    for (let X = 0; X < XW; X++) for (const sx of [0.25, 0.75]) {
      const s = (VP[0] - (X + sx) / S) / (VP[0] - u); if (s > 1) continue; const xs = (WARP.ds * (1 / s - 1)) * S - 0.5;
      for (let Y = 0; Y < H3; Y++) { const o = (Y * XW + X) * 4; if (sx === 0.25) D[o] = D[o + 1] = D[o + 2] = D[o + 3] = 0;
        const acc = [0, 0, 0, 0]; for (const sy of [0.25, 0.75]) at(xs, (VP[1] + ((Y + sy) / S - VP[1]) / s) * S - 0.5, acc);
        if (acc[3] > 0) { const n = D[o + 3] + acc[3] / 4; for (let c = 0; c < 3; c++) D[o + c] = (D[o + c] * D[o + 3] + acc[c] / 4) / n; D[o + 3] = n; } }
    }
    og.putImageData(id, 0, 0); return out; };

  // ---- 1. the floor: the room's light fitted to the painted floor (planks only), boards and grain on top ----
  const sampleM = layer(g => { poly(g, FLOOR); g.fill(); g.globalCompositeOperation = 'destination-out'; keepPaint(g); g.beginPath(); g.ellipse(RUG[0], RUG[1], RUG[2] + 8, RUG[3] + 6, 0, 0, 7); g.fill();
    g.fillRect(455, 552, 600, 170); drawMask(g, 'room-l'); g.fillRect(1000, 420, 280, 300); // the boss rug, the bamboo corners
    g.fillRect(0, 460, WARP.corner, 108); // the old nook's floor (the kitchen stood there)
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
      const wall = px < WARP.corner ? wallFloor(px) : px < 1040 ? 470 : 497, a = Math.min(1, (py - wall) / 14); m *= 0.62 + 0.38 * a * (2 - a);
      m *= 1 - 0.22 * Math.max(0, 1 - px / 160) - 0.18 * Math.max(0, (px - 1150) / 130);
      D[o] = col[0] * m; D[o + 1] = col[1] * m; D[o + 2] = col[2] * m;
    }
    g.putImageData(id, 0, 0);
  }
  log.push('floor');
  // ---- 1b. the kitchen corner, round 2 (David, 2026-11-12): a tall walnut bookcase under the wall clock (its twenty skill books are drawn
  // by the viewer, so a book can leave its slot), then the fridge, the stand with the coffee machine and the floor lamp: one generated
  // picture (src/gen/kitchen-iso.jpg, keyed by props_prep2.py), front-on, feet on the nook's floor line, against a walnut wainscot under
  // the window. The snack shelf (coffee bags, mugs) is now the bookcase's lowest open shelf. ----
  const KP = await fetch(art + 'props2.json').then(r => r.json()), KS = KP.kitchenSpots, BC = KP.bookcase;
  const KL = { dusk: await img(art + 'kitchen2-dusk.png'), night: await img(art + 'kitchen2-night.png') }, BK = { dusk: await img(art + 'bookcase-dusk.png'), night: await img(art + 'bookcase-night.png') };
  // round 5: the wainscot and panel run along the left wall from the picture's edge (behind the bookcase); round 6: they end at the coffee
  // stand's far end (WEND), and the window shows on past it to the corner (XC)
  const WEND = 236, WS = { x0: 0, x1: WEND, x2: WEND, wall: 398, top: 464, sill: 469, base: 567 };
  // round 6: the parts that stand out from the wall: source boxes [x0, y0, x1, y1], the columns of the kitchen picture each one is cut from
  // (image px), and the colour of its side faces (sampled from the pictures: dusk, night)
  const PARTS = {
    stand: { box: [141.4, 519.8, 234.7, 566.5], clip: [237, 518], u: DEPTH.stand, side: { dusk: [81, 42, 17], night: [72, 39, 17] } },
    fridge: { box: [96.7, 484.5, 140.7, 566.5], clip: [0, 237], u: DEPTH.fridge, side: { dusk: [141, 105, 79], night: [124, 95, 78] } },
    bookcase: { box: BC.rect, u: DEPTH.bookcase, side: { dusk: [102, 53, 22], night: [78, 44, 21] } } };
  const LAMP = { x: 248, top: 466, sb: 491, floor: 566, rt: 7.5, rb: 11.5, u: DEPTH.lamp }; // the floor lamp, drawn round in code (source x, y) // the nook's back wall behind the kitchen: an upper panel with string lights and a menu board, then a wainscot
  const kitWin = [0, 100, 272, 572];
  const kpal = {}; // the painting's own wood colours (the old stand's front)
  for (const k of ['dusk', 'night']) { const D0 = od[k], avg = (x0, y0, x1, y1) => { let r = 0, g = 0, b = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const o = ((y * S) * W3 + x * S) * 4; r += D0[o]; g += D0[o + 1]; b += D0[o + 2]; n++; } return [r / n, g / n, b / n]; };
    kpal[k] = { wood: avg(150, 512, 206, 534), top: avg(176, 486, 212, 496) }; }
  const wk = {}; // the nook on the slanted wall, per time of day
  for (const k of ['dusk', 'night']) {
    const nk = canvas(W3, H3), g = ctx(nk), p = kpal[k], Wd = p.wood, nt = k === 'night';
    g.save(); g.setTransform(S, 0, 0, S, 0, 0);
    const lin = (x0, y0, x1, y1, stops) => { const gr = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
    // the wainscot: vertical walnut boards, a sill along the top that catches the window light, a dark skirting
    g.fillStyle = lin(0, WS.sill, 0, WS.base, [[0, krgb(Wd, 0.62)], [1, krgb(Wd, 0.42)]]); g.fillRect(WS.x0, WS.sill, WS.x1 - WS.x0, WS.base - WS.sill);
    for (let x = WS.x0 + 9; x < WS.x1 - 2; x += 11) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x, WS.sill + 1, 0.8, WS.base - WS.sill - 6); g.fillStyle = 'rgba(255,220,180,.05)'; g.fillRect(x + 0.8, WS.sill + 1, 0.6, WS.base - WS.sill - 6); }
    g.fillStyle = lin(0, WS.top, 0, WS.sill, [[0, krgb(p.top, 1.15)], [1, krgb(Wd, 0.7)]]); g.fillRect(WS.x0, WS.top, WS.x1 - WS.x0, WS.sill - WS.top);
    g.fillStyle = nt ? 'rgba(170,180,230,.18)' : 'rgba(255,200,150,.3)'; g.fillRect(WS.x0, WS.top, WS.x1 - WS.x0, 0.8);
    g.fillStyle = krgb(Wd, 0.28); g.fillRect(WS.x0, WS.base - 5, WS.x1 - WS.x0, 5);
    // the upper panel: horizontal walnut boards, a top rail, warm string lights, a small chalk menu board
    g.fillStyle = lin(0, WS.wall, 0, WS.top, [[0, krgb(Wd, 0.5)], [1, krgb(Wd, 0.66)]]); g.fillRect(WS.x0, WS.wall, WS.x1 - WS.x0, WS.top - WS.wall);
    g.fillStyle = lin(0, WS.wall, 0, 470, [[0, krgb(Wd, 0.42)], [1, krgb(Wd, 0.5)]]); g.fillRect(WS.x1, WS.wall, WS.x2 - WS.x1, 470 - WS.wall); // where the panel runs back to the window wall
    g.fillStyle = krgb(Wd, 0.26); g.fillRect(WS.x1, 466, WS.x2 - WS.x1, 4);
    for (let y = WS.wall + 8; y < WS.top - 2; y += 8.5) { g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(WS.x0, y, WS.x2 - WS.x0, 0.7); g.fillStyle = 'rgba(255,220,180,.04)'; g.fillRect(WS.x0, y + 0.7, WS.x2 - WS.x0, 0.6); }
    g.fillStyle = krgb(p.top, 0.85); g.fillRect(WS.x0, WS.wall - 3, WS.x2 - WS.x0, 4); g.fillStyle = nt ? 'rgba(170,180,230,.2)' : 'rgba(255,200,150,.32)'; g.fillRect(WS.x0, WS.wall - 3, WS.x2 - WS.x0, 0.8);
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(WS.x0, WS.wall + 1, WS.x2 - WS.x0, 2.5);
    g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(WS.x2 - 1, WS.wall - 3, 1, 470 - WS.wall + 3);
    const mb = [104, 412, 40, 30]; g.fillStyle = krgb(Wd, 0.35); g.fillRect(mb[0] - 2, mb[1] - 2, mb[2] + 4, mb[3] + 4); g.fillStyle = '#1d211f'; g.fillRect(mb[0], mb[1], mb[2], mb[3]);
    g.fillStyle = nt ? 'rgba(220,220,210,.55)' : 'rgba(240,236,224,.8)'; g.font = '600 6px sans-serif'; g.textAlign = 'center'; g.fillText('COFFEE', mb[0] + mb[2] / 2, mb[1] + 9);
    g.fillStyle = nt ? 'rgba(220,220,210,.35)' : 'rgba(240,236,224,.5)'; for (let i = 0; i < 3; i++) { g.fillRect(mb[0] + 6, mb[1] + 14 + i * 5, 18 - i * 3, 0.8); g.fillRect(mb[0] + 29, mb[1] + 14 + i * 5, 5, 0.8); }
    g.strokeStyle = 'rgba(30,20,12,.8)'; g.lineWidth = 0.5; g.beginPath(); for (let x = WS.x0; x <= WS.x2; x += 1) { const y = WS.wall + 5 + 3.2 * Math.abs(Math.sin((x - WS.x0) / 26 * Math.PI)); x === WS.x0 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke();
    for (let x = WS.x0 + 13; x < WS.x2; x += 26) { const y = WS.wall + 8.2; const gl = g.createRadialGradient(x, y + 1, 0, x, y + 1, 9); gl.addColorStop(0, `rgba(255,190,110,${nt ? 0.5 : 0.35})`); gl.addColorStop(1, 'rgba(255,190,110,0)'); g.fillStyle = gl; g.fillRect(x - 9, y - 8, 18, 18); g.fillStyle = '#ffe2a8'; g.beginPath(); g.ellipse(x, y + 1.2, 1.3, 1.8, 0, 0, 7); g.fill(); g.fillStyle = '#3a2a1a'; g.fillRect(x - 0.8, y - 1.2, 1.6, 1.2); }
    // round 6: the wall's end by the stand: a walnut edge trim that catches the window light
    g.fillStyle = krgb(p.top, 0.7); g.fillRect(WS.x1 - 2.4, WS.wall - 3, 2.4, WS.base - WS.wall + 3); g.fillStyle = nt ? 'rgba(170,185,235,.4)' : 'rgba(255,210,160,.5)'; g.fillRect(WS.x1 - 0.9, WS.wall - 3, 0.9, WS.base - WS.wall + 3);
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(WS.x1 - 3.2, WS.wall - 3, 0.8, WS.base - WS.wall + 3);
    // contact shadows: the bookcase, the fridge, the stand and the lamp stand on the boards
    const sh = (x0, x1, y, d, a) => { g.fillStyle = lin(0, y - 2, 0, y + d, [[0, `rgba(6,3,2,${a})`], [1, 'rgba(6,3,2,0)']]); g.fillRect(x0, y - 2, x1 - x0, d + 2); };
    sh(BC.rect[0], WEND, 567, 6, 0.45); // round 6: the parts' own shadows are drawn on the floor below (their footprints)
    // a shadow the bookcase casts on the wall beside it
    g.fillStyle = lin(BC.rect[2], 0, BC.rect[2] + 10, 0, [[0, 'rgba(6,3,2,.45)'], [1, 'rgba(6,3,2,0)']]); g.fillRect(BC.rect[2], BC.rect[1] + 6, 10, BC.rect[3] - BC.rect[1] - 6);
    g.restore();
    // round 6: the parts in 3D. Each front is cut out on its own layer, shaded (darker to the floor and the near edge, lit edges on top and at
    // the near corner) and warped onto its own plane u out from the wall; between it and the wall go its near side face (square to the
    // view, so a plain rectangle in this projection), its top face (a sliver, seen from above when it is below the horizon) and its
    // footprint shadow on the floor. Back to front: lamp, stand, fridge, bookcase.
    const hl = nt ? 'rgba(175,190,240,.38)' : 'rgba(255,214,168,.5)', out = canvas(W3, H3), og = ctx(out);
    og.drawImage(warpLeft(nk), 0, 0); og.save(); og.setTransform(S, 0, 0, S, 0, 0);
    const quad = (pts, fs) => { og.fillStyle = fs; og.beginPath(); pts.forEach(([x, y], i) => i ? og.lineTo(x, y) : og.moveTo(x, y)); og.closePath(); og.fill(); };
    for (const P of Object.values(PARTS)) { const [x0, , x1] = P.box, y = 567; og.filter = 'blur(2.5px)';
      quad([wFwd(x0 - 2, y), wFwd(x1 + 3, y), wFwd(x1 + 3, y, P.u + 4), wFwd(x0 - 2, y, P.u + 5)], 'rgba(6,3,2,.55)'); og.filter = 'none'; }
    { // the floor lamp: a round brass foot, a pole and a cloth shade lit from inside, all square to the view at its depth
      const s = wS(LAMP.x), [cx] = wFwd(LAMP.x, 0, LAMP.u), Y = y => VP[1] + (y - VP[1]) * s, yt = Y(LAMP.top), yb = Y(LAMP.sb), yf = Y(LAMP.floor), rt = LAMP.rt * s * 1.5, rb = LAMP.rb * s * 1.5;
      const tilt = yv => (yv - VP[1]) / 260; // how much of an ellipse's top shows (seen from above)
      og.filter = 'blur(1.5px)'; og.fillStyle = 'rgba(6,3,2,.5)'; og.beginPath(); og.ellipse(cx + 1, yf + 0.5, 9 * s * 1.5, 2.6 * s * 1.5, 0, 0, 7); og.fill(); og.filter = 'none';
      og.fillStyle = lin(cx - 6 * s, 0, cx + 6 * s, 0, [[0, '#4a3218'], [0.55, nt ? '#a98a58' : '#c9a065'], [1, '#5a3e1e']]); og.beginPath(); og.ellipse(cx, yf - 0.6, 6.5 * s, 6.5 * s * tilt(yf), 0, 0, 7); og.fill();
      og.fillRect(cx - 6.5 * s, yf - 1.6, 13 * s, 1); og.beginPath(); og.ellipse(cx, yf - 1.6, 6.5 * s, 6.5 * s * tilt(yf), 0, 0, 7); og.fillStyle = nt ? '#8d7350' : '#b38b52'; og.fill();
      og.fillStyle = lin(cx - 1, 0, cx + 1, 0, [[0, '#3c2812'], [0.6, nt ? '#b8955c' : '#e0b070'], [1, '#4a3218']]); og.fillRect(cx - 0.9, yb, 1.8, yf - yb - 1.4);
      const sg = lin(cx - rb, 0, cx + rb, 0, [[0, nt ? '#b07a3c' : '#c98a45'], [0.45, nt ? '#ffe6b0' : '#ffe0a8'], [0.7, nt ? '#ffd890' : '#ffd38e'], [1, nt ? '#9a6430' : '#b5763a']]);
      og.fillStyle = sg; og.beginPath(); og.moveTo(cx - rt, yt); og.lineTo(cx + rt, yt); og.lineTo(cx + rb, yb); og.ellipse(cx, yb, rb, rb * tilt(yb), 0, 0, Math.PI); og.lineTo(cx - rt, yt); og.fill();
      og.fillStyle = 'rgba(255,248,225,.95)'; og.beginPath(); og.ellipse(cx, yt, rt, rt * tilt(yt) + 0.4, 0, 0, 7); og.fill(); // the open top, the bulb's light
      og.strokeStyle = 'rgba(120,70,30,.55)'; og.lineWidth = 0.6; og.beginPath(); og.ellipse(cx, yb, rb, rb * tilt(yb), 0, 0, Math.PI); og.stroke();
      og.strokeStyle = 'rgba(255,240,205,.7)'; og.beginPath(); og.ellipse(cx, yt, rt, rt * tilt(yt) + 0.4, 0, Math.PI, 2 * Math.PI); og.stroke(); }
    for (const nm of ['stand', 'fridge', 'bookcase']) { const P = PARTS[nm], [x0, y0, x1, y1] = P.box, sc = P.side[k], s0 = wS(x0);
      // the top face (only when it is below the eye), then the near side face
      if (y0 > VP[1] + 4) { quad([wFwd(x0, y0), wFwd(x1, y0), wFwd(x1, y0, P.u), wFwd(x0, y0, P.u)], krgb(sc, 1.12));
        og.strokeStyle = hl; og.lineWidth = 0.7; og.beginPath(); og.moveTo(...wFwd(x0, y0, P.u)); og.lineTo(...wFwd(x1, y0, P.u)); og.stroke();
        og.strokeStyle = 'rgba(0,0,0,.35)'; og.beginPath(); og.moveTo(...wFwd(x0, y0)); og.lineTo(...wFwd(x1, y0)); og.stroke(); }
      const [ax, ay] = wFwd(x0, y0), [, by] = wFwd(x0, y1), w = P.u * s0;
      og.fillStyle = lin(0, ay, 0, by, [[0, krgb(sc, 0.78)], [1, krgb(sc, 0.5)]]); og.fillRect(ax, ay, w, by - ay);
      og.fillStyle = lin(ax, 0, ax + w, 0, [[0, 'rgba(0,0,0,.35)'], [0.3, 'rgba(0,0,0,0)'], [1, 'rgba(255,220,180,.06)']]); og.fillRect(ax, ay, w, by - ay);
      if (nm === 'bookcase') { og.fillStyle = 'rgba(0,0,0,.12)'; for (let i = 1; i < 6; i++) og.fillRect(ax + w * i / 6, ay, 0.5, by - ay); } // the side panel's grain
      og.fillStyle = hl; og.fillRect(ax + w - 0.7, ay, 0.7, by - ay); if (y0 > VP[1]) og.fillRect(ax, ay, w, 0.6);
      // the front, shaded on its own layer, then warped
      const L1 = canvas(W3, H3), lg = ctx(L1);
      if (nm === 'bookcase') lg.drawImage(BK[k], BC.rect[0] * S, BC.rect[1] * S);
      else { const [c0, c1] = P.clip; lg.drawImage(KL[k], c0, 0, c1 - c0, KL[k].height, Math.round(KP.kitchen.at[0] * S) + c0, Math.round(KP.kitchen.at[1] * S), c1 - c0, KL[k].height); }
      lg.setTransform(S, 0, 0, S, 0, 0); lg.globalCompositeOperation = 'source-atop';
      const fy0 = nm === 'stand' ? y0 - 50 : y0; // the machine on the stand is shaded with it
      lg.fillStyle = (gr => { [[0, 'rgba(255,225,190,.06)'], [0.55, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.26)']].forEach(([o, c]) => gr.addColorStop(o, c)); return gr; })(lg.createLinearGradient(0, fy0, 0, y1)); lg.fillRect(x0 - 2, fy0, x1 - x0 + 4, y1 - fy0 + 2);
      lg.fillStyle = (gr => { [[0, 'rgba(0,0,0,.2)'], [0.22, 'rgba(0,0,0,0)'], [1, nt ? 'rgba(150,170,230,.07)' : 'rgba(255,205,150,.09)']].forEach(([o, c]) => gr.addColorStop(o, c)); return gr; })(lg.createLinearGradient(x0, 0, x1, 0)); lg.fillRect(x0 - 2, fy0, x1 - x0 + 4, y1 - fy0 + 2);
      lg.fillStyle = hl; lg.fillRect(x0, y0, 1, y1 - y0); lg.fillRect(x0, y0, x1 - x0, 0.9); // the edges that catch the light
      og.setTransform(1, 0, 0, 1, 0, 0); og.drawImage(warpLeft(L1, P.u), 0, 0); og.setTransform(S, 0, 0, S, 0, 0);
    }
    og.restore(); wk[k] = out;
  }
  { // the old fridge, stand, machine, jar and lamp: whatever the new wall does not cover is filled from the window, wall and floor round them
    const W = (kitWin[2] - kitWin[0]) * S, H = (kitWin[3] - kitWin[1]) * S;
    const OLD = [[[107, 428], [111, 421], [119, 420], [121, 409], [141, 409], [143, 420], [163, 420], [167, 426], [167, 447], [163, 452], [163, 480], [166, 482], [166, 492], [112, 492], [112, 482], [115, 480], [115, 452], [108, 449]],
      [[168, 452], [176, 446], [190, 446], [199, 451], [203, 458], [203, 491], [168, 491]]];
    const wa = ctx(wk.dusk).getImageData(kitWin[0] * S, kitWin[1] * S, W, H).data;
    let hole = bitmap(kitWin, g => { g.fillStyle = '#fff'; for (const q of OLD) { poly(g, q); g.fill(); } g.fillRect(200, 400, 58, 62); g.fillRect(216, 452, 24, 18); g.fillRect(0, 420, 92, 150);
      g.fillRect(BC.rect[0], BC.rect[1], BC.rect[2] - BC.rect[0] + 12, 300); }); // and the old upright bookcase above the slanted one
    // round 6: past the wall's new end the painting's own window shows again (only its old lamp is filled)
    hole = dilate(hole, W, H, 4);
    const valid = new Uint8Array(hole.length), [xe] = wFwd(WEND, 0);
    for (let i = 0; i < hole.length; i++) { const X = i % W, Y = (i / W) | 0, o = ((Y + kitWin[1] * S) * W3 + X + kitWin[0] * S) * 4, cov = wa[i * 4 + 3] > 200, fl = floorM[o + 3] >= 128;
      if (cov || fl) hole[i] = 0; valid[i] = !hole[i] && (!cov || fl) && !(fl && X / S + kitWin[0] > xe - 6) ? 1 : 0; } // the new wall and the new floor stay; what the wall hides is not a source, nor the floor past the wall's end (the window comes down from above)
    fill([hi.dusk, hi.night], kitWin, hole, valid); }
  for (const k of ['dusk', 'night']) ctx(hi[k]).drawImage(wk[k], 0, 0);
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
  // round 2 (David, 2026-11-12): every monitor frame drawn new around the exact screen the viewer animates (no painted bezels copied any more):
  // a slim charcoal bezel with rounded corners, dark glass, a lit top edge, a neck and a foot on the desk top
  const pasteMon = (k, q, dx, D) => {
    q = q.map(([x, y]) => [x + dx, y]);
    const xs = q.map(p => p[0]), ys = q.map(p => p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, qb = Math.max(q[2][1], q[3][1]), wq = Math.max(...xs) - Math.min(...xs), p = pal[k], nt = k === 'night';
    const c0 = [xs.reduce((s, v) => s + v, 0) / 4, ys.reduce((s, v) => s + v, 0) / 4], e = 1.6 + wq * 0.022;
    const grow = (d) => q.map(([x, y]) => { const vx = x - c0[0], vy = y - c0[1], l = Math.hypot(vx, vy) || 1, sx = Math.sign(vx), sy = Math.sign(vy); return [x + sx * d, y + sy * d * 1.15]; });
    const outer = grow(e), back = grow(e + 0.6).map(([x, y]) => [x + (cx < VP[0] ? -0.9 : 0.9), y + 0.6]);
    const g = ctx(hi[k]); g.save(); g.setTransform(S, 0, 0, S, 0, 0); g.lineJoin = 'round';
    let foot = D.yb + (D.yf - D.yb) * 0.4; if (foot < qb + 2) foot = qb + 2;
    const nw = Math.max(3, wq * 0.07);
    // neck and foot
    const ng = g.createLinearGradient(cx - nw / 2, 0, cx + nw / 2, 0); ng.addColorStop(0, rgb(p.leg, 1.25)); ng.addColorStop(1, rgb(p.leg, 0.75));
    g.fillStyle = ng; g.fillRect(cx - nw / 2, qb - 2, nw, foot - qb + 1.5);
    g.fillStyle = 'rgba(6,3,2,.45)'; g.beginPath(); g.ellipse(cx, foot + 0.8, nw * 2.6, Math.max(1.4, (D.yf - D.yb) * 0.1), 0, 0, 7); g.fill();
    g.fillStyle = rgb(p.leg, 1.05); g.beginPath(); g.ellipse(cx, foot, nw * 2.2, Math.max(1.2, (D.yf - D.yb) * 0.08), 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,240,225,.08)'; g.fillRect(cx - nw * 2, foot - 0.6, nw * 4, 0.5);
    // the shell behind, then the bezel
    g.fillStyle = 'rgba(4,4,6,.55)'; g.strokeStyle = 'rgba(4,4,6,.55)'; g.lineWidth = 1.4; poly(g, back); g.fill(); g.stroke();
    const bz = g.createLinearGradient(0, Math.min(...ys) - e, 0, qb + e); bz.addColorStop(0, nt ? '#1d1e25' : '#2a2a30'); bz.addColorStop(1, nt ? '#0d0e12' : '#151518');
    g.fillStyle = bz; g.strokeStyle = bz; g.lineWidth = 1.2; poly(g, outer); g.fill(); g.stroke();
    // a lit top edge and a faint inner lip
    g.strokeStyle = nt ? 'rgba(170,180,230,.16)' : 'rgba(255,214,180,.22)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(outer[0][0] + 1, outer[0][1] + 0.3); g.lineTo(outer[1][0] - 1, outer[1][1] + 0.3); g.stroke();
    g.fillStyle = '#06070a'; poly(g, q); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 0.5; poly(g, q); g.stroke();
    // a small power light on the bottom bezel
    g.fillStyle = nt ? 'rgba(120,200,255,.7)' : 'rgba(120,200,255,.5)'; g.beginPath(); g.arc((q[2][0] + q[3][0]) / 2 + wq * 0.38, (q[2][1] + q[3][1]) / 2 + e * 0.55, 0.45, 0, 7); g.fill();
    g.restore();
  };
  for (const d of PLAN) {
    const D = DESKS[d.id];
    if (d.mon === 'keep:sbp+add') { const keep = deskById.sbp.monitors.map(q => q.map(([x, y]) => [x * PW, y * PH])), src = keep[d.add.from[1]], scx = (Math.min(...src.map(p => p[0])) + Math.max(...src.map(p => p[0]))) / 2;
      quadsOut[d.id] = [...keep, ...d.add.at.map(cx => src.map(([x, y]) => [x + cx - scx, y]))]; for (const k of ['dusk', 'night']) for (const cx of d.add.at) pasteMon(k, src, cx - scx, D); }
    else if (d.mon === 'keep:housekeeping') { quadsOut[d.id] = deskById.housekeeping.monitors.map(q => q.map(([x, y]) => [x * PW, y * PH])); for (const k of ['dusk', 'night']) for (const q of quadsOut[d.id]) pasteMon(k, q, 0, D); }
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

  // ---- 5. chairs, round 2 (David, 2026-11-12: a chair seen from behind looked like a black blob): the office chair exactly as the turning
  // sheet draws it from behind (src/chair.png, props_prep2.py), at the scale the viewer draws that seat's turn frames, so the plate chair
  // and the turning chair are the same chair. Its backrest outline is the seat's `chair` polygon: the viewer lays it over the sitting bot. ----
  const seatsOut = [], before = { dusk: ctx(hi.dusk).getImageData(0, 0, W3, H3), night: ctx(hi.night).getImageData(0, 0, W3, H3) };
  const CH = KP.chair, chairImg = await img(art + CH.file);
  const tint = {}; // the room's dusk->night light at each seat (night picture over dusk picture, wide average)
  for (const d of PLAN) d.seats.forEach(([x, tid]) => { const t = seatById[tid], y0 = Math.round(t.ctop * PH), y1 = Math.round(t.base * PH), c = [0, 0], r = [[0, 0, 0], [0, 0, 0]];
    for (let y = y0; y < y1; y += 2) for (let xx = Math.round(x - 40); xx < x + 40; xx += 2) { const o = ((y * S) * W3 + Math.max(0, Math.min(PW - 1, xx)) * S) * 4; ['dusk', 'night'].forEach((k, j) => { for (let ch = 0; ch < 3; ch++) r[j][ch] += od[k][o + ch]; }); }
    tint[`${d.id}${x}`] = [0, 1, 2].map(ch => Math.max(0.3, Math.min(1.1, (r[1][ch] + 1) / (r[0][ch] + 1)))); });
  for (const d of PLAN) d.seats.forEach(([x, tid], i) => {
    const t = seatById[tid], base = t.base * PH, H = (t.base - t.ctop) * PH, ts = H / CH.chairH, dx = x - t.x * PW;
    const back = CH.back.map(([u, v]) => [x + (u - CH.cx) * ts, base + (v - CH.floor) * ts]);
    const at = [x - CH.cx * ts, base - CH.floor * ts, CH.cell[0] * ts, CH.cell[1] * ts];
    const parts = g => { g.drawImage(chairImg, at[0], at[1], at[2], at[3]); g.beginPath(); g.ellipse(x - 4 * ts, base - 3 * ts, 52 * ts, 9 * ts, 0, 0, 7); g.fill(); };
    for (const k of ['dusk', 'night']) {
      const g = ctx(hi[k]); g.save(); g.setTransform(S, 0, 0, S, 0, 0);
      g.fillStyle = 'rgba(6,3,2,.42)'; g.beginPath(); g.ellipse(x - 4 * ts, base - 3 * ts, 50 * ts, 8 * ts, 0, 0, 7); g.fill(); // its shadow
      const c = canvas(Math.ceil(at[2] * S), Math.ceil(at[3] * S)), cg = ctx(c); cg.drawImage(chairImg, 0, 0, c.width, c.height);
      { const tn = k === 'night' ? tint[`${d.id}${x}`] : [0.8, 0.8, 0.82]; cg.globalCompositeOperation = 'multiply'; cg.fillStyle = `rgb(${tn.map(v => Math.round(v * 255)).join(',')})`; cg.fillRect(0, 0, c.width, c.height); cg.globalCompositeOperation = 'destination-in'; cg.drawImage(chairImg, 0, 0, c.width, c.height); }
      g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(c, Math.round(at[0] * S), Math.round(at[1] * S)); g.restore();
    }
    seatsOut.push({ desk: d.id, i, x, t, dx, back, parts, at });
  });
  log.push('chairs');
  // ---- 5b. the lounge, round 2: a woven rug drawn new, then the coffee table and the three bean bags (red, blue, mustard: src/, props_prep.py
  // and props_prep2.py) standing on it, back to front. Their cut-outs (the viewer hides bots behind them) are made from the same pictures. ----
  // round 6 (David, 2026-11-19): the bags turn to face each other round the table (the red one leans back to the left and opens to the right,
  // the mustard one is mirrored to open to the left, the blue one behind faces the front), and two dog beds lie under the table
  const TURN = { 'bag-r': { flip: 1, lean: -0.07 }, 'bag-m': { flip: -1, lean: 0.07 } };
  const turned = (nm, im) => { const t = TURN[nm]; if (!t) return im; const w = im.width, h = im.height, c = canvas(w, h), cg = ctx(c);
    cg.setTransform(t.flip * 0.93, 0, -t.lean * w / h, 1, w / 2 * (1 - t.flip * 0.93) + t.lean * w, 0); cg.drawImage(im, 0, 0); return c; };
  const LG = {}; for (const n of ['bag-b', 'bag-m', 'bag-r', 'table']) LG[n] = { dusk: turned(n, await img(art + n + '-dusk.png')), night: turned(n, await img(art + n + '-night.png')), rect: KP[n].rect };
  const BEDS = [{ x: 283, y: 679, col: [104, 126, 96] }, { x: 337, y: 679, col: [92, 108, 146] }], BED = { rx: 26, ry: 8.5, rim: 5.5 }; // sage and slate, cream cushions
  const drawBeds = (g, nt, L0) => { // two round dog beds: a padded rim (top and front band) round a cream cushion, under the table
    const f = Math.max(0.6, Math.min(1.1, L0 * 1.3)) * (nt ? 0.85 : 1), col = (c, m, a = 1) => `rgba(${c.map(v => Math.max(0, Math.min(255, v * m * f)) | 0).join(',')},${a})`, cream = [214, 196, 170];
    g.save(); g.setTransform(S, 0, 0, S, 0, 0);
    for (const b of BEDS) { const { rx, ry, rim } = BED, cx = b.x, cy = b.y, lin = (y0, y1, a, c) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, a); gr.addColorStop(1, c); return gr; };
      g.filter = 'blur(1.5px)'; g.fillStyle = 'rgba(6,3,2,.45)'; g.beginPath(); g.ellipse(cx + 1, cy + 1.5, rx + 2, ry + 2, 0, 0, 7); g.fill(); g.filter = 'none';
      g.fillStyle = lin(cy - rim, cy + ry, col(b.col, 0.8), col(b.col, 0.5)); g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI); g.lineTo(cx - rx, cy - rim); g.ellipse(cx, cy - rim, rx, ry, 0, Math.PI, 0, true); g.closePath(); g.fill(); // the rim's front band
      g.fillStyle = lin(cy - rim - ry, cy - rim + ry, col(b.col, 1.15), col(b.col, 0.9)); g.beginPath(); g.ellipse(cx, cy - rim, rx, ry, 0, 0, 7); g.fill(); // the rim's top
      g.fillStyle = col(b.col, 0.55); g.beginPath(); g.ellipse(cx, cy - rim + 0.8, rx * 0.7, ry * 0.58, 0, 0, 7); g.fill(); // the dip
      g.fillStyle = lin(cy - rim - ry * 0.5, cy - rim + ry * 0.6, col(cream, 0.95), col(cream, 0.72)); g.beginPath(); g.ellipse(cx, cy - rim + 1.4, rx * 0.62, ry * 0.46, 0, 0, 7); g.fill(); // the cushion
      g.strokeStyle = nt ? 'rgba(180,190,235,.3)' : 'rgba(255,214,168,.38)'; g.lineWidth = 0.7; g.beginPath(); g.ellipse(cx, cy - rim - 0.3, rx - 0.6, ry - 0.6, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); // light on the rim's back
      g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 0.5; for (let i = -2; i <= 2; i++) { const a = Math.PI / 2 + i * 0.42; g.beginPath(); g.moveTo(cx + Math.cos(a) * rx * 0.98, cy - rim + Math.sin(a) * ry); g.lineTo(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry); g.stroke(); } } // the stitched seams
    g.restore(); };
  const drawLounge = (g, k) => {
    const nt = k === 'night', D0 = od[k];
    let fr = [0, 0, 0], n = 0; for (let y = 600; y < 700; y += 3) for (let x = 140; x < 470; x += 3) { const o = ((y * S) * W3 + x * S) * 4; fr[0] += D0[o]; fr[1] += D0[o + 1]; fr[2] += D0[o + 2]; n++; } fr = fr.map(v => v / n);
    const L0 = lum(...fr) / 90, base = [128 * L0, 52 * L0, 40 * L0], c = (m, a = 1) => `rgba(${base.map(v => Math.max(0, Math.min(255, v * m)) | 0).join(',')},${a})`;
    g.save(); g.setTransform(S, 0, 0, S, 0, 0);
    const [rx, ry, ra, rb] = RUG;
    g.fillStyle = 'rgba(6,3,2,.25)'; g.beginPath(); g.ellipse(rx, ry + 1.5, ra + 2, rb + 1.5, 0, 0, 7); g.fill();
    const rg = g.createRadialGradient(rx, ry, 0, rx, ry, ra); rg.addColorStop(0, c(1.05)); rg.addColorStop(0.75, c(0.95)); rg.addColorStop(1, c(0.8));
    g.save(); g.translate(rx, ry); g.scale(1, rb / ra); g.fillStyle = rg; g.beginPath(); g.arc(0, 0, ra, 0, 7); g.fill();
    const ring = (r, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); };
    ring(ra - 5, 6, c(0.62)); ring(ra - 9.5, 1.2, nt ? 'rgba(170,140,100,.35)' : 'rgba(232,180,110,.45)'); ring(ra - 2, 1, c(1.25, 0.6));
    ring(ra * 0.55, 1, nt ? 'rgba(170,140,100,.25)' : 'rgba(232,180,110,.32)'); ring(ra * 0.5, 4, c(0.85, 0.7));
    for (let i = 0; i < 24; i++) { const an = i / 24 * Math.PI * 2; g.fillStyle = nt ? 'rgba(170,140,100,.3)' : 'rgba(232,180,110,.38)'; g.beginPath(); g.arc(Math.cos(an) * (ra - 15), Math.sin(an) * (ra - 15), 1.6, 0, 7); g.fill(); }
    g.restore();
    g.setTransform(1, 0, 0, 1, 0, 0);
    for (const nm of ['bag-b', 'bag-m', 'bag-r', 'beds', 'table']) { if (nm === 'beds') { drawBeds(g, nt, L0); continue; } const q = LG[nm], [x0, y0] = q.rect;
      g.save(); g.setTransform(S, 0, 0, S, 0, 0); g.fillStyle = 'rgba(6,3,2,.38)'; const [a0, b0, a1, b1] = q.rect; g.beginPath(); g.ellipse((a0 + a1) / 2, b1 - (b1 - b0) * 0.06, (a1 - a0) * 0.46, (b1 - b0) * 0.08, 0, 0, 7); g.fill(); g.restore();
      if (nt) { const c2 = canvas(q.night.width, q.night.height), cg = ctx(c2); cg.drawImage(q.night, 0, 0); cg.globalCompositeOperation = 'multiply'; cg.fillStyle = 'rgb(200,198,215)'; cg.fillRect(0, 0, c2.width, c2.height); cg.globalCompositeOperation = 'destination-in'; cg.drawImage(q.night, 0, 0); g.drawImage(c2, Math.round(x0 * S), Math.round(y0 * S)); }
      else g.drawImage(q[k], Math.round(x0 * S), Math.round(y0 * S)); }
    g.restore();
  };
  for (const k of ['dusk', 'night']) drawLounge(ctx(hi[k]), k);
  const bagMasks = {}; for (const nm of ['bag-r', 'bag-b', 'bag-m', 'table']) { const r = L.masks[nm], w = Math.round((r[2] - r[0]) * PW * 2), h = Math.round((r[3] - r[1]) * PH * 2), m = canvas(w, h), mg = ctx(m), q = LG[nm];
    mg.setTransform(2, 0, 0, 2, -r[0] * PW * 2, -r[1] * PH * 2); mg.drawImage(q.dusk, q.rect[0], q.rect[1], q.dusk.width / S, q.dusk.height / S); bagMasks[nm + '-mask.png'] = m.toDataURL('image/png'); }
  log.push('lounge');

  // ---- 6. chair-less patches (floor and desk behind each chair, shown while a bot turns) and the front desks' cut-outs ----
  let ax = 0; const atlasParts = [];
  for (const s of seatsOut) {
    const x0 = Math.floor(s.at[0] - 2), x1 = Math.ceil(s.at[0] + s.at[2] + 2), y0 = Math.floor(Math.min(s.t.ctop * PH, Math.min(...s.back.map(p => p[1]))) - 2), y1 = Math.ceil(s.t.base * PH + 6);
    atlasParts.push({ s, x0, y0, w: x1 - x0, h: y1 - y0, ax }); ax += (x1 - x0) * 2 + 4;
  }
  const atlas = { dusk: canvas(ax, Math.max(...atlasParts.map(p => p.h * 2))), night: null }; atlas.night = canvas(atlas.dusk.width, atlas.dusk.height);
  for (const k of ['dusk', 'night']) { const src = canvas(W3, H3); ctx(src).putImageData(before[k], 0, 0); drawLounge(ctx(src), k); const ag = ctx(atlas[k]);
    for (const p of atlasParts) { const m = canvas(p.w * 2, p.h * 2), mg = ctx(m); mg.drawImage(src, p.x0 * S, p.y0 * S, p.w * S, p.h * S, 0, 0, p.w * 2, p.h * 2);
      const mm = canvas(p.w * 2, p.h * 2), m2 = ctx(mm); m2.setTransform(2, 0, 0, 2, -p.x0 * 2, -p.y0 * 2); m2.filter = 'blur(1px)'; m2.fillStyle = '#fff'; m2.strokeStyle = '#fff'; m2.lineWidth = 3; poly(m2, p.s.back); m2.fill(); m2.stroke(); p.s.parts(m2); p.s.parts(m2);
      mg.globalCompositeOperation = 'destination-in'; mg.drawImage(mm, 0, 0);
      ag.drawImage(m, p.ax, 0); } }
  const frontMask = id => { const D = DESKS[id], qs = quadsOut[id], top = Math.min(...qs.flatMap(q => q.map(p => p[1]))) - 4, r = [D.x0 - 6, top, D.x1 + 6, D.yfl + 6], m = canvas((r[2] - r[0]) * 2, (r[3] - r[1]) * 2), g = ctx(m);
    g.setTransform(2, 0, 0, 2, -r[0] * 2, -r[1] * 2); g.fillStyle = '#fff'; g.strokeStyle = '#fff';
    g.fillRect(D.x0, D.yb, D.x1 - D.x0, D.ye - D.yb); for (const lx of [D.x0 + 3, D.x1 - 3 - D.leg]) g.fillRect(lx - 0.5, D.ye, D.leg + 1, D.yfl - D.ye + 1);
    g.lineWidth = 6; for (const q of qs) { poly(g, q); g.fill(); g.stroke(); const xs = q.map(p => p[0]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, qb = Math.max(...q.map(p => p[1])); g.fillRect(cx - 4, qb, 8, D.yb - qb + 2); }
    return { rect: [r[0] / PW, r[1] / PH, r[2] / PW, r[3] / PH], png: m.toDataURL('image/png') }; };
  const masksOut = { boss: frontMask('boss'), 'desk-fr': frontMask('numbers') };

  // ---- 7. (the small corner bamboo was taken out again: David, 2026-11-11) ----

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
  { const cur = await fetch(assets + 'layout.json').then(r => r.json()).catch(() => null); if (cur && cur.sprites) { for (const key of ['sprites', 'walkSide', 'baseSprites', 'dash', 'turn']) if (cur[key] !== undefined) lay[key] = cur[key]; } } // the character art's measurements (run-chars.js, the redrawn characters) stay as installed
  // a back-row seat joins the walkway behind the desks at the walkway point nearest to it (the seats moved since the template's own)
  const AISLE = L.nav.nodes.map((p, i) => [i, p]).filter(([, p]) => Math.abs(p[1] - 0.7861) < 0.004);
  const seatNode = (t, x) => t.feet[1] > 0.78 && t.feet[1] < 0.8 ? AISLE.reduce((b, a) => Math.abs(a[1][0] * PW - x) < Math.abs(b[1][0] * PW - x) ? a : b)[0] : t.node;
  lay.desks = PLAN.map(d => ({ id: d.id, label: d.label, theme: d.theme, accent: d.accent, bots: d.bots,
    monitors: quadsOut[d.id].map(q => q.map(([x, y]) => [+(x / PW).toFixed(4), +(y / PH).toFixed(4)])),
    seats: seatsOut.filter(s => s.desk === d.id).map(s => ({ ...JSON.parse(JSON.stringify(s.t)), id: `${d.id[0]}${s.i}`, x: s.x / PW, chair: s.back.map(([x, y]) => [x / PW, y / PH]), feet: [s.t.feet[0] + s.dx / PW, s.t.feet[1]], node: seatNode(s.t, s.x), nc: `${d.id[0]}${s.i}` })) }));
  lay.desks.push({ ...JSON.parse(JSON.stringify(deskById.lounge)), bots: [] });
  lay.nochair = Object.fromEntries(atlasParts.map(p => [`${p.s.desk[0]}${p.s.i}`, [p.ax, 0, p.w * 2, p.h * 2, p.x0, p.y0]]));
  lay.boss.monitors = L.boss.monitors;
  lay.steam = L.steam.filter(c => c.x > 0.2 && c.x < 0.4); // only the mug on the lounge table: the boss and front-right desks' mugs went with the old desks, the old kitchen jar with the old kitchen
  lay.lamps = L.lamps.filter(l => l.desk !== 'boss'); // and so is the boss desk lamp
  // round 2: the kitchen moved right of the new bookcase. The floor lamp's glow, the machine's steam, the coffee and fridge spots follow it;
  // a new walking point in front of the bookcase (joined to the fridge spot) for Grok's book runs. Round 5: all of them through the left
  // wall's perspective (wFwd), and the ladder on the bookcase: two rails at source x LAD.x, tops under the case top, feet kicked out from the wall
  const n4 = (x, y) => [+(x / PW).toFixed(4), +(y / PH).toFixed(4)];
  // round 6: the lamp, the stand and the fridge stand out from the wall (DEPTH), so their spots move out with their fronts
  { const [lx, ly] = wFwd(LAMP.x, (LAMP.top + LAMP.sb) / 2, LAMP.u); lay.lamps[0] = { ...lay.lamps[0], x: +(lx / PW).toFixed(4), y: +(ly / PH).toFixed(4), r: +(lay.lamps[0].r * wS(KS.lampShade[0])).toFixed(4) }; }
  const uS = DEPTH.stand, [spX] = wFwd(KS.spout[0], KS.tray, uS);
  lay.lounge.steam = n4(...wFwd(...KS.steam, uS)); lay.lounge.espresso = n4(...wFwd(KS.spout[0], KS.tray, uS));
  lay.lounge.lamp = [lay.lamps[0].x, lay.lamps[0].y];
  const sq = KS.screen, [q0x, q0y] = wFwd(sq[0], sq[1], uS), [q1x, q1y] = wFwd(sq[2], sq[3], uS);
  lay.kitchen = { spout: wFwd(...KS.spout, uS).map(v => +v.toFixed(1)), tray: +wFwd(KS.spout[0], KS.tray, uS)[1].toFixed(1), screen: [q0x, q0y, q1x, q1y].map(v => +v.toFixed(1)), s: +wS(KS.spout[0]).toFixed(3), note: 'plate px; the coffee pour (KIT in main.js) on the slanted kitchen' };
  const spot = id => lay.lounge.spots.find(q => q.id === id), nodes = lay.nav.nodes;
  { const c = spot('coffee'), f = spot('fridge'); c.p = [+(spX / PW).toFixed(4), c.p[1]]; nodes[c.node] = c.p.slice(); f.p = [+(wFwd(KS.fridge[0], 567, DEPTH.fridge)[0] / PW).toFixed(4), f.p[1]]; nodes[f.node] = f.p.slice(); }
  const uB = DEPTH.bookcase, LAD = { x: [30, 58], top: 126, kick: 24 }, ladTop = LAD.x.map(x => wFwd(x, LAD.top, uB)), ladFoot = LAD.x.map(x => { const [fx, fy] = wFwd(x, 567, uB); return [fx + LAD.kick * wS(x), fy]; });
  const stand = [(ladFoot[0][0] + ladFoot[1][0]) / 2, Math.max(ladFoot[0][1], ladFoot[1][1]) + 6]; // where the climber stands, just in front of the ladder's feet
  const bookNode = nodes.length; nodes.push(n4(...stand)); lay.nav.edges.push([spot('fridge').node, bookNode]);
  // round 6: a walking point on each dog bed, joined to the nearest point of the floor graph (a dead end, so nobody walks through a bed)
  const near = (x, y) => nodes.reduce((b, p, i) => Math.hypot(p[0] * PW - x, p[1] * PH - y) < Math.hypot(nodes[b][0] * PW - x, nodes[b][1] * PH - y) ? i : b, 0);
  lay.lounge.beds = BEDS.map(b => { const at = near(b.x, b.y + 12), node = nodes.length; nodes.push(n4(b.x, b.y - 2)); lay.nav.edges.push([at, node]); return { p: nodes[node].slice(), node }; });
  const bc = [[BC.rect[0], BC.rect[1]], [BC.rect[2], BC.rect[1]], [BC.rect[0], BC.rect[3]], [BC.rect[2], BC.rect[3]]].map(([x, y]) => wFwd(x, y, uB));
  lay.bookcase = { rect: BC.rect.map((v, i) => +(v / (i % 2 ? PH : PW)).toFixed(4)), inner: BC.inner.map(v => +(v / PW).toFixed(4)), shelves: BC.shelves.map(([a, b]) => [+(a / PH).toFixed(4), +(b / PH).toFixed(4)]), node: bookNode, spot: nodes[bookNode].slice(), slots: 4,
    warp: { vp: n4(...VP), ds: +(WARP.ds / PW).toFixed(5), u: +(uB / PW).toFixed(5) }, box: [...n4(Math.min(...bc.map(p => p[0])), Math.min(...bc.map(p => p[1]))), ...n4(Math.max(...bc.map(p => p[0])), Math.max(...bc.map(p => p[1])))],
    ladder: { top: ladTop.map(p => n4(...p)), foot: ladFoot.map(p => n4(...p)) },
    note: 'portable/art/scene.js 1b: the case is in the room picture; the viewer draws the books (BOOKS in config.js), 4 to a shelf, top shelf first, and the ladder. rect, inner, shelves: front-on (source) coordinates; warp lays them onto the slanted left wall (screen = vp.x - (vp.x - u) s, vp.y + (y - vp.y) s, s = 1 / (1 + x / ds); u: how far the front of the case stands out from the wall); box, ladder, spot: screen' };
  lay.masks.boss = masksOut.boss.rect; lay.masks['desk-fr'] = masksOut['desk-fr'].rect; delete lay.masks['plant-l'];
  delete lay.masks['room-l']; delete lay.masks['room-r'];
  lay.masks.water = waterOut.rect; lay.nearGlass = [VB.x0 / PW, VB.x1 / PW, VB.sill / PH]; // the animated water reaches down into the window band
  lay.sun = [771 / PW, 304 / PH]; lay.moon = [634 / PW, 128 / PH]; // where the painted sun and moon are: their light paths on the water
  lay.note = (L.note || '') + '; v11: office rebuilt by portable/art/scene.js (clean floor, black four-leg desks, one monitor per bot, team desks); v12 (round 2): skill bookcase, kitchen redrawn, drawn monitor frames, turn-sheet chairs, lounge redrawn';
  const lo = {}; for (const k of ['dusk', 'night']) { lo[k] = canvas(2560, 1440); const g = ctx(lo[k]); g.imageSmoothingQuality = 'high'; g.drawImage(hi[k], 0, 0, 2560, 1440); }
  window.__sceneOut = { 'layout.json': JSON.stringify(lay), 'plate-dusk-hi.webp': hi.dusk.toDataURL('image/webp', 0.9), 'plate-night-hi.webp': hi.night.toDataURL('image/webp', 0.9), 'plate-dusk.webp': lo.dusk.toDataURL('image/webp', 0.9), 'plate-night.webp': lo.night.toDataURL('image/webp', 0.9),
    'nochair-dusk.webp': atlas.dusk.toDataURL('image/webp', 0.92), 'nochair-night.webp': atlas.night.toDataURL('image/webp', 0.92), 'boss-mask.png': masksOut.boss.png, 'desk-fr-mask.png': masksOut['desk-fr'].png, 'water-mask.png': waterOut.png, ...bagMasks };
  return log;
}
