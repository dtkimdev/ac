// Layout options for David (2026-11-10): Studio, Media and LF share one bigger desk; Usage, Archives, Dash and Ops share one bigger
// workstation; every desk becomes a black minimalist desk in the style of the boss desk (charcoal top, lighter edge, plain legs).
// Run in a browser page by portable/art/run-layouts.js. Starts from the current room pictures in assets/ and writes, per option,
// the edited room pictures and a layout.json the viewer renders with (seats, monitors, who sits where). Not loaded by the site.
import { inpaint } from './inpaint.js';
import { DESKS, img, canvas, ctx, isWood, poly, bitmap, dilate, fill } from './room.js';

const PW = 1280, PH = 720, S = 3;
// bot numbers: 0 Usage, 1 Grok, 2 $tonks, 3 Ops, 4 Studio, 5 Media, 6 SBP, 7 LF, 8 Archives, 9 Cyber, 10 Sports, 14 Dash
const A = { label: 'Studio · Media · LF', theme: 'video', accent: '#e8806e', bots: [4, 5, 7] };
const B = { label: 'Ops · Usage · Archives · Dash', theme: 'house', accent: '#6fbfd0', bots: [3, 0, 8, 14] };
const P1 = { label: 'SB Pallet', theme: 'sbp', accent: '#a6d67e', bots: [6, 9] };
const P2 = { label: 'Numbers', theme: 'numbers', accent: '#f2b85c', bots: [2, 10] };
// slots: v / s / m = back-row desks (left, middle, right), h = right desk, n = front-right desk, boss = Grok's desk (unchanged)
export const OPTIONS = [
  { id: 1, name: 'Back bench + right desk', desks: [
    { slot: 'v+s', group: B, seats: ['v0', 'v1', 's0', 's1'] },
    { slot: 'h', group: A, seats: [['h0', 1085], ['h0', 1155], ['h0', 1225]] },
    { slot: 'm', group: P1, seats: ['m0', 'm1'] },
    { slot: 'n', group: P2, seats: ['n0', 'n1'] } ] },
  { id: 2, name: 'Front team table + back bench', desks: [
    { slot: 's+m', group: B, seats: ['s0', 's1', 'm0', 'm1'] },
    { slot: 'n3', group: A, seats: ['n0', 'n1', ['n1', 1098]] },
    { slot: 'v', group: P1, seats: ['v0', 'v1'] },
    { slot: 'h', group: P2, seats: ['h0', 'h1'] } ] },
  { id: 3, name: 'Front ops hub + back studio', desks: [
    { slot: 'v+s', group: A, seats: ['v0', 'v1', 's0'], drop: ['s1'] },
    { slot: 'n4', group: B, seats: ['n0', 'n1', ['n0', 1098], ['n1', 1205]] },
    { slot: 'm', group: P1, seats: ['m0', 'm1'] },
    { slot: 'h', group: P2, seats: ['h0', 'h1'] } ] },
  { id: 4, name: 'Both teams in the back row', desks: [
    { slot: 'v', group: A, seats: [['v0', 298], ['v0', 375], ['v0', 452]] },
    { slot: 's+m', group: B, seats: ['s0', 's1', 'm0', 'm1'] },
    { slot: 'h', group: P1, seats: ['h0', 'h1'] },
    { slot: 'n', group: P2, seats: ['n0', 'n1'] } ] },
];
const SLOT_DESK = { v: 'video', s: 'sbp', m: 'messages', h: 'housekeeping', n: 'numbers', n3: 'numbers', n4: 'numbers' };
const GAPS = { 'v+s': [494, 530, 465, 489], 's+m': [762, 787, 462, 488] }; // x0, x1, top row, bottom of the front edge (plate px)

// the boss desk's look, from the luminance of the old wood: charcoal, a touch cool
const black = (r, g, b) => { const L = (0.3 * r + 0.59 * g + 0.11 * b) / 255, v = 0.05 + L * 0.82; return [v * 246, v * 250, v * 272]; };
const woodish = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx < 12) return false; const s = (mx - mn) / mx; return isWood(r, g, b) || (r >= g && g >= b * 0.9 && s > 0.18 && mx < 200); };
const deskLike = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b) < 30 && r + g + b < 330;

export async function run(assets) {
  const L = await fetch(assets + 'layout.json').then(r => r.json());
  const P = { dusk: await img(assets + 'plate-dusk-hi.webp'), night: await img(assets + 'plate-night-hi.webp') };
  const fr = await img(assets + 'desk-fr-mask.png'), bagImg = {}; for (const m of ['bag-r', 'bag-b', 'bag-m', 'table']) bagImg[m] = await img(assets + m + '-mask.png');
  const paintBags = g => { for (const [m, im] of Object.entries(bagImg)) { const [a, b, c, d] = L.masks[m]; g.drawImage(im, a * PW, b * PH, (c - a) * PW, (d - b) * PH); } };
  const bagsD = (() => { const c = canvas(PW * S, PH * S), g = ctx(c); g.setTransform(S, 0, 0, S, 0, 0); paintBags(g); return g.getImageData(0, 0, c.width, c.height).data; })(); // bean bags and the table stand in front of the back-left chairs
  const seatById = Object.fromEntries(L.desks.flatMap(d => d.seats.map(s => [s.id, s])));
  const chairRegion = (g, s, dx = 0) => { // a chair's back, post and five-star base, plate px
    const p = s.chair.map(([x, y]) => [x * PW + dx, y * PH]), xs = p.map(q => q[0]), x0 = Math.min(...xs), x1 = Math.max(...xs), cx = (x0 + x1) / 2, hw = (x1 - x0) * 0.72, yb = Math.max(...p.map(q => q[1])), bs = s.base * PH, top = Math.max(yb, bs - (bs - yb) * 0.6);
    poly(g, p); g.fill(); g.fillRect(cx - 6, yb - 2, 12, top - yb + 2); g.fillRect(cx - hw, top, 2 * hw, bs + 4 - top);
  };
  const monQuads = [...L.desks.flatMap(d => d.monitors), ...L.boss.monitors].map(q => q.map(([x, y]) => [x * PW, y * PH]));
  const paintMonitors = g => { g.lineWidth = 10; g.lineJoin = 'round'; for (const q of monQuads) { poly(g, q); g.fill(); g.stroke(); } };
  const srcData = {}; for (const k of ['dusk', 'night']) { const c = canvas(P[k].width, P[k].height), g = ctx(c); g.drawImage(P[k], 0, 0); srcData[k] = g.getImageData(0, 0, c.width, c.height).data; } // chairs are copied from the untouched pictures
  const out = {};
  for (const opt of OPTIONS) {
    const hi = {}; for (const k of ['dusk', 'night']) { hi[k] = canvas(P[k].width, P[k].height); ctx(hi[k]).drawImage(P[k], 0, 0); }
    const cv = [hi.dusk, hi.night], full = [0, 0, PW, PH];
    // 1. every desk black: the old wood (tops, front edges, slab legs) becomes the boss desk's charcoal; things on the desks keep their colours
    { const m = canvas(PW * S, PH * S), g = ctx(m); g.setTransform(S, 0, 0, S, 0, 0); g.fillStyle = '#fff';
      for (const d of DESKS) { poly(g, d.top); g.fill(); for (const [x0, y0, x1, y1, side] of d.peds) g.fillRect(side === 'L' ? x0 - 1 : x1 - 6, y0 - 2, 7, y1 - y0 + 6); }
      g.globalCompositeOperation = 'destination-out'; for (const s of Object.values(seatById)) { poly(g, s.chair.map(([x, y]) => [x * PW, y * PH])); g.fill(); } paintMonitors(g);
      const box = [250 * S, 455 * S, PW * S, 700 * S], md = g.getImageData(...box.slice(0, 2), box[2] - box[0], box[3] - box[1]).data;
      for (const c of cv) { const cg = ctx(c), id = cg.getImageData(box[0], box[1], box[2] - box[0], box[3] - box[1]), D = id.data;
        for (let i = 0; i < D.length; i += 4) { if (md[i + 3] < 128 || !woodish(D[i], D[i + 1], D[i + 2])) continue; const [r, gg, b] = black(D[i], D[i + 1], D[i + 2]); D[i] = r; D[i + 1] = gg; D[i + 2] = b; }
        cg.putImageData(id, box[0], box[1]); } }
    // 2. chairs that move or go: filled from the desk and floor around them
    const keep = new Set(opt.desks.flatMap(d => d.seats.filter(s => typeof s === 'string')));
    const gone = Object.keys(seatById).filter(id => id !== 'b0' && !keep.has(id) && opt.desks.some(d => d.slot.split('+').some(sl => id.startsWith(sl[0]))));
    for (const id of gone) {
      const s = seatById[id], w = [Math.max(0, Math.round(s.x * PW - 80)), Math.round(s.ctop * PH - 30), Math.min(PW, Math.round(s.x * PW + 80)), Math.min(PH, Math.round(s.base * PH + 25))];
      const W = (w[2] - w[0]) * S, H = (w[3] - w[1]) * S, bags = bitmap(w, paintBags, 40), hole = dilate(bitmap(w, g => chairRegion(g, s)), W, H, 6).map((v, i) => v && !bags[i] ? 1 : 0);
      const other = bitmap(w, g => { for (const o of Object.values(seatById)) if (o !== s) chairRegion(g, o); paintMonitors(g); paintBags(g); });
      fill(cv, w, hole, hole.map((v, i) => v || other[i] ? 0 : 1));
    }
    // 3. joined desks: the top and front edge carried across the gap, the open space beneath shaded
    for (const d of opt.desks) if (GAPS[d.slot]) {
      const [x0, x1, y0, y1] = GAPS[d.slot];
      for (const c of cv) { const cg = ctx(c), id = cg.getImageData(0, 0, c.width, c.height), D = id.data, Wd = c.width;
        for (let Y = y0 * S; Y < y1 * S; Y++) { let r = 0, g = 0, b = 0, n = 0; for (let X = (x0 - 34) * S; X < (x0 - 14) * S; X++) { const o = (Y * Wd + X) * 4; if (deskLike(D[o], D[o + 1], D[o + 2])) { r += D[o]; g += D[o + 1]; b += D[o + 2]; n++; } } if (!n) continue;
          for (let X = x0 * S - 2; X < x1 * S + 2; X++) { const o = (Y * Wd + X) * 4; D[o] = r / n; D[o + 1] = g / n; D[o + 2] = b / n; } }
        for (let Y = y1 * S; Y < 545 * S; Y++) { const t = (Y / S - y1) / (545 - y1), m = 0.42 + 0.48 * t * t * (3 - 2 * t); for (let X = x0 * S; X < x1 * S; X++) { const o = (Y * Wd + X) * 4; D[o] *= m; D[o + 1] *= m; D[o + 2] *= m; } }
        cg.putImageData(id, 0, 0); }
    }
    // 4. the front-right desk made longer (3 or 4 seats): top and edge continued to the right, a leg at the new end, monitors copied along
    const nd = opt.desks.find(d => d.slot === 'n3' || d.slot === 'n4'), extraMon = [];
    let nx1 = null;
    if (nd) {
      const four = nd.slot === 'n4', x0 = 1062; nx1 = four ? 1266 : 1170;
      for (const c of cv) { const cg = ctx(c), id = cg.getImageData(0, 0, c.width, c.height), D = id.data, Wd = c.width; let prev = null;
        for (let Y = 575 * S; Y < 627 * S; Y++) { let r = 0, g = 0, b = 0, n = 0; for (let X = 1040 * S; X < 1058 * S; X++) { const o = (Y * Wd + X) * 4; if (deskLike(D[o], D[o + 1], D[o + 2])) { r += D[o]; g += D[o + 1]; b += D[o + 2]; n++; } } const col = n > 6 ? [r / n, g / n, b / n] : prev; prev = col; if (!col) continue;
          for (let X = x0 * S; X < nx1 * S; X++) { const o = (Y * Wd + X) * 4, e = X > nx1 * S - 4 ? 1.25 : 1; D[o] = col[0] * e; D[o + 1] = col[1] * e; D[o + 2] = col[2] * e; } }
        for (let Y = 627 * S; Y < 692 * S; Y++) { const t = (Y / S - 627) / 65, m = 0.42 + 0.48 * t * t * (3 - 2 * t); for (let X = x0 * S; X < nx1 * S; X++) { const o = (Y * Wd + X) * 4; D[o] *= m; D[o + 1] *= m; D[o + 2] *= m; } }
        cg.putImageData(id, 0, 0);
        cg.save(); cg.setTransform(S, 0, 0, S, 0, 0); const gr = cg.createLinearGradient(nx1 - 6, 0, nx1, 0); gr.addColorStop(0, '#24262c'); gr.addColorStop(1, '#3d4048');
        cg.fillStyle = gr; cg.fillRect(nx1 - 6, 621, 6, 70); const ft = cg.createRadialGradient(nx1 - 3, 691, 0, nx1 - 3, 691, 9); ft.addColorStop(0, 'rgba(8,4,3,.5)'); ft.addColorStop(1, 'rgba(8,4,3,0)'); cg.fillStyle = ft; cg.fillRect(nx1 - 14, 685, 22, 12); cg.restore(); }
      // monitors (with stand) copied along the desk
      const nm = L.desks.find(d => d.id === 'numbers').monitors.map(q => q.map(([x, y]) => [x * PW, y * PH]));
      const copies = four ? [[nm[0], 214], [nm[1], 214]] : [[nm[1], 107]];
      for (const [q, dx] of copies) {
        const xs = q.map(p => p[0]), ys = q.map(p => p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, qb = Math.max(...ys);
        const shape = g => { g.lineWidth = 8; g.lineJoin = 'round'; poly(g, q); g.fill(); g.stroke(); g.fillRect(cx - 6, qb - 2, 12, 12); g.beginPath(); g.ellipse(cx, qb + 13, 22, 5, 0, 0, 7); g.fill(); };
        for (const [k, c] of [['dusk', hi.dusk], ['night', hi.night]]) { const t = canvas(c.width, c.height), tg = ctx(t); tg.setTransform(S, 0, 0, S, 0, 0); tg.fillStyle = '#fff'; shape(tg); tg.globalCompositeOperation = 'source-in'; tg.setTransform(1, 0, 0, 1, 0, 0); tg.drawImage(c, 0, 0); ctx(c).drawImage(t, dx * S, 0); }
        extraMon.push(q.map(([x, y]) => [x + dx, y]));
      }
    }
    // 5. chairs pasted at new seats (only the chair's own dark pixels; anything in front of them is kept)
    const front = canvas(PW * S, PH * S); { const g = ctx(front); g.setTransform(S, 0, 0, S, 0, 0); g.fillStyle = '#fff'; poly(g, DESKS.find(d => d.id === 'numbers').top); g.fill(); g.lineWidth = 10; for (const q of [...L.desks.find(d => d.id === 'numbers').monitors.map(q => q.map(([x, y]) => [x * PW, y * PH])), ...extraMon]) { poly(g, q); g.fill(); g.stroke(); } if (nx1) g.fillRect(1058, 571, nx1 - 1058, 60); }
    const frontD = ctx(front).getImageData(0, 0, front.width, front.height).data;
    const newSeats = [];
    for (const d of opt.desks) for (const s of d.seats) if (Array.isArray(s)) {
      const src = seatById[s[0]], dx = s[1] - src.x * PW, behindFront = src.id.startsWith('h');
      const m = canvas(PW * S, PH * S), mg = ctx(m); mg.setTransform(S, 0, 0, S, 0, 0); mg.fillStyle = '#fff'; chairRegion(mg, src); const md = mg.getImageData(0, 0, m.width, m.height).data;
      for (const [k, c] of [['dusk', hi.dusk], ['night', hi.night]]) {
        const SD = srcData[k], cg = ctx(c), id = cg.getImageData(0, 0, c.width, c.height), D = id.data, Wd = c.width, ddx = Math.round(dx * S);
        for (let i = 0; i < md.length; i += 4) { if (md[i + 3] < 128 || bagsD[i + 3] > 40) continue; const r = SD[i], g = SD[i + 1], b = SD[i + 2]; if (r + g + b > 230 || isWood(r, g, b)) continue;
          const p = i / 4, X = p % Wd + ddx, Y = (p / Wd) | 0; if (X < 0 || X >= Wd) continue; const o = (Y * Wd + X) * 4; if ((behindFront && frontD[o + 3] > 128) || bagsD[o + 3] > 40) continue; D[o] = r; D[o + 1] = g; D[o + 2] = b; }
        cg.putImageData(id, 0, 0);
      }
      newSeats.push({ src, dx });
    }
    // 6. the viewer's layout: who sits where, seats, monitors; the front-right desk's cut-out grows with it
    const lay = JSON.parse(JSON.stringify(L)), byId = id => L.desks.find(d => d.id === id);
    const seatAt = (s, i, did) => { if (typeof s === 'string') return JSON.parse(JSON.stringify(seatById[s])); const src = seatById[s[0]], dx = (s[1] - src.x * PW) / PW;
      return { ...JSON.parse(JSON.stringify(src)), id: `${did}${i}`, x: src.x + dx, chair: src.chair.map(([x, y]) => [x + dx, y]), feet: [src.feet[0] + dx, src.feet[1]], nc: null }; };
    const desks = opt.desks.map(d => {
      const ids = d.slot.split('+').map(sl => SLAB(sl)), first = byId(ids[0]);
      const monitors = [...ids.flatMap(id => byId(id).monitors), ...(d.slot.startsWith('n') ? extraMon.map(q => q.map(([x, y]) => [x / PW, y / PH])) : [])];
      return { id: first.id, label: d.group.label, theme: d.group.theme, accent: d.group.accent, bots: d.group.bots, monitors, seats: d.seats.map((s, i) => seatAt(s, i, first.id[0])) };
    });
    desks.push(JSON.parse(JSON.stringify(byId('boss'))), { ...JSON.parse(JSON.stringify(byId('lounge'))), bots: [] });
    lay.desks = desks;
    if (nx1) { const oc = lay.occluders.find(o => o.mask === 'desk-fr'); oc.depth = 0.875; oc.zone[1] = nx1 / PW; lay.masks['desk-fr'] = [0.6391, 0.7069, nx1 / PW + 0.005, 0.9639]; }
    lay.note = `layout option ${opt.id}: ${opt.name} (portable/art/layouts.js)`;
    // the grown cut-out of the front-right desk (drawn over bots behind it)
    let frOut = null;
    if (nx1) { const [a, b2, c2, d2] = lay.masks['desk-fr'], mw = Math.round((c2 - a) * PW * 2), mh = Math.round((d2 - b2) * PH * 2), m = canvas(mw, mh), g = ctx(m);
      const [oa, ob, oc2, od] = L.masks['desk-fr']; g.drawImage(fr, (oa - a) * PW * 2, (ob - b2) * PH * 2, (oc2 - oa) * PW * 2, (od - ob) * PH * 2);
      g.setTransform(2, 0, 0, 2, -a * PW * 2, -b2 * PH * 2); g.fillStyle = '#fff'; g.fillRect(1058, 575, nx1 - 1058, 52); g.fillRect(nx1 - 6, 621, 6, 70); g.lineWidth = 8; for (const q of extraMon) { poly(g, q); g.fill(); g.stroke(); }
      frOut = m.toDataURL('image/png'); }
    const lo = {}; for (const k of ['dusk', 'night']) { lo[k] = canvas(2560, 1440); const g = ctx(lo[k]); g.imageSmoothingQuality = 'high'; g.drawImage(hi[k], 0, 0, 2560, 1440); }
    out[opt.id] = { name: opt.name, layout: JSON.stringify(lay), 'plate-dusk-hi.webp': hi.dusk.toDataURL('image/webp', 0.9), 'plate-night-hi.webp': hi.night.toDataURL('image/webp', 0.9), 'plate-dusk.webp': lo.dusk.toDataURL('image/webp', 0.9), 'plate-night.webp': lo.night.toDataURL('image/webp', 0.9), 'desk-fr-mask.png': frOut };
  }
  window.__layOut = out;
  return Object.keys(out);
}
function SLAB(sl) { return SLOT_DESK[sl]; }
