// One-off art repaint, run in a browser page by portable/art/run-desks.js. Not loaded by the site.
// David, 2026-11-10: every desk minimalist, dark brown, no drawers. On the room pictures (dusk and night, 2x and 3x) and the
// chair-less floor patches:
//  1. wood inside each desk outline becomes dark walnut (only wood-coloured pixels change: monitors, plants, mugs, keyboards and the
//     chairs keep their colours; chairs are also masked out by their outlines from layout.json)
//  2. each drawer stack becomes a slim slab leg at its outer edge, with open, shadowed space under the desk where the drawers were
// All coordinates are plate px (1280 x 720), traced from the 3x plate.
const DESKS = [
  { id: 'video', wood: [[256, 460], [494, 459], [495, 542], [258, 537]], peds: [[262, 488, 305, 533, 'L'], [440, 488, 486, 540, 'R']] },
  { id: 'sbp', wood: [[529, 463], [761, 462], [762, 513], [531, 512]], peds: [[534, 489, 576, 509, 'L'], [710, 489, 756, 511, 'R']] },
  { id: 'messages', wood: [[785, 459], [1030, 458], [1030, 512], [787, 543]], peds: [[788, 487, 839, 540, 'L'], [975, 487, 1004, 510, 'R']] },
  { id: 'housekeeping', wood: [[987, 495], [1252, 492], [1252, 546], [987, 545]], peds: [] },
  { id: 'numbers', wood: [[818, 574], [1076, 573], [1076, 690], [820, 690]], peds: [[822, 627, 860, 688, 'L'], [1024, 627, 1062, 688, 'R']] },
];
const SLAB = 5; // slab leg thickness, plate px

const img = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function rgb2hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return [0, 0, l]; const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, s, l]; }
function hsl2rgb(h, s, l) { h /= 360; const f = (p, q, t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; if (!s) return [l * 255, l * 255, l * 255]; const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255]; }
const walnut = (r, g, b) => { const [h, s, l] = rgb2hsl(r, g, b); return hsl2rgb(22, Math.min(0.5, s) * 0.85, l * 0.5 + 0.015); };
const isWood = (r, g, b) => { const [h, s, l] = rgb2hsl(r, g, b); return h >= 8 && h <= 46 && s > 0.22 && l > 0.1 && l < 0.85; };

// apply to canvas c; map plate px -> canvas px: X = ox + x * s, Y = oy + y * s; clip = [x0, y0, x1, y1] in canvas px (or null)
function apply(c, s, ox, oy, chairs, clip, floorRef) {
  const g = c.getContext('2d', { willReadFrequently: true }), W = c.width, H = c.height;
  const X = x => ox + x * s, Y = y => oy + y * s;
  // masks in canvas px: wood areas minus chairs; pedestals minus chairs
  const mk = paint => { const m = canvas(W, H), mg = m.getContext('2d'); mg.fillStyle = '#fff'; paint(mg); mg.globalCompositeOperation = 'destination-out'; mg.fillStyle = '#000';
    for (const p of chairs) { mg.beginPath(); p.forEach(([x, y], i) => i ? mg.lineTo(X(x), Y(y)) : mg.moveTo(X(x), Y(y))); mg.closePath(); mg.fill(); }
    if (clip) { mg.globalCompositeOperation = 'destination-in'; mg.fillRect(clip[0], clip[1], clip[2] - clip[0], clip[3] - clip[1]); }
    return mg.getImageData(0, 0, W, H).data; };
  const woodM = mk(mg => { for (const d of DESKS) { mg.beginPath(); d.wood.forEach(([x, y], i) => i ? mg.lineTo(X(x), Y(y)) : mg.moveTo(X(x), Y(y))); mg.closePath(); mg.fill(); } });
  const id = g.getImageData(0, 0, W, H), D = id.data;
  // floor colour per column under each pedestal (from the reference plate when given, so patches match the room)
  const peds = DESKS.flatMap(d => d.peds);
  const floorAt = (x, yy) => { const R = floorRef || { data: D, W, s, ox, oy }; const px = Math.round(R.ox + x * R.s), py = Math.round(R.oy + (yy + 4) * R.s), o = (py * R.W + px) * 4; return [R.data[o], R.data[o + 1], R.data[o + 2]]; };
  // 1. pedestals -> slab + shadowed open space (before the recolour, so the slab gets walnut too)
  for (const [x0, y0, x1, y1, side] of peds) {
    const cx0 = Math.floor(X(x0)), cx1 = Math.ceil(X(x1)), cy0 = Math.floor(Y(y0)), cy1 = Math.ceil(Y(y1));
    for (let py = Math.max(0, cy0); py < Math.min(H, cy1); py++) for (let px = Math.max(0, cx0); px < Math.min(W, cx1); px++) {
      const o = (py * W + px) * 4; if (woodM[o + 3] < 128) continue; // chairs (and anything outside the desk) stay as painted
      const x = (px - ox) / s, y = (py - oy) / s, u = (y - y0) / (y1 - y0), slab = side === 'L' ? x - x0 < SLAB : x1 - x < SLAB;
      if (slab) { const e = side === 'L' ? (x - x0) / SLAB : (x1 - x) / SLAB, lv = 0.55 + 0.45 * Math.sin(e * Math.PI); D[o] = 150 * lv; D[o + 1] = 96 * lv; D[o + 2] = 58 * lv; continue; } // recoloured below
      // open space: the floor seen under the desk (planks sampled from just below, mirrored upward), darkest right under the top
      const f = floorAt(x, y1 + (y1 - y) * 0.6), b = Math.min(1, Math.max(0, (u - 0.08) / 0.8)) ** 1.1, top = [44, 30, 23], k = 0.4 + 0.4 * b;
      D[o] = top[0] + (f[0] * k - top[0]) * b; D[o + 1] = top[1] + (f[1] * k - top[1]) * b; D[o + 2] = top[2] + (f[2] * k - top[2]) * b;
    }
  }
  // 2. wood -> dark walnut
  for (let i = 0; i < D.length; i += 4) {
    if (woodM[i + 3] < 128) continue;
    const r = D[i], gg = D[i + 1], b = D[i + 2]; if (!isWood(r, gg, b)) continue;
    const [nr, ng, nb] = walnut(r, gg, b), a = woodM[i + 3] / 255; D[i] = r + (nr - r) * a; D[i + 1] = gg + (ng - gg) * a; D[i + 2] = b + (nb - b) * a;
  }
  g.putImageData(id, 0, 0);
  return { data: D, W, s, ox, oy };
}

export async function run(base) {
  const L = await fetch(base + 'layout.json').then(r => r.json()), PW = 1280;
  const chairs = L.desks.flatMap(d => d.seats.map(s => s.chair).filter(Boolean)).map(p => p.map(([x, y]) => [x * PW, y * 720]));
  const out = {}, refs = {};
  for (const name of ['plate-dusk.webp', 'plate-night.webp', 'plate-dusk-hi.webp', 'plate-night-hi.webp']) {
    const im = await img(base + name + '?r=' + Math.random()), c = canvas(im.width, im.height); c.getContext('2d').drawImage(im, 0, 0);
    const R = apply(c, im.width / PW, 0, 0, chairs, null, null);
    if (!name.includes('-hi')) refs[name.includes('dusk') ? 'dusk' : 'night'] = { data: R.data.slice(), W: c.width, s: R.s, ox: 0, oy: 0 };
    out[name] = c.toDataURL('image/webp', 0.9);
  }
  for (const t of ['dusk', 'night']) { // chair-less patches: each seat's patch is a 2x piece of floor, placed at s.nc in plate px
    const name = `nochair-${t}.webp`, im = await img(base + name + '?r=' + Math.random()), c = canvas(im.width, im.height); c.getContext('2d').drawImage(im, 0, 0);
    for (const d of L.desks) for (const s of d.seats) {
      if (s.nc == null) continue; const [ax, ay, w, h, x, y] = L.nochair[s.nc];
      apply(c, 2, ax - 2 * x, ay - 2 * y, [], [ax, ay, ax + w, ay + h], refs[t]);
    }
    out[name] = c.toDataURL('image/webp', 0.9);
  }
  window.__deskOut = out;
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length]));
}
