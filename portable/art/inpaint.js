// Image completion for one-off art repairs (portable/art/room.js). Not loaded by the site.
// Fills the `hole` pixels of one or more same-sized pictures with texture taken from their `valid` pixels: multi-scale PatchMatch
// (Barnes et al. 2009) with patch voting (Wexler et al. 2007). The first picture guides the search; every other picture is filled with
// the very same source pixels, so the dusk and night versions of a room picture get identical repairs.
//   imgs:  Float32Array RGB (W * H * 3) per picture, filled in place
//   hole:  Uint8Array (W * H), 1 = fill
//   valid: Uint8Array (W * H), 1 = may be copied from (hole pixels are never used)
export function inpaint(imgs, W, H, hole, valid, opt = {}) {
  const R = opt.r || 3, rnd = mulberry(opt.seed || 7);
  // pyramid of the guide picture (holes grow, sources shrink: a coarse pixel is a hole if any of its four is)
  const lv = [{ W, H, I: imgs[0], hole, valid: and(valid, not(hole)) }];
  while (Math.min(lv[lv.length - 1].W, lv[lv.length - 1].H) >= (opt.minSize || 48) * 2) { // stop while the sources still hold whole patches
    const c = down(lv[lv.length - 1]); let n = 0; const ok = boxAll(c.valid, c.W, c.H, R); for (let i = 0; i < ok.length && n < 200; i++) n += ok[i];
    if (n < 200) break; lv.push(c);
  }
  let prev = null;
  for (let l = lv.length - 1; l >= 0; l--) {
    const L = lv[l], last = l === lv.length - 1;
    L.ok = boxAll(L.valid, L.W, L.H, R); L.src = []; for (let i = 0; i < L.ok.length; i++) if (L.ok[i]) L.src.push(i);
    if (!L.src.length) throw new Error('inpaint: no source patches at level ' + l);
    L.tgt = boxAny(L.hole, L.W, L.H, R); L.T = []; for (let i = 0; i < L.tgt.length; i++) if (L.tgt[i]) L.T.push(i);
    L.nnf = new Int32Array(L.W * L.H).fill(-1); L.dist = new Float64Array(L.W * L.H); L.n = new Uint8Array(L.W * L.H);
    for (const p of L.T) L.n[p] = count(p, L.W, L.H, R);
    if (last) { diffuse(L); for (const p of L.T) L.nnf[p] = L.src[(rnd() * L.src.length) | 0]; }
    else { upsample(prev, L, rnd); vote(L, [L.I], null); }
    const em = l === 0 ? (opt.fineIters || 3) : last ? 10 : 5, rad0 = l === 0 ? (opt.fineRadius || 40) : Math.max(L.W, L.H);
    for (let e = 0; e < em; e++) {
      for (const p of L.T) L.dist[p] = dist(L, p, L.nnf[p], Infinity);
      for (let s = 0; s < 2; s++) sweep(L, s ? -1 : 1, rad0, rnd);
      const h = scale(L), w = weights(L, h);
      if (l === 0 && e === em - 1 && opt.sharp !== false) { for (const p of L.T) L.dist[p] = dist(L, p, L.nnf[p], Infinity); centre(L, imgs); } // last pass: each pixel copied from its own best match, so texture stays crisp
      else vote(L, l === 0 && e === em - 1 ? imgs : [L.I], w);
    }
    prev = L;
  }
  return { levels: lv.length };
}
const not = a => a.map(v => v ? 0 : 1), and = (a, b) => a.map((v, i) => v && b[i] ? 1 : 0);
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function down({ W, H, I, hole, valid }) {
  const w = W >> 1, h = H >> 1, J = new Float32Array(w * h * 3), ho = new Uint8Array(w * h), va = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, n = 0, any = 0, all = 1;
    for (let k = 0; k < 4; k++) { const i = (2 * y + (k >> 1)) * W + 2 * x + (k & 1); if (hole[i]) any = 1; else { r += I[i * 3]; g += I[i * 3 + 1]; b += I[i * 3 + 2]; n++; } if (!valid[i]) all = 0; }
    const o = y * w + x; ho[o] = any; va[o] = all && !any ? 1 : 0; if (n) { J[o * 3] = r / n; J[o * 3 + 1] = g / n; J[o * 3 + 2] = b / n; }
  }
  return { W: w, H: h, I: J, hole: ho, valid: va };
}
function boxAny(m, W, H, R) { // dilate by R (square)
  const t = new Uint8Array(W * H), o = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let a = 0; for (let d = -R; d <= R && !a; d++) { const xx = x + d; if (xx >= 0 && xx < W && m[y * W + xx]) a = 1; } t[y * W + x] = a; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let a = 0; for (let d = -R; d <= R && !a; d++) { const yy = y + d; if (yy >= 0 && yy < H && t[yy * W + x]) a = 1; } o[y * W + x] = a; }
  return o;
}
function boxAll(m, W, H, R) { // patch centres whose whole patch is inside the picture and valid
  const t = new Uint8Array(W * H), o = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = R; x < W - R; x++) { let a = 1; for (let d = -R; d <= R && a; d++) if (!m[y * W + x + d]) a = 0; t[y * W + x] = a; }
  for (let y = R; y < H - R; y++) for (let x = 0; x < W; x++) { let a = 1; for (let d = -R; d <= R && a; d++) if (!t[(y + d) * W + x]) a = 0; o[y * W + x] = a; }
  return o;
}
function count(p, W, H, R) { const x = p % W, y = (p / W) | 0; return (Math.min(W - 1, x + R) - Math.max(0, x - R) + 1) * (Math.min(H - 1, y + R) - Math.max(0, y - R) + 1); }
function diffuse(L) { // first guess on the coarsest level: grow the known colours inwards
  const { W, H, I } = L, known = not(L.hole); let front = true;
  while (front) {
    front = false; const add = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (known[i]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (known[j]) { r += I[j * 3]; g += I[j * 3 + 1]; b += I[j * 3 + 2]; n++; } }
      if (n) add.push([i, r / n, g / n, b / n]);
    }
    for (const [i, r, g, b] of add) { I[i * 3] = r; I[i * 3 + 1] = g; I[i * 3 + 2] = b; known[i] = 1; front = true; }
  }
}
function dist(L, p, s, best) {
  const { W, H, I } = L, R = 3, px = p % W, py = (p / W) | 0, sx = s % W, sy = (s / W) | 0; let d = 0;
  for (let dy = -R; dy <= R; dy++) {
    const qy = py + dy; if (qy < 0 || qy >= H) continue;
    const rq = qy * W, rs = (sy + dy) * W;
    for (let dx = -R; dx <= R; dx++) {
      const qx = px + dx; if (qx < 0 || qx >= W) continue;
      const a = (rq + qx) * 3, b = (rs + sx + dx) * 3, e0 = I[a] - I[b], e1 = I[a + 1] - I[b + 1], e2 = I[a + 2] - I[b + 2];
      d += e0 * e0 + e1 * e1 + e2 * e2;
    }
    if (d >= best) return d;
  }
  return d;
}
function sweep(L, dir, rad0, rnd) {
  const { W, H, T, nnf, ok, tgt } = L, n = T.length;
  for (let k = 0; k < n; k++) {
    const p = T[dir > 0 ? k : n - 1 - k]; let s = nnf[p], best = L.dist[p];
    const px = p % W, py = (p / W) | 0;
    const nx = px - dir; if (nx >= 0 && nx < W && tgt[p - dir] && nnf[p - dir] >= 0) { const c = nnf[p - dir] + dir, cx = (nnf[p - dir] % W) + dir; if (cx >= 0 && cx < W && ok[c]) { const d = dist(L, p, c, best); if (d < best) { best = d; s = c; } } }
    const ny = py - dir; if (ny >= 0 && ny < H && tgt[p - dir * W] && nnf[p - dir * W] >= 0) { const c = nnf[p - dir * W] + dir * W; if (c >= 0 && c < W * H && ok[c]) { const d = dist(L, p, c, best); if (d < best) { best = d; s = c; } } }
    for (let r = rad0; r >= 1; r >>= 1) {
      const sx = s % W, sy = (s / W) | 0, cx = sx + Math.round((rnd() * 2 - 1) * r), cy = sy + Math.round((rnd() * 2 - 1) * r);
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue; const c = cy * W + cx; if (!ok[c]) continue;
      const d = dist(L, p, c, best); if (d < best) { best = d; s = c; }
    }
    nnf[p] = s; L.dist[p] = best;
  }
}
function scale(L) { // typical per-pixel patch distance, for the voting weights
  const a = []; for (let i = 0; i < L.T.length; i += 7) { const p = L.T[i]; a.push(L.dist[p] / L.n[p]); }
  a.sort((x, y) => x - y); return (a[(a.length * 0.6) | 0] || 1) + 1;
}
function weights(L, h) { const w = new Float32Array(L.W * L.H); for (const p of L.T) w[p] = Math.exp(-L.dist[p] / L.n[p] / (2 * h)) + 1e-4; return w; } // never 0: every hole pixel must get a colour
function vote(L, pics, w) {
  const { W, H, T, nnf, hole } = L, R = 3;
  for (const I of pics) {
    const acc = new Float32Array(W * H * 3), ws = new Float32Array(W * H);
    for (const p of T) {
      const s = nnf[p], px = p % W, py = (p / W) | 0, sx = s % W, sy = (s / W) | 0, wt = w ? w[p] : 1;
      for (let dy = -R; dy <= R; dy++) {
        const qy = py + dy; if (qy < 0 || qy >= H) continue;
        for (let dx = -R; dx <= R; dx++) {
          const qx = px + dx; if (qx < 0 || qx >= W) continue; const q = qy * W + qx; if (!hole[q]) continue;
          const b = ((sy + dy) * W + sx + dx) * 3; acc[q * 3] += wt * I[b]; acc[q * 3 + 1] += wt * I[b + 1]; acc[q * 3 + 2] += wt * I[b + 2]; ws[q] += wt;
        }
      }
    }
    for (let q = 0; q < W * H; q++) if (hole[q] && ws[q] > 0) { I[q * 3] = acc[q * 3] / ws[q]; I[q * 3 + 1] = acc[q * 3 + 1] / ws[q]; I[q * 3 + 2] = acc[q * 3 + 2] / ws[q]; }
  }
}
function centre(L, pics) { for (const I of pics) { const c = I.slice(); for (const p of L.T) if (L.hole[p]) { const s = L.nnf[p]; c[p * 3] = I[s * 3]; c[p * 3 + 1] = I[s * 3 + 1]; c[p * 3 + 2] = I[s * 3 + 2]; } I.set(c); } }
function upsample(C, F, rnd) {
  for (const p of F.T) {
    const px = p % F.W, py = (p / F.W) | 0, cx = Math.min(C.W - 1, px >> 1), cy = Math.min(C.H - 1, py >> 1), cs = C.nnf[cy * C.W + cx];
    let s = -1;
    if (cs >= 0) { const sx = 2 * (cs % C.W) + (px & 1), sy = 2 * ((cs / C.W) | 0) + (py & 1); if (sx < F.W && sy < F.H && F.ok[sy * F.W + sx]) s = sy * F.W + sx; }
    F.nnf[p] = s >= 0 ? s : F.src[(rnd() * F.src.length) | 0];
  }
}
