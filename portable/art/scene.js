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
  sbp: { x0: 556, x1: 906, yb: 463, yf: 480, ye: 487, yfl: 545, leg: 4 },
  housekeeping: { x0: 1026, x1: 1250, yb: 493, yf: 518, ye: 527, yfl: 600, leg: 5 },
  numbers: { x0: 828, x1: 1050, yb: 575, yf: 617, ye: 627, yfl: 691, leg: 6 },
  boss: { x0: 512, x1: 708, yb: 572, yf: 617, ye: 627, yfl: 688, leg: 6 },
};
// who sits where (bot numbers: 0 Usage, 1 Grok, 2 $tonks, 3 Ops, 4 Studio, 5 Media, 6 SBP, 7 LF, 8 Archives, 9 Cyber, 10 Sports, 14 Dash)
// seats: [x, chair template seat id]; monitors: [centre x, monitor template] or 'keep' (the painted ones stay where they are)
export const PLAN = [
  { id: 'video', label: 'Studio · Media · LF', theme: 'video', accent: '#e8806e', bots: [4, 5, 7], seats: [[302, 'v0'], [375, 'v0'], [448, 'v0']], mon: { from: ['video', 0], at: [302, 375, 448] } },
  { id: 'sbp', label: 'Ops · Usage · Archives · Dash', theme: 'house', accent: '#6fbfd0', bots: [3, 0, 8, 14], seats: [[595, 's0'], [688, 's1'], [781, 's1'], [874, 's1']], mon: 'keep:sbp+add', add: { from: ['sbp', 1], at: [772, 865] } },
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

export async function run(base, orig, assets) {
  const L = await fetch(assets + 'layout.json').then(r => r.json());
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
  for (const k of ['dusk', 'night']) {
    const g = ctx(hi[k]), id = g.getImageData(0, 0, 84 * S, 610 * S), D = id.data, Wd = 84 * S, top = 552, door = 590, base = 597;
    for (let X = 0; X < 83 * S; X++) {
      let r = 0, gg = 0, b = 0, n = 0; for (let Y = 538 * S; Y < 550 * S; Y++) { const o = (Y * Wd + X) * 4; r += D[o]; gg += D[o + 1]; b += D[o + 2]; n++; }
      r /= n; gg /= n; b /= n;
      for (let Y = top * S; Y < base * S; Y++) { const y = Y / S, o = (Y * Wd + X) * 4;
        const m = y < door ? 1 - 0.14 * (y - top) / (door - top) - (y > door - 2.5 ? 0.25 : 0) : 0.38; // the door darkens a little towards its bottom edge, then the recessed kick plate
        D[o] = r * m; D[o + 1] = gg * m; D[o + 2] = b * m * (y < door ? 1 : 1.08); }
    }
    g.putImageData(id, 0, 0);
    g.save(); g.setTransform(S, 0, 0, S, 0, 0);
    const sh = g.createLinearGradient(0, base, 0, base + 14); sh.addColorStop(0, 'rgba(6,3,2,.55)'); sh.addColorStop(1, 'rgba(6,3,2,0)'); g.fillStyle = sh; g.fillRect(0, base, 88, 14); // its shadow on the floor
    const side = g.createLinearGradient(83, 0, 104, 0); side.addColorStop(0, 'rgba(6,3,2,.5)'); side.addColorStop(1, 'rgba(6,3,2,0)'); g.fillStyle = side; g.fillRect(83, 567, 21, base - 567 + 6); // and beside it, where it stands forward of the counter
    g.fillStyle = k === 'night' ? '#1a1718' : '#2b2523'; for (const fx2 of [6, 74]) { g.beginPath(); g.roundRect(fx2 - 3, base - 1, 6, 4, 1.5); g.fill(); } // feet
    g.restore();
  }

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

  // ---- 8. the viewer's layout ----
  const lay = JSON.parse(JSON.stringify(L)), nav = L.nav.nodes.map(([x, y]) => [x * PW, y * PH]);
  const seatNode = t => t.node;
  lay.desks = PLAN.map(d => ({ id: d.id, label: d.label, theme: d.theme, accent: d.accent, bots: d.bots,
    monitors: quadsOut[d.id].map(q => q.map(([x, y]) => [+(x / PW).toFixed(4), +(y / PH).toFixed(4)])),
    seats: seatsOut.filter(s => s.desk === d.id).map(s => ({ ...JSON.parse(JSON.stringify(s.t)), id: `${d.id[0]}${s.i}`, x: s.x / PW, chair: s.back.map(([x, y]) => [x / PW, y / PH]), feet: [s.t.feet[0] + s.dx / PW, s.t.feet[1]], node: seatNode(s.t), nc: `${d.id[0]}${s.i}` })) }));
  lay.desks.push({ ...JSON.parse(JSON.stringify(deskById.lounge)), bots: [] });
  lay.nochair = Object.fromEntries(atlasParts.map(p => [`${p.s.desk[0]}${p.s.i}`, [p.ax, 0, p.w * 2, p.h * 2, p.x0, p.y0]]));
  lay.boss.monitors = L.boss.monitors;
  lay.steam = L.steam.filter(c => c.x < 0.4); // the mugs on the boss and front-right desks are gone with the old desks
  lay.lamps = L.lamps.filter(l => l.desk !== 'boss'); // and so is the boss desk lamp
  lay.masks.boss = masksOut.boss.rect; lay.masks['desk-fr'] = masksOut['desk-fr'].rect; lay.masks['plant-l'] = plantMask.rect;
  delete lay.masks['room-l']; delete lay.masks['room-r'];
  lay.note = (L.note || '') + '; v11: office rebuilt by portable/art/scene.js (clean floor, black four-leg desks, one monitor per bot, team desks)';
  const lo = {}; for (const k of ['dusk', 'night']) { lo[k] = canvas(2560, 1440); const g = ctx(lo[k]); g.imageSmoothingQuality = 'high'; g.drawImage(hi[k], 0, 0, 2560, 1440); }
  window.__sceneOut = { 'layout.json': JSON.stringify(lay), 'plate-dusk-hi.webp': hi.dusk.toDataURL('image/webp', 0.9), 'plate-night-hi.webp': hi.night.toDataURL('image/webp', 0.9), 'plate-dusk.webp': lo.dusk.toDataURL('image/webp', 0.9), 'plate-night.webp': lo.night.toDataURL('image/webp', 0.9),
    'nochair-dusk.webp': atlas.dusk.toDataURL('image/webp', 0.92), 'nochair-night.webp': atlas.night.toDataURL('image/webp', 0.92), 'boss-mask.png': masksOut.boss.png, 'desk-fr-mask.png': masksOut['desk-fr'].png, 'plant-l-mask.png': plantMask.png };
  return log;
}
