// One-off art repair, run in a browser page (portable/art/run.js drives it). Not loaded by the site.
// 1. turn-heads: fills the holes inside the painted heads (transparent gaps between hair and face, the missing patch beside the glasses)
//    with colour grown in from the surrounding paint. A gap counts as a hole when paint surrounds it in at least 6 of 8 directions,
//    so the open space under a cap brim or beside a ponytail stays open.
// 2. walk-side: one side-view upper body per bot for walking sideways: the back-view torso (no front pocket or strings) with the
//    repaired profile head (column 2) on its neck. Same cell size and hem as the w??.png walk sprites, so the walk code can swap it in.
const img = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

function fillHoles(id, W, H, x0, y0, cw, ch, R = 30, need = 6) {
  const d = id.data, A = (x, y) => d[(y * W + x) * 4 + 3];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.71, 0.71], [-0.71, 0.71], [0.71, -0.71], [-0.71, -0.71]];
  const hole = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    if (A(x0 + x, y0 + y) > 235) continue;
    let hits = 0;
    for (let k = 0; k < dirs.length; k++) {
      const [dx, dy] = dirs[k];
      for (let s = 1; s <= R; s++) {
        const px = Math.round(x + dx * s), py = Math.round(y + dy * s);
        if (px < 0 || py < 0 || px >= cw || py >= ch) break;
        if (A(x0 + px, y0 + py) > 200) { hits++; break; }
      }
      if (hits + dirs.length - k - 1 < need) break; // cannot reach `need` any more
    }
    if (hits >= need) hole[y * cw + x] = 1;
  }
  // grow colour inwards, layer by layer, from solid paint into the hole
  let left = 0; for (let i = 0; i < hole.length; i++) left += hole[i];
  const total = left;
  const solid = (x, y) => { const a = A(x0 + x, y0 + y); return a > 200; };
  for (let pass = 0; pass < 80 && left > 0; pass++) {
    const set = [];
    for (let y = 1; y < ch - 1; y++) for (let x = 1; x < cw - 1; x++) {
      if (!hole[y * cw + x]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        if (!i && !j) continue;
        const qx = x + i, qy = y + j;
        if (hole[qy * cw + qx] || !solid(qx, qy)) continue;
        const o = ((y0 + qy) * W + x0 + qx) * 4, wgt = i && j ? 0.7 : 1; r += d[o] * wgt; g += d[o + 1] * wgt; b += d[o + 2] * wgt; n += wgt;
      }
      if (n >= 1.5) set.push([x, y, r / n, g / n, b / n]);
    }
    if (!set.length) break;
    for (const [x, y, r, g, b] of set) {
      const o = ((y0 + y) * W + x0 + x) * 4, a0 = d[o + 3] / 255; // a seam that was half painted keeps its own paint where there was some
      d[o] = d[o] * a0 + r * (1 - a0); d[o + 1] = d[o + 1] * a0 + g * (1 - a0); d[o + 2] = d[o + 2] * a0 + b * (1 - a0); d[o + 3] = 255;
      hole[y * cw + x] = 0; left--;
    }
  }
  return total;
}

export async function run(base) {
  const L = await fetch(base + 'layout.json').then(r => r.json()), T = L.turn, [hw, hh] = T.head;
  const heads = await img(base + T.heads), W = heads.width, H = heads.height;
  const hc = canvas(W, H), hg = hc.getContext('2d', { willReadFrequently: true }); hg.drawImage(heads, 0, 0);
  const id = hg.getImageData(0, 0, W, H), report = [];
  for (let row = 0; row < H / hh; row++) for (let col = 0; col < W / hw; col++) {
    if (col === 0) continue; // the plain back of the head has no gaps worth filling and is drawn under the bust anyway
    const n = fillHoles(id, W, H, col * hw, row * hh, hw, hh);
    if (n) report.push(`r${row}c${col}:${n}`);
  }
  hg.putImageData(id, 0, 0);
  // side-view walk bodies
  const S = L.sprites.slice(0, T.sprites.length), cellW = Math.max(...S.map(s => s.w)) + 60, cellH = Math.max(...S.map(s => s.h)) + 30;
  const side = canvas(cellW * S.length, cellH), sg = side.getContext('2d'), meta = [];
  for (let r = 0; r < S.length; r++) {
    const s = S[r], back = await img(base + s.file), sp = T.sprites[r], ox = r * cellW + (cellW - s.w) / 2, oy = cellH - s.h;
    const neckY = sp.neck, cut = neckY - 6; // torso only: everything below the neck of the back view
    sg.save(); sg.beginPath(); sg.rect(ox - 10, oy + cut, s.w + 20, s.h - cut + 2); sg.clip(); sg.drawImage(back, ox, oy); sg.restore();
    const k = T.headScale / 0.78, [ax, ay] = T.anchor, nx = ox + s.w * sp.axb + 4, ny = oy + neckY + 6; // head px -> walk-sprite px (see drawFrame / drawBust)
    sg.drawImage(hc, 2 * hw, r * hh, hw, hh, nx - ax * k, ny - ay * k, hw * k, hh * k);
    meta.push({ x: r * cellW, w: cellW, h: cellH, hem: [(oy + s.h * s.hem[0]) / cellH, s.hem[1], (ox - r * cellW + s.w * s.hem[2]) / cellW] });
  }
  const out = { report, heads: hc.toDataURL('image/webp', 0.9), side: side.toDataURL('image/webp', 0.92), sideMeta: { file: 'walk-side.webp', cell: [cellW, cellH], cells: meta } };
  window.__artOut = out;
  return { report, sideMeta: out.sideMeta, headsLen: out.heads.length, sideLen: out.side.length };
}
