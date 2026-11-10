// Character fixes (David, 2026-11-10), run in a browser page by portable/art/run-chars.js. Not loaded by the site.
//  - Cyber (sprite 5): the hair bun on top of the cap is taken off and the cap's crown drawn on where it sat.
//  - Studio (sprite 2): no cap. Studio is drawn from LF's art (the same chibi, same pose), the hoodie recoloured to Studio's own
//    yellow and the hair darkened to the dark brown that showed under the cap.
//  - LF (sprite 3): dark blue hoodie instead of green.
// Every picture a bot is drawn from is changed: back (wNN.png), front (fNN.png), side walk (walk-side.webp), turning heads and bodies.
// Input: the pictures as they were at commit 2eb30a1 (src), so this can run again. Output: window.__charsOut (data URLs).
const im = s => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('load ' + s)); i.src = s; });
const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const cx = c => c.getContext('2d', { willReadFrequently: true });
function hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return [0, 0, l]; const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, s, l]; }
function rgb(h, s, l) { h = ((h % 360) + 360) % 360 / 360; if (!s) return [l * 255, l * 255, l * 255]; const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q, f = t => { t = (t + 1) % 1; return 255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p); }; return [f(h + 1 / 3), f(h), f(h - 1 / 3)]; }
const isGreen = (h, s, l) => h >= 58 && h <= 170 && s > 0.18 && l > 0.06;
const isHair = (h, s, l) => h >= 5 && h <= 42 && s > 0.15 && l < 0.5 && l > 0.04; // brown, darker than skin
const isOrange = (r, g, b) => { const [h, s, l] = hsl(r, g, b); return h >= 12 && h <= 42 && s > 0.55 && l > 0.32; };
// mean H, S, L of the pixels a test picks (opaque only)
function stats(d, test, y0 = 0, y1 = 1e9, W = 1) { let h = 0, s = 0, l = 0, n = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 200) continue; const y = Math.floor(i / 4 / W); if (y < y0 || y >= y1) continue; const c = hsl(d[i], d[i + 1], d[i + 2]); if (!test(...c)) continue; h += c[0]; s += c[1]; l += c[2]; n++; } return n ? [h / n, s / n, l / n] : null; }
// recolour the pixels a test picks: hue to the target, saturation and lightness scaled so the mean lands on the target's
function recolor(d, test, from, to, region = () => true, W = 1) {
  for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; const p = i / 4; if (!region(p % W, Math.floor(p / W))) continue; const [h, s, l] = hsl(d[i], d[i + 1], d[i + 2]); if (!test(h, s, l)) continue;
    const c = rgb(to[0] + (h - from[0]) * 0.25, Math.min(1, s * to[1] / from[1]), Math.min(0.95, l * to[2] / from[2])); d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; }
}
const darkenHair = (d, region, W, f = 0.52) => { for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; const p = i / 4; if (!region(p % W, Math.floor(p / W))) continue; const c = hsl(d[i], d[i + 1], d[i + 2]); if (!isHair(...c)) continue; d[i] *= f; d[i + 1] *= f * 0.97; d[i + 2] *= f * 0.95; } };
// take the bun off the top of a cap: the bun is the non-orange blob the topmost pixels belong to; then the crown is drawn on, column by
// column, up to a dome fitted to the cap's own top edge either side
function unBun(d, W, H, x0, y0, w, h) {
  const at = (x, y) => ((y0 + y) * W + x0 + x) * 4, op = (x, y) => d[at(x, y) + 3] > 40;
  let sx = -1, sy = -1; for (let y = 0; y < h && sx < 0; y++) for (let x = 0; x < w; x++) if (d[at(x, y) + 3] > 120) { sx = x; sy = y; break; }
  if (sx < 0) return 0;
  const o0 = at(sx, sy); if (isOrange(d[o0], d[o0 + 1], d[o0 + 2])) return 0; // nothing on top of the cap
  const bun = new Uint8Array(w * h), st = [[sx, sy]]; bun[sy * w + sx] = 1; let n = 0;
  while (st.length) { const [x, y] = st.pop(); n++; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h || bun[Y * w + X] || !op(X, Y)) continue; const o = at(X, Y); if (isOrange(d[o], d[o + 1], d[o + 2])) continue; bun[Y * w + X] = 1; st.push([X, Y]); } }
  // the bun's rim where it met the cap: darker pixels right next to it
  for (let pass = 0; pass < 2; pass++) { const add = []; for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { if (bun[y * w + x] || !op(x, y)) continue; if (!(bun[y * w + x - 1] || bun[y * w + x + 1] || bun[(y - 1) * w + x] || bun[(y + 1) * w + x])) continue; const o = at(x, y), l = hsl(d[o], d[o + 1], d[o + 2])[2]; if (l < 0.5 || d[o + 3] < 200) add.push(y * w + x); } for (const i of add) bun[i] = 1; }
  let bx0 = w, bx1 = 0, by1 = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (bun[y * w + x]) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); d[at(x, y) + 3] = 0; }
  // the cap's top edge either side of the bun -> a quadratic dome
  const top = x => { for (let y = 0; y < h; y++) if (d[at(x, y) + 3] > 128) return y; return -1; };
  const pts = []; for (let x = Math.max(0, bx0 - 26); x < Math.min(w, bx1 + 27); x++) { if (x >= bx0 - 1 && x <= bx1 + 1) continue; const y = top(x); if (y < 0) continue; const o = at(x, y + 2); if (isOrange(d[o], d[o + 1], d[o + 2])) pts.push([x, y]); }
  if (pts.length < 6) return n;
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0], v = [0, 0, 0]; for (const [x, y] of pts) { const f = [1, x, x * x]; for (let a = 0; a < 3; a++) { v[a] += f[a] * y; for (let b = 0; b < 3; b++) m[a * 3 + b] += f[a] * f[b]; } }
  const det = M => M[0] * (M[4] * M[8] - M[5] * M[7]) - M[1] * (M[3] * M[8] - M[5] * M[6]) + M[2] * (M[3] * M[7] - M[4] * M[6]);
  const D0 = det(m), c = [0, 1, 2].map(k => { const M = m.slice(); for (let a = 0; a < 3; a++) M[a * 3 + k] = v[a]; return det(M) / D0; });
  const dome = x => c[0] + c[1] * x + c[2] * x * x;
  // per column: from the dome down to the bottom of the bun's footprint (or a few px into the old edge), in the cap's colour just below,
  // smoothed across columns so the seams under the bun leave no stripes
  const xa = Math.max(0, bx0 - 3), xb = Math.min(w - 1, bx1 + 3), yEnd = [], base = [];
  for (let x = xa; x <= xb; x++) { let e = -1; for (let y = 0; y < h; y++) if (bun[y * w + x]) e = y; const t0 = top(x); yEnd.push(e >= 0 ? e + 2 : t0 >= 0 ? t0 + 2 : -1); }
  for (let x = xa; x <= xb; x++) { const e = yEnd[x - xa]; let r = 0, g = 0, b = 0, k = 0; if (e >= 0) for (let y = e + 1; y < Math.min(h, e + 7); y++) for (let X = Math.max(0, x - 3); X <= Math.min(w - 1, x + 3); X++) { const o = at(X, y); if (d[o + 3] > 200 && isOrange(d[o], d[o + 1], d[o + 2])) { r += d[o]; g += d[o + 1]; b += d[o + 2]; k++; } } base.push(k ? [r / k, g / k, b / k] : null); }
  const sm = base.map((c, i) => { if (!c) return null; let r = 0, g = 0, b = 0, k = 0; for (let j = Math.max(0, i - 3); j <= Math.min(base.length - 1, i + 3); j++) if (base[j]) { r += base[j][0]; g += base[j][1]; b += base[j][2]; k++; } return [r / k, g / k, b / k]; });
  for (let x = xa; x <= xb; x++) { const c = sm[x - xa], e = yEnd[x - xa]; if (!c || e < 0) continue; const yt = Math.max(0, dome(x)); if (yt >= e || e - yt > 50) continue;
    for (let y = Math.floor(yt); y <= e; y++) { const o = at(x, y), f = (y - yt) / Math.max(1, e - yt), lift = 1 + 0.07 * (1 - f), a = y === Math.floor(yt) ? 1 - (yt - Math.floor(yt)) : 1;
      const blend = y > e - 2 ? 0.5 : 1; // the last rows melt into the cap below
      for (let ch = 0; ch < 3; ch++) d[o + ch] = d[o + 3] > 200 && blend < 1 ? d[o + ch] * (1 - blend) + Math.min(255, c[ch] * lift) * blend : Math.min(255, c[ch] * lift);
      d[o + 3] = Math.round(255 * a); } }
  // faint leftovers of the bun's soft outline outside the new cap
  for (let y = 0; y < Math.min(h, by1 + 4); y++) for (let x = xa; x <= xb; x++) { const o = at(x, y); if (d[o + 3] && d[o + 3] < 150 && !isOrange(d[o], d[o + 1], d[o + 2]) && (y < Math.max(0, dome(x)) - 0.5 || bun[y * w + x])) d[o + 3] = 0; }
  return n;
}
export async function run(src) {
  const L = await fetch(src + 'layout.json').then(r => r.json()), out = {}, log = [];
  const load = async f => { const i = await im(src + f), c = cv(i.width, i.height), g = cx(c); g.drawImage(i, 0, 0); return { c, g, id: g.getImageData(0, 0, c.width, c.height) }; };
  const save = (k, p, type = 'image/png', q) => { p.g.putImageData(p.id, 0, 0); out[k] = p.c.toDataURL(type, q); };
  // Studio's own yellow, LF's green: the recolour targets
  const f02 = await load('f02.png'), f03 = await load('f03.png');
  const yellow = stats(f02.id.data, (h, s, l) => h >= 38 && h <= 58 && s > 0.45, 125, 1e9, f02.c.width), green = stats(f03.id.data, isGreen, 125, 1e9, f03.c.width), navy = [222, 0.5, 0.27];
  log.push({ yellow, green });
  // flat sprites: back, front
  for (const [st, lf, cy] of [['w02.png', 'w03.png', 'w05.png'], ['f02.png', 'f03.png', 'f05.png']]) {
    const S = await load(lf); const W = S.c.width; recolor(S.id.data, isGreen, green, yellow, () => true, W); darkenHair(S.id.data, (x, y) => y < 125, W); save(st, S);
    const F = await load(lf); recolor(F.id.data, isGreen, green, navy, () => true, W); save(lf, F);
    const C = await load(cy); log.push([cy, unBun(C.id.data, C.c.width, C.c.height, 0, 0, C.c.width, 90)]); save(cy, C);
  }
  // side walk: one 198 x 284 cell per sprite
  { const ws = await load(L.walkSide.file), [cw, ch] = L.walkSide.cell, W = ws.c.width, d = ws.id.data;
    const g2 = cx(cv(cw, ch)); g2.putImageData(ws.id, -3 * cw, 0); const lfCell = g2.getImageData(0, 0, cw, ch); // LF's cell, untouched
    recolor(lfCell.data, isGreen, green, yellow, () => true, cw); darkenHair(lfCell.data, (x, y) => y < 150, cw);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const o = (y * W + 2 * cw + x) * 4, p = (y * cw + x) * 4; for (let k = 0; k < 4; k++) d[o + k] = lfCell.data[p + k]; }
    recolor(d, isGreen, green, navy, (x) => x >= 3 * cw && x < 4 * cw, W);
    log.push(['walk-side bun', unBun(d, W, ws.c.height, 5 * cw, 0, cw, 150)]);
    save(L.walkSide.file, ws, 'image/webp', 0.95); }
  // turning heads (6 yaws x 12 rows): Studio's row is LF's with darker hair; Cyber's buns come off
  { const th = await load(L.turn.heads), [cw, ch] = L.turn.head, W = th.c.width, d = th.id.data;
    for (let y = 0; y < ch; y++) for (let x = 0; x < W; x++) { const o = ((2 * ch + y) * W + x) * 4, s = ((3 * ch + y) * W + x) * 4; for (let k = 0; k < 4; k++) d[o + k] = d[s + k]; }
    darkenHair(d, (x, y) => y >= 2 * ch && y < 3 * ch, W);
    const nb = []; for (let i = 0; i < L.turn.yaws; i++) nb.push(unBun(d, W, th.c.height, i * cw, 5 * ch, cw, 120)); log.push(['heads buns', nb]);
    save(L.turn.heads, th, 'image/webp', 0.95); }
  // turning bodies: LF's hoodie navy (Studio keeps its own yellow body)
  { const tb = await load(L.turn.bodies), [cw, ch] = L.turn.cell, W = tb.c.width; recolor(tb.id.data, isGreen, green, navy, (x, y) => y >= 3 * ch && y < 4 * ch, W); save(L.turn.bodies, tb, 'image/webp', 0.95); }
  window.__charsOut = out;
  return log;
}
