// Ambient layers over the painted plate (all in plate px, 1280x720).
// City FX live behind the glass: far layer (stars, planes, far airships) is drawn under a skyline mask cut from the
// plate, the near layer (window lights, bridge traffic, boats, sea glints, a near airship) under the window-frame /
// vine mask, so nothing ever paints over the frame, the room or the vines. Every glow is a pre-rendered radial
// sprite drawn with 'lighter'; colours are sampled from the plates (layout.palette) and re-tinted per time bucket;
// far things are smaller, slower and lerped toward the local haze. Objects live in fixed pools (no per-frame allocs).
import { BOAT_KINDS, buildBoat, drawLeds } from './boats.js';
const PW = 1280, PH = 720;

function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
const ledDots = new Map(); // one soft dot per LED colour
const ledDot = hex => { let c = ledDots.get(hex); if (!c) { const n = parseInt(hex.slice(1), 16); c = glowSprite([n >> 16, (n >> 8) & 255, n & 255].join(','), 16, 0.32); ledDots.set(hex, c); } return c; };
export function glowSprite(rgb, size = 64, core = 0.25) {
  const c = canvas(size, size), g = c.getContext('2d'), r = size / 2;
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(core, `rgba(${rgb},.5)`); gr.addColorStop(0.6, `rgba(${rgb},.12)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, size, size); return c;
}
// soft vertical column of light for the water (sun / moon path): strong just under the horizon, fading towards the viewer
function pathSprite(rgb) {
  const c = canvas(48, 128), g = c.getContext('2d');
  for (let x = 0; x < 48; x++) { const h = Math.exp(-(((x + 0.5) / 48 - 0.5) ** 2) / 0.03), gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, `rgba(${rgb},${h})`); gr.addColorStop(0.35, `rgba(${rgb},${0.55 * h})`); gr.addColorStop(1, `rgba(${rgb},${0.12 * h})`); g.fillStyle = gr; g.fillRect(x, 0, 1, 128); }
  return c;
}
// horizontal light trail: bright at the left end, fading to the right, soft top/bottom
function streakSprite(rgb, w = 128, h = 16) {
  const c = canvas(w, h), g = c.getContext('2d');
  g.drawImage(glowSprite(rgb, 64, 0.35), -w * 0.1, 0, w * 1.2, h);
  g.globalCompositeOperation = 'destination-in';
  const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.25, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h); return c;
}
const inPoly = (P, x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
export const px = P => P.map(([x, y]) => [x * PW, y * PH]);
export function polyPath(ctx, P) { ctx.beginPath(); P.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); }
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const smooth = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// soft painted blob: draw small then scale up (cheap blur), built once per tint
function soften(src, f = 0.5) {
  const s = canvas(src.width * f, src.height * f); s.getContext('2d').drawImage(src, 0, 0, s.width, s.height);
  const o = canvas(src.width, src.height), g = o.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(s, 0, 0, o.width, o.height); return o;
}
function tinted(src, rgb, a) { // src with its colours lerped toward rgb by a (alpha preserved)
  const c = canvas(src.width, src.height), g = c.getContext('2d');
  g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = css(rgb, a); g.fillRect(0, 0, c.width, c.height); return c;
}

// --- procedural silhouettes, shaded like the plate (gradient body + warm rim), rendered at 4x and drawn tiny ---
function planeSprite(body, rim) {
  const c = canvas(64, 24), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 6, 0, 16); gr.addColorStop(0, css(rim)); gr.addColorStop(0.35, css(body)); gr.addColorStop(1, css(mixc(body, [0, 0, 0], 0.35)));
  g.fillStyle = gr;
  g.beginPath(); g.ellipse(32, 12, 26, 3.6, 0, 0, 7); g.fill();                       // fuselage
  g.beginPath(); g.moveTo(28, 11); g.lineTo(38, 11); g.lineTo(24, 21); g.lineTo(19, 21); g.closePath(); g.fill(); // near wing
  g.globalAlpha = 0.7; g.beginPath(); g.moveTo(30, 11); g.lineTo(36, 11); g.lineTo(27, 4); g.lineTo(23, 4); g.closePath(); g.fill(); g.globalAlpha = 1;
  g.beginPath(); g.moveTo(9, 11); g.lineTo(15, 11); g.lineTo(8, 2); g.lineTo(4, 2); g.closePath(); g.fill();   // tail fin
  return soften(c, 0.5);
}
// one painted boat from the sheet (design/v9/boats), cut at its waterline, at twice its largest on-screen size
function boatCell(sheet, i, cw, ch, water, scale) {
  const c = canvas(cw * scale, water * scale), g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
  g.drawImage(sheet, i * cw, 0, cw, water, 0, 0, c.width, c.height); return c;
}
// mirrored, squashed, faded copy for the water (colour pulled toward the sea)
function reflectionOf(src, sea) {
  const c = canvas(src.width, src.height * 0.7), g = c.getContext('2d');
  g.translate(0, c.height); g.scale(1, -0.7); g.drawImage(src, 0, 0); g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = css(sea, 0.45); g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in';
  const gr = g.createLinearGradient(0, 0, 0, c.height); gr.addColorStop(0, 'rgba(0,0,0,.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
  return soften(c, 0.6);
}
function bodySprite(rgb) { // faint dark car body: soft rounded smear
  const c = canvas(32, 12), g = c.getContext('2d'); g.fillStyle = css(rgb); g.beginPath(); g.roundRect(3, 3, 26, 7, 3); g.fill(); return soften(c, 0.35);
}
function dotSprite(rgb) { const c = canvas(8, 8), g = c.getContext('2d'); g.fillStyle = css(rgb); g.beginPath(); g.arc(4, 4, 3, 0, 7); g.fill(); return soften(c, 0.5); }

// soft painted cloud: many overlapping soft puffs, lit from above (top colour) with a darker, flatter base
function cloudSprite(rnd, top, base, w = 240, h = 70) {
  const c = canvas(w, h), g = c.getContext('2d'), n = 14 + (rnd() * 8 | 0);
  const puff = (x, y, r, col, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, css(col, a)); gr.addColorStop(0.55, css(col, a * 0.55)); gr.addColorStop(1, css(col, 0)); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
  const P = []; for (let i = 0; i < n; i++) { const u = rnd(); P.push([w * (0.12 + 0.76 * u), h * (0.62 - 0.32 * Math.sin(u * Math.PI) * rnd()), h * (0.18 + 0.22 * rnd())]); }
  for (const [x, y, r] of P) puff(x, y + r * 0.25, r * 1.15, base, 0.55);
  for (const [x, y, r] of P) puff(x, y - r * 0.15, r, mixc(top, base, 0.3), 0.6);
  g.globalCompositeOperation = 'destination-in';
  const fl = g.createLinearGradient(0, 0, 0, h); fl.addColorStop(0, 'rgba(0,0,0,1)'); fl.addColorStop(0.7, 'rgba(0,0,0,.9)'); fl.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fl; g.fillRect(0, 0, w, h);
  return soften(c, 0.5);
}
// a boat's V wake as seen from above: two soft foam arms diverging from the apex (right-middle) toward the left
function vWakeSprite() {
  const c = canvas(96, 32), g = c.getContext('2d');
  g.lineCap = 'round';
  for (const [lw, a] of [[5, 0.12], [2.6, 0.35], [1.2, 0.7]]) {
    g.strokeStyle = `rgba(255,250,240,${a})`; g.lineWidth = lw; g.beginPath();
    g.moveTo(92, 16); g.quadraticCurveTo(50, 12, 4, 3); g.moveTo(92, 16); g.quadraticCurveTo(50, 20, 4, 29); g.stroke();
  }
  g.globalCompositeOperation = 'destination-in';
  const gr = g.createLinearGradient(0, 0, 96, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.6, 'rgba(0,0,0,.8)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = gr; g.fillRect(0, 0, 96, 32);
  return soften(c, 0.6);
}
// vertical shimmering light reflection on water
function reflSprite(rgb) {
  const c = canvas(16, 64), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, `rgba(${rgb},.9)`); gr.addColorStop(0.35, `rgba(${rgb},.45)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.beginPath(); g.ellipse(8, 32, 5, 32, 0, 0, 7); g.fill();
  return soften(c, 0.5);
}
// tileable ripple texture: short soft horizontal highlight dashes (lit crests)
function rippleSprite(rnd, rgb, w = 256, h = 48, n = 70) {
  const c = canvas(w, h), g = c.getContext('2d');
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h, l = 6 + rnd() * 22, a = 0.25 + rnd() * 0.55;
    const gr = g.createLinearGradient(x - l / 2, 0, x + l / 2, 0); gr.addColorStop(0, `rgba(${rgb},0)`); gr.addColorStop(0.5, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; for (const dx of [-w, 0, w]) g.fillRect(x - l / 2 + dx, y, l, 1.3);
  }
  return soften(c, 0.7);
}

// lane polyline -> 1px samples [x, y, near] for O(1) lookups
function sampleLane(pts, near) {
  const segs = []; let L = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(l); L += l; }
  const n = Math.ceil(L) + 1, a = new Float32Array(n * 3);
  let si = 0, acc = 0;
  for (let i = 0; i < n; i++) {
    const s = Math.min(i, L); while (si < segs.length - 1 && acc + segs[si] < s) { acc += segs[si]; si++; }
    const f = (s - acc) / segs[si], p0 = pts[si], p1 = pts[si + 1];
    a[i * 3] = p0[0] + (p1[0] - p0[0]) * f; a[i * 3 + 1] = p0[1] + (p1[1] - p0[1]) * f; a[i * 3 + 2] = near[0] + (near[1] - near[0]) * (s / L);
  }
  return { a, len: n - 1 };
}

export function makeFx(L, rnd, img) {
  const win = px(L.window), shafts = L.shafts.map(px);
  const WX0 = win[0][0], WY0 = win[0][1], WX1 = win[2][0], WY1 = win[2][1];
  const pal = L.palette;
  // glass panes only (between mullions, above/below the transom): every city FX is clipped to this path, then the
  // frame / vines / interior are redrawn from the plate on top (fg mask) -> nothing city-related over a mullion
  const glass = new Path2D(), TR0 = (L.transom || [0.34, 0.354])[0] * PH, TR1 = (L.transom || [0.34, 0.354])[1] * PH;
  for (const [a, b] of (L.panes || [[WX0 / PW, WX1 / PW]])) { glass.rect(a * PW, WY0, (b - a) * PW, TR0 - WY0); glass.rect(a * PW, TR1, (b - a) * PW, WY1 - TR1); }
  if (L.nearGlass) { const [a, b, y1] = L.nearGlass; glass.rect(a * PW, WY1, (b - a) * PW, y1 * PH - WY1); } // the window band behind the back-right desk: only the water draws there (water-mask.png)
  const paneCount = (L.panes || [0]).length * 2;
  const wbox = L.masks.water ? [L.masks.water[0] * PW, L.masks.water[1] * PH, L.masks.water[2] * PW, L.masks.water[3] * PH] : null;
  let waterC = null, waterG = null, waterAge = 1;
  // light paths on the water (David, 2026-11-10): under the painted sun a column of glitter that flickers and drifts on the swell, warm at
  // sunset, and under the moon a cooler one at night. Far glints are small and packed, near ones larger and spread wider (perspective).
  const lightPaths = [['sun', '255,196,118'], ['moon', '214,224,255']].filter(([k]) => L[k] && wbox).map(([k, c]) => ({ k, x: L[k][0] * PW, col: glowSprite(c, 32, 0.3), sheen: pathSprite(c),
    gl: Array.from({ length: 40 }, () => { const v = Math.pow(rnd(), 0.8); return { v, u: (rnd() + rnd() + rnd() - 1.5) / 1.5, ph: rnd() * 7, sp: 1.2 + rnd() * 3.4, w: 0.7 + rnd() * 0.9 }; }) }));
  const vwake = vWakeSprite(), wakes = []; for (let i = 0; i < 48; i++) wakes.push({ on: false, x: 0, y: 0, age: 0, dir: 1, sc: 1 });
  const neon = (L.neon || []).map(([x0, y0, x1, y1, rgb]) => ({ x0: x0 * PW, y0: y0 * PH, x1: x1 * PW, y1: y1 * PH, glow: glowSprite(rgb.join(','), 64, 0.3), v: 1, t: 8 + rnd() * 30, buzz: 0, off: 0, ph: rnd() * 7 }));
  const darkBlob = glowSprite('22,14,34', 32, 0.5);
  const clouds = []; for (let i = 0; i < 7; i++) clouds.push({ x: WX0 + rnd() * (WX1 - WX0), y: 46 + rnd() * 150, s: 0.55 + rnd() * 0.7, v: 1.2 + rnd() * 2.6, k: i % 4 });
  // light sprites (built once)
  const warm = glowSprite('255,200,130'), cool = glowSprite('150,200,255'), white = glowSprite('255,248,232'), amber = glowSprite('255,176,96');
  const red = glowSprite('255,62,48'), green = glowSprite('90,255,150'), strobe = glowSprite('255,255,255', 32, 0.15), magenta = glowSprite('255,110,200'), teal = glowSprite('110,235,230');
  const head = glowSprite('255,238,205', 32, 0.3), tail = glowSprite('255,50,40', 32, 0.3);
  const trailW = streakSprite('255,236,200'), trailR = streakSprite('255,60,45'), foam = streakSprite('255,245,235', 96, 12);
  const fly = glowSprite('220,255,150', 32);

  // ---------- fireworks over the river at night (David, 2026-11-10): now and then a short show of one to three shells. Soft glowing
  // sparks in the city's own colours (warm gold, rose, cyan, violet), drawn behind the skyline so buildings stand in front, with a faint
  // shimmer on the water. Bursts: peony (round), willow (gold, long drooping trails), ring. ----------
  const FW = { x: [470, 820], launch: 352, apex: [190, 285], every: [16, 48] };
  const fwCols = ['255,206,128', '255,140,178', '128,222,255', '196,150,255', '255,236,210'].map(c => ({ c, g: glowSprite(c, 32, 0.5), h: glowSprite(c, 32, 0.08) }));
  const fwFlash = glowSprite('255,220,190', 64, 0.05), fwShells = [], fwSparks = [];
  let fwNext = 6 + rnd() * 10, fwQueue = 0, fwQT = 0;
  function fwLaunch() {
    const kind = rnd() < 0.3 ? 'willow' : rnd() < 0.25 ? 'ring' : 'peony', col = kind === 'willow' ? fwCols[0] : fwCols[(rnd() * fwCols.length) | 0];
    const x = FW.x[0] + rnd() * (FW.x[1] - FW.x[0]), apex = FW.apex[0] + rnd() * (FW.apex[1] - FW.apex[0]), T = 1.15 + rnd() * 0.45;
    fwShells.push({ x, y: FW.launch, x0: x, vx: (rnd() - 0.5) * 6, apex, T, t: 0, kind, col, col2: fwCols[(rnd() * fwCols.length) | 0] });
  }
  function fwBurst(sh) {
    const n = Math.round((sh.kind === 'ring' ? 36 : 54) * (share < 1 ? 0.5 : 1)), sp = sh.kind === 'willow' ? 58 : 78, tilt = rnd() * 6.28;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + rnd() * 0.12, r = sh.kind === 'ring' ? 1 : 0.55 + 0.45 * Math.sqrt(rnd()), v = sp * r * (0.9 + rnd() * 0.2);
      const vx = Math.cos(a) * v, vy = sh.kind === 'ring' ? Math.sin(a) * v * (0.35 + 0.3 * Math.abs(Math.cos(tilt))) : Math.sin(a) * v;
      fwSparks.push({ x: sh.x, y: sh.y, vx, vy, t: 0, life: (sh.kind === 'willow' ? 2.8 : 1.9) + rnd() * 0.7, col: i % 5 === 0 ? sh.col2 : sh.col, willow: sh.kind === 'willow', tr: [] });
    }
    fwSparks.push({ flash: true, x: sh.x, y: sh.y, t: 0, life: 0.5 });
  }
  function drawFireworks(ctx, t, dt, env) {
    const night = Math.max(0, (env.dark - 0.55) / 0.45);
    if (night > 0 && (fwNext -= dt) <= 0) { fwNext = FW.every[0] + rnd() * (FW.every[1] - FW.every[0]); fwQueue = 1 + (rnd() * 3 | 0); fwQT = 0; }
    if (fwQueue > 0 && (fwQT -= dt) <= 0) { fwLaunch(); fwQueue--; fwQT = 0.5 + rnd() * 1.1; }
    if (!fwShells.length && !fwSparks.length) return;
    const A = Math.max(night, 0.35);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = fwShells.length - 1; i >= 0; i--) { // the rising shell: a small warm light with a short fading tail
      const s = fwShells[i]; s.t += dt; const u = Math.min(1, s.t / s.T), e = 1 - (1 - u) * (1 - u);
      s.y = FW.launch + (s.apex - FW.launch) * e; s.x = s.x0 + s.vx * s.t;
      for (let k = 0; k < 5; k++) { const back = k * 0.035, yy = FW.launch + (s.apex - FW.launch) * (1 - (1 - Math.max(0, u - back)) ** 2); ctx.globalAlpha = A * 0.55 * (1 - k / 5); ctx.drawImage(fwCols[4].g, s.x - 1.6, yy - 1.6, 3.2, 3.2); }
      if (u >= 1) { fwBurst(s); fwShells.splice(i, 1); }
    }
    for (let i = fwSparks.length - 1; i >= 0; i--) {
      const p = fwSparks[i]; p.t += dt; const q = p.t / p.life;
      if (q >= 1) { fwSparks.splice(i, 1); continue; }
      if (p.flash) { // the burst lights the sky round it, and its reflection shimmers on the river
        const a = A * 0.3 * (1 - q); ctx.globalAlpha = a; ctx.drawImage(fwFlash, p.x - 110, p.y - 110, 220, 220);
        ctx.globalAlpha = a * 0.6; ctx.drawImage(fwFlash, p.x - 18, FW.launch + 6, 36, 60 * (1 - q * 0.5)); continue; }
      const drag = Math.pow(p.willow ? 0.42 : 0.3, dt); p.vx *= drag; p.vy = p.vy * drag + (p.willow ? 22 : 15) * dt;
      p.tr.unshift(p.x, p.y); if (p.tr.length > (p.willow ? 16 : 8)) p.tr.length = p.willow ? 16 : 8;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const fade = (1 - q) * (1 - q) * (q < 0.06 ? q / 0.06 : 1), tw = q > 0.6 ? 0.6 + 0.4 * Math.sin(t * 40 + i) : 1, sz = 4.4 * (1 - q * 0.45);
      for (let k = 0; k < p.tr.length; k += 2) { ctx.globalAlpha = A * fade * 0.5 * (1 - k / p.tr.length); ctx.drawImage(p.col.g, p.tr[k] - sz * 0.35, p.tr[k + 1] - sz * 0.35, sz * 0.7, sz * 0.7); }
      ctx.globalAlpha = A * fade * 0.3; ctx.drawImage(p.col.h, p.x - sz * 1.6, p.y - sz * 1.6, sz * 3.2, sz * 3.2); // soft halo
      ctx.globalAlpha = A * fade * tw; ctx.drawImage(p.col.g, p.x - sz / 2, p.y - sz / 2, sz, sz);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  // window lights sampled from the night plate: [x, y, cool, offR, offG, offB]
  const lights = L.lights.map(([x, y, c, r, g, b]) => ({ x: x * PW, y: y * PH, c, off: `rgb(${r},${g},${b})`, ph: rnd() * 7, sp: 0.4 + rnd() * 1.4 }));
  // stars: each has its own steady brightness (magnitude) and colour, and shimmers gently through the air; they never switch off
  const starPts = (L.stars || []).map(([x, y]) => { const m = rnd(); return { x: x * PW, y: y * PH, ph: rnd() * 7, ph2: rnd() * 7, f1: 0.5 + rnd() * 1.3, f2: 1.9 + rnd() * 3.1, b: 0.3 + 0.7 * m * m, r: 1.6 + 2.2 * m, warm: rnd() < 0.3 }; });
  const starW = glowSprite('255,236,214', 16, 0.18), starC = glowSprite('214,226,255', 16, 0.18);
  const toggles = []; // pool of switching windows (fraction lit follows the darkness; fades are slow)
  for (let i = 0; i < 150; i++) { const l = lights[(rnd() * lights.length) | 0]; toggles.push({ l, on: rnd() < 0.6 ? 1 : 0, v: rnd() < 0.6 ? 1 : 0, t: 2 + rnd() * 40 }); }
  // tower LEDs (David, 2026-11-10: more life in the buildings). Plate px on the painted towers: red aviation beacons on the spire tips,
  // and light pulses that run up the LED edges painted on the towers. Stronger at night; faint by day.
  const BEACONS = [[155, 69], [270, 113], [331, 156], [410, 169], [477, 223], [868, 166], [950, 193], [1040, 129], [1140, 76]].map(([x, y], i) => ({ x, y, ph: i * 0.37 + rnd() }));
  const RUNNERS = [[241, 130, 360, '120,235,255'], [303, 136, 330, '120,235,255'], [463, 234, 360, '140,225,255'], [490, 234, 360, '140,225,255'], [853, 206, 360, '150,240,255'],
    [886, 206, 360, '255,225,140'], [952, 202, 360, '205,140,255'], [1046, 272, 350, '220,140,255'], [1107, 92, 245, '150,235,255'], [1164, 96, 245, '150,235,255']]
    .map(([x, y0, y1, rgb], i) => ({ x, y0, y1, glow: glowSprite(rgb, 32, 0.25), ph: rnd(), sp: 26 + rnd() * 30, gap: 2.5 + rnd() * 5, i }));
  const beaconSpr = glowSprite('255,60,50', 32, 0.3);
  // city lights just above the water -> shimmering vertical reflections
  const refl = wbox ? lights.filter(l => l.x > wbox[0] + 4 && l.x < wbox[2] - 4 && l.y > wbox[1] - 60 && l.y < wbox[1] + 30).slice(0, 18)
    .map(l => ({ x: l.x, y: Math.max(l.y + 5, wbox[1] + 2), c: l.c, ph: rnd() * 7, h: 10 + rnd() * 16 })) : [];
  for (const n of (L.neon || [])) { const x = (n[0] + n[2]) / 2 * PW; if (wbox && x > wbox[0] && x < wbox[2]) refl.push({ x, y: wbox[1] + 3, c: 1, ph: rnd() * 7, h: 22 }); }
  const reflW = reflSprite('255,206,140'), reflC = reflSprite('170,210,255');
  const lanes = L.lanes.map(l => ({ ...sampleLane(px(l.pts), l.near), wx0: l.water[0] * PW, wx1: l.water[1] * PW }));
  const blanes = L.boatLanes.map(b => ({ y: b.y * PH, x0: b.x[0] * PW, x1: b.x[1] * PW, near: b.near }));
  const band = [L.skyBand[0] * PH, L.skyBand[1] * PH];
  const sea = px(L.sea);
  const glints = []; for (let i = 0; i < 40; i++) glints.push({ u: rnd(), v: rnd(), ph: rnd() * 7, w: 3 + rnd() * 8 });
  const motes = []; for (let i = 0; i < 64; i++) { const s = shafts[i % shafts.length]; let x, y; do { x = 100 + rnd() * 1080; y = 60 + rnd() * 620; } while (!inPoly(s, x, y)); motes.push({ x, y, s, vx: (rnd() - 0.5) * 4, vy: -1 - rnd() * 3, ph: rnd() * 7, r: 0.6 + rnd() * 1.2 }); }
  const flies = []; for (let i = 0; i < 18; i++) flies.push({ x: rnd() < 0.5 ? 20 + rnd() * 200 : 1060 + rnd() * 200, y: 420 + rnd() * 280, ph: rnd() * 7, sp: 0.3 + rnd() * 0.5 });

  // pools
  const cars = []; for (let i = 0; i < 64; i++) cars.push({ lane: i % 2, s: 0, dir: 1, v: 0, ph: 0, on: false, col: 0, len: 1 });
  const spawnCar = (c, anywhere) => {
    const ln = lanes[c.lane]; c.dir = rnd() < 0.5 ? 1 : -1; c.v = (12 + rnd() * 20) * (rnd() < 0.15 ? 1.6 : 1) * (c.dir > 0 ? 1 : 0.92);
    c.s = anywhere ? rnd() * ln.len : (c.dir > 0 ? 0 : ln.len); c.ph = rnd() * 7; c.on = true; c.long = rnd() < 0.1; // a few buses / trucks
    c.col = (rnd() * 6) | 0; c.len = 0.8 + rnd() * 0.45;
  };
  cars.forEach(c => spawnCar(c, true));
  // boats.js: drawn in code; the painted sheet (and its cargo ship) is retired
  const BK = BOAT_KINDS, boats = []; for (let i = 0; i < 10; i++) boats.push({ on: false, lane: 0, x: 0, dir: 1, v: 0, kind: 0, ph: 0 });
  let nextKind = (rnd() * BK.length) | 0;
  const laneRoom = (l, x, self) => boats.every(o => o === self || !o.on || o.lane !== l || Math.abs(o.x - x) > 70);
  const spawnBoat = (b, anywhere) => { // the kinds take turns, so the harbour is always a mix; one freighter at a time; never on top of a boat in the lane
    b.on = false; let kind = nextKind; nextKind = (nextKind + 1) % BK.length;
    if (BK[kind].id === 'freighter' && boats.some(o => o.on && BK[o.kind].id === 'freighter')) { kind = nextKind; nextKind = (nextKind + 1) % BK.length; }
    for (let n = 0; n < 8; n++) {
      const l = (rnd() * blanes.length) | 0, bl = blanes[l], dir = rnd() < 0.5 ? 1 : -1, x = anywhere ? bl.x0 + rnd() * (bl.x1 - bl.x0) : (dir > 0 ? bl.x0 - 30 : bl.x1 + 30);
      if (!laneRoom(l, x, b)) continue;
      b.lane = l; b.dir = dir; b.x = x; b.kind = kind; b.v = BK[kind].v * (0.45 + 0.75 * bl.near) * (0.85 + rnd() * 0.3); b.ph = rnd() * 7; b.on = true; b.we = 0; return;
    }
  };
  boats.forEach((b, i) => { if (i < 7) spawnBoat(b, true); });
  const planes = []; for (let i = 0; i < 3; i++) planes.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, s: 1, ph: 0 });
  let nextPlane = 2 + rnd() * 6;
  const spawnPlane = p => {
    const dir = rnd() < 0.5 ? 1 : -1, far = rnd();
    p.s = 0.16 + (1 - far) * 0.14; p.x = dir > 0 ? WX0 - 20 : WX1 + 20; p.y = band[0] + 10 + rnd() * (band[1] - band[0] - 50) * (0.4 + 0.6 * far);
    p.vx = dir * (22 + (1 - far) * 26); p.vy = (rnd() - 0.6) * 3; p.ph = rnd() * 3; p.on = true; p.far = far;
  };
  // airships: depth 0 far (behind skyline) .. 2 near; painted ones in the plate stay where they are
  const ships = [
    { d: 0, x: 300, y: 214, s: 0.3, v: -2.6, src: 0 }, { d: 1, x: 640, y: 196, s: 0.42, v: 3.4, src: 1 },
    { d: 2, x: 220, y: 78, s: 0.78, v: -4.2, src: 1 },
  ];

  // per time-bucket tinted sprites (rebuilt by rebuild())
  let T = null;
  function rebuild(env, dk = 1) { // dk: device pixels per plate pixel, so sprites can be built at the size they are drawn
    const n = env.n, G = env.grade;
    const P = k => { // palette colour for the current blend + grade wash
      let c = mixc(pal.dusk[k], pal.night[k], n);
      c = mixc(c, G.rgb, Math.min(0.5, G.a * 0.9));
      if (G.lift) c = mixc(c, [210, 220, 235], G.lift);
      return c;
    };
    const sky = P('sky'), horizon = P('horizon'), skyTop = P('skyTop'), seaC = P('sea'), city = P('city'), bridge = P('bridge');
    const rim = mixc(horizon, [255, 214, 170], 0.4 * (1 - n));
    const shipSrc = [0, 1].map(i => {
      const d = img.ships[i], c = canvas(d.dusk.width, d.dusk.height), g = c.getContext('2d');
      g.drawImage(d.dusk, 0, 0); if (n > 0) { g.globalAlpha = n; g.drawImage(d.night, 0, 0); } return c;
    });
    const shipT = ships.map(s => {
      const haze = [0.5, 0.32, 0.14][s.d], hz = s.d === 2 ? skyTop : sky;
      const t = tinted(shipSrc[s.src], hz, haze);
      return s.d === 0 ? soften(t, 0.55) : s.d === 1 ? soften(t, 0.8) : t;
    });
    const boatT = BK.map(K => [0.42, 0.24, 0.08].map((dz, z) => { // three depths: haze toward the sea, dusk gives a warm rim, night dims the hulls
      // drawn at the largest size it appears on screen at this depth, so it stays crisp on big screens
      const W = Math.round(Math.min(720, Math.max(16, K.w * (24 + [0.3, 0.6, 1][z] * 34) * dk * 1.2)));
      const B = buildBoat(K.id, W, canvas), nightA = 0.7 * n, tint = tinted(tinted(B.sp, mixc(city, [14, 16, 40], 0.6), nightA), mixc(seaC, horizon, 0.3), dz + 0.12 * (1 - n)), sp = z < 2 ? soften(tint, 0.8) : tint; // far boats a little soft, like the painting
      return { sp, lit: B.lit, leds: B.leds, ref: reflectionOf(sp, seaC) };
    }));
    const cloudTop = mixc(mixc(horizon, [255, 236, 220], 0.5 * (1 - n)), [255, 190, 170], 0.35 * env.golden), cloudBase = mixc(sky, city, 0.25 + 0.3 * n);
    let cs = 11; const crnd = () => ((cs = Math.imul(cs, 1664525) + 1013904223 >>> 0) / 4294967296); // same shapes every bucket
    const carCols = [[150, 60, 55], [70, 80, 110], [200, 190, 175], [60, 60, 66], [150, 120, 70], [90, 120, 120]].map(c => bodySprite(mixc(mixc(c, bridge, 0.45), sky, 0.15)));
    T = {
      clouds: [0, 1, 2, 3].map(() => cloudSprite(crnd, cloudTop, cloudBase)), cloudA: 0.2 + 0.22 * (1 - n) + 0.08 * env.golden, carCols,
      ripple: rippleSprite(crnd, `${mixc(horizon, [255, 240, 225], 0.35).map(v => v | 0)}`), rippleD: rippleSprite(crnd, `${mixc(seaC, [0, 0, 10], 0.55).map(v => v | 0)}`, 256, 48, 50),
      plane: planeSprite(mixc(skyTop, city, 0.55), rim), planeNear: planeSprite(mixc(skyTop, city, 0.8), rim),
      ships: shipT, boats: boatT, body: bodySprite(mixc(bridge, [0, 0, 0], 0.3)),
      glint: glowSprite(`${horizon.map(v => Math.min(255, v + 30) | 0)}`, 32), seaCol: css(seaC),
      contrail: streakSprite(`${mixc(horizon, [255, 255, 255], 0.6).map(v => v | 0)}`, 128, 8),
    };
  }

  function navLights(ctx, x, y, w, t, ph, a, dir, size) {
    // red (port) / green (starboard) wingtips blink, white strobe double-flash, red beacon
    const blink = Math.sin(t * 3.1 + ph) > -0.2 ? 1 : 0.15, st = (t * 0.85 + ph) % 1.4, flash = st < 0.07 || (st > 0.18 && st < 0.25) ? 1 : 0;
    const r = size;
    ctx.globalAlpha = a * 0.85 * blink; ctx.drawImage(red, x - dir * w * 0.42 - r / 2, y - r / 2, r, r);
    ctx.drawImage(green, x + dir * w * 0.08 - r / 2, y + w * 0.12 - r / 2, r, r);
    if (flash) { const s = r * 2.2; ctx.globalAlpha = a; ctx.drawImage(strobe, x - s / 2, y - s / 2, s, s); }
  }

  function drawShip(ctx, s, sp, t, env, dt) {
    s.x += s.v * dt; const w = sp.width * s.s, h = sp.height * s.s;
    if (s.x > WX1 + w) s.x = WX0 - w; if (s.x < WX0 - w) s.x = WX1 + w;
    const y = s.y + Math.sin(t * 0.25 + s.x * 0.01) * 1.5;
    ctx.globalAlpha = [0.72, 0.86, 0.97][s.d];
    if (s.v > 0) { ctx.save(); ctx.translate(s.x, y); ctx.scale(-1, 1); ctx.drawImage(sp, -w / 2, -h / 2, w, h); ctx.restore(); } // painted nose points left
    else ctx.drawImage(sp, s.x - w / 2, y - h / 2, w, h);
    ctx.globalCompositeOperation = 'lighter';
    const dir = s.v > 0 ? 1 : -1, la = 0.25 + 0.75 * env.dark;
    navLights(ctx, s.x, y - h * 0.05, w, t, s.d * 2.1, la * (s.d === 0 ? 0.6 : 1), -dir, Math.max(1.8, w * 0.07));
    if (env.dark > 0.2) { // warm gondola glow
      const g = w * 0.45; ctx.globalAlpha = (env.dark - 0.2) * 0.5 * (0.85 + 0.15 * Math.sin(t * 2 + s.d));
      ctx.drawImage(amber, s.x - g / 2 + dir * w * 0.02, y + h * 0.3 - g * 0.3, g, g * 0.6);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  let fxq = 1, share = 1; // quality scale for counts; share < 1 is the lite picture: fewer city effects and no per-pane clip
  return {
    rebuild,
    setQuality(q, s = 1) { fxq = q; share = s; },
    // static bloom on every lit window, baked into the cached base (plate coords)
    bake(g, env) {
      g.globalCompositeOperation = 'lighter';
      for (const l of lights) { g.globalAlpha = 0.16 * env.lights; const r = 5; g.drawImage(l.c ? cool : warm, l.x - r, l.y - r, r * 2, r * 2); }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    },
    // far layer: under the skyline mask
    far(ctx, t, dt, env) {
      ctx.save(); if (share === 1) ctx.clip(glass);
      // drifting painted cloud layers (behind the skyline: the sky overlay is drawn after this layer)
      const ncl = Math.max(2, Math.round(clouds.length * (0.45 + 0.55 * fxq) * share));
      for (let i = 0; i < ncl; i++) {
        const c = clouds[i], sp = T.clouds[c.k], w = sp.width * c.s, h = sp.height * c.s * 0.8;
        c.x += c.v * dt * (0.6 + 0.4 * c.s); if (c.x > WX1 + w / 2) { c.x = WX0 - w / 2; c.y = 46 + rnd() * 150; }
        ctx.globalAlpha = T.cloudA * (0.55 + 0.45 * c.s) * (1 - Math.max(0, (c.y - 150) / 120));
        ctx.drawImage(sp, c.x - w / 2, c.y - h / 2, w, h);
      }
      ctx.globalCompositeOperation = 'lighter';
      if (env.stars > 0.02) {
        for (let i = 0; i < starPts.length; i += share < 1 ? 4 : 1) {
          const s = starPts[i], tw = 0.7 + 0.2 * Math.sin(t * s.f1 + s.ph) + 0.1 * Math.sin(t * s.f2 + s.ph2), r = s.r * (0.85 + 0.15 * tw);
          ctx.globalAlpha = env.stars * 0.75 * s.b * tw; ctx.drawImage(s.warm ? starW : starC, s.x - r / 2, s.y - r / 2, r, r);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      // planes
      nextPlane -= dt;
      if (nextPlane <= 0) { nextPlane = 9 + rnd() * 22; for (const p of planes) if (!p.on) { spawnPlane(p); break; } }
      for (const p of planes) {
        if (!p.on) continue;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.x < WX0 - 30 || p.x > WX1 + 30) { p.on = false; continue; }
        const sp = p.far < 0.5 ? T.planeNear : T.plane, w = sp.width * p.s, h = sp.height * p.s, dir = p.vx > 0 ? 1 : -1;
        if (env.day > 0.3) { // faint contrail in daylight
          ctx.globalAlpha = 0.18 * env.day * (1 - p.far * 0.5); const cl = 70 * p.s * 4;
          if (dir > 0) { ctx.save(); ctx.translate(p.x - w * 0.45, p.y); ctx.scale(-1, 1); ctx.drawImage(T.contrail, 0, -1.5, cl, 3); ctx.restore(); }
          else ctx.drawImage(T.contrail, p.x + w * 0.45, p.y - 1.5, cl, 3);
        }
        ctx.globalAlpha = (0.55 + 0.35 * (1 - env.dark)) * (1 - 0.35 * p.far);
        if (dir > 0) ctx.drawImage(sp, p.x - w / 2, p.y - h / 2, w, h);
        else { ctx.save(); ctx.translate(p.x, p.y); ctx.scale(-1, 1); ctx.drawImage(sp, -w / 2, -h / 2, w, h); ctx.restore(); }
        ctx.globalCompositeOperation = 'lighter';
        navLights(ctx, p.x, p.y, w, t, p.ph, (0.35 + 0.65 * env.dark) * (1 - 0.3 * p.far), dir, Math.max(2.2, w * 0.2));
        ctx.globalCompositeOperation = 'source-over';
      }
      for (let i = 0; i < 2; i++) drawShip(ctx, ships[i], T.ships[i], t, env, dt);
      drawFireworks(ctx, t, dt, env);
      ctx.restore(); ctx.globalAlpha = 1;
    },
    fireworks() { fwNext = 0; }, // test aid: start a show now (at night)
    fwCount: () => fwShells.length + fwSparks.length,
    // near layer: under the window-frame / vine mask
    near(ctx, t, dt, env) {
      ctx.save(); if (share === 1) ctx.clip(glass);
      // switching windows: a lit window goes dark (painted with its own wall colour) or lights up, with a soft fade
      const nt = Math.round(toggles.length * (0.35 + 0.65 * fxq) * share);
      for (let i = 0; i < nt; i++) {
        const o = toggles[i], l = o.l;
        if ((o.t -= dt) <= 0) { const f = 0.25 + 0.65 * env.dark; o.on = rnd() < f ? 1 : 0; o.t = o.on ? 8 + rnd() * 34 : 4 + rnd() * 20; if (o.on && rnd() < 0.5) o.l = lights[(rnd() * lights.length) | 0]; }
        o.v += ((o.on ? 1 : 0) - o.v) * Math.min(1, dt * 0.7);
        if (o.v < 0.98) { ctx.globalAlpha = (1 - o.v) * 0.8 * (0.3 + 0.7 * env.dark); ctx.fillStyle = o.l.off; ctx.fillRect(o.l.x - 1.3, o.l.y - 1.1, 2.6, 2.2); }
        if (o.v > 0.02) {
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = o.v * env.lights * (0.45 + 0.25 * Math.sin(t * o.l.sp + o.l.ph));
          const r = 2.5 + 1.8 * env.dark; ctx.drawImage(o.l.c ? cool : warm, o.l.x - r, o.l.y - r, r * 2, r * 2); ctx.globalCompositeOperation = 'source-over';
        }
      }
      // neon signs: buzzing flicker, now and then a stutter or a few seconds dark
      for (let i = 0; i < neon.length; i++) {
        const o = neon[i];
        if ((o.t -= dt) <= 0) { if (o.buzz > 0 || o.off > 0) { o.buzz = 0; o.off = 0; o.t = 15 + rnd() * 45; } else if (rnd() < 0.35) { o.off = 2 + rnd() * 6; o.t = o.off; } else { o.buzz = 1; o.t = 0.8 + rnd() * 1.4; } }
        const target = o.off > 0 ? 0 : o.buzz ? (Math.sin(t * 47 + o.ph) * Math.sin(t * 13.3) > 0.1 ? 1 : 0.1) : 0.92 + 0.08 * Math.sin(t * 31 + o.ph);
        o.v += (target - o.v) * Math.min(1, dt * (o.buzz ? 30 : 6));
        const cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2, w = (o.x1 - o.x0), h = (o.y1 - o.y0), a = 0.25 + 0.75 * env.dark;
        if (o.v < 0.9 && env.dark > 0.2) { ctx.globalAlpha = (1 - o.v) * 0.75 * env.dark; ctx.drawImage(darkBlob, cx - w * 0.8, cy - h * 0.75, w * 1.6, h * 1.5); }
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = o.v * a * 0.5; ctx.drawImage(o.glow, cx - w * 1.4, cy - h * 1.1, w * 2.8, h * 2.2);
        ctx.globalAlpha = o.v * a * 0.35; ctx.drawImage(o.glow, cx - w * 0.6, cy - h * 0.6, w * 1.2, h * 1.2);
        ctx.globalCompositeOperation = 'source-over';
      }
      // tower LEDs: beacons blink in a slow, uneven rhythm; pulses climb the lit tower edges
      ctx.globalCompositeOperation = 'lighter';
      const la = 0.25 + 0.75 * env.dark;
      for (const b of BEACONS) {
        const p = (t * 0.55 + b.ph) % 1, on = p < 0.12 ? Math.sin(p / 0.12 * Math.PI) : 0;
        if (on <= 0) continue;
        ctx.globalAlpha = on * la; ctx.drawImage(beaconSpr, b.x - 4, b.y - 4, 8, 8); ctx.globalAlpha = on * la * 0.35; ctx.drawImage(beaconSpr, b.x - 9, b.y - 9, 18, 18);
      }
      if (share >= 1 || env.dark > 0.3) for (const r of RUNNERS) { // a bright head with a fading tail, then a pause
        const len = r.y1 - r.y0, cyc = len / r.sp + r.gap, q = ((t + r.ph * cyc) % cyc) / (len / r.sp);
        if (q > 1) continue;
        const y = r.y1 - q * len;
        for (let k = 0; k < 6; k++) { const yy = y + k * 5; if (yy > r.y1) break; ctx.globalAlpha = la * (1 - k / 6) * (k ? 0.45 : 0.95); const s = k ? 5 : 7; ctx.drawImage(r.glow, r.x - s / 2, yy - s / 2, s, s); }
      }
      ctx.globalCompositeOperation = 'source-over';
      this.water(ctx, t, dt, env);
      // sea glints (sun / city light on the swell)
      const [a0, b0, b1, a1] = sea;
      ctx.globalCompositeOperation = 'lighter';
      const ng = Math.round(glints.length * (0.4 + 0.6 * fxq) * share);
      for (let i = 0; i < ng; i++) {
        const g = glints[i], y = a0[1] + (a1[1] - a0[1]) * g.v, xl = a0[0] + (a1[0] - a0[0]) * g.v, xr = b0[0] + (b1[0] - b0[0]) * g.v;
        const x = xl + (xr - xl) * ((g.u + t * 0.006) % 1), w = g.w * (0.6 + g.v), s = Math.sin(t * 1.8 + g.ph);
        if (s <= 0) continue;
        ctx.globalAlpha = (0.12 + 0.22 * env.dark + 0.12 * env.golden) * s;
        ctx.drawImage(T.glint, x - w, y - 1.2, w * 2, 2.4);
      }
      ctx.globalCompositeOperation = 'source-over';
      // boats: slow, with reflection, wake and (at dusk/night) cabin lights
      const nb = Math.max(2, Math.round(boats.length * env.boats * (0.5 + 0.5 * fxq)));
      let live = 0; for (let i = 0; i < boats.length; i++) if (boats[i].on) live++;
      for (let i = 0; i < boats.length; i++) {
        const b = boats[i];
        if (!b.on) { if (live < nb && rnd() < dt * 0.14) { spawnBoat(b, false); if (b.on) live++; } continue; }
        const bl = blanes[b.lane]; b.x += b.dir * b.v * dt;
        if (b.x < bl.x0 - 44 || b.x > bl.x1 + 44) { b.on = false; continue; }
        const K = BK[b.kind], set = T.boats[b.kind][bl.near < 0.3 ? 0 : bl.near < 0.6 ? 1 : 2], sp = set.sp;
        const w = K.w * (24 + bl.near * 34), sc = w / sp.width, h = sp.height * sc, y = bl.y + Math.sin(t * 1.3 + b.ph) * 0.3, rock = Math.sin(t * 1.1 + b.ph * 2) * 0.012 * (K.id === 'freighter' ? 0.3 : 1);
        const edge = Math.min(1, (b.x - bl.x0 + 44) / 40, (bl.x1 + 44 - b.x) / 40);
        b.w = w; b.h = h; b.y = y; b.sc = sc; b.edge = edge; b.set = set;
        // V wake: emit a growing, fading V at the bow; fast boats throw more of it (drawn in the water layer)
        if ((b.we = (b.we || 0) - dt) <= 0) { b.we = K.wake > 1 ? 0.14 : 0.3; for (const k of wakes) if (!k.on) { k.on = true; k.x = b.x + b.dir * w * 0.36; k.y = y + 0.3; k.age = 0; k.dir = b.dir; k.sc = w / 96 / K.w * 0.9; k.v = b.v; k.s = K.wake; break; } }
        ctx.save(); ctx.translate(b.x, y); ctx.rotate(rock * b.dir); ctx.scale(b.dir, 1); ctx.globalAlpha = edge; ctx.drawImage(sp, -w / 2, -h, w, h);
        if (env.dark > 0.1) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, env.dark * 1.15) * edge; ctx.drawImage(set.lit, -w / 2, -h, w, h); }
        if (set.leds.length && share >= 1) { ctx.globalCompositeOperation = 'lighter'; drawLeds(ctx, set.leds, w, h, t, b.ph, edge * (0.35 + 0.65 * env.dark), ledDot); } // LED runs: every frame on the full picture, not in lite
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
        if (env.dark > 0.15) { // soft warm pool: a glow on the hull + its long shimmer on the water
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = env.dark * 0.22 * edge; ctx.drawImage(amber, b.x - w * 0.46, y - h * 0.62, w * 0.92, h * 0.62);
          ctx.globalAlpha = env.dark * 0.16 * edge * (0.8 + 0.2 * Math.sin(t * 3 + b.ph)); ctx.drawImage(amber, b.x - w * 0.34, y + 0.3, w * 0.68, h * 0.8);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      // bridge traffic: paired head/tail lights with streak trails over a faint dark body; reflections over the water
      const nc = Math.round(cars.length * (0.45 + 0.55 * fxq) * share);
      const hl = env.headlights;
      for (let i = 0; i < nc; i++) {
        const c = cars[i], ln = lanes[c.lane];
        c.s += c.dir * c.v * dt;
        if (c.s < 0 || c.s > ln.len) { spawnCar(c, false); continue; }
        const j = (c.s | 0) * 3, x = ln.a[j], near = ln.a[j + 2], y = ln.a[j + 1] + (c.dir > 0 ? 1.1 : -0.8) * near - 0.6; // one lane per direction
        const fade = Math.min(1, c.s / 18, (ln.len - c.s) / 18), len = (3.2 + 3.8 * near) * (c.long ? 1.8 : c.len), sz = 1.6 + 2.6 * near;
        const front = x + c.dir * len / 2, back = x - c.dir * len / 2;
        ctx.globalAlpha = (0.3 + 0.55 * (1 - env.dark)) * fade * (0.45 + 0.55 * near); // soft painted body (colour by day)
        ctx.drawImage(env.dark > 0.6 ? T.body : T.carCols[c.col], x - len / 2 - 0.5, y - sz * 0.6, len + 1, sz * 0.8);
        ctx.globalCompositeOperation = 'lighter';
        // taillight trail (behind) and headlight beam (ahead)
        const tl = (6 + 12 * near) * (c.v / 25);
        ctx.globalAlpha = 0.5 * hl * hl * fade;
        if (share < 1) { /* lite: lights only, no trails */ }
        else if (c.dir > 0) { ctx.save(); ctx.translate(back, y); ctx.scale(-1, 1); ctx.drawImage(trailR, 0, -sz * 0.35, tl, sz * 0.7); ctx.restore(); ctx.drawImage(trailW, front, y - sz * 0.4, tl * 0.7, sz * 0.8); }
        else { ctx.drawImage(trailR, back, y - sz * 0.35, tl, sz * 0.7); ctx.save(); ctx.translate(front, y); ctx.scale(-1, 1); ctx.drawImage(trailW, 0, -sz * 0.4, tl * 0.7, sz * 0.8); ctx.restore(); }
        ctx.globalAlpha = (0.55 + 0.45 * hl) * fade;
        ctx.drawImage(head, front - sz, y - sz, sz * 2, sz * 2);
        ctx.globalAlpha = (0.4 + 0.5 * hl) * fade;
        ctx.drawImage(tail, back - sz * 0.8, y - sz * 0.8, sz * 1.6, sz * 1.6);
        if (x > ln.wx0 && x < ln.wx1 && hl > 0.3) { // smeared reflection on the water below the deck
          ctx.globalAlpha = 0.16 * hl * fade * (0.75 + 0.25 * Math.sin(t * 4 + c.ph));
          ctx.drawImage(head, front - sz * 0.5, y + 8, sz, 14 + 10 * near);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      drawShip(ctx, ships[2], T.ships[2], t, env, dt);
      ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    },
    // water layer (offscreen, device px): waves, light reflections, boat reflections, V wakes -> masked by the
    // painted water (water-mask.png) so nothing lands on bridges, piers or land
    water(ctx, t, dt, env) {
      if (!wbox || !img.water) return;
      // kept light (David, 2026-11-11: it lagged): the layer is drawn at about plate resolution, not screen resolution, and refreshed at
      // most 30 times a second; in between the last one is reused. Soft water hides the lower resolution.
      const [x0, y0, x1, y1] = wbox, k = Math.min(1.25, ctx.getTransform().a), W = Math.ceil((x1 - x0) * k) + 1, H = Math.ceil((y1 - y0) * k) + 1;
      if (!waterC || waterC.width !== W || waterC.height !== H) { waterC = canvas(W, H); waterG = waterC.getContext('2d'); waterAge = 1; }
      waterAge += dt; for (const wk of wakes) if (wk.on) { wk.age += dt; if (wk.age > 3.2) wk.on = false; }
      if (waterAge < 1 / 30) { ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(waterC, x0, y0, W / k, H / k); return; }
      waterAge = 0;
      const g = waterG; g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, W, H);
      g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
      // ripples: 3 perspective bands (far = small and slow), two textures scrolling against each other
      const bw = x1 - x0, bands = 3;
      for (let i = 0; i < bands; i++) {
        const ya = y0 + (y1 - y0) * i / bands, hb = (y1 - y0) / bands + 1, sc = 0.35 + 0.3 * i, tw = 256 * sc;
        for (const [tex, dir, a, op] of [[T.rippleD, -1, 0.35, 'source-over'], [T.ripple, 1, (0.22 + 0.3 * env.dark + 0.2 * env.golden), 'lighter']]) {
          g.globalCompositeOperation = op; g.globalAlpha = a * (0.6 + 0.4 * i / bands);
          const off = ((t * (3 + 4 * i) * dir) % tw + tw) % tw;
          for (let x = x0 - off; x < x1; x += tw) g.drawImage(tex, x, ya, tw, hb);
        }
      }
      // the sun's and the moon's paths: a soft column, then glitter that comes and goes on the swell
      g.globalCompositeOperation = 'lighter';
      for (const P of lightPaths) {
        const A = P.k === 'sun' ? (1 - env.n) * (0.55 + 0.45 * env.golden) * 1.25 : env.n * 0.85; if (A < 0.02) continue;
        const top = y0 + 1, H = y1 - top, sway = Math.sin(t * 0.21) * 1.5;
        g.globalAlpha = A * (P.k === 'sun' ? 0.32 : 0.22) * (0.9 + 0.1 * Math.sin(t * 0.7)); g.drawImage(P.sheen, P.x - 18 + sway, top, 36, H);
        const ng = Math.round(P.gl.length * (0.45 + 0.55 * fxq));
        for (let i = 0; i < ng; i++) {
          const q = P.gl[i], f = Math.sin(t * q.sp + q.ph); if (f <= 0.2) continue;
          const y = top + H * q.v, half = 2.5 + 26 * q.v, x = P.x + sway + q.u * half + Math.sin(t * 0.5 + q.ph) * (0.5 + 2 * q.v), w = (1.6 + 6 * q.v) * q.w, h = 0.7 + 1.3 * q.v;
          g.globalAlpha = A * f * f * f * (0.95 - 0.35 * Math.abs(q.u)); g.drawImage(P.col, x - w, y - h, w * 2, h * 2);
        }
      }
      // shimmering vertical reflections of the city lights (stronger at night)
      g.globalCompositeOperation = 'lighter';
      const nr = Math.round(refl.length * (0.5 + 0.5 * fxq) * share);
      for (let i = 0; i < nr; i++) {
        const r = refl[i], sh = Math.sin(t * 2.3 + r.ph), wob = Math.sin(t * 3.1 + r.ph * 2) * 0.8;
        g.globalAlpha = (0.12 + 0.55 * env.lights) * (0.65 + 0.35 * sh);
        g.drawImage(r.c ? reflC : reflW, r.x - 1.6 + wob, r.y, 3.2, r.h * (1 + 0.15 * sh));
      }
      // boat reflections (three shimmering slices) under each boat
      g.globalCompositeOperation = 'source-over';
      for (const b of boats) {
        if (!b.on || !b.set) continue;
        const set = b.set, w = b.w, h = b.h, sc = b.sc, rw = set.ref.width, rh = set.ref.height, rs = rh / 3;
        g.globalAlpha = 0.8 * b.edge;
        for (let j = 0; j < 3; j++) {
          const off = Math.sin(t * 2.4 + b.ph + j * 1.7) * (0.3 + j * 0.25) * sc * 4;
          if (b.dir > 0) g.drawImage(set.ref, 0, j * rs, rw, rs, b.x - w / 2 + off, b.y - h * 0.12 + j * rs * sc, w, rs * sc);
          else { g.save(); g.translate(b.x + off, 0); g.scale(-1, 1); g.drawImage(set.ref, 0, j * rs, rw, rs, -w / 2, b.y - h * 0.12 + j * rs * sc, w, rs * sc); g.restore(); }
        }
      }
      // V wakes: grow, spread and fade behind the boat
      g.globalCompositeOperation = 'lighter';
      for (const wk of wakes) {
        if (!wk.on) continue;
        const L2 = (14 + wk.age * 22) * wk.sc * 4 * 0.25, Hh = (3 + wk.age * 9) * wk.sc * 4 * 0.25;
        g.globalAlpha = (1 - wk.age / 3.2) * (0.3 - 0.12 * env.n) * Math.min(1.7, 0.45 + (wk.s ?? 1));
        if (wk.dir > 0) g.drawImage(vwake, wk.x - L2, wk.y - Hh / 2, L2, Hh);
        else { g.save(); g.translate(wk.x, 0); g.scale(-1, 1); g.drawImage(vwake, -L2, wk.y - Hh / 2, L2, Hh); g.restore(); }
      }
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'destination-in';
      g.drawImage(img.water, 0, 0, W, H);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(waterC, x0, y0, W / k, H / k);
    },
    glassPanes: () => paneCount,
    lamps(ctx, t, env, lampTint) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < L.lamps.length; i++) {
        const l = L.lamps[i], r = l.r * PW * (1 + 0.06 * Math.sin(t * 1.1 + i * 1.7));
        ctx.globalAlpha = (0.22 + 0.1 * Math.sin(t * 0.9 + i)) * (0.5 + 0.65 * env.dark);
        ctx.drawImage(lampTint(l) || warm, l.x * PW - r, l.y * PH - r, r * 2, r * 2);
      }
      ctx.restore();
    },
    motes(ctx, t, dt, env) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const a = 0.18 + 0.3 * (1 - env.n), nm = Math.round(motes.length * (0.4 + 0.6 * fxq));
      for (let i = 0; i < nm; i++) {
        const m = motes[i];
        m.x += (m.vx + Math.sin(t * 0.5 + m.ph) * 2) * dt; m.y += m.vy * dt;
        if (m.y < 50 || !inPoly(m.s, m.x, m.y)) { m.y = 640 + rnd() * 40; m.x = m.s[3][0] + rnd() * (m.s[2][0] - m.s[3][0]); }
        ctx.globalAlpha = a * (0.4 + 0.6 * Math.sin(t * 0.8 + m.ph) ** 2); const r = m.r * 3;
        ctx.drawImage(warm, m.x - r, m.y - r, r * 2, r * 2);
      }
      if (env.n > 0.3) for (const f of flies) {
        const x = f.x + Math.sin(t * f.sp + f.ph) * 22, y = f.y + Math.cos(t * f.sp * 1.3 + f.ph) * 14;
        ctx.globalAlpha = (env.n - 0.3) * Math.max(0, Math.sin(t * 1.7 + f.ph)); ctx.drawImage(fly, x - 5, y - 5, 10, 10);
      }
      ctx.restore();
    },
    counts: () => ({ glassPanes: paneCount, water: !!(wbox && img.water), neon: neon.length, clouds: clouds.length, cars: cars.length, boats: boats.filter(b => b.on).length, boatKinds: [...new Set(boats.filter(b => b.on).map(b => BK[b.kind].id))], boatTypes: BK.length, planes: planes.filter(p => p.on).length, ships: ships.length + 2 }),
    warm, amber, teal, magenta,
  };
}
