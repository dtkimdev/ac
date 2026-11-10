// One-off repair of the turn heads (assets/turn-heads.webp), run in a browser page by portable/art/run-heads-trim.js. Not loaded by the site.
// David, 2026-11-10: in the back three-quarter and side poses (columns 1 and 2) long hair hung far below the jaw, over the neck and round to
// the chin. Here the hair ends just under the jawline near the face and a little lower at the back of the head, with a soft fade.
// Cell coordinates (220 x 232 per head, face to the right): the neck joins at about y 168 (layout turn.anchor).
export async function run(assets) {
  const L = await fetch(assets + 'layout.json').then(r => r.json()), T = L.turn, [cw, ch] = T.head;
  const im = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = assets + T.heads + '?r=' + Math.random(); });
  const k = im.width / (cw * T.yaws), c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
  const id = g.getImageData(0, 0, c.width, c.height), D = id.data, W = c.width, ay = T.anchor[1];
  for (const col of [1, 2]) for (let row = 0; row < im.height / (ch * k); row++) {
    const x0 = Math.round(col * cw * k), y0 = Math.round(row * ch * k);
    for (let y = 0; y < ch * k; y++) for (let x = 0; x < cw * k; x++) {
      const cx = x / k, cy = y / k;
      const start = ay - 4 + Math.max(0, 92 - cx) * (col === 1 ? 0.4 : 0.25), end = start + 12; // lower at the back of the head (left), just under the jaw near the face
      if (cy <= start) continue;
      const o = ((y0 + y) * W + x0 + x) * 4, f = cy >= end ? 0 : 1 - (cy - start) / (end - start);
      D[o + 3] = Math.round(D[o + 3] * f * f * (3 - 2 * f));
    }
  }
  g.putImageData(id, 0, 0);
  window.__headsOut = c.toDataURL('image/webp', 0.95);
  return [c.width, c.height];
}
