// Painted 2.5D office. Canvas 2D over pre-rendered plates (assets/plate-*.webp; v8 art via bin/preprocess_v8.py):
// cached plate+grade, city FX behind the glass, themed monitor screens, seated chibi workers (one per live bot) who
// turn in their chairs through painted in-between poses and walk over to another desk when the interactions feed says so,
// cosmetic idle life (lounge visits, neighbour chats, fidgets, a moody corgi), harbour boats, lamps, dust.
// Data/card come from ui.js; the music toggle from /audio.js. Read-only viewer.
import { bkkHour, envAt, skyAt } from './time.js';
import { renderUpdated, renderRoster, showCard, hideCard, cardOpen } from './ui.js';
import { SW, SH, WW, WH, THEME_KINDS, drawScreen, drawWall } from './screens.js';
import { makeFx, glowSprite, px, polyPath } from './fx.js';
import { VIEW, BOTS, behaviorOf, LOITER, CHAT, DOG_MOODS, DOG, WALK, PROPS, QUALITY, LITE, REFRESH } from './config.js';

const STATIC = !!window.AC_STATIC; // GitHub Pages build (bin/pages-build.sh): relative URLs, state.json polled instead of /api/*
const PW = 1280, PH = 720, A = (STATIC ? '' : '/') + 'office2d/assets/', V = '?v=29'; // V: busts the 1 h asset cache when the art set changes
const q = new URLSearchParams(location.search);
const DEMO = q.get('demo') === '1', EMBED = q.get('embed') === '1', NOTAGS = q.get('notags') === '1'; // notags: screenshot aid only
if (EMBED) document.body.classList.add('embed');
let seedN = (Date.now() & 0xffff) | 1;
const rnd = () => ((seedN = Math.imul(seedN, 1664525) + 1013904223 >>> 0) / 4294967296);

const cv = document.getElementById('office'), ctx = cv.getContext('2d', { alpha: false });
const tagsEl = document.getElementById('tags'), fpsEl = document.getElementById('fps');
const D = window.__office2d = { workers: [], ready: false, frames: 0, fps: 0, loaded: false, walking: 0, interactions: 0, quality: QUALITY[0], turned: 0, corgi: null, corgi2: null, wall: {}, labels: [], plates: 'lo', glassClip: null, ambient: { away: [], lounge: [] }, assets: {} };

const LIVE = [], IMGS = []; // for __office2d.memory(): every canvas made here (weakly held) and every picture loaded
const img = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => { IMGS.push(i); ok(i); }; i.onerror = () => no(new Error('asset ' + src)); i.src = A + src + V; });
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); if (typeof WeakRef === 'function') LIVE.push(new WeakRef(c)); return c; };
const free = c => { if (c) { c.width = 0; c.height = 0; } }; // hand a canvas's pixels back now: weak TVs collect garbage late, so replaced canvases piled up
D.memory = () => { // rough estimate of picture memory, in MB: canvases still alive plus decoded pictures
  const MB = b => +(b / 1048576).toFixed(1); let cb = cv.width * cv.height * 4, n = 1, ib = 0; const bigC = [], bigI = [];
  for (let i = LIVE.length - 1; i >= 0; i--) { const c = LIVE[i].deref(); if (!c || !c.width) { LIVE.splice(i, 1); continue; } const b = c.width * c.height * 4; cb += b; n++; if (b > 2e6) bigC.push(`${c.width}x${c.height}`); }
  for (const i of IMGS) { const b = i.naturalWidth * i.naturalHeight * 4; ib += b; if (b > 4e6) bigI.push(`${i.src.split('/').pop().split('?')[0]} ${MB(b)}`); }
  return { totalMB: MB(cb + ib), canvasesMB: MB(cb), canvases: n, bigCanvases: bigC, picturesMB: MB(ib), bigPictures: bigI };
};
const SANS = getComputedStyle(document.documentElement).getPropertyValue('--sans').trim() || 'system-ui, sans-serif';

// ---------- assets ----------
// ATL: pose-sheet scale (0.5 once lite shrinks them)
let L, plates, sprites, fronts, sideImg = null, dogImg, dogImg2, legImg, fx, bossMon, bossClip, nav, turnB, turnH, ATL = 1, nochair, dashImg = {}, masks = {}, seats = [], monitors = [], occluders = [], zones = [], standing = [], walkH = [], lng;
const redGlow = glowSprite('255,70,50'), screenGlow = glowSprite('150,190,255');
async function load() {
  L = await fetch(A + 'layout.json' + V, { credentials: 'same-origin' }).then(r => r.json());
  const ships = L.airships.map(a => a.file), occ = L.occluders.map(o => o.mask);
  const [dusk, night, fgM, skyM, waterM, dogI, dog2I, legsI, tbI, thI, ncD, ncN, lapI, mugI, boatI, boatL, ...rest] = await Promise.all([img('plate-dusk.webp'), img('plate-night.webp'), img('fg-mask.png'), img('sky-mask.png'),
    img('water-mask.png'), img(L.corgi.file), img(L.corgi2), img(L.legs.file), img(L.turn.bodies), img(L.turn.heads), img('nochair-dusk.webp'), img('nochair-night.webp'), img(L.dash.laptop), img(L.dash.mug), img(L.boats.file), img(L.boats.lit),
    ...occ.map(m => img(m + '-mask.png')), ...ships.flatMap(f => [img(f + '-dusk.png'), img(f + '-night.png')]), ...L.sprites.map(s => img(s.file)), ...L.sprites.map(s => img(s.front))]);
  plates = { dusk, night }; masks = { fg: fgM, sky: skyM };
  for (const n of FRONT()) { masks[n] = await img(n + '-mask.png'); over[n] = null; } // front plants: cut from the room picture, drawn over everyone
  occ.forEach((m, i) => { masks[m] = rest[i]; }); const r2 = rest.slice(occ.length);
  const shipImgs = ships.map((_, i) => ({ dusk: r2[i * 2], night: r2[i * 2 + 1] }));
  sprites = r2.slice(ships.length * 2, ships.length * 2 + L.sprites.length);
  fronts = r2.slice(ships.length * 2 + L.sprites.length);
  dogImg = dogI; dogImg2 = dog2I; legImg = legsI; turnB = tbI; turnH = thI; nochair = { dusk: ncD, night: ncN }; dashImg = { laptop: lapI, mug: mugI };
  D.assets = { legs: legsI.naturalWidth, corgi: dogI.naturalWidth, corgi2: dog2I.naturalWidth, turnBodies: tbI.naturalWidth, turnHeads: thI.naturalWidth, nochair: ncD.naturalWidth, dashLaptop: lapI.naturalWidth, dashMug: mugI.naturalWidth, dashFront: fronts[fronts.length - 1].naturalWidth, boats: boatI.naturalWidth, boatsLit: boatL.naturalWidth };
  sideImg = L.walkSide ? await img(L.walkSide.file).catch(() => null) : null; // side-view walk bodies; without them sideways walkers keep the front/back body
  buildErasers();
  initLounge();
  fx = makeFx(L, rnd, { ships: shipImgs, water: waterM, boats: boatI, boatsLit: boatL });
  D.city = () => fx.counts(); D.fireworks = () => fx.fireworks(); D.fw = () => fx.fwCount();
  D.glassClip = { panes: fx.glassPanes(), masks: ['fg', 'sky'], water: !!waterM };
  bossMon = L.boss.monitors.map(px); bossClip = L.boss.clip.map((c, i) => c ? px(c) : bossMon[i]);
  walkH = L.walk.h.map(([f, h]) => [f * PH, h * PH]);
  nav = L.nav.nodes.map(([x, y]) => [x * PW, y * PH]);
  occluders = L.occluders.map(o => ({ mask: o.mask, depth: o.depth * PH, patch: null }));
  zones = L.occluders.filter(o => o.zone).map(o => ({ x0: o.zone[0] * PW, x1: o.zone[1] * PW, y: o.zone[2] * PH, key: o.key * PH }));
  const T = L.turn, F0 = T.frames[0];
  for (const d of L.desks) {
    d.seats.forEach((s, i) => {
      const x = s.x * PW, ctop = s.ctop * PH, base = s.base * PH, H = base - ctop, ts = H / T.chairH; // ts: plate px per turn-atlas px, from the chair in the plate
      seats.push({ ...s, x, ctop, base, ts, hsc: ts * 0.78, neckY: base - (T.floor - F0.neck) * ts, top: ctop - H * 0.5, h: H * 1.05, clip: ctop + H * 0.56, chair: px(s.chair), feet: [s.feet[0] * PW, s.feet[1] * PH], desk: d, idx: i, bot: null, self: false, nc: L.nochair[s.nc], ncP: null });
    });
    const kinds = THEME_KINDS[d.theme] || THEME_KINDS.default, ow = { boss: 0, numbers: 1 }[d.id], cuts = d.cuts || [];
    d.monitors.forEach((m, i) => {
      const Q = px(m), c = mk(SW, SH);
      monitors.push({ q: Q, desk: d, idx: i, kind: kinds[i % kinds.length], c, g: c.getContext('2d'), cut: cuts[i] ? px(cuts[i]) : null, wc: null, wg: null, mask: null, bx: 0, by: 0, depth: ow != null ? occluders[ow].depth + 1 : Math.max(...Q.map(p => p[1])), cx: (Q[0][0] + Q[2][0]) / 2, cy: (Q[0][1] + Q[2][1]) / 2, w: Q[1][0] - Q[0][0] });
    });
  }
  // right wall: slim monitors, behind everything that can walk (they hang far above the floor)
  for (const w of L.wall) { const Q = px(w.q), c = mk(WW, WH); monitors.push({ q: Q, desk: { id: 'wall', accent: '#7a78ff' }, idx: monitors.length, wall: w.id, c, g: c.getContext('2d'), cut: null, wc: null, wg: null, mask: null, bx: 0, by: 0, depth: 1, cx: (Q[0][0] + Q[2][0]) / 2, cy: (Q[0][1] + Q[2][1]) / 2, w: Q[1][0] - Q[0][0] }); }
  // Dashboards (bot14) has no desk: her seat is the blue bean bag
  const home = lng.bags.find(b => b.id === 'bag-b'), ld = L.desks.find(d => d.id === 'lounge');
  seats.push({ x: home.sit[0], top: home.sit[1] - 90, h: 100, clip: home.sit[1], base: home.sit[1], feet: home.visit, node: home.node, chair: null, desk: ld, idx: 0, bot: null, bag: home, self: true });
  initDog();
  // bots without a desk live in the kitchen: each gets a home spot to idle at between short trips (coffee, bean bags, the dogs)
  standing = KITCHEN_HOMES.map((p, i) => kitchenHome(p, i));
  D.screens = monitors.map(m => m.kind);
  propImgs = await Promise.all(PROPS.map(p => img(p.file)));
  buildStatic();
  D.loaded = true; maybeHi(); if (qual.lite) shrinkForLite();
  document.getElementById('loading').remove();
}

// ---------- static sprites built once: floor shadow, paper note ----------
let shadowSpr, noteSpr;
function buildStatic() {
  shadowSpr = mk(64, 24); { const g = shadowSpr.getContext('2d'), gr = g.createRadialGradient(32, 12, 0, 32, 12, 32); gr.addColorStop(0, 'rgba(14,6,10,.6)'); gr.addColorStop(0.5, 'rgba(14,6,10,.3)'); gr.addColorStop(1, 'rgba(14,6,10,0)'); g.setTransform(1, 0, 0, 0.375, 0, 7.5); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
  noteSpr = mk(28, 34); { const g = noteSpr.getContext('2d'), gr = g.createLinearGradient(0, 0, 28, 34); gr.addColorStop(0, '#fffaf0'); gr.addColorStop(1, '#e9dcc8'); g.fillStyle = gr; g.beginPath(); g.roundRect(3, 3, 22, 28, 2); g.fill(); g.fillStyle = 'rgba(90,70,100,.45)'; for (let i = 0; i < 4; i++) g.fillRect(7, 9 + i * 5.5, 14 - (i === 3 ? 6 : 0), 1.6); }
}

// ---------- viewport + cached plate (re-composited only when the time-of-day bucket, size or quality changes) ----------
for (const kv of (q.get('lite') || '').split(',')) { const [a, b] = kv.split(':'); if (a in LITE && b !== undefined && !isNaN(+b)) LITE[a] = +b; } // tuning aid, e.g. ?q=4&lite=cityEvery:2,maxWidth:960
try { localStorage.removeItem('ac_lite'); localStorage.removeItem('ac_lite2'); } catch {} // old flags: fast PCs had been stuck in lite by them (David, 2026-11-11)
const LITE_KEY = 'ac_lite3', remembered = () => { try { return localStorage.getItem(LITE_KEY) === '1'; } catch { return false; } }, remember = on => { try { if (on) localStorage.setItem(LITE_KEY, '1'); else localStorage.removeItem(LITE_KEY); } catch {} };
if (q.has('q') && +q.get('q') !== 4) remember(false);
const TV = LITE.tvBrowsers.test(navigator.userAgent);
const startLevel = q.has('q') ? +q.get('q') || 0 : TV || remembered() ? 4 : 0;
let dpr = 1, k = 1, offX = 0, offY = 0, base = mk(1, 1), baseKey = '', qual = QUALITY[startLevel] || QUALITY[0], fullPaint = true, propImgs = [];
// plate sets: 2560x1440 for normal canvases, 3840x2160 (loaded lazily) once the canvas itself is bigger than that
let hiLoading = false;
function wantHi() { return cv.width > 2600 || cv.height > 1460; }
function maybeHi() {
  if (!plates || plates.hi || hiLoading || !wantHi()) return;
  hiLoading = true;
  Promise.all([img('plate-dusk-hi.webp'), img('plate-night-hi.webp')]).then(([d, n]) => { plates.hi = { dusk: d, night: n }; baseKey = ''; }).catch(() => {});
}
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (qual.lite) qual.scale = Math.min(1, LITE.maxWidth / (innerWidth * dpr));
  document.body.classList.toggle('lite', !!qual.lite);
  const s = qual.lite ? dpr * qual.scale : Math.min(dpr * qual.scale, VIEW.maxWidth / innerWidth);
  cv.width = Math.round(innerWidth * s); cv.height = Math.round(innerHeight * s);
  k = Math.max(cv.width / PW, cv.height / PH); offX = (cv.width - PW * k) / 2; offY = (cv.height - PH * k) / 2;
  baseKey = ''; layoutDirty = true; labelFont = 0; maybeHi();
}
addEventListener('resize', resize);
let env = envAt(12);
// overlays cut from the base: window frame + vines (fg), skyline (sky); patches for chairs/occluders. The foreground bamboo is gone from
// the room pictures (David, 2026-11-10; portable/art/room.js), so there are no front plant overlays any more.
const over = { fg: null, sky: null };
const FRONT = () => Object.keys(L.masks).filter(n => n.startsWith('plant-')); // e.g. plant-l: the small bamboo in the lounge corner (layout v11)
function cutMasked(name) {
  const [x0, y0, x1, y1] = L.masks[name], X = offX + x0 * PW * k, Y = offY + y0 * PH * k, W = (x1 - x0) * PW * k, H = (y1 - y0) * PH * k;
  const bx = Math.floor(X), by = Math.floor(Y), c = mk(W + 2, H + 2), g = c.getContext('2d');
  g.drawImage(base, -bx, -by);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(masks[name], X - bx, Y - by, W, H);
  return { c, x: bx, y: by };
}
function cutPoly(poly) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const bx = Math.floor(offX + x0 * k) - 2, by = Math.floor(offY + y0 * k) - 2, c = mk((x1 - x0) * k + 5, (y1 - y0) * k + 5), g = c.getContext('2d');
  g.setTransform(k, 0, 0, k, offX - bx, offY - by);
  polyPath(g, poly); g.clip(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(base, -bx, -by);
  return { c, x: bx, y: by };
}
// painted-out details of the room pictures: each is covered by a soft-edged copy of the picture taken dx plate px to the side.
// The A-shaped frame at the foot of the mountain (a Ferris wheel stand without its wheel) is gone (David, 2026-11-10).
const ERASE = [{ at: [682, 313, 36, 38], dx: -40 }];
let erasers = { dusk: [], night: [] };
function buildErasers() {
  for (const key of ['dusk', 'night']) erasers[key] = ERASE.map(({ at: [x, y, w, h], dx }) => {
    const im = plates[key], s = im.width / PW, c = mk(Math.round(w * s), Math.round(h * s)), g = c.getContext('2d');
    g.drawImage(im, (x + dx) * s, y * s, w * s, h * s, 0, 0, c.width, c.height);
    const m = g.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.3, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.52);
    m.addColorStop(0, '#000'); m.addColorStop(1, 'rgba(0,0,0,0)'); g.globalCompositeOperation = 'destination-in'; g.fillStyle = m; g.fillRect(0, 0, c.width, c.height);
    return { c, x, y, w, h };
  });
}
function paintBase(g, n, G, nc) { // the plate + grade + bloom pipeline; nc = also lay the chair-less patches in, so they get the very same grade
  const PS = plates.hi && wantHi() ? plates.hi : plates; D.plates = PS === plates ? 'lo' : 'hi';
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.fillStyle = '#1c1622'; g.fillRect(0, 0, cv.width, cv.height);
  g.setTransform(k, 0, 0, k, offX, offY); g.imageSmoothingQuality = 'high';
  const layer = (P2, im) => { g.drawImage(P2, 0, 0, PW, PH); const er = erasers[P2 === PS.night ? 'night' : 'dusk']; for (const e of er) g.drawImage(e.c, e.x, e.y, e.w, e.h); if (nc) for (const s of seats) if (s.nc) { const [ax, ay, w, h, x, y] = s.nc; g.drawImage(im, ax, ay, w, h, x, y, w / 2, h / 2); } };
  if (n < 1) layer(PS.dusk, nochair.dusk);
  if (n > 0) { g.globalAlpha = n; layer(PS.night, nochair.night); g.globalAlpha = 1; }
  // grade: warm/cool wash; midday cools and lifts the golden-hour plate
  g.globalCompositeOperation = 'soft-light'; g.fillStyle = `rgba(${G.rgb},${Math.min(1, G.a * 2.5)})`; g.fillRect(0, 0, PW, PH);
  if (G.lift > 0) { g.globalCompositeOperation = 'screen'; g.fillStyle = `rgba(150,170,205,${G.lift})`; g.fillRect(0, 0, PW, PH); }
  if (env.golden > 0) { g.globalCompositeOperation = 'overlay'; g.fillStyle = `rgba(255,170,110,${0.10 * env.golden})`; g.fillRect(0, 0, PW, PH); }
  // light shafts from the window (stronger at dusk), static window-light bloom
  g.globalCompositeOperation = 'lighter';
  for (const s of L.shafts.map(px)) {
    const gr = g.createLinearGradient(0, 40, 0, 700); gr.addColorStop(0, `rgba(255,200,150,${0.07 * (1 - n) * (0.6 + 0.4 * env.golden)})`); gr.addColorStop(1, 'rgba(255,180,120,0)');
    g.fillStyle = gr; polyPath(g, s); g.fill();
  }
  fx.bake(g, env);
  g.globalCompositeOperation = 'source-over';
  const vg = g.createRadialGradient(640, 380, 300, 640, 380, 820); vg.addColorStop(0, 'rgba(10,6,20,0)'); vg.addColorStop(1, `rgba(10,6,20,${0.28 + 0.12 * n})`);
  g.fillStyle = vg; g.fillRect(0, 0, PW, PH);
  g.setTransform(1, 0, 0, 1, 0, 0);
}
function rebuildBase(h) {
  const sky = skyAt(h), key = `${qual.lite ? sky.key.split('.')[0] : sky.key}|${cv.width}x${cv.height}|${plates.hi ? 1 : 0}`; // lite skips the 30 s repaints of a sky fade
  if (key === baseKey) return; baseKey = key; fullPaint = true;
  env = sky.env; D.sky = { bucket: sky.bucket, f: sky.f, n: env.n }; const n = env.n, G = env.grade;
  if (base.width !== cv.width || base.height !== cv.height) { free(base); base = mk(cv.width, cv.height); }
  for (const kk in over) free(over[kk]?.c); // the patches below are all cut again: release the old pixels now
  for (const o of occluders) free(o.patch?.c);
  for (const s of seats) { free(s.patch?.c); free(s.ncP?.c); }
  paintBase(base.getContext('2d'), n, G, false);
  if (qual.lite) { const g = base.getContext('2d'); g.setTransform(k, 0, 0, k, offX, offY); fx.lamps(g, 0, env, lampTint); g.setTransform(1, 0, 0, 1, 0, 0); } // lite: lamp glow is baked in once
  fx.rebuild(env, k);
  for (const kk in over) over[kk] = cutMasked(kk);
  for (const o of occluders) o.patch = cutMasked(o.mask);
  for (const s of seats) if (s.chair) s.patch = cutPoly(s.chair);
  // chair-less floor under a turning bot: the same pipeline over the erased patches, cut with the patch's own soft alpha
  const nb = mk(cv.width, cv.height); paintBase(nb.getContext('2d'), n, G, true);
  for (const s of seats) if (s.nc) {
    const [ax, ay, w, h2, x, y] = s.nc, X = offX + x * k, Y = offY + y * k, W = w / 2 * k, H = h2 / 2 * k, bx = Math.floor(X), by = Math.floor(Y), c = mk(W + 2, H + 2), g = c.getContext('2d');
    g.drawImage(nb, -bx, -by); g.globalCompositeOperation = 'destination-in'; g.drawImage(nochair.dusk, ax, ay, w, h2, X - bx, Y - by, W, H);
    s.ncP = { c, x: bx, y: by };
  }
  free(nb); // a full-screen scratch canvas
  buildMonitors();
}
const blit = p => { if (p) ctx.drawImage(p.c, p.x, p.y); }; // a seat without a chair-less patch (a new layout) simply skips it

// ---------- data: seats, sprites, workers ----------
let S = null;
const QUIET = new Set(); // bot ids allowed to wander (see assign)
const workers = new Map(), wl = []; // bot id -> worker; wl = the same workers as an array (no per-frame iterators)
function demoize(bots) {
  return bots.map(b => b.num === 1 ? { ...b, status: 'working', task: 'routing a request' } : b.num === 3 ? { ...b, status: 'working', task: 'triaging inbox' } : b.num === 9 ? { ...b, status: 'error', error: 'heartbeat stale' } : b.num === 2 ? { ...b, status: 'working', task: 'market-desk brief' } : b.num === 14 ? { ...b, status: 'working', task: 'charting usage' } : b); // preview only
}
function assign(bots) {
  const live = bots.filter(b => b.status !== 'moved_out' && !HIDDEN_IDS.has(b.id)).sort((a, b) => (a.num ?? 999) - (b.num ?? 999));
  // who may take breaks: the quieter part of the office by usage (WALK.quietShare; David, 2026-11-10: the bottom 50%, never the busy ones)
  const byUse = [...live].sort((a, b) => (a.usage_pct ?? 0) - (b.usage_pct ?? 0)); QUIET.clear(); for (const b of byUse.slice(0, Math.ceil(byUse.length * WALK.quietShare))) QUIET.add(b.id); D.quiet = byUse.filter(b => QUIET.has(b.id)).map(b => b.name);
  for (const s of [...seats, ...standing]) s.bot = null;
  const deskOf = want => L.desks.find(d => d.id === want || d.label.toLowerCase() === want.toLowerCase());
  const homeless = [];
  for (const b of live) {
    const want = b.desk != null && String(b.desk).trim() ? deskOf(String(b.desk).trim()) : L.desks.find(d => d.bots.includes(b.num));
    const mine = want && seats.find(s => s.desk === want && s.idx === want.bots.indexOf(b.num));
    const free = mine && !mine.bot ? mine : want && seats.find(s => s.desk === want && !s.bot);
    if (free) free.bot = b; else homeless.push(b);
  }
  const reserved = s => s.desk.bots[s.idx] != null && live.some(x => x.num === s.desk.bots[s.idx]);
  for (const b of homeless) {
    // no desk of its own: a kitchen home (spare desk seats stay free for bots that are assigned to them)
    const s = standing.find(s => !s.bot);
    if (s) s.bot = b; else { const i = standing.length, [x, y, node] = KITCHEN_HOMES[i % KITCHEN_HOMES.length], s2 = kitchenHome([x + 28 * Math.floor(i / KITCHEN_HOMES.length), y, node], i); s2.bot = b; standing.push(s2); }
  }
  const pins = BOTS.spriteByNum, used = new Set(Object.values(pins)), spriteOf = new Map(); // pinned rows are kept for good, whatever the seed says
  const nBase = L.baseSprites; // Dashboards has her own art (the last sprite), everyone else draws from the base set
  for (const b of live) { if (isDash(b)) { spriteOf.set(b.id, nBase); continue; } if (pins[b.num] != null) { spriteOf.set(b.id, pins[b.num]); continue; } let i = (b.sprite_seed >>> 0) % nBase, n = 0; while (used.has(i) && n++ < nBase) i = (i + 1) % nBase; used.add(i); spriteOf.set(b.id, i); }
  const all = [...seats, ...standing].filter(s => s.bot);
  for (const [id, w] of workers) if (!all.some(s => s.bot.id === id)) { w.tag.remove(); workers.delete(id); }
  for (const s of all) {
    let w = workers.get(s.bot.id);
    if (!w) { w = newWorker(s.bot); workers.set(s.bot.id, w); }
    if (w.seat && w.seat !== s) w.walk = null;
    w.bot = s.bot; w.seat = s; w.sprite = spriteOf.get(s.bot.id); w.label = labelText(s.bot);
    w.b = s.roam ? { ...behaviorOf(s.bot.num), ...LOITER } : behaviorOf(s.bot.num);
    if (s.roam && w.tripT > w.b.tripEvery[1]) w.tripT = span(...w.b.tripEvery); // the desk bots' first-break delay is minutes; kitchen bots get going in seconds
  }
  wl.length = 0; for (const w of workers.values()) wl.push(w);
  labelMax = maxUsage();
  buildItems(); refreshOccupants();
}
function newWorker(b) {
  const el = document.createElement('div'); el.className = 'w';
  el.innerHTML = '<div class="tag"><span></span></div>';
  el.querySelector('.tag').onclick = ev => { ev.stopPropagation(); showCard(S, b.id, [ev.clientX, ev.clientY], deskInfo); };
  tagsEl.appendChild(el);
  return { bot: b, b: behaviorOf(b.num), tag: el, box: [0, 0, 0, 0], ph: rnd() * 7, tilt: 0, tiltT: 3 + rnd() * 10, tiltDir: 1, tiltA: 9, look: 0, walk: null, key: 0, lx: 0, ly: 0, lw: 0, lh: 0, bh: 0, hx: 0, hy: 0,
    pose: { b: 0, hb: 0, from: 0, to: 0, t: 0, dur: 0, p: 0, dir: 1, a: 0, hold: 0, after: null, done: null, chat: 0, chatTo: 0, nod: 0 }, turnT: DEMO ? 1 + rnd() * 4.5 : 25 + rnd() * 125, label: labelText(b),
    fid: null, fidT: 4 + rnd() * 18, fr: 0, fx: 0, fsy: 1, tripT: isDash(b) ? 20 + rnd() * 45 : 100 + rnd() * 500, sayNow: null, sayOff: 0, chatting: null };
}
// ---------- last-active suffix on the name tags: `Grok · 1d`, `2h`, `15m`, `now`, `—` (from bot.last_active; whole numbers only) ----------
// display-only: bots hidden from the office by id (bot itself untouched). bot11 Notes removed from the office v8.
const HIDDEN_IDS = new Set(BOTS.hiddenIds);
const isDash = b => String(b.id).startsWith(BOTS.loungeBotIdPrefix); // bot14 Dashboards lives in the lounge
// kitchen homes for bots without a desk: [x, floor y, nearest walking node], in plate px. A sixth bot reuses the first spot, shifted aside.
const KITCHEN_HOMES = [[196, 600, 7], [290, 698, 12], [204, 656, 8], [170, 694, 11], [232, 578, 0]];
function kitchenHome([x, y, node], i) {
  const hu = hAt(y);
  return { x, top: y - hu * 1.45, h: hu * 1.45, clip: y, base: y, feet: [x, y], node, chair: null, desk: { id: 'kitchen', label: 'Kitchen', accent: '#e6b07a', seats: [] }, idx: i, roam: true, bot: null };
}
// counters refresh once an hour (zero tokens: the server only stats files, and caches those reads for the hour too); labelClock holds the time of the last refresh
const LABEL_EVERY = 3600; let labelClock = Date.now();
// tag time colour: 0 d = green -> yellow/orange -> red at 7+ d; unknown = neutral grey
function ageColor(ms) {
  if (!ms) return 'rgba(200,196,206,.78)';
  const d = Math.min(7, Math.max(0, (labelClock - ms) / 864e5)), h = 120 * (1 - d / 7);
  return `hsl(${h.toFixed(0)},80%,${(62 - 4 * Math.sin(Math.PI * d / 7)).toFixed(0)}%)`;
}
function agoStr(ms) {
  if (!ms) return '—';
  const s = Math.max(0, (labelClock - ms) / 1000);
  // whole minutes / hours / days only (David: no decimals on time counters)
  return s < 60 ? 'now' : s < 3600 ? Math.round(s / 60) + 'm' : s < 86400 ? Math.max(1, Math.round(s / 3600)) + 'h' : Math.max(1, Math.round(s / 86400)) + 'd';
}
const pctStr = v => v == null ? '' : ` · ${Math.round(v)}%`;
const labelText = b => `${b.name} · ${agoStr(b.last_active)}${pctStr(b.usage_pct)}`;
function refreshLabels() {
  labelClock = Date.now(); labelMax = maxUsage();
  let changed = false;
  for (let i = 0; i < wl.length; i++) { const w = wl[i], t = labelText(w.bot); if (t !== w.label) { w.label = t; changed = true; } }
  D.labels = wl.map(w => w.label);
  if (changed) layoutDirty = true;
}

// ---------- turning in the chair: the painted poses back -> 3/4 back -> side -> 3/4 front -> front, composited per bot (turn atlases,
// bin/preprocess_v8.py). pose.b is the continuous body angle (0..4), the head leads it, the swivel chair in the frames turns with the body and
// the plate chair is hidden by a chair-less patch while pose.a > 0. Eased; never a squash or a flip of the seated body. ----------
const ease = p => p < 0.5 ? 4 * p * p * p : 1 - (2 - 2 * p) ** 3 / 2;
const easeOut = p => 1 - (1 - p) ** 2;
const TURN_T = 0.85;
const turnedNow = () => { let n = 0; for (let i = 0; i < wl.length; i++) if (wl[i].pose.a > 0 && !wl[i].walk && !wl[i].chatting) n++; return n; };
function turnTo(w, to, dur, dir, done) { // ease the body from where it is to `to`; dir = which way round (the art faces right, -1 mirrors the whole pose)
  const P = w.pose; if (dir && P.b < 0.05) P.dir = dir;
  P.from = P.b; P.to = to; P.t = 0; P.dur = dur * Math.max(0.55, Math.min(1, Math.abs(to - P.b) / 3)); P.p = 0; P.done = done || null; P.hold = 0; P.after = null;
  if (Math.abs(to - P.b) < 1e-3) { P.dur = 0; if (done) done(); }
}
function startTurn(w, hold, dir, force) { // force: a dog is being fed, the two-at-once limit does not apply
  if (!w || w.walk || w.seat.bag || w.seat.stand || w.seat.roam || w.chatting || w.pose.dur > 0 || w.pose.b > 0 || (!force && turnedNow() >= 2) || !L.turn.sprites[w.sprite]) return false; // no turn art (Dashboards): no idle turns
  const P = w.pose;
  turnTo(w, rnd() < 0.65 ? 4 : 3, TURN_T, dir || (rnd() < 0.5 ? 1 : -1), () => { P.hold = hold ?? 2 + rnd() * 3; P.after = () => turnTo(w, 0, TURN_T + 0.1 * rnd()); });
  return true;
}
function stepPose(w, dt) {
  const P = w.pose, g = w.walk, s = w.seat;
  if (s.bag || s.stand || s.roam) return;
  if (!g && P.b === 0 && P.dur === 0 && !w.chatting && (w.turnT -= dt) <= 0) { w.turnT = DEMO ? 6 + rnd() * 9 : span(...w.b.turnEvery); if (!busy(w)) startTurn(w); }
  const manual = g && (g.phase === 'stand' || g.phase === 'sit');
  if (!manual) {
    const on = P.dur > 0 || P.b > 1e-3 || P.hold > 0 || !!w.chatting || (g && (g.phase === 'rise' || g.phase === 'settle'));
    P.a = Math.max(0, Math.min(1, P.a + (on ? 1 : -1) * dt / 0.14));
    if (P.a === 0 && g && g.phase !== 'rise' && g.phase !== 'settle') { P.b = P.hb = 0; }
  }
  if (P.dur > 0 && P.a >= 1) {
    P.t += dt; P.p = Math.min(1, P.t / P.dur); P.b = P.from + (P.to - P.from) * ease(P.p);
    P.hb = P.from + (P.to - P.from) * ease(Math.min(1, P.p * 1.25)); // the head starts first and arrives first
    if (P.p >= 1) { P.dur = 0; P.b = P.hb = P.to; P.p = 0; const f = P.done; P.done = null; if (f) f(); }
  }
  if (P.hold > 0 && (P.hold -= dt) <= 0) { P.hold = 0; const f = P.after; P.after = null; if (f) f(); }
  P.chat += (P.chatTo - P.chat) * Math.min(1, dt * 6);
  s.self = P.a > 0;
}
D.turn = i => startTurn(typeof i === 'number' ? wl[i] : findWorker(i), 4);

// ---------- neighbour chat: two idle desk neighbours face each other for a moment. Cosmetic: never written to the interactions feed ----------
let nchat = null, nchatT = DEMO ? 2 : 60 + rnd() * 140;
const freeSeated = w => w && !w.walk && !busy(w) && !w.chatting && w.pose.b === 0 && w.pose.dur === 0 && !w.seat.bag && !w.seat.stand && !w.seat.roam;
function startChat(a, b) {
  if (nchat || !freeSeated(a) || !freeSeated(b)) return false;
  const C = nchat = { a, b, phase: 'in', t: 0, n: 0, talk: rnd() < 0.5 ? 0 : 1, dur: 6 + rnd() * 6, next: 0 };
  a.chatting = b.chatting = C; a.fid = b.fid = null;
  turnTo(a, 2, TURN_T + 0.05, 1, () => { C.n++; }); setTimeout0(0.12 + rnd() * 0.2, () => { if (nchat === C) turnTo(b, 2, TURN_T, -1, () => { C.n++; }); });
  return true;
}
const delayed = []; function setTimeout0(s, f) { delayed.push([s, f]); } // on the frame clock, so a hidden tab just pauses it
function endChat(C) {
  if (C !== nchat) return; nchat = null;
  for (const w of [C.a, C.b]) { w.chatting = null; w.sayNow = null; w.pose.chatTo = 0; w.pose.nod = 0; if (!w.walk) turnTo(w, 0, TURN_T + rnd() * 0.15); } layoutDirty = true;
}
function stepChat(dt) {
  for (let i = delayed.length - 1; i >= 0; i--) if ((delayed[i][0] -= dt) <= 0) { const f = delayed[i][1]; delayed.splice(i, 1); f(); }
  if (!nchat) {
    if ((nchatT -= dt) <= 0) {
      nchatT = DEMO ? 10 : span(...CHAT.every);
      const ds = L.desks.map(d => seats.filter(s => s.desk === d && s.bot)).filter(p => p.length === 2 && !p[0].bag);
      for (let n = 0; n < 6; n++) { const p = ds[(rnd() * ds.length) | 0], a = p && workers.get(p[0].bot.id), b = p && workers.get(p[1].bot.id); if (a && b && startChat(a, b)) break; }
    }
    return;
  }
  const C = nchat, { a, b } = C;
  if (a.walk || b.walk || busy(a) || busy(b)) return endChat(C);
  for (const w of [a, b]) if (w.sayNow && (w.sayOff -= dt) <= 0) { w.sayNow = null; layoutDirty = true; }
  if (C.n < 2) return;
  C.t += dt; C.next -= dt;
  if (C.t > C.dur) return endChat(C);
  if (C.next <= 0) { // alternate: the speaker turns a bit to the viewer and gestures, the other one listens and nods
    C.talk ^= 1; C.next = 1.8 + rnd() * 1.4; const sp = C.talk ? b : a, li = C.talk ? a : b;
    sp.pose.chatTo = 1; li.pose.chatTo = 0; sp.pose.nod = 0; li.pose.nod = 1;
    sp.sayNow = pick(sp.b.deskChat); sp.sayOff = 1.5; layoutDirty = true;
  }
}
D.neighbourChat = i => { const w = typeof i === 'number' ? wl[i] : findWorker(i), p = w && seats.filter(s => s.desk === w.seat.desk && s.bot); return !!(p && p.length === 2 && startChat(workers.get(p[0].bot.id), workers.get(p[1].bot.id))); };
// debug aids for portable/shot.js: a bot's on-screen box in CSS pixels (with padding), and who is walking
D.boxOf = (name, pad = 30) => { const w = findWorker(name); if (!w) return null; const b = w.box, c = 1 / (dpr * qual.scale); return [(offX + b[0] * k) * c - pad, (offY + b[1] * k) * c - pad, (b[2] - b[0]) * k * c + pad * 2, (b[3] - b[1]) * k * c + pad * 2].map(Math.round); };
D.order = () => items.map(it => `${it.k.toFixed(1)} ${['monitor', 'occluder', 'chair', 'bot', 'overlay', 'dog', 'bossfx', 'lounge', 'steam', 'prop'][it.t]} ${it.t === 3 ? it.r.bot.name : it.t === 0 ? it.r.desk.id + it.r.idx : it.t === 1 ? it.r.mask : it.t === 2 ? it.r.desk.id + it.r.idx : ''}`); // painter's order, back to front
D.navShow = () => { // draws the walking graph (yellow), behind-desk zones (red) and seats (blue) over the canvas, until reload
  const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:5;pointer-events:none';
  const g = c.getContext('2d'); g.setTransform(k, 0, 0, k, offX, offY); g.lineWidth = 2 / k; g.font = `${11 / k * 1.4}px sans-serif`;
  g.strokeStyle = '#ff0'; for (const [a, b] of L.nav.edges) { g.beginPath(); g.moveTo(...nav[a]); g.lineTo(...nav[b]); g.stroke(); }
  g.fillStyle = '#ff0'; nav.forEach(([x, y], i) => { g.fillRect(x - 3, y - 3, 6, 6); g.fillText(i, x + 4, y - 4); });
  g.strokeStyle = '#f33'; for (const z of zones) { g.strokeRect(z.x0, 0, z.x1 - z.x0, z.y); }
  g.fillStyle = '#4af'; for (const s of seats) if (s.feet) g.fillRect(s.feet[0] - 4, s.feet[1] - 4, 8, 8);
  document.body.appendChild(c); return nav.length;
};
D.rush = () => { for (const w of wl) w.tripT = 0; }; // test aid: every idle bot wants a break at once (the walking cap still holds)
D.walkers = () => wl.filter(w => w.walk && (w.walk.phase === 'go' || w.walk.phase === 'back')).map(w => w.bot.name);
D.walkInfo = () => items.filter(it => it.t === 3 && it.r.walk).map(it => ({ name: it.r.bot.name, phase: it.r.walk.phase, x: Math.round(it.r.walk.x), y: Math.round(it.r.walk.y), key: +it.k.toFixed(1) }));

function deskInfo(id) { const w = workers.get(id); return w && { label: w.seat.desk.label, accent: w.seat.desk.accent }; }

let layoutDirty = true;
function apply(s) {
  if (q.get('fakeages') && s.bots) s.bots = s.bots.map((b, i) => ({ ...b, last_active: Date.now() - (i % 8) * 864e5 - 5e5 })); // screenshot aid only: a spread of ages
  if (DEMO && s.bots) {
    s.bots = demoize(s.bots);
    s.kpi = { ...(s.kpi || {}), working: s.bots.filter(b => b.status === 'working').length, errors: s.bots.filter(b => b.status === 'error').map(b => b.name) };
  }
  S = { ...(S || {}), ...s }; if (s.now) renderUpdated(s.now);
  if (D.loaded) { assign(S.bots || []); if (!D.labels.length) refreshLabels(); }
  renderRoster({ ...S, bots: (S.bots || []).filter(b => !HIDDEN_IDS.has(b.id)) }, id => deskInfo(id)?.label);
  if (cardOpen()) showCard(S, cardOpen(), null, deskInfo);
  D.workers = [...workers.values()].map(w => ({ id: w.bot.id, name: w.bot.name, num: w.bot.num, desk: w.seat.desk.label, seat: w.seat.idx, sprite: L.sprites[w.sprite].file, status: w.bot.status }));
  if (!DEMO && Array.isArray(s.interactions)) feed(s.interactions);
  layoutDirty = true;
}
const POLL_MS = 60e3;
const stateUrl = () => STATIC ? `./state.json?t=${Date.now()}` : '/api/state'; // cache-buster: Pages/CDN caches files for 10 min
// Pages refresh button, a doorbell through GitHub (no Funnel, nothing on the shared computer open to the internet): the button starts the
// do-nothing .github/workflows/refresh.yml with a key that can only start workflows; the publisher checks for new runs every minute and
// publishes at once (bin/pages-pull.sh refresh_requested). The button then waits for /published.json to change and reloads the data.
function setupPagesRefresh() {
  const btn = document.getElementById('refresh'), toast = document.getElementById('refresh-toast');
  if (!btn) return;
  const KEY = 'ac_refresh_key';
  const qrt = new URLSearchParams(location.search).get('rt');
  if (qrt) { try { localStorage.setItem(KEY, qrt); } catch {} history.replaceState(null, '', location.pathname + location.search.replace(/([?&])rt=[^&]*/g, '$1').replace(/[?&]$/, '').replace(/[?&]{2,}/g, '?') + location.hash); }
  const tip = (msg, ms = 4200) => { if (!toast) return; toast.textContent = msg; toast.classList.add('show'); clearTimeout(tip._t); tip._t = setTimeout(() => toast.classList.remove('show'), ms); };
  const token = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
  const ask = () => {
    const v = prompt('Paste the Agent City refresh key (a GitHub key that can only start the refresh). Saved on this device only:', token());
    if (v == null) return null;
    const s = v.trim();
    try { if (s) localStorage.setItem(KEY, s); else localStorage.removeItem(KEY); } catch {}
    return s;
  };
  const builtAt = () => fetch(`./published.json?t=${Date.now()}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => j && j.built).catch(() => null);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  btn.onclick = async () => {
    let tok = token();
    if (!tok) tok = ask();
    if (!tok) return tip('No key — cancelled');
    btn.disabled = true; btn.classList.add('spin');
    try {
      const before = await builtAt();
      const r = await fetch(`https://api.github.com/repos/${REFRESH.repo}/actions/workflows/${REFRESH.workflow}/dispatches`, {
        method: 'POST', headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: REFRESH.ref }) });
      if (r.status === 401 || r.status === 403) { tip('Key refused — press ↻ to paste it again', 6000); try { localStorage.removeItem(KEY); } catch {} return; }
      if (r.status !== 204) { tip(`Refresh failed (${r.status})`); return; }
      tip('Refresh requested… usually live in 1–2 minutes', 9000);
      for (const end = Date.now() + REFRESH.waitSeconds * 1000; Date.now() < end;) {
        await wait(15000);
        const now = await builtAt();
        if (now && now !== before) { poll(); tip('Updated ✓'); return; }
      }
      tip('Still waiting: the publishing computer may be asleep. The site updates when it wakes.', 8000);
    } catch {
      tip('Could not reach GitHub — try again');
    } finally {
      btn.classList.remove('spin');
      setTimeout(() => { btn.disabled = false; }, 1500);
    }
  };
}
function poll() {
  fetch(stateUrl()).then(r => r.ok ? r.json() : null).then(s => { if (s) apply(s); }).catch(() => {});
}
function connect() {
  if (STATIC) {
    setInterval(poll, POLL_MS);
    setupPagesRefresh();
    return;
  }
  const es = new EventSource('/api/stream');
  es.addEventListener('init', e => apply(JSON.parse(e.data)));
  es.addEventListener('status', e => apply(JSON.parse(e.data)));
  es.addEventListener('usage', e => apply({ usage: JSON.parse(e.data) }));
  es.addEventListener('portfolio', e => apply({ portfolio: JSON.parse(e.data) }));
  es.addEventListener('claude', e => apply({ claude_usage: JSON.parse(e.data) }));
  es.onerror = () => { if (es.readyState === 2) setTimeout(connect, 5000); };
}

// ---------- interactions: data/interactions.jsonl -> /api/state + SSE `interactions` -> walks (each entry once) ----------
const seen = new Set(), pending = [], PAGE_T0 = Date.now();
function findWorker(ref) {
  const r = String(ref).trim().toLowerCase(), m = r.match(/^bot(\d+)$/);
  for (const w of workers.values()) if (m ? w.bot.num === +m[1] : (w.bot.id === ref || String(w.bot.name).toLowerCase() === r)) return w;
  return null;
}
function feed(list) {
  for (const o of list) {
    const key = `${o.ts}|${o.from}|${o.to}`;
    if (seen.has(key)) continue; seen.add(key);
    const t = Date.parse(o.ts);
    if (!(t >= PAGE_T0 - 120e3)) continue; // on page load only replay the last 2 minutes
    pending.push({ from: o.from, to: o.to, note: o.note || '', at: performance.now() });
    D.interactions++;
  }
}
function pump(now) {
  for (let i = pending.length - 1; i >= 0; i--) {
    const p = pending[i], a = findWorker(p.from), b = findWorker(p.to);
    if (!a || !b || a === b || a.seat.stand || b.seat.stand || now - p.at > 90e3) { pending.splice(i, 1); continue; }
    if (!freeWalkers()) continue; // the walking cap: wait for a free slot
    if (a.walk?.trip) recall(a); if (b.walk?.trip) recall(b); // real interactions outrank the cosmetic ones
    if (a.walk || b.walk || visiting(b)) continue;
    if (a.chatting) endChat(a.chatting); if (b.chatting) endChat(b.chatting);
    pending.splice(i, 1); startWalk(a, b, p.note, false);
  }
}
// the walking cap (WALK.maxMoving): bots getting up, walking out or walking home count; bots standing, sitting or talking somewhere do not
const MOVING = { rise: 1, stand: 1, go: 1, back: 1 };
const freeWalkers = () => { let n = 0; for (let i = 0; i < wl.length; i++) if (wl[i].walk && MOVING[wl[i].walk.phase]) n++; D.moving = n; return Math.max(0, WALK.maxMoving - n); };
const visiting = w => { for (let i = 0; i < wl.length; i++) if (wl[i].walk && wl[i].walk.to === w) return true; return false; };

// ---------- walking: stand up, walk the walkway to the other desk, talk, walk back, sit ----------
function hAt(f) { // upper-body sprite height for a floor y (piecewise fit of the measured seats)
  const W = walkH; if (f <= W[0][0]) return W[0][1] + (f - W[0][0]) * (W[1][1] - W[0][1]) / (W[1][0] - W[0][0]);
  for (let i = 1; i < W.length; i++) if (f <= W[i][0] || i === W.length - 1) return W[i - 1][1] + (f - W[i - 1][0]) * (W[i][1] - W[i - 1][1]) / (W[i][0] - W[i - 1][0]);
  return W[W.length - 1][1];
}
function navPath(a, b, adj = navAdj()) { // Dijkstra on the floor graph -> node ids after a, up to and including b
  const n = nav.length, dist = new Array(n).fill(1e9), prev = new Array(n).fill(-1), done = new Array(n).fill(false); dist[a] = 0;
  for (;;) {
    let u = -1; for (let i = 0; i < n; i++) if (!done[i] && dist[i] < 1e9 && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === b) break; done[u] = true;
    for (const [v, d] of adj[u]) if (dist[u] + d < dist[v]) { dist[v] = dist[u] + d; prev[v] = u; }
  }
  const p = []; for (let u = b; u >= 0 && u !== a; u = prev[u]) p.unshift(u); return p;
}
let adjC = null; const navAdj = () => { if (adjC) return adjC; adjC = nav.map(() => []); for (const [a, b] of L.nav.edges) { const d = Math.hypot(nav[a][0] - nav[b][0], nav[a][1] - nav[b][1]); adjC[a].push([b, d]); adjC[b].push([a, d]); } return adjC; };
function pathPts(P) { const out = []; for (const p of P) { const l = out[out.length - 1]; if (!l || Math.hypot(l[0] - p[0], l[1] - p[1]) > 1) out.push(p); } return out; }
const visitOf = s => s.bag || s.roam ? s.feet : [s.x + (s.idx ? 36 : -36) * (s.desk.seats.length > 1 ? 1 : 0.9), s.feet[1]];
const route = (a, b) => pathPts([a.feet, ...navPath(a.node, b.node).map(n => nav[n]), visitOf(b)]);
const DEMO_NOTES = ['handoff ✓', 'got a sec?', 'PR is up', 'numbers look good', 'synced the inbox', 'backup done', 'new clip ready', 'shield check passed'];
function leave(w, g) { // rise: turn out of the chair towards the way out, then stand up (phase `stand`); the bean bag has no chair to turn
  w.fid = null; if (w.chatting) endChat(w.chatting);
  if (w.seat.bag || w.seat.roam) return;
  const dir = g.pts[1] && g.pts[1][0] < w.seat.x ? -1 : 1;
  w.pose.dir = w.pose.b < 0.05 ? dir : w.pose.dir;
  turnTo(w, 3.4, TURN_T, dir, () => { if (w.walk === g && g.phase === 'rise') { g.phase = 'stand'; g.t = 0; } });
}
function startWalk(w, to, note, demo) {
  const pts = route(w.seat, to.seat), len = [];
  for (let i = 1; i < pts.length; i++) len.push(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  w.walk = { to, pts, len, i: 0, front: true, f: 0, dir: 1, phase: 'rise', t: 0, x: pts[0][0], y: pts[0][1], stride: 0, v: 0, face: 1, legs: 'side', prev: null, fade: 0, note: note || (demo ? DEMO_NOTES[(rnd() * DEMO_NOTES.length) | 0] : '…'), demo };
  leave(w, w.walk); layoutDirty = true;
}
let nextDemo = 1.2 + rnd() * 0.8;
function maybeDemo(t) {
  if (!DEMO || t < nextDemo || !freeWalkers()) return;
  nextDemo = t + 8 + rnd() * 4;
  const ws = [...workers.values()].filter(w => !w.seat.stand && !w.walk && !visiting(w)); // bag seat (Dashboards) may walk too
  if (ws.length < 2) return;
  const a = ws[(rnd() * ws.length) | 0], others = ws.filter(o => o !== a && o.seat.desk !== a.seat.desk);
  const b = others[(rnd() * others.length) | 0]; if (b) startWalk(a, b, '', true);
}
const RISE = 0.55, STAND = 0.4, TALK = 3.6;
function stepWalk(w, dt) {
  const g = w.walk, P = w.pose, s = w.seat;
  g.t += dt; if (g.fade > 0) g.fade -= dt;
  if (g.phase === 'rise') { if ((s.bag || s.roam) && g.t >= RISE) { g.phase = 'go'; g.t = 0; } return; }
  if (g.phase === 'stand') { P.a = Math.max(0, 1 - g.t / STAND); if (g.t >= STAND) { g.phase = 'go'; g.t = 0; P.a = 0; P.b = P.hb = 0; P.dur = 0; s.self = false; } return; } // chair frame dissolves into the standing body
  if (g.phase === 'hang' || g.phase === 'petting') return stepHang(w, g, dt);
  if (g.phase === 'talk') {
    g.to.look = g.x < g.to.seat.x ? -1 : 1;
    g.face = g.x < g.to.seat.x ? 1 : -1;
    if (g.t >= TALK) { g.to.look = 0; if (!g.to.walk && !g.to.seat.bag && g.to.pose.b > 0) turnTo(g.to, 0, TURN_T); g.phase = 'back'; g.t = 0; g.i = g.len.length - 1; g.f = 1; g.dir = -1; }
    return;
  }
  if (g.phase === 'sit') { // back at the chair: the standing body dissolves into the frame, then the slow turn back to the desk
    if (s.bag || s.roam) { if (g.t >= RISE) { w.walk = null; layoutDirty = true; } return; }
    if (g.t < dt * 1.5 && P.a === 0) { P.b = P.hb = 3.4; P.dir = g.face; s.self = true; }
    P.a = Math.min(1, g.t / STAND); if (g.t >= STAND) { P.a = 1; g.phase = 'settle'; turnTo(w, 0, TURN_T + 0.1, 0, () => { w.walk = null; layoutDirty = true; }); }
    return;
  }
  if (g.phase === 'settle') return;
  const hu = hAt(g.y), cruise = Math.max(42, hu * 0.75), rem = (g.dir > 0 ? g.i === g.len.length - 1 ? (1 - g.f) * g.len[g.i] : 99 : g.i === 0 ? g.f * g.len[0] : 99);
  g.v += (cruise * Math.max(0.4, Math.min(1, rem / 16)) - g.v) * Math.min(1, dt * 6); // eased start and stop
  let d = g.v * dt;
  while (d > 0) {
    const l = g.len[g.i] || 1, r = g.dir > 0 ? (1 - g.f) * l : g.f * l;
    if (d < r) { g.f += g.dir * d / l; d = 0; }
    else {
      d -= r;
      if (g.dir > 0) { if (g.i < g.len.length - 1) { g.i++; g.f = 0; } else { g.f = 1; g.phase = g.pet ? 'petting' : g.trip ? 'hang' : 'talk'; g.t = 0; g.v = 0; layoutDirty = true; if (g.pet) dogPetted(w); else if (g.to && !g.to.walk && !g.to.seat.bag) { endIf(g.to); turnTo(g.to, 2, TURN_T, g.x < g.to.seat.x ? -1 : 1); } break; } }
      else { if (g.i > 0) { g.i--; g.f = 1; } else { g.f = 0; g.phase = 'sit'; g.t = 0; g.v = 0; break; } }
    }
  }
  if (g.phase === 'sit' || g.phase === 'hang' || g.phase === 'talk' || g.phase === 'petting') return;
  const p0 = g.pts[g.i], p1 = g.pts[g.i + 1] || p0, nx = p0[0] + (p1[0] - p0[0]) * g.f, ny = p0[1] + (p1[1] - p0[1]) * g.f, oldF = g.front, oldD = g.face;
  if (Math.abs(nx - g.x) > 0.01) g.face = nx > g.x ? 1 : -1;
  const ddx = Math.abs(nx - g.x), ddy = ny - g.y; // face the walk direction: front sprite toward the camera, back away
  if (Math.abs(ddy) > ddx * 0.35 && Math.abs(ddy) > 1e-3) g.front = ddy > 0;
  const oldS = g.side; if (sideImg && ddx + Math.abs(ddy) > 1e-3) g.side = ddx > Math.abs(ddy) * 1.4; // mostly sideways: the profile body (David, 2026-11-10)
  if (oldF !== g.front || oldD !== g.face || oldS !== g.side) { g.prev = { front: oldF, face: oldD, side: oldS }; g.fade = FADE; } // direction changes dissolve instead of snapping
  // legs always match the torso: side stride under the profile body, front or back stride under the front or back body
  if (ddx + Math.abs(ddy) > 1e-3) g.legs = g.side ? 'side' : g.front ? 'front' : 'back';
  g.stride += Math.hypot(nx - g.x, ny - g.y) / Math.max(20, hu * 0.42) * Math.PI;
  g.x = nx; g.y = ny;
}
const FADE = 0.16, endIf = w => { if (w.chatting) endChat(w.chatting); };

// ---------- ambient idle life: purely cosmetic and client-side, never an interaction (no feed, no API, no handoff labels) ----------
const pick = list => list[(rnd() * list.length) | 0];
const busy = w => w.bot.status === 'working' || w.bot.status === 'error';
function initLounge() {
  const O = L.lounge, P2 = p => [p[0] * PW, p[1] * PH];
  lng = { ...O, steam: P2(O.steam), espresso: P2(O.espresso), puff: glowSprite('255,244,232', 32, 0.2), wisp: glowSprite('255,246,236', 32, 0.3), puffs: [0, 1, 2, 3, 4, 5, 6].map(i => ({ ph: i / 7, sw: rnd() * 7 })),
    bags: O.bags.map(b => ({ ...b, sit: P2(b.sit), visit: P2(b.visit), depth: b.depth * PH, bag: true, id: b.id })), spots: O.spots.map(s => ({ ...s, x: s.p[0] * PW, y: s.p[1] * PH })) };
  for (const b of lng.bags) { b.x = b.visit[0]; b.y = b.visit[1]; }
}
function drawLounge(t) {
  P(); const [sx, sy] = lng.steam;
  for (let i = 0; i < 7; i++) {
    const p = lng.puffs[i], a = (t * 0.22 + p.ph) % 1, sz = 8 + a * 18;
    ctx.globalAlpha = Math.sin(a * Math.PI) * 0.32 * (1 - a * 0.4);
    ctx.drawImage(lng.puff, sx + Math.sin(a * 5 + p.sw) * (2 + a * 5) - sz / 2, sy - a * 46 - sz * 0.7, sz, sz * 1.4);
  }
  ctx.globalAlpha = 1;
  drawClock(t);
}
// small steam off a hot drink, in plate px
function curl(x, y, s, ph, t) {
  for (let i = 0; i < 6; i++) {
    const a = (t * 0.2 + ph + i / 6) % 1, sz = (5 + a * 15) * s;
    ctx.globalAlpha = Math.min(1, a * 7) * (1 - a) * 0.5; // starts at the rim, thins as it rises
    ctx.drawImage(lng.wisp, x + Math.sin(a * 5 + ph * 7 + i) * (1.5 + a * 4) * s - sz / 2, y - a * 34 * s - sz * 0.8, sz, sz * 1.6);
  }
  ctx.globalAlpha = 1;
}
function drawSteam(t) {
  P(); for (const c of L.steam) curl(c.x * PW, c.y * PH, c.s, c.ph, t);
}
// ---------- wall clock: digital, in a walnut case like the kitchen shelves (David, 2026-11-10: digital, big, matching the room). The digits
// are drawn as rounded amber segments, not a font, so they look the same on every screen and TV. Case and digits are two layers: at night
// the case sits in the room's shade while the digits stay lit. ----------
const CK = { x: 3, y: 36, w: 92, h: 50, c: null, d: null, m: -1, glow: glowSprite('255,170,90') };
const SEG = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f]; // segments a..g per digit
function segDigit(g, x, y, w, h, t, bits, on, off) { // one 7-segment digit, top-left x,y, stroke t, italic slant
  const sl = 0.1 * h, P = (u, v) => [x + u * w + (1 - v) * sl, y + v * h], hv = 0.5;
  const S = [[[0, 0], [1, 0]], [[1, 0], [1, hv]], [[1, hv], [1, 1]], [[0, 1], [1, 1]], [[0, hv], [0, 1]], [[0, 0], [0, hv]], [[0, hv], [1, hv]]];
  g.lineCap = 'round'; g.lineWidth = t;
  for (let i = 0; i < 7; i++) {
    const [[u0, v0], [u1, v1]] = S[i], horiz = v0 === v1, gu = horiz ? t * 0.85 / w : 0, gv = horiz ? 0 : t * 0.85 / h;
    const a = P(u0 + gu, v0 + gv), b = P(u1 - gu, v1 - gv);
    g.strokeStyle = bits >> i & 1 ? on : off; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  }
}
function drawClock(t) {
  const h = bkkHour(), m = Math.floor(h * 60), S = 4, W = CK.w * S, H = CK.h * S; // drawn at 4x for big screens
  if (!CK.c) { // the case, once
    const c = CK.c = mk(W + 40, H + 40), g = c.getContext('2d'), o = 20;
    g.shadowColor = 'rgba(10,5,2,.55)'; g.shadowBlur = 18; g.shadowOffsetX = 5; g.shadowOffsetY = 9; // cast on the wall
    const wood = g.createLinearGradient(0, o, 0, o + H); wood.addColorStop(0, '#7a4f2a'); wood.addColorStop(0.5, '#5b3719'); wood.addColorStop(1, '#3a220e');
    g.fillStyle = wood; g.beginPath(); g.roundRect(o, o, W, H, 22); g.fill(); g.shadowColor = 'transparent';
    g.globalAlpha = 0.18; g.strokeStyle = '#2a1607'; g.lineWidth = 2; // grain
    for (let i = 0; i < 9; i++) { const y = o + 10 + i * (H - 20) / 8; g.beginPath(); g.moveTo(o + 8, y); g.bezierCurveTo(o + W * 0.3, y + 5, o + W * 0.6, y - 5, o + W - 8, y + 2); g.stroke(); }
    g.globalAlpha = 1; g.strokeStyle = 'rgba(255,214,160,.35)'; g.lineWidth = 3; g.beginPath(); g.roundRect(o + 2, o + 2, W - 4, H - 4, 20); g.stroke(); // lit top edge
    const ix = o + 16, iy = o + 16, iw = W - 32, ih = H - 32, glass = g.createLinearGradient(0, iy, 0, iy + ih);
    glass.addColorStop(0, '#1c1210'); glass.addColorStop(1, '#0c0807');
    g.fillStyle = glass; g.beginPath(); g.roundRect(ix, iy, iw, ih, 10); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 4; g.stroke();
    CK.inner = [ix, iy, iw, ih];
  }
  if (m !== CK.m) { // the digits, once a minute
    CK.m = m; const d = CK.d || (CK.d = mk(W + 40, H + 40)), g = d.getContext('2d'), [ix, iy, iw, ih] = CK.inner;
    g.clearRect(0, 0, d.width, d.height);
    const h12 = Math.floor(m / 60) % 12 || 12, mm = m % 60, pm = m >= 720, digs = h12 >= 10 ? [1, h12 % 10, (mm / 10) | 0, mm % 10] : [h12, (mm / 10) | 0, mm % 10], nd = digs.length, ci = nd - 3; // ci: the colon follows this digit
    const dh = ih * 0.66, dw = dh * 0.46, t = dh * 0.12, gap = dw * 0.36, col = dw * 0.42, margin = dw * 0.45, ampm = dw * 0.52; // margin: the space before A / P
    const total = (dw + gap) * nd - gap + col + margin + ampm, x0 = ix + (iw - total) / 2, y0 = iy + (ih - dh) / 2;
    const on = '#ffc47a', off = 'rgba(255,170,90,.06)';
    g.shadowColor = 'rgba(255,140,50,.85)'; g.shadowBlur = 14;
    let x = x0;
    for (let i = 0; i < nd; i++) {
      segDigit(g, x, y0, dw, dh, t, SEG[digs[i]], on, off);
      x += dw + gap;
      if (i === ci) { const cx = x - gap / 2 + col / 2 - dh * 0.05; g.fillStyle = on; for (const v of [0.32, 0.7]) { g.beginPath(); g.arc(cx + (1 - v) * dh * 0.1, y0 + v * dh, t * 0.55, 0, 7); g.fill(); } x += col; }
    }
    // one letter, A or P (David, 2026-11-10), set off from the minutes by a small margin and sitting on the digits' baseline
    g.shadowBlur = 8; g.font = `800 ${Math.round(dh * 0.5)}px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillStyle = on; g.fillText(pm ? 'P' : 'A', x - gap + margin + ampm / 2, y0 + dh);
    g.shadowBlur = 0;
    const gl = g.createLinearGradient(ix, iy, ix + iw * 0.6, iy + ih); gl.addColorStop(0, 'rgba(255,255,255,.10)'); gl.addColorStop(0.45, 'rgba(255,255,255,0)'); // glass sheen
    g.fillStyle = gl; g.beginPath(); g.roundRect(ix, iy, iw, ih, 10); g.fill();
    D.clock = `${h12}:${String(mm).padStart(2, '0')}${pm ? 'pm' : 'am'}`;
  }
  const s = 1 / S, o = 20 * s;
  P(); ctx.save(); ctx.translate(CK.x, CK.y); ctx.transform(1, 0.03, 0, 1, 0, 0); // follows the left wall a little
  ctx.drawImage(CK.c, -o, -o, CK.c.width * s, CK.c.height * s);
  if (env.n > 0) { ctx.globalAlpha = 0.5 * env.n; ctx.fillStyle = '#0d0a18'; ctx.beginPath(); ctx.roundRect(0, 0, CK.w, CK.h, 5); ctx.fill(); ctx.globalAlpha = 1; } // night: the case sits in the room's shade
  ctx.drawImage(CK.d, -o, -o, CK.d.width * s, CK.d.height * s); // the digits stay lit
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (0.1 + 0.015 * Math.sin(t * 0.7)) * (0.4 + 0.8 * env.dark); ctx.drawImage(CK.glow, -14, -12, CK.w + 28, CK.h + 24);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  ctx.restore();
}
const tripPhase = g => g.trip && g.phase !== 'back' && g.phase !== 'sit' && g.phase !== 'settle';
const spotTaken = sp => wl.some(o => o.walk && tripPhase(o.walk) && o.walk.trip.spot === sp);
function pickSpot(w) {
  const dash = isDash(w.bot), bags = dash ? [] : lng.bags.filter(b => b.id !== 'bag-b' && !spotTaken(b)), free = lng.spots.filter(s => !spotTaken(s)); // the blue bag is her home
  const list = bags.length && rnd() < 0.72 ? bags : free.length ? free : bags;
  return list.length ? list[(rnd() * list.length) | 0] : null;
}
function startTrip(w, force, spotId) {
  if (!w || w.walk || w.seat.stand || (!force && !freeWalkers())) return false;
  const spot = spotId ? [...lng.spots, ...lng.bags].find(s => s.id === spotId) : pickSpot(w); if (!spot) return false;
  const pts = pathPts([w.seat.feet, ...navPath(w.seat.node, spot.node).map(n => nav[n]), [spot.x, spot.y]]), len = [];
  for (let i = 1; i < pts.length; i++) len.push(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  w.walk = { to: null, pts, len, i: 0, front: true, f: 0, dir: 1, phase: 'rise', t: 0, x: pts[0][0], y: pts[0][1], stride: 0, v: 0, face: 1, legs: 'side', prev: null, fade: 0, note: '', demo: false, say: null, sayT: 1 + rnd() * 2, sayOff: 0, stayT: span(...w.b.tripStay), pet: false, petted: false, sitK: 0, leaving: false,
    force: !!force && busy(w), trip: { spot } }; // a forced trip by a busy bot (debug hook) is not recalled at once
  leave(w, w.walk); layoutDirty = true; return true;
}
function recall(w) { // back to the desk from wherever they are on the route
  const g = w.walk;
  if (g.phase === 'rise') { w.walk = null; if (!w.seat.bag) turnTo(w, 0, TURN_T); layoutDirty = true; return; }
  if (g.phase === 'stand') { g.phase = 'sit'; g.t = STAND * (1 - Math.min(1, g.t / STAND)); return; }
  if (g.phase === 'go') g.dir = -1;
  else if (g.phase === 'hang' || g.phase === 'petting') { if (g.sitK > 0) { g.leaving = true; return; } g.i = g.len.length - 1; g.f = 1; g.dir = -1; }
  else return;
  g.phase = 'back'; g.t = 0; g.say = null; layoutDirty = true;
}
function say(g, text, dur) { g.say = text; g.sayOff = dur; layoutDirty = true; }
// ---------- kitchen task (David, 2026-11-10): at the coffee machine a bot pulls a coffee into a mug, drawn over the painted machine, behind
// the bots; afterwards the bot carries the mug. The fridge animation was removed (David, 2026-11-10). Plate px, from the 3x plate. ----------
const KIT = {
  spout: [137, 472], tray: 482,   // espresso group head and drip tray top
  screen: [110, 442, 124, 455],   // the machine's little display
  coffeeT: [0.8, 3.2, 0.7],       // warm up, pour, hand-off (s)
  live: 0,                        // >0 while anything here moves (lite repaints the corner)
};
const kitTask = () => { for (let i = 0; i < wl.length; i++) { const g = wl[i].walk; if (g && g.task) return g.task; } return null; };
function startKitchenTask(w, g, sp) { g.task = { kind: sp.id, t: 0, w }; g.front = false; g.face = 1; g.say = null; }
function stepKitchenTask(w, g, dt) { // true while the task runs
  const k = g.task; k.t += dt; KIT.live = 0.6;
  const T = KIT.coffeeT, end = T[0] + T[1] + T[2];
  g.front = false; g.face = 1;
  if (k.t < end) return true;
  g.task = null; g.taskDone = true; g.front = true; g.prev = { front: false, face: g.face }; g.fade = FADE;
  g.holding = 'mug'; g.stayT = Math.max(g.stayT, 6 + rnd() * 6);
  say(g, pick(['☕', 'ahh ☕', 'fresh!']), 2.4); layoutDirty = true;
  return false;
}
function drawKitchen(t) {
  const k = kitTask(); if (!k) return;
  P();
  {
    const [a, b, c] = KIT.coffeeT, [sx, sy] = KIT.spout, tray = KIT.tray, on = k.t < a + b + c * 0.5;
    const [qx0, qy0, qx1, qy1] = KIT.screen; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 9);
    ctx.drawImage(screenGlow, qx0 - 8, qy0 - 8, qx1 - qx0 + 16, qy1 - qy0 + 16); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    if (on) { // the mug under the spout, filling
      const mw = 11, mh = 10, mx = sx - mw / 2, my = tray - mh, fill = Math.max(0, Math.min(1, (k.t - a) / b));
      ctx.fillStyle = '#f4efe6'; ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, 2); ctx.fill();
      ctx.strokeStyle = '#f4efe6'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(mx + mw + 1, my + mh * 0.45, 2.4, -1.3, 1.3); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(mx + mw * 0.65, my + 1, mw * 0.35 - 1, mh - 2); // shade
      if (fill > 0) { ctx.fillStyle = '#5a3418'; ctx.fillRect(mx + 1.2, my + 1.5, mw - 2.4, 1.6); }
      if (k.t > a && k.t < a + b) { // the stream
        ctx.strokeStyle = 'rgba(92,52,22,.95)'; ctx.lineWidth = 1.3 + 0.3 * Math.sin(t * 30); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.sin(t * 13) * 0.3, my + 1); ctx.stroke();
      }
      if (fill > 0.3) curl(sx, my - 2, 0.55, 1.3, t);
    }
  }
}
function drawHeld(w, g, x, hip, hu, t) { // what a bot carries back from the kitchen
  if (!g.holding || !g.front) return;
  const hx = x + (g.face || 1) * hu * 0.2, hy = hip - hu * 0.12;
  if (g.holding === 'mug') {
    const s = hu * 0.09; ctx.fillStyle = '#f4efe6'; ctx.beginPath(); ctx.roundRect(hx - s / 2, hy - s, s, s, s * 0.2); ctx.fill();
    ctx.strokeStyle = '#f4efe6'; ctx.lineWidth = s * 0.18; ctx.beginPath(); ctx.arc(hx + s * 0.6, hy - s * 0.55, s * 0.26, -1.3, 1.3); ctx.stroke();
    curl(hx, hy - s * 1.1, 0.6, w.ph, t);
  } else { const s = hu * 0.16; ctx.font = `${s}px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(g.holding, hx, hy - s * 0.4); }
}
function stepHang(w, g, dt) {
  const sp = g.trip.spot;
  if (g.phase === 'petting') {
    g.face = g.petDog.x > g.x ? 1 : -1;
    if (g.t > 3.8) { g.pet = false; g.stayT = 0; g.phase = 'hang'; }
    return;
  }
  if (g.leaving) { g.sitK -= dt / 0.65; if (g.sitK <= 0) { g.sitK = 0; g.leaving = false; recall(w); } return; }
  if (!g.task && !g.taskDone && sp.id === 'coffee' && !kitTask()) startKitchenTask(w, g, sp);
  if (g.task && stepKitchenTask(w, g, dt)) return;
  if (sp.bag) { g.sitK = Math.min(1, g.sitK + dt / 0.7); g.front = true; } else { g.front = g.taskDone || !sp.back; if (sp.face && !g.taskDone) g.face = sp.face; }
  if (g.say && (g.sayOff -= dt) <= 0) { g.say = null; layoutDirty = true; }
  if ((g.stayT -= dt) <= 0 && !g.say) { if (freeWalkers()) return recall(w); g.stayT = 0.5 + rnd(); } // the walk home waits for a free slot
  if ((g.sayT -= dt) > 0) return;
  g.sayT = 4 + rnd() * 5;
  const others = wl.filter(o => o !== w && o.walk && o.walk.phase === 'hang'), r = rnd();
  if (others.length && r < 0.55) { // alternating small talk
    say(g, pick(w.b.loungeChat), 2);
    const o = others[(rnd() * others.length) | 0]; if (o.walk.sayT > 2.4) o.walk.sayT = 2.2 + rnd() * 0.5;
  } else if (!g.petted && !sp.bag && r > 0.6 && freeWalkers() && (g.petDog = dogNear(g))) { // walk over and pet the dog (the way home retraces this leg)
    const pd = g.petDog, dx = pd.x > g.x ? -1 : 1, tx = pd.x + dx * 36, ty = pd.y + 3;
    g.petted = g.pet = true; g.pts.push([tx, ty]); g.len.push(Math.hypot(tx - g.x, ty - g.y)); g.i = g.len.length - 1; g.f = 0; g.dir = 1; g.phase = 'go'; g.t = 0; g.say = null;
  } else say(g, pick(w.b.snacks), 2.2);
}
const dogNear = g => dogs.filter(d => d.y > 590 && d.x > 60 && d.x < 480).sort((a, b) => Math.hypot(a.x - g.x, a.y - g.y) - Math.hypot(b.x - g.x, b.y - g.y))[0];
let ambT = 0;
function dashVisit(w) { // Dashboards leaves the bean bag to check in at a desk, then walks back
  const targets = wl.filter(o => o !== w && !o.seat.stand && !o.seat.bag && !o.walk && !visiting(o) && !busy(o) && !o.chatting);
  if (!targets.length || !freeWalkers()) return false;
  startWalk(w, targets[(rnd() * targets.length) | 0], '☕ check-in', false);
  return true;
}
function stepAmbient(dt) {
  let away = 0;
  for (let i = 0; i < wl.length; i++) {
    const w = wl[i], g = w.walk;
    // Dashboards keeps roaming even while her status is working (laptop life in the kitchen)
    if (g && g.trip) { if (!isDash(w.bot) && !w.seat.roam) away++; if ((busy(w) && !isDash(w.bot) && !w.seat.roam || !QUIET.has(w.bot.id)) && !g.force && (g.phase === 'rise' || g.phase === 'stand' || g.phase === 'go' || (g.phase === 'hang' || g.phase === 'petting') && freeWalkers())) recall(w); }
  }
  for (let i = 0; i < wl.length; i++) {
    const w = wl[i], dash = isDash(w.bot);
    if (w.walk || w.seat.stand || w.chatting) continue;
    if (busy(w) && !dash && !w.seat.roam) continue; // only Dashboards and the kitchen bots wander while working
    if (!w.b.wanders || !QUIET.has(w.bot.id) || (w.tripT -= dt) > 0) continue; // only the quieter bots go on breaks
    w.tripT = span(...w.b.tripEvery);
    if (!(w.pose.b === 0 && w.pose.dur === 0 && !visiting(w))) continue;
    if (dash) {
      if (rnd() < 0.4 ? dashVisit(w) : startTrip(w) || dashVisit(w)) {}
    } else if (w.seat.roam) startTrip(w); // kitchen bots are always out and about; they do not count against the desk bots' break limit
    else if (away < Math.min(3, wl.length - 1) && startTrip(w)) away++;
  }
  if ((ambT -= dt) <= 0) {
    ambT = 0.25;
    D.ambient = { away: wl.filter(w => w.walk?.trip).map(w => w.bot.name), lounge: wl.filter(w => w.walk?.phase === 'hang' || w.walk?.phase === 'petting').map(w => w.bot.name), onBag: wl.filter(w => w.walk?.sitK > 0.9).map(w => w.bot.name) };
  }
}
D.visit = (a, b) => { const w = findWorker(a), o = findWorker(b); if (!w || !o || w.walk || w.seat.bag || w.seat.roam) return false; startWalk(w, o, 'hi', false); return true; }; // test aid: walk a desk bot over to another
D.loungeTrip = (i, spot) => { const w = typeof i === 'number' ? wl[i] : findWorker(i); return startTrip(w, true, spot); };

// ---------- seated fidgets (idle only): lean, swivel, stretch, look around, head scratch; soft envelopes, no two alike ----------
const FIDGETS = [['lean', 2.5, 5], ['stretch', 2, 3.2], ['look', 2.4, 4], ['scratch', 1.6, 2.6]];
function stepFidget(w, dt) {
  w.fr = w.fx = 0; w.fsy = 1;
  if (w.walk || busy(w) || w.pose.a > 0 || w.seat.bag) { w.fid = null; return; }
  if (!w.fid) {
    if ((w.fidT -= dt) > 0) return;
    const [kind, a, b] = FIDGETS[(rnd() * FIDGETS.length) | 0];
    w.fid = { kind, d: a + rnd() * (b - a), t: 0, dir: rnd() < 0.5 ? -1 : 1 }; w.fidT = span(...w.b.fidgetEvery);
  }
  const F = w.fid, p = (F.t += dt) / F.d; if (p >= 1) { w.fid = null; return; }
  const e = Math.sin(Math.PI * p), s2 = F.dir;
  switch (F.kind) {
    case 'lean': w.fr = 0.06 * s2 * e; w.fx = 0.022 * s2 * e; break;
    case 'stretch': w.fsy = 1 + 0.05 * e * e; w.fr = 0.015 * s2 * Math.sin(p * 9); break;
    case 'look': w.fr = 0.055 * s2 * Math.sin(p * Math.PI * 2); w.fx = 0.008 * s2 * Math.sin(p * Math.PI * 2); break;
    case 'scratch': w.fr = 0.05 * s2 * e + 0.016 * e * Math.sin(F.t * 21); break;
  }
}
// behind a big desk: its monitors and body hide them. hw = half the body width: a walker counts as behind while any part of it overlaps
// the desk, so it no longer pops in front when its centre crosses the desk's edge
const zoneKey = (x, y, hw = 0) => { for (let i = 0; i < zones.length; i++) { const z = zones[i]; if (x + hw > z.x0 && x - hw < z.x1 && y < z.y) return z.key; } return y; };

// ---------- corgi: mood state machine on the floor graph (layout.dog): weighted random moods, variable durations, eased
// starts and stops, smooth turns; poses come from the painted atlas; depth-sorted by its feet ----------
let dog = null, dogs = [], zSpr = null; // `dog` is the one being stepped; outside the step it is the primary (corgi), dogs[1] is its brown twin
function newDog(start, im) {
  const N = nav, adj = dogAdj();
  return { im, N, adj, fr: L.corgi.frames, x: N[start][0], y: N[start][1], node: start, path: [], mood: 'nap', pose: DEMO ? 'sit' : 'sleep', t: DEMO ? 1.5 : 5 + rnd() * 6, face: 1, fs: 1, ph: 0, v: 0, pace: 1, seq: [], by: null, zoom: 0 };
}
function initDog() {
  const twin = L.dog.rest.find(r => r[0] !== L.dog.start)[0];
  dogs = [newDog(L.dog.start, dogImg), newDog(twin, dogImg2)]; dog = dogs[0];
  zSpr = mk(48, 48); { const g = zSpr.getContext('2d'); g.font = `italic 700 34px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(200,220,255,.9)'; g.shadowBlur = 8; g.fillStyle = 'rgba(250,246,255,.95)'; g.fillText('z', 24, 25); }
  dogs.forEach((d, i) => { d.out = { mode: d.pose, mood: d.mood, x: d.x, y: d.y, node: d.node, by: null }; D[i ? 'corgi2' : 'corgi'] = d.out; });
}
// The dogs skip the walkers' corner node j3: it sits on the right end of the front-right desk, so a dog there (shorter than the desk) looked as
// if it stood on the desktop. They reach the right aisle by the front corridor instead.
const DOG_SKIP = ['j3'];
let dogAdjC = null; const dogAdj = () => { if (dogAdjC) return dogAdjC; const skip = new Set(DOG_SKIP.map(n => L.nav.name[n])); dogAdjC = navAdj().map((a, i) => skip.has(i) ? [] : a.filter(([b]) => !skip.has(b))); return dogAdjC; };
const dogPath = (a, b) => navPath(a, b, dogAdj());
const nearestNode = (x, y) => { let best = 0, bd = 1e9; const adj = dogAdj(); dog.N.forEach(([nx, ny], i) => { if (!adj[i].length) return; const d = Math.hypot(nx - x, ny - y); if (d < bd) { bd = d; best = i; } }); return [best, bd]; };
const span = (a, b) => a + rnd() * (b - a);
function dogGo(node, pace, seq) { // walk to node at pace, then play seq = [[pose, seconds, fn?], ...]; an empty path plays seq right here
  const d = dog, o = dogs.find(x => x !== d), to = o.path.length ? o.path[o.path.length - 1] : o.node;
  if (node === to && node !== d.node) { const a = d.adj[node]; node = a[(rnd() * a.length) | 0][0]; } // never the same spot as the twin
  d.path = dogPath(d.node, node); d.pace = pace; d.seq = seq;
  if (d.path.length) { d.pose = 'walk'; d.t = 0; } else dogSeq();
}
function dogSeq() {
  const d = dog, s = d.seq.shift();
  if (!s) return dogNext();
  d.pose = s[0]; d.t = s[1]; if (s[2]) s[2]();
}
function pickFriend() { // a bot the dog can reach: at a desk, in the kitchen or on a break, and not the one the other dog is with
  const other = dogs.find(x => x !== dog), list = wl.filter(o => o !== other?.by && !o.seat.stand && !o.seat.bag && (!o.walk || o.walk.phase === 'hang') && nearestNode(...(o.walk ? [o.walk.x, o.walk.y] : o.seat.feet))[1] < 90);
  const near = list.filter(o => o.walk || o.seat.roam); // bots on a break or in the kitchen are the favourites
  const pool = near.length && rnd() < 0.6 ? near : list;
  return pool[(rnd() * pool.length) | 0] || null;
}
function loungeBots() { const o = []; for (let i = 0; i < wl.length; i++) if (wl[i].walk?.phase === 'hang') o.push(wl[i]); return o; }
function dogMood(m, w) {
  const d = dog, K = L.dog.beg; d.mood = m; d.by = null; d.zoom = 0;
  switch (m) {
    case 'wander': { // varied pace: a trot, or a slow sniff with pauses
      const slow = rnd() < 0.5, n = (rnd() * d.N.length) | 0;
      return dogGo(n, slow ? span(0.4, 0.6) : span(0.85, 1.15), rnd() < 0.65 ? [[rnd() < 0.5 ? 'sniff' : 'sit', span(1.5, 5)]] : []);
    }
    case 'affection': case 'belly': case 'ask': { // trot up to one bot and be cute at it; the bot turns round, looks down or answers
      w = w || pickFriend();
      if (!w) return dogMood('rest');
      d.by = w;
      const at = () => w.walk ? [w.walk.x, w.walk.y] : w.seat.feet;
      const seatSide = () => { d.face = at()[0] > d.x ? 1 : -1; };
      const react = txt => { if (w.walk) say(w.walk, txt, 2.2); else if (w.seat.roam) w.dogLook = d.x > w.seat.feet[0] ? 1 : -1; else startTurn(w, 3 + rnd() * 2, d.x < w.seat.x ? -1 : 1); };
      const greet = () => { seatSide(); react(['🐶', '🥰', 'good boy!', '❤️'][(rnd() * 4) | 0]); };
      const treat = () => { seatSide(); react(['🍪', '❤️', 'hi buddy'][(rnd() * 3) | 0]); };
      const seq = m === 'belly' ? [['sit', span(1, 2), greet], ['belly', span(5, 9)], ['happy', span(1.5, 2.5), seatSide], ['sit', span(1, 2)]]
        : m === 'ask' ? [['sit', span(0.8, 1.5), seatSide], ['beg', span(2.5, 4), greet], ['happy', span(1.5, 2.5), treat], ['beg', span(2, 3.5)], ['sit', span(1, 2)]]
        : [['sit', span(1, 2), greet], ['happy', span(2.5, 4.5), seatSide], ['beg', span(1.5, 2.5)], ['sit', span(1.5, 3)]];
      const [node] = nearestNode(...at());
      return dogGo(node, span(1, 1.3), seq);
    }
    case 'feed': { // ask a bot for food: sit, beg (dreaming of a biscuit), then the bot feeds it (stepFeeds / drawFeeds drive the rest)
      w = w || pickFriend();
      if (!w) return dogMood('rest');
      d.by = w;
      const at = () => w.walk ? [w.walk.x, w.walk.y] : w.seat.feet, face = () => { d.face = at()[0] > d.x ? 1 : -1; };
      const serve = () => { face(); const side = d.x < at()[0] ? -1 : 1; let ok = true;
        if (w.walk) w.walk.face = side; else if (w.seat.roam) w.dogLook = side;
        else { const P = w.pose; if (P.b > 1.5 && P.dur === 0 && !w.chatting) { P.hold = Math.max(P.hold, 6.5); if (!P.after) P.after = () => turnTo(w, 0, TURN_T); } else ok = startTurn(w, 7.5, side, true); } // already turned round: it just stays a while
        if (!ok) { d.seq = [['beg', span(1.2, 2)], ['sit', 1]]; return; } // busy right now: no snack this time
        feeds.push({ w, d, side, t: w.walk || w.seat.roam ? -0.3 : -1.1, crumbs: [] }); }; // a seated bot swivels round first
      const [node] = nearestNode(...at());
      return dogGo(node, span(1, 1.3), [['sit', span(0.6, 1.1), face], ['beg', span(2.2, 3), () => { face(); d.think = 2.8; }], ['beg', 6, serve], ['sit', span(1, 2)]]);
    }
    case 'nap': { const c = L.dog.rest.filter(r => r[1] === 'sleep'), r = c[(rnd() * c.length) | 0]; return dogGo(r[0], span(0.6, 0.9), [['sleep', span(30, 95)]]); }
    case 'rest': { const c = L.dog.rest.filter(r => r[1] === 'lie'), r = c[(rnd() * c.length) | 0]; return dogGo(r[0], span(0.6, 0.95), [['lie', span(14, 42)]]); }
    case 'beg': {
      const treat = () => { const b = loungeBots(); if (b.length && rnd() < 0.5) { const o = b[(rnd() * b.length) | 0]; say(o.walk, '🍪', 2.2); d.seq.unshift(['happy', span(2, 3.2)]); } };
      const lb = loungeBots(), nearSpot = lb.length ? nearestNode(lb[0].walk.x, lb[0].walk.y)[0] : K[(rnd() * K.length) | 0];
      return dogGo(rnd() < 0.5 ? nearSpot : K[(rnd() * K.length) | 0], span(1, 1.25), [['beg', span(3, 6)], ['sit', span(1.5, 3)], ['beg', span(3, 6), null], ['sit', 1, treat]]);
    }
    case 'zoomies': d.zoom = 3 + ((rnd() * 4) | 0); return dogGo((rnd() * d.N.length) | 0, span(2.2, 2.8), []);
    case 'happy': return dogGo(d.node, 1, [['happy', span(2.5, 4)], ['sit', 2]]);
    default: return dogGo(d.node, 1, [[m, span(6, 12)]]);
  }
}
function dogNext() {
  const kb = loungeBots().length, M = DOG_MOODS, W = [['wander', M.wander], ['affection', DEMO ? 34 : M.affection], ['ask', M.ask], ['belly', M.belly], ['nap', M.nap], ['rest', M.rest], ['beg', kb ? M.begWithVisitors : M.beg], ['zoomies', M.zoomies], ['feed', M.feed || 0]];
  let r = rnd() * W.reduce((a, b) => a + b[1], 0);
  for (const [m, wt] of W) if ((r -= wt) <= 0) return dogMood(m);
  dogMood('wander');
}
function dogPetted(w) { const d = dog = w.walk.petDog; d.mood = 'happy'; d.by = w; d.path = []; d.v = 0; d.zoom = 0; d.face = w.walk.x > d.x ? 1 : -1; d.seq = [['happy', 3.6], ['sit', span(2, 4)]]; dogSeq(); dog = dogs[0]; }
D.dogPut = (i, node) => { const d = dogs[i]; d.path = []; d.seq = []; d.v = 0; d.node = node; [d.x, d.y] = d.N[node]; d.pose = 'sit'; d.t = 600; return [d.x, d.y]; };
D.dogAt = (i, x, y, pose = 'walk') => { const d = dogs[i]; d.path = []; d.seq = []; d.v = 0; d.x = x; d.y = y; d.pose = pose === 'walk' ? 'sniff' : pose; d.t = 600; return [d.x, d.y]; };
D.dogFeed = (name, i = 0) => { const w = findWorker(name); if (!w || !dogs[i]) return false; dog = dogs[i]; dog.path = []; dog.seq = []; dog.v = 0; dogMood('feed', w); dog = dogs[0]; return true; }; // check aid
D.feeds = () => feeds.map(f => ({ bot: f.w.bot.name, t: +f.t.toFixed(2), abort: !!f.abort }));
D.dogMood = m => { if (!dog) return false; dog.path = []; dog.seq = []; dog.v = 0; dogMood(m); return true; };
function stepDog(dt) {
  const d = dog;
  if (d.think > 0) d.think -= dt;
  d.fs += (d.face - d.fs) * Math.min(1, dt * 9);
  if (d.pose !== 'walk') { if ((d.t -= dt) <= 0) dogSeq(); }
  else {
    const [tx, ty] = d.N[d.path[0]], dx = tx - d.x, dy = ty - d.y, dist = Math.hypot(dx, dy), last = d.path.length === 1 && !d.zoom;
    const cruise = hAt(d.y) * 0.5 * d.pace, want = last ? Math.min(cruise, 16 + dist * 2.4) : cruise; // ease in, ease out on the last leg
    d.v += (want - d.v) * Math.min(1, dt * (d.pace > 2 ? 9 : 4.5));
    const step = d.v * dt, mv = Math.min(step, dist);
    if (Math.abs(dx) > 0.5) d.face = dx > 0 ? 1 : -1;
    d.x += dx / (dist || 1) * mv; d.y += dy / (dist || 1) * mv;
    d.ph += mv / (hAt(d.y) * 0.075); // walk cycle synced to distance
    if (dist <= Math.max(step, 0.4)) {
      d.node = d.path.shift();
      if (!d.path.length) {
        if (d.zoom > 0) { d.zoom--; const a = d.adj[d.node]; dogGo(d.zoom ? (rnd() * d.N.length) | 0 : a[(rnd() * a.length) | 0][0], d.pace, d.zoom ? [] : [['sit', span(3, 6)]]); }
        else { d.v = 0; dogSeq(); }
      }
    }
  }
  const c = d.out; c.mode = d.pose === 'walk' && d.zoom ? 'zoomies' : d.pose; c.mood = d.mood; c.x = Math.round(d.x); c.y = Math.round(d.y); c.node = d.node; c.by = d.by ? d.by.bot.name : null;
}
function drawDog(d, t) {
  const C = L.corgi, hu = hAt(d.y), [cw, ch] = C.cell, W = 0.507 * DOG.size * hu / C.bodyW, H = W * ch / cw; // DOG.size: 1 = the old atlas body length
  const pose = d.pose, fi = pose === 'walk' ? C.walk[(d.ph | 0) % C.walk.length] : pose === 'sniff' ? C.walk[0] : C[pose] ?? C.sit, f = d.fr[fi];
  let sy = 1, rot = 0, hop = 0;
  if (pose === 'sleep' || pose === 'lie') sy = 1 + Math.sin(t * (pose === 'sleep' ? 1.6 : 2)) * 0.022;
  else if (pose === 'sit') { sy = 1 + Math.sin(t * 2.2) * 0.012; rot = Math.sin(t * 8) * 0.008; }
  else if (pose === 'sniff') { rot = 0.03 + Math.sin(t * 5) * 0.022; sy = 1 + Math.sin(t * 9) * 0.006; }
  else if (pose === 'beg') { sy = 1 + Math.sin(t * 3.4) * 0.022; rot = Math.sin(t * 5.5) * 0.02; }
  else if (pose === 'happy') { hop = Math.abs(Math.sin(t * 6.2)) * H * 0.075; rot = Math.sin(t * 12.4) * 0.03; }
  else if (pose === 'belly') { rot = Math.sin(t * 4.6) * 0.035; sy = 1 + Math.sin(t * 9) * 0.012; }
  else if (pose === 'eat') { const c = Math.sin(t * 17); sy = 1 + c * 0.02; rot = 0.02 + Math.sin(t * 8.5) * 0.035; hop = Math.max(0, c) * H * 0.012; } // munching
  else if (pose === 'walk') hop = Math.abs(Math.sin(d.ph * Math.PI / 3)) * H * 0.012 * Math.min(2, d.pace);
  const dir = (d.fs < 0 ? -1 : 1) * Math.max(0.22, Math.abs(d.fs));
  P();
  ctx.globalAlpha = 0.5 - hop / H; ctx.drawImage(shadowSpr, d.x - W * 0.42, d.y - H * 0.08, W * 0.84, H * 0.17); ctx.globalAlpha = 1;
  ctx.save(); ctx.translate(d.x, d.y - hop); ctx.scale(dir, 1); ctx.rotate(rot);
  ctx.drawImage(d.im, f[0], f[1], f[2], f[3], -W * C.ax, -H * sy, W, H * sy);
  ctx.restore();
  if (pose === 'sleep') for (let i = 0; i < 3; i++) { // tiny rising "z" puffs
    const p = (t * 0.3 + i / 3) % 1, s = H * (0.13 + 0.16 * p);
    ctx.globalAlpha = Math.sin(p * Math.PI) * 0.75;
    ctx.drawImage(zSpr, d.x + d.face * W * 0.3 + p * H * 0.28 - s / 2, d.y - H * 0.52 - p * H * 0.7 - s / 2, s, s);
  }
  if (pose === 'eat') for (let i = 0; i < 3; i++) { // yum: little hearts rise while it munches
    const p = (t * 0.55 + i / 3) % 1, s = H * (0.12 + 0.1 * p);
    ctx.globalAlpha = Math.sin(p * Math.PI) * 0.85;
    ctx.drawImage(heartSpr, d.x + d.face * W * 0.15 + Math.sin(p * 6 + i) * H * 0.12 - s / 2, d.y - H * 0.85 - p * H * 0.6 - s / 2, s, s);
  }
  if (d.think > 0) { const a = Math.min(1, d.think / 0.3, (3.1 - d.think) / 0.3), bw = H * 0.62, bh = bw * 0.75, bob = Math.sin(t * 2.4) * H * 0.02; // dreaming of a biscuit
    ctx.globalAlpha = Math.max(0, a); ctx.drawImage(boneBubble, d.x + d.face * W * 0.18 - bw * 0.25, d.y - H * 1.05 - bh + bob, bw, bh); }
  ctx.globalAlpha = 1;
}

// ---------- snack time (David, 2026-11-10): now and then a dog asks a bot for food. It sits, begs and dreams of a biscuit; the bot turns
// to it, reaches into its hoodie pocket, rummages, brings out a bone biscuit and holds it down to the dog's mouth; the dog eats it in three
// bites (crumbs, little hearts), then hops about happily. Everything eases; the arm is drawn over the bot (sleeve in the bot's own hoodie
// colour, then the hand). Full picture only: the lite (TV) picture keeps the begging and the turning, without the arm. ----------
const feeds = [], FEED = { pocket: 0.45, out: 1.2, mouth: 2.25, bites: 3, eat: 3.1, done: 3.85 };
const sleeveOf = (() => { const memo = {}; return w => { const k = w.sprite; if (memo[k]) return memo[k]; let c = '#7a6a8a'; try { const im = fronts[k], t = mk(1, 1), g = t.getContext('2d', { willReadFrequently: true }); g.drawImage(im, im.width * 0.3, im.height * 0.8, 6, 6, 0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; c = `rgb(${d[0]},${d[1]},${d[2]})`; } catch (e) {} return (memo[k] = c); }; })();
const dogDims = d => { const C = L.corgi, hu = hAt(d.y), [cw, ch] = C.cell, W = 0.507 * DOG.size * hu / C.bodyW; return [W, W * ch / cw]; };
const mouthOf = d => { const [W, H] = dogDims(d), f = d.face < 0 ? -1 : 1; return [d.x + f * W * 0.3, d.y - H * (d.pose === 'beg' ? 0.74 : 0.62)]; };
function stepFeeds(dt) {
  for (let i = feeds.length - 1; i >= 0; i--) {
    const f = feeds[i], w = f.w, d = f.d, prev = f.t; f.t += dt;
    const gone = w.walk ? w.walk.phase !== 'hang' && w.walk.phase !== 'talk' : w.seat.roam ? false : w.pose.b < 2 && f.t > 0.2 && f.t < FEED.eat; // the bot walked off or turned back
    if (gone && !f.abort) { f.abort = true; f.t = Math.max(f.t, FEED.eat); }
    if (!f.abort && prev < FEED.out && f.t >= FEED.out && w.walk) say(w.walk, ['here you go!', 'good pup 🍪', 'snack time!'][(rnd() * 3) | 0], 2.2);
    if (!f.abort && prev < FEED.mouth && f.t >= FEED.mouth && d.by === w && d.mood === 'feed') { d.pose = 'eat'; d.t = 2.6; d.seq = [['happy', span(1.8, 2.6), () => { d.face = (w.walk ? w.walk.x : w.seat.feet[0]) > d.x ? 1 : -1; }], ['sit', span(1, 2)]]; }
    if (!f.abort) for (let b = 0; b < FEED.bites; b++) { const tb = FEED.mouth + 0.12 + b * 0.27; if (prev < tb && f.t >= tb) { const [mx, my] = mouthOf(d), s = dogDims(d)[1] * 0.05; for (let j = 0; j < 4; j++) f.crumbs.push({ x: mx, y: my, vx: (rnd() - 0.5) * s * 9, vy: -rnd() * s * 6, life: 0.7 + rnd() * 0.4, s: s * (0.25 + rnd() * 0.3) }); } }
    for (const c of f.crumbs) { c.life -= dt; c.vy += 140 * dt * (c.s > 0 ? 1 : 0); c.x += c.vx * dt; c.y += c.vy * dt; }
    f.crumbs = f.crumbs.filter(c => c.life > 0);
    if (f.t > FEED.done + 0.8) feeds.splice(i, 1);
  }
}
function drawBiscuit(x, y, s, rot) { // a little bone biscuit
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.fillStyle = '#9a6a3c'; for (const [a, b] of [[-1, -0.55], [-1, 0.55], [1, -0.55], [1, 0.55]]) { ctx.beginPath(); ctx.arc(a * s * 0.95, b * s * 0.62, s * 0.52, 0, 7); ctx.fill(); }
  ctx.fillRect(-s, -s * 0.42, s * 2, s * 0.84);
  ctx.fillStyle = '#e9c48c'; for (const [a, b] of [[-1, -0.55], [-1, 0.55], [1, -0.55], [1, 0.55]]) { ctx.beginPath(); ctx.arc(a * s * 0.95, b * s * 0.62, s * 0.4, 0, 7); ctx.fill(); }
  ctx.fillRect(-s, -s * 0.3, s * 2, s * 0.6); ctx.fillStyle = 'rgba(255,245,225,.6)'; ctx.fillRect(-s * 0.8, -s * 0.24, s * 1.4, s * 0.14);
  ctx.restore();
}
function drawFeeds(t) {
  if (!feeds.length) return;
  P();
  for (const f of feeds) {
    const w = f.w, d = f.d, b = w.box, bw = b[2] - b[0], bh = b[3] - b[1], cx = (b[0] + b[2]) / 2, seated = !w.walk && !w.seat.roam, side = f.side;
    for (const c of f.crumbs) { ctx.globalAlpha = Math.min(1, c.life * 2); ctx.fillStyle = '#d7aa6a'; ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(0.6, c.s), 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (f.t < 0 || f.t > FEED.done) continue;
    const sh = [cx + side * bw * (seated ? 0.17 : 0.27), b[1] + bh * (seated ? 0.46 : 0.47)], pk = [cx + side * bw * (seated ? 0.07 : 0.11), b[1] + bh * (seated ? 0.57 : 0.62)];
    const [mx, my] = mouthOf(d), s = Math.max(2.2, dogDims(d)[1] * 0.075), hand = [mx - (d.face < 0 ? -1 : 1) * s * 1.5, my + s * 0.2];
    const T = f.t, E = q => q * q * (3 - 2 * q), lerp2 = (a, c, q) => [a[0] + (c[0] - a[0]) * q, a[1] + (c[1] - a[1]) * q];
    let p, alpha = 1, snack = 0;
    if (T < FEED.pocket) { p = lerp2(sh, pk, E(T / FEED.pocket)); alpha = Math.min(1, T / 0.15); }
    else if (T < FEED.out) p = [pk[0] + Math.sin(T * 28) * s * 0.3, pk[1] + Math.sin(T * 21) * s * 0.2]; // rummaging in the pocket
    else if (T < FEED.mouth) { const q = E((T - FEED.out) / (FEED.mouth - FEED.out)), ctl = [(pk[0] + hand[0]) / 2, Math.min(pk[1], hand[1]) - bh * 0.1];
      p = [(1 - q) * (1 - q) * pk[0] + 2 * (1 - q) * q * ctl[0] + q * q * hand[0], (1 - q) * (1 - q) * pk[1] + 2 * (1 - q) * q * ctl[1] + q * q * hand[1]]; snack = 1; }
    else if (T < FEED.eat) { const bi = Math.min(FEED.bites, Math.floor((T - FEED.mouth - 0.12) / 0.27) + 1); p = [hand[0] + Math.sin((T - FEED.mouth) * 23) * s * 0.12, hand[1]]; snack = [1, 0.68, 0.38, 0][Math.max(0, bi)]; }
    else { const q = E(Math.min(1, (T - FEED.eat) / (FEED.done - FEED.eat))); p = lerp2(hand, sh, q); alpha = 1 - Math.max(0, (q - 0.6) / 0.4); }
    if (f.abort) snack = 0;
    // the arm: shoulder -> elbow (bent out and down a little) -> wrist, a soft dark edge under the sleeve
    const dx = p[0] - sh[0], dy = p[1] - sh[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, bend = Math.min(bh * 0.07, len * 0.22) * (ny > 0 ? 1 : -1) * side;
    const el = [(sh[0] + p[0]) / 2 + nx * bend, (sh[1] + p[1]) / 2 + ny * bend], th = bh * (seated ? 0.05 : 0.055);
    ctx.globalAlpha = alpha; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(20,14,24,.55)'; ctx.lineWidth = th + 1.6; ctx.beginPath(); ctx.moveTo(...sh); ctx.quadraticCurveTo(...el, ...p); ctx.stroke();
    ctx.strokeStyle = sleeveOf(w); ctx.lineWidth = th; ctx.beginPath(); ctx.moveTo(...sh); ctx.quadraticCurveTo(...el, ...p); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = th * 0.35; ctx.beginPath(); ctx.moveTo(sh[0] - nx * th * 0.2, sh[1] - ny * th * 0.2); ctx.quadraticCurveTo(el[0] - nx * th * 0.2, el[1] - ny * th * 0.2, p[0], p[1]); ctx.stroke();
    if (snack > 0) drawBiscuit(p[0] + (d.face < 0 ? 1 : -1) * -s * 0.9, p[1] - s * 0.15, s * 0.62 * snack, -0.35 * (d.face < 0 ? -1 : 1));
    ctx.fillStyle = '#5a3a2c'; ctx.beginPath(); ctx.ellipse(p[0], p[1], th * 0.62, th * 0.55, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#f3c6a2'; ctx.beginPath(); ctx.ellipse(p[0], p[1], th * 0.5, th * 0.45, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,228,.5)'; ctx.beginPath(); ctx.ellipse(p[0] - th * 0.12, p[1] - th * 0.14, th * 0.2, th * 0.13, 0, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }
}
const heartSpr = (() => { const c = mk(48, 48), g = c.getContext('2d'); g.font = '700 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = 'rgba(255,170,190,.9)'; g.shadowBlur = 6; g.fillStyle = '#ff7aa2'; g.fillText('♥', 24, 26); return c; })();
const boneBubble = (() => { const c = mk(96, 72), g = c.getContext('2d'); g.fillStyle = 'rgba(255,255,255,.94)'; g.strokeStyle = 'rgba(60,40,50,.35)'; g.lineWidth = 2;
  g.beginPath(); g.roundRect(8, 4, 80, 46, 22); g.fill(); g.stroke(); for (const [x, y, r] of [[30, 56, 6], [20, 66, 4]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.stroke(); }
  g.save(); g.translate(48, 27); g.rotate(-0.25); g.fillStyle = '#c99858'; for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) { g.beginPath(); g.arc(a * 17, b * 6, 7, 0, 7); g.fill(); } g.fillRect(-17, -5, 34, 10);
  g.fillStyle = '#efd09c'; for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) { g.beginPath(); g.arc(a * 17, b * 6, 5.4, 0, 7); g.fill(); } g.fillRect(-17, -3.6, 34, 7.2); g.restore(); return c; })();

// ---------- boss desk FX: screen glow, scanline shimmer on the 2 curved monitors ----------
const scanSpr = (() => { const c = mk(64, 128), g = c.getContext('2d');
  for (let y = 0; y < 128; y += 2) { g.fillStyle = 'rgba(200,230,255,.10)'; g.fillRect(0, y, 64, 1); }
  for (const y0 of [24, 88]) { const gr = g.createLinearGradient(0, y0, 0, y0 + 16); gr.addColorStop(0, 'rgba(210,235,255,0)'); gr.addColorStop(0.5, 'rgba(210,235,255,.5)'); gr.addColorStop(1, 'rgba(210,235,255,0)'); g.fillStyle = gr; g.fillRect(0, y0, 64, 16); }
  return c; })();
function drawBossFx(t) {
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < bossMon.length; i++) {
    const Q = bossMon[i], [TL, TR, BR, BL] = Q, cx = (TL[0] + BR[0]) / 2, cy = (TL[1] + BR[1]) / 2, w = TR[0] - TL[0];
    P(); ctx.save(); polyPath(ctx, bossClip[i]); ctx.clip(); ctx.globalAlpha = (0.12 + 0.05 * Math.sin(t * 1.3 + i * 2.1)) * (0.6 + 0.6 * env.n);
    ctx.drawImage(screenGlow, cx - w * 0.85, cy - w * 0.6, w * 1.7, w * 1.2);
    ctx.setTransform(k * (TR[0] - TL[0]) / 64, k * (TR[1] - TL[1]) / 64, k * (BL[0] - TL[0]) / 64, k * (BL[1] - TL[1]) / 64, offX + k * TL[0], offY + k * TL[1]);
    ctx.globalAlpha = 0.16 + 0.04 * Math.sin(t * 7 + i);
    ctx.drawImage(scanSpr, 0, ((t * 9 + i * 21) % 64), 64, 64, 0, 0, 64, 64); ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
}

// ---------- painter's list (persistent, sorted in place each frame) ----------
const items = [];
function buildItems() {
  items.length = 0;
  for (const m of monitors) items.push({ k: m.depth, t: 0, r: m });
  for (const o of occluders) items.push({ k: o.depth, t: 1, r: o });
  for (const s of seats) if (s.chair) items.push({ k: s.clip + 0.2, t: 2, r: s });
  for (const w of workers.values()) items.push({ k: 0, t: 3, r: w });
  items.push({ k: 9997, t: 8, r: 'steam' }); for (const n of FRONT()) items.push({ k: 9998, t: 4, r: n });
  items.push({ k: 590, t: 10, r: 'kitchen' }); // the coffee pour: over the painted kitchen, behind the bots standing there
  items.push({ k: 0.5, t: 7, r: 'lounge' }, { k: occluders[0].depth + 1.5, t: 6, r: 'bossfx' });
  for (const d of dogs) items.push({ k: 0, t: 5, r: d });
  PROPS.forEach((p, i) => items.push({ k: p.depth, t: 9, r: { ...p, im: propImgs[i] } })); // extra pictures from config.js
  fullPaint = true;
}
const byKey = (a, b) => a.k - b.k;

// ---------- drawing ----------
const P = () => ctx.setTransform(k, 0, 0, k, offX, offY);
// Dashboards has no turn-atlas row (she lived on the bean bag): at a desk her back picture (dash-back.png) sits like this
const DASH_BUST = { sc: 0.86, neck: 128, axb: 0.5 };
function drawBust(w, t) { // the default pose at the desk: the back bust behind the plate chair's backrest
  const s = w.seat, b = w.bot, im = sprites[w.sprite], sp = L.turn.sprites[w.sprite] || DASH_BUST, bs = s.hsc * sp.sc, ww = im.width * bs, hh = im.height * bs, top = s.neckY - sp.neck * bs, x = s.x;
  const err = b.status === 'error', working = b.status === 'working', h = s.h, B = w.pose.b;
  let dx = 0, dy = Math.sin(t * 1.7 + w.ph) * h * 0.006, rot = 0, sy = 1 + Math.sin(t * 1.7 + w.ph) * 0.008;
  if (working) { dx = Math.sin(t * 23 + w.ph) * h * 0.005; dy += Math.abs(Math.sin(t * 11.5 + w.ph)) * h * 0.006; }
  if (err) { dy += h * 0.06; rot = 0.07 * (w.ph > 3.5 ? 1 : -1); sy *= 0.97; }
  rot += w.tilt * 0.07 + w.look * 0.06 + w.fr; dx += w.tilt * h * 0.012 + w.fx * h; // look around: small head tilt + lean, idle fidgets
  dy -= (w.fsy - 1) * h * 0.45; sy *= w.fsy;
  const pivotY = hh * 0.55;
  P();
  ctx.save(); ctx.beginPath(); ctx.rect(x - ww, top - hh, ww * 2, s.clip - top + hh); ctx.clip();
  ctx.translate(x + dx, top + pivotY + dy); ctx.rotate(rot); ctx.scale(1, sy); ctx.drawImage(im, -ww * sp.axb, -pivotY, ww, hh);
  ctx.restore();
  w.box[0] = x - ww / 2; w.box[1] = top; w.box[2] = x + ww / 2; w.box[3] = s.base;
  w.hx = x; w.hy = top;
}
// The body pictures have an open neck hole under the hood: facing round, it showed whatever was behind the bot (the dark chair and desk) as a
// black band under the chin (David, 2026-11-10). A neck is drawn behind the body, so the hole shows skin, shaded under the chin.
function neck(T, i, f, chatIn, alpha, row) {
  const FR = T.frames, a = FR[i], b = FR[Math.min(5, i + 1)], m = win(f, 0.42, 0.58), lerp = (p, q, u) => p + (q - p) * u;
  const hx = lerp(lerp(a.head[0], b.head[0], m), FR[5].head[0], chatIn) - T.cx, nk = lerp(lerp(a.neck, b.neck, m), FR[5].neck, chatIn), face = Math.min(1, Math.max(0, (i + f - 1.3) / 1.2) + chatIn);
  if (face <= 0.02 || row >= T.sprites.length) return;
  const g = ctx.createLinearGradient(0, nk - 18, 0, nk + 20); g.addColorStop(0, '#9c6a52'); g.addColorStop(0.35, '#c4896a'); g.addColorStop(1, '#d9a080');
  ctx.globalAlpha = alpha * face; ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(hx - 13, nk - 18, 26, 40, 9); ctx.fill(); ctx.globalAlpha = alpha;
}
const win = (v, a, b) => { const u = Math.max(0, Math.min(1, (v - a) / (b - a))); return u * u * (3 - 2 * u); };
function drawFrame(w, t, alpha) { // whole body + swivel chair from the turn atlas; the head is its own layer so it can lead the turn. Poses step (a quick wipe of opaque art over opaque art), they never dissolve through each other
  const s = w.seat, T = L.turn, P2 = w.pose, [cw, ch] = T.cell, [hw, hh] = T.head, row = w.sprite, ts = s.ts, B = Math.min(4, P2.b), i = Math.min(3, B | 0), f = B - i;
  const swing = P2.dur > 0 ? Math.sin(Math.PI * P2.p) : 0, sign = Math.sign(P2.to - P2.from) || 1, nod = P2.nod ? Math.sin(t * 5.5) * 0.04 : 0, up = P2.dir < 0 ? -1 : 1;
  ctx.setTransform(k, 0, 0, k, offX, offY); ctx.translate(s.x + swing * 3 * sign * P2.dir * ts, s.base + Math.sin(t * 1.7 + w.ph) * 0.5 * ts); ctx.scale(up * ts, ts); ctx.translate(0, -T.floor); // scaleX is only ever the mirror
  ctx.translate(0, T.floor * 0.5); ctx.rotate(swing * 0.03 * sign); ctx.translate(0, -T.floor * 0.5); // the weight shifts with the turn
  const stepIn = win(f, 0.4, 0.52), stepOut = win(f, 0.5, 0.62), chatIn = win(P2.chat, 0.44, 0.5), chatOut = win(P2.chat, 0.5, 0.56), sx = j => j * cw, sy = row * ch;
  const body = (j, a) => { if (a > 0.004) { ctx.globalAlpha = alpha * a; ctx.drawImage(turnB, sx(j) * ATL, sy * ATL, cw * ATL, ch * ATL, -T.cx, 0, cw, ch); } };
  neck(T, i, f, chatIn, alpha, w.sprite);
  body(i, (1 - stepOut) * (1 - chatOut)); body(i + 1, stepIn * (1 - chatOut)); body(5, chatIn);
  // the talking pose (5) steps in like the turn frames: it is fully drawn over an opaque old pose before the old one fades. It used to
  // cross-fade (both half see-through), so the desk screen showed through faces and caps whenever a bot started or stopped talking.
  // head: anchored on the neck of the frame on show; the leading angle picks the painted head
  const FR = T.frames, Fa = FR[i], Fb = FR[i + 1], Fc = FR[5], lerp = (a, b, q) => a + (b - a) * q, m = win(f, 0.42, 0.58), hxB = lerp(Fa.head[0], Fb.head[0], m), nkB = lerp(Fa.neck, Fb.neck, m), hx = lerp(hxB, Fc.head[0], chatIn), nk = lerp(nkB, Fc.neck, chatIn) - 2;
  const hB = Math.min(4, P2.hb), hi = Math.min(3, hB | 0), hf = hB - hi, hIn = win(hf, 0.4, 0.52), hOut = win(hf, 0.5, 0.62), hk = T.headScale * (T.sprites[row] || T.sprites[0]).sc, hr = w.tilt * 0.06 + nod * P2.dir + swing * 0.05 * sign;
  ctx.save(); ctx.translate(hx - T.cx, nk); ctx.rotate(hr); ctx.translate(0, nod * 18);
  const dw = hw * hk, dh = hh * hk, [ax, ay] = T.anchor, ox = -ax * hk, oy = -ay * hk;
  const head = (j, a) => { if (a <= 0.004) return; ctx.globalAlpha = alpha * a; if (j === 0 && up < 0) { ctx.save(); ctx.scale(-1, 1); ctx.drawImage(turnH, 0, row * hh * ATL, hw * ATL, hh * ATL, ox, oy, dw, dh); ctx.restore(); } else ctx.drawImage(turnH, j * hw * ATL, row * hh * ATL, hw * ATL, hh * ATL, ox, oy, dw, dh); }; // the back head stays as the bust painted it, on either side
  head(hi, (1 - hOut) * (1 - chatOut)); head(hi + 1, hIn * (1 - chatOut)); head(5, chatIn);
  ctx.restore(); ctx.globalAlpha = 1;
  P();
  w.box[0] = s.x - cw * ts / 2; w.box[1] = s.base + (nk - T.floor - ay * hk) * ts; w.box[2] = s.x + cw * ts / 2; w.box[3] = s.base;
  w.hx = s.x; w.hy = w.box[1];
}
function drawSeated(w, t) {
  const a = w.pose.a, s = w.seat;
  if (a < 1) { drawBust(w, t); if (a > 0) { ctx.setTransform(1, 0, 0, 1, 0, 0); blit(s.patch); } } // patch: the chair's own item is skipped while s.self
  if (a > 0) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = a; blit(s.ncP); ctx.globalAlpha = 1; drawFrame(w, t, a); }
}
// a bean bag: front bust + sitting legs, sunk a little into the bag. `alpha` crossfades with the standing walker
function drawOnBag(w, t, bag, alpha, lean) {
  const im = fronts[w.sprite], sprite = L.sprites[w.sprite], hu = hAt(bag.y) * 0.98 * im.height / 216, ar = im.width / im.height, ww = hu * ar, hem = sprite.hemF, [x, seat] = bag.sit;
  const hip = seat - hu * 0.05 + Math.sin(t * 1.9 + w.ph) * hu * 0.006 + (1 - lean) * hu * 0.16;
  ctx.globalAlpha = alpha; P();
  drawLegSet('sit', 0, x, hip, hip + hu * 0.27, hu, ww, 1);
  ctx.save(); ctx.translate(x, hip + hu * 0.04); ctx.rotate(bag.tilt + Math.sin(t * 0.8 + w.ph) * 0.012); ctx.drawImage(im, -ww * hem[2], -hu * hem[0], ww, hu); ctx.restore();
  ctx.globalAlpha = 1;
  const top = hip + hu * 0.04 - hu * hem[0];
  if (alpha > 0.5) { w.box[0] = x - ww / 2; w.box[1] = top; w.box[2] = x + ww / 2; w.box[3] = hip + hu * 0.27; w.hx = x; w.hy = top; }
}
function drawDash(w, t) { // full-body art on her bean bag: laptop while working, mug when idle
  const s = w.seat, working = busy(w), im = working ? dashImg.laptop : dashImg.mug, Hd = hAt(s.bag.y) * 1.18, Wd = Hd * im.width / im.height, x = s.x + (working ? -6 : 2), y = s.base + Hd * 0.3;
  const bob = working ? Math.abs(Math.sin(t * 10.5 + w.ph)) * Hd * 0.004 : Math.sin(t * 1.5 + w.ph) * Hd * 0.006; // tiny typing bob, or breathing
  P(); ctx.globalAlpha = 0.34; ctx.drawImage(shadowSpr, x - Wd * 0.4, y - Hd * 0.09, Wd * 0.8, Hd * 0.13); ctx.globalAlpha = 1;
  ctx.drawImage(im, x - Wd / 2, y - Hd - bob, Wd, Hd);
  if (working) {
    const [gx, gy] = L.dash.glow, r = Hd * (0.3 + 0.02 * Math.sin(t * 3.1)); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (0.3 + 0.1 * Math.sin(t * 2.2 + w.ph)) * (0.6 + 0.6 * env.n);
    ctx.drawImage(screenGlow, x - Wd / 2 + Wd * gx - r, y - Hd + Hd * gy - r, r * 2, r * 2); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  else curl(x - Wd / 2 + Wd * L.dash.mugAt[0], y - Hd + Hd * L.dash.mugAt[1], 0.75, w.ph, t); // her mug, while it's idle time
  w.box[0] = x - Wd / 2; w.box[1] = y - Hd; w.box[2] = x + Wd / 2; w.box[3] = y; w.hx = x; w.hy = y - Hd;
}
// painted legs (assets/legs.png): cell scaled from the body height, hip line at `hip`, sole on `floor`; waist fits the hoodie hem
function drawLegSet(set, i, x, hip, floor, hu, ww, face) {
  const G = L.legs, [cw, ch] = G.cell, c = G[set][i], foot = G[set + 'Foot'][i], H = (floor - hip) / (foot - G.hip), W = 0.6 * ww / G.waist * Math.min(1, 1.1 * H / (hu * 0.6)), top = hip - G.hip * H;
  if (face > 0) { ctx.save(); ctx.translate(x, 0); ctx.scale(-1, 1); ctx.drawImage(legImg, c[0], c[1], cw, ch, -W / 2, top, W, H); ctx.restore(); } // the sheet faces left
  else ctx.drawImage(legImg, c[0], c[1], cw, ch, x - W / 2, top, W, H);
}
const LEG_H = 0.33; // hip to sole, in upper-body heights
function drawUpper(w, g, front, face, x, hip, hu0, sway, alpha, side) {
  const sprite = L.sprites[w.sprite], S = side && sideImg && L.walkSide.hem[w.sprite];
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, hip + hu0 * 0.035); ctx.rotate(sway); if (face < 0) ctx.scale(-1, 1);
  if (S) { // profile: one cell of walk-side.webp, painted facing right
    const [cw, ch] = L.walkSide.cell, hu = hu0 * ch / 216, ww = hu * cw / ch;
    ctx.drawImage(sideImg, w.sprite * cw, 0, cw, ch, -ww * S[2], -hu * S[0], ww, hu); ctx.restore();
    return hip + hu0 * 0.035 - hu * S[0] + hu * 0.12; // the cell has headroom above the head
  }
  const im = front ? fronts[w.sprite] : sprites[w.sprite], hem = front ? sprite.hemF : sprite.hem, hu = hu0 * im.height / 216, ww = hu * im.width / im.height;
  ctx.drawImage(im, -ww * hem[2], -hu * hem[0], ww, hu);
  ctx.restore();
  return hip + hu0 * 0.035 - hu * hem[0];
}
function drawWalker(w, t, alpha = 1) {
  const g = w.walk, moving = g.phase === 'go' || g.phase === 'back', front = g.front, x = g.x, f = g.y, hu = hAt(f), ww = hu * 0.64, cyc = g.stride / (Math.PI * 2);
  const petting = g.phase === 'petting', crouch = petting ? 0.34 + Math.sin(t * 7) * 0.04 : 0, bag = g.trip?.spot?.bag && g.sitK > 0 ? g.trip.spot : null, sk = bag ? g.sitK * g.sitK * (3 - 2 * g.sitK) : 0;
  let set = front ? 'front' : 'back', i = 0;
  if (moving) { set = g.legs; const n = L.legs[set].length; i = ((cyc * n) % n + n) % n | 0; }
  const bob = moving ? Math.sin(g.stride * 2) * hu * 0.006 : g.phase === 'hang' ? Math.sin(t * 2.3 + w.ph) * hu * 0.005 : Math.sin(t * 2 + w.ph) * hu * 0.004;
  const foot = L.legs[set + 'Foot'][i], ref = L.legs[set === 'side' ? 'sideFoot' : set + 'Foot'][0]; // side frames carry their own hip drop
  const hip = f - hu * LEG_H * (1 - crouch) * (foot - L.legs.hip) / (ref - L.legs.hip) + bob;
  const sway = moving ? Math.sin(g.stride) * 0.03 : g.phase === 'talk' ? Math.sin(t * 3.2) * 0.03 : petting ? 0.16 * g.face + Math.sin(t * 7) * 0.03 : 0;
  if (sk < 1) {
    P(); ctx.globalAlpha = 0.42 * alpha * (1 - sk); ctx.drawImage(shadowSpr, x - ww * 0.42, f - hu * 0.05, ww * 0.84, hu * 0.11);
    ctx.globalAlpha = alpha * (1 - sk); drawLegSet(set, i, x, hip, f, hu, ww, g.face);
    let top;
    if (g.fade > 0 && g.prev) { const m = g.fade / FADE; drawUpper(w, g, g.prev.front, g.prev.face, x, hip, hu, sway, m, g.prev.side && moving); top = drawUpper(w, g, front, g.face, x, hip, hu, sway, 1 - m * 0.5, g.side && moving); }
    else top = drawUpper(w, g, front, g.face, x, hip, hu, sway, 1, g.side && moving);
    if (g.holding && !(g.side && moving)) drawHeld(w, g, x, hip, hu, t);
    ctx.globalAlpha = 1;
    w.box[0] = x - ww / 2; w.box[1] = top; w.box[2] = x + ww / 2; w.box[3] = f;
    w.hx = x; w.hy = top;
  }
  if (bag) drawOnBag(w, t, bag, sk, sk);
  if (g.demo && g.phase !== 'back' && g.phase !== 'sit') { // demo only: the paper note in hand
    ctx.save(); ctx.translate(x + g.face * ww * 0.36, hip - hu * 0.45); ctx.rotate(-0.25 * g.face + Math.sin(t * 6) * 0.08);
    ctx.drawImage(noteSpr, -hu * 0.08, -hu * 0.1, hu * 0.16, hu * 0.2); ctx.restore();
  }
}
function drawWorker(w, t) {
  const g = w.walk, s = w.seat;
  if (s.roam) { if (!g || g.phase === 'rise' || g.phase === 'sit') return drawLoiter(w, t); return drawWalker(w, t); }
  if (s.bag) { if (!g || g.phase === 'rise' || g.phase === 'sit') { drawDash(w, t); return; } return drawWalker(w, t); }
  if (!g || g.phase === 'rise' || g.phase === 'settle') return drawSeated(w, t);
  if (g.phase === 'stand' || g.phase === 'sit') { // dissolve between the chair pose and the standing body, the plate chair comes back under it
    const a = w.pose.a; ctx.setTransform(1, 0, 0, 1, 0, 0); if (a > 0) { ctx.globalAlpha = a; blit(s.ncP); ctx.globalAlpha = 1; drawFrame(w, t, a); }
    return drawWalker(w, t, 1 - a);
  }
  drawWalker(w, t);
}
function drawLoiter(w, t) { // a kitchen bot at its home spot between trips: the full standing body, breathing, now and then looking the other way
  const s = w.seat, x = s.feet[0], f = s.feet[1], hu = hAt(f), ww = hu * 0.64, face = w.dogLook && dogs.some(d => d.by === w) ? w.dogLook : Math.sin(t * 0.11 + w.ph * 3) > 0 ? 1 : -1; // looks at a dog that came to say hi
  const hip = f - hu * LEG_H + Math.sin(t * 2 + w.ph) * hu * 0.004;
  P(); ctx.globalAlpha = 0.42; ctx.drawImage(shadowSpr, x - ww * 0.42, f - hu * 0.05, ww * 0.84, hu * 0.11); ctx.globalAlpha = 1;
  drawLegSet('front', 0, x, hip, f, hu, ww, face);
  const top = drawUpper(w, null, true, face, x, hip, hu, Math.sin(t * 0.9 + w.ph) * 0.015, 1);
  w.box[0] = x - ww / 2; w.box[1] = top; w.box[2] = x + ww / 2; w.box[3] = f; w.hx = x; w.hy = top;
}
// monitors: the content is warped into the glass quad at the screen refresh (true trapezoid in 12 strips: an affine map ignores the 4th corner and spills past the bezel),
// glow included, then cut by a soft rounded mask of the glass. Per frame it is one blit, and nothing leaves the glass.
function glassPath(g, Q, r) {
  g.beginPath(); const n = Q.length;
  for (let i = 0; i < n; i++) { const a = Q[i], b = Q[(i + 1) % n], c = Q[(i + 2) % n], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; if (!i) g.moveTo(mx, my); g.arcTo(b[0], b[1], (b[0] + c[0]) / 2, (b[1] + c[1]) / 2, r); }
  g.closePath();
}
function buildMonitors() {
  for (const m of monitors) {
    const dq = m.q.map(([x, y]) => [offX + x * k, offY + y * k]), bx = Math.floor(Math.min(...dq.map(p => p[0]))) - 1, by = Math.floor(Math.min(...dq.map(p => p[1]))) - 1, W = Math.ceil(Math.max(...dq.map(p => p[0]))) - bx + 2, H = Math.ceil(Math.max(...dq.map(p => p[1]))) - by + 2;
    m.bx = bx; m.by = by; m.dq = dq.map(([x, y]) => [x - bx, y - by]);
    if (!m.wc || m.wc.width !== W || m.wc.height !== H) { free(m.wc); free(m.mask); m.wc = mk(W, H); m.wg = m.wc.getContext('2d'); m.mask = mk(W, H); }
    const g = m.mask.getContext('2d'), r = 2.6 * k; g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H);
    g.fillStyle = '#fff'; glassPath(g, m.dq, r); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.lineJoin = 'round'; g.strokeStyle = 'rgba(0,0,0,.34)'; // feathered edge
    for (const w of [1.6, 0.9]) { g.lineWidth = w * k; glassPath(g, m.dq, r); g.stroke(); }
    if (m.cut) { g.setTransform(k, 0, 0, k, offX - bx, offY - by); polyPath(g, m.cut); g.fillStyle = '#000'; g.fill(); }
  }
}
const lerp2 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], STRIPS = 12;
function warpMonitor(m, t, working, error) {
  const G = m.wg, [TL, TR, BR, BL] = m.dq, W = m.wc.width, H = m.wc.height, strips = qual.lite ? LITE.monitorStrips : STRIPS, sh = m.c.height, sw = m.c.width / strips;
  G.setTransform(1, 0, 0, 1, 0, 0); G.globalCompositeOperation = 'source-over'; G.globalAlpha = m.desk.id === 'boss' ? 0.92 : m.occ || m.wall ? 0.98 : 0.8; G.clearRect(0, 0, W, H);
  for (let i = 0; i < strips; i++) {
    const a = lerp2(TL, TR, i / strips), b = lerp2(TL, TR, (i + 1) / strips), c = lerp2(BL, BR, i / strips), sx = i * sw;
    G.setTransform((b[0] - a[0]) / sw, (b[1] - a[1]) / sw, (c[0] - a[0]) / sh, (c[1] - a[1]) / sh, a[0] - sx * (b[0] - a[0]) / sw, a[1] - sx * (b[1] - a[1]) / sw);
    G.drawImage(m.c, sx, 0, sw + 0.7, sh, sx, 0, sw + 0.7, sh);
  }
  G.setTransform(1, 0, 0, 1, 0, 0); G.globalCompositeOperation = 'lighter'; // the screen's own glow, on the glass
  const r = W * (working ? 0.75 : 0.62); G.globalAlpha = (working ? 0.26 + 0.08 * Math.sin(t * 5 + m.idx) : 0.12) * (0.6 + 0.6 * env.n);
  G.drawImage(error ? redGlow : screenGlow, W / 2 - r, H / 2 - r * 0.8, r * 2, r * 1.6);
  G.globalAlpha = 1; G.globalCompositeOperation = 'destination-in'; G.drawImage(m.mask, 0, 0);
}
// Right-wall bars: fraction of the pool left + fraction of the window left. A reset that has already passed means the reading belongs to a closed window, so the pool bar goes empty
// while the clock still knows the weekly cycle. Nothing here is estimated.
const WEEK = 7 * 864e5, frac = v => Math.max(0, Math.min(1, v));
function poolLeft(used, reset, now) { return used == null || !isFinite(used) || !reset || reset <= now ? null : frac(1 - used / 100); }
function timeLeft(reset, span, now) { if (!reset || !(span > 0)) return null; const r = reset > now ? reset : reset + Math.ceil((now - reset + 1) / span) * span; return frac((r - now) / span); }
function wallBars(id, now) {
  if (id === 'grok') { const u = S?.usage; return u?.available ? [poolLeft(u.used_pct, u.reset, now), timeLeft(u.reset, WEEK, now)] : [null, null]; }
  const c = S?.claude_usage, r = c?.resets_at ? Date.parse(c.resets_at) : 0, s = c?.window_start ? r - Date.parse(c.window_start) : WEEK;
  return c && c.source === 'ratelimit' ? [poolLeft(c.week_pct, r, now), timeLeft(r, s, now)] : [null, null];
}
function drawMonitor(m, t, redraw) {
  if (m.wall) {
    // lite refreshes rarely already, so every lite refresh repaints the bars
    if (redraw && (qual.lite || (m.wt = (m.wt || 0) - 1) <= 0)) { m.wt = 4; const [a, b] = wallBars(m.wall, Date.now()); drawWall(m.g, m.wall === 'grok' ? 'GROK' : 'CLAUDE', a, b, t); D.wall[m.wall] = [a, b]; warpMonitor(m, t, false, false); }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.drawImage(m.wc, m.bx, m.by); return;
  }
  const occ = m.desk.id === 'boss' ? m.desk._boss : m.occ;
  const working = occ?.status === 'working', error = occ?.status === 'error';
  if (redraw) { drawScreen(m.g, m.kind, t + m.idx * 1.3, { accent: m.desk.accent, seed: m.desk.id.length * 7 + m.idx, working, error, portfolio: S?.portfolio, usage: S?.usage, bots: liveBots }); warpMonitor(m, t, working, error); }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.drawImage(m.wc, m.bx, m.by);
}
let liveBots = [];
function refreshOccupants() {
  liveBots = (S?.bots || []).filter(b => b.status !== 'moved_out' && !HIDDEN_IDS.has(b.id));
  for (const m of monitors) m.occ = seats.find(s => s.desk === m.desk && s.idx === m.idx)?.bot;
  for (const d of L.desks) d._boss = seats.find(s => s.desk === d && s.idx === 0)?.bot;
}

// ---------- labels + bubbles: cached bitmaps drawn on the canvas; transparent DOM pills stay as click targets ----------
let labelFont = 0, labelMax = 0, labelCache = new Map(), bubbleCache = new Map();
const maxUsage = () => wl.reduce((a, v) => Math.max(a, Math.round(v.bot.usage_pct || 0)), 0);
function fontSize() {
  const vs = Math.min(innerWidth / 1280, innerHeight / 800);
  return EMBED ? Math.max(11, Math.min(20, 12 * vs)) : Math.max(13, Math.min(26, 15.5 * vs));
}
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
function labelBitmap(w) {
  const b = w.bot, acc = w.seat.desk.accent, mx = labelMax, key = `${w.label}|${b.status}|${acc}|${mx}`;
  let c = labelCache.get(key); if (c) return c;
  // two rows: name on top, `1.4d · 18%` underneath in a smaller font (about half the width of one row)
  const f = labelFont, S2 = dpr * qual.scale, fp = f * S2, fs = fp * 0.7, pad = fp * 0.55, dot = fp * 0.42, r1 = fp * 1.12, r2 = fs * 1.2, hgt = Math.round(r1 + r2 + fp * 0.28);
  const m = mk(1, 1).getContext('2d');
  const name = b.name, rest = w.label.slice(name.length + 3), k = rest.indexOf(' · '), tm = k < 0 ? rest : rest.slice(0, k), pc = k < 0 ? '' : rest.slice(k);
  m.font = `700 ${fp}px ${SANS}`; const nw = m.measureText(name).width;
  m.font = `600 ${fs}px ${SANS}`; const tw = m.measureText(tm).width, w2 = tw + m.measureText(pc).width;
  const W = Math.round(pad * 2 + dot + fp * 0.38 + Math.max(nw, w2)), sh = Math.ceil(fp * 0.5), rad = Math.min(hgt / 2, fp * 0.62);
  c = mk(W + sh * 2, hgt + sh * 2); const g = c.getContext('2d');
  const col = b.status === 'error' ? [255, 122, 102] : b.status === 'working' ? [166, 214, 126] : hexRgb(acc);
  g.translate(sh, sh);
  g.shadowColor = 'rgba(8,4,14,.55)'; g.shadowBlur = sh; g.shadowOffsetY = sh * 0.3;
  g.fillStyle = b.status === 'error' ? 'rgba(70,18,22,.86)' : 'rgba(20,16,32,.82)'; g.beginPath(); g.roundRect(0, 0, W, hgt, rad); g.fill();
  g.shadowColor = 'transparent';
  const sheen = g.createLinearGradient(0, 0, 0, hgt); sheen.addColorStop(0, 'rgba(255,255,255,.16)'); sheen.addColorStop(0.5, 'rgba(255,255,255,.03)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sheen; g.beginPath(); g.roundRect(0, 0, W, hgt, rad); g.fill();
  g.strokeStyle = `rgba(${col},.95)`; g.lineWidth = Math.max(1, S2 * 1.3); g.beginPath(); g.roundRect(0.5 * g.lineWidth, 0.5 * g.lineWidth, W - g.lineWidth, hgt - g.lineWidth, rad); g.stroke();
  const y1 = fp * 0.14 + r1 / 2, y2 = fp * 0.14 + r1 + r2 / 2 - fs * 0.04;
  const dx = pad + dot / 2, dy = y1, gl = g.createRadialGradient(dx, dy, 0, dx, dy, dot * 1.3);
  gl.addColorStop(0, `rgba(${col},.9)`); gl.addColorStop(0.45, `rgba(${col},.5)`); gl.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = gl; g.fillRect(dx - dot * 1.3, dy - dot * 1.3, dot * 2.6, dot * 2.6);
  g.fillStyle = `rgb(${col})`; g.beginPath(); g.arc(dx, dy, dot / 2, 0, 7); g.fill();
  g.textBaseline = 'middle';
  const tx = pad + dot + fp * 0.38;
  g.font = `700 ${fp}px ${SANS}`;
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillText(name, tx, y1 + S2 * 1.1);
  g.fillStyle = '#fff8ec'; g.fillText(name, tx, y1 + S2 * 0.2);
  g.font = `600 ${fs}px ${SANS}`; // row 2: coloured age, then cream % of this week's pool
  g.fillStyle = 'rgba(0,0,0,.5)'; g.fillText(tm + pc, tx, y2 + S2 * 0.9);
  g.fillStyle = ageColor(b.last_active); g.fillText(tm, tx, y2);
  if (pc) { const sep = ' · ', sw = m.measureText(sep).width, u = mx > 0 ? Math.min(1, Math.round(b.usage_pct || 0) / mx) : 0; g.fillStyle = 'rgba(255,226,196,.82)'; g.fillText(sep, tx + tw, y2); g.fillStyle = `hsl(${(120 * (1 - u)).toFixed(0)},80%,${(62 - 4 * Math.sin(Math.PI * u)).toFixed(0)}%)`; g.fillText(pc.slice(3), tx + tw + sw, y2); } // % of week: green 0% to red for the top user
  c.pad = sh; labelCache.set(key, c); return c;
}
function bubbleBitmap(text, talk) {
  const key = (talk ? 'T|' : 'W|') + text;
  let c = bubbleCache.get(key); if (c) return c;
  const S2 = dpr * qual.scale, fp = labelFont * 0.92 * S2, pad = fp * 0.7, hgt = Math.round(fp * 1.85), tail = fp * 0.55, sh = Math.ceil(fp * 0.6);
  const m = mk(1, 1).getContext('2d'); m.font = `600 ${fp}px ${SANS}`;
  let s = text; while (m.measureText(s).width > fp * 15 && s.length > 4) s = s.slice(0, -2);
  if (s !== text) s = s.trimEnd() + '…';
  const W = Math.round(m.measureText(s).width + pad * 2);
  c = mk(W + sh * 2, hgt + tail + sh * 2); const g = c.getContext('2d'); g.translate(sh, sh);
  const path = () => { g.beginPath(); g.roundRect(0, 0, W, hgt, hgt * 0.42); g.moveTo(W / 2 - tail * 0.8, hgt - 1); g.quadraticCurveTo(W / 2 - tail * 0.1, hgt + tail * 0.4, W / 2 - tail * 0.35, hgt + tail); g.quadraticCurveTo(W / 2 + tail * 0.5, hgt + tail * 0.2, W / 2 + tail * 0.8, hgt - 1); g.closePath(); };
  g.shadowColor = 'rgba(30,10,30,.45)'; g.shadowBlur = sh; g.shadowOffsetY = sh * 0.35;
  const bg = g.createLinearGradient(0, 0, 0, hgt); bg.addColorStop(0, talk ? 'rgba(255,250,240,.96)' : 'rgba(255,246,228,.94)'); bg.addColorStop(1, talk ? 'rgba(246,228,236,.94)' : 'rgba(240,226,206,.92)');
  g.fillStyle = bg; path(); g.fill(); g.shadowColor = 'transparent';
  g.strokeStyle = talk ? 'rgba(232,128,160,.55)' : 'rgba(166,214,126,.6)'; g.lineWidth = Math.max(1, S2); path(); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.roundRect(hgt * 0.25, 2 * S2, W - hgt * 0.5, hgt * 0.22, hgt * 0.11); g.fill();
  g.font = `600 ${fp}px ${SANS}`; g.textBaseline = 'middle'; g.fillStyle = '#3a2438'; g.fillText(s, pad, hgt / 2 + S2 * 0.5);
  c.pad = sh; bubbleCache.set(key, c); return c;
}
const order = [];
const bubbleText = w => w.walk ? (w.walk.phase === 'talk' ? w.walk.note : w.walk.say) : w.sayNow || (w.bot.status === 'working' ? (w.bot.task || 'working…') : null);
function layoutLabels() {
  const f = fontSize();
  if (f !== labelFont) { labelFont = f; labelCache.clear(); bubbleCache.clear(); }
  order.length = 0;
  for (let i = 0; i < wl.length; i++) {
    const w = wl[i];
    const bm = labelBitmap(w);
    w.lw = bm.width - bm.pad * 2; w.lh = bm.height - bm.pad * 2;
    w.lx = offX + w.hx * k - w.lw / 2; w.ly = offY + w.hy * k - w.lh - 3 * dpr;
    if (w.seat.desk.id === 'numbers' && !w.walk) w.ly = Math.min(w.ly, offY + 504 * k - w.lh); // above the monitors: the portfolio total needs the top of its glass
    const m = 5 * dpr * qual.scale; w.lx = Math.max(m, Math.min(cv.width - w.lw - m, w.lx)); // tags at the screen edges stay fully on screen
    const bt = bubbleText(w); w.bh = bt ? bubbleBitmap(bt, !!w.walk || !!w.sayNow).height * 0.9 : 0; // the bubble sits on top of the tag
    order.push(w);
  }
  // stagger: never overlap a neighbour's tag (push the later one up)
  order.sort((a, b) => b.ly - a.ly || a.lx - b.lx);
  for (let i = 0; i < order.length; i++) {
    const a = order[i];
    for (let pass = 0; pass < 4; pass++) {
      let hit = false;
      for (let j = 0; j < i; j++) {
        const b = order[j];
        if (a.lx < b.lx + b.lw + 4 && b.lx < a.lx + a.lw + 4 && a.ly - a.bh < b.ly + b.lh + 3 && b.ly - b.bh < a.ly + a.lh + 3) { a.ly = b.ly - b.bh - a.lh - 3; hit = true; }
      }
      if (!hit) break;
    }
  }
}
function drawLabel(w) {
  const bm = labelBitmap(w);
  ctx.drawImage(bm, Math.round(w.lx - bm.pad), Math.round(w.ly - bm.pad));
  const text = bubbleText(w);
  if (text) { const bb = bubbleBitmap(text, !!w.walk || !!w.sayNow), bx = Math.max(0, Math.min(cv.width - bb.width, w.lx + w.lw / 2 - bb.width / 2)); ctx.drawImage(bb, Math.round(bx), Math.round(w.ly - bb.height + bb.pad * 0.6)); }
}
function syncTag(w) { // DOM hit target follows the bitmap (only touched when it moves)
  const css = 1 / (dpr * qual.scale), X = (w.lx * css).toFixed(1), Y = (w.ly * css).toFixed(1);
  if (w._x !== X || w._y !== Y || w._w !== w.lw) {
    w._x = X; w._y = Y; w._w = w.lw;
    w.tag.style.transform = `translate(${X}px,${Y}px)`;
    const t = w.tag.firstChild; t.style.width = (w.lw * css).toFixed(1) + 'px'; t.style.height = (w.lh * css).toFixed(1) + 'px';
  }
  const tk = `${w.label}|${w.bot.status}`;
  if (w.tag._k !== tk) { w.tag._k = tk; w.tag.firstChild.firstChild.textContent = w.label; w.tag.firstChild.className = 'tag ' + w.bot.status; }
}
function drawLabels() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < order.length; i++) { drawLabel(order[i]); syncTag(order[i]); }
}
const lampTint = l => { if (!l.desk) return null; const s = seats.find(s => s.desk.id === l.desk && s.bot); return s && s.bot.status === 'error' ? redGlow : null; };

function sortItems() { // painter's order by plate depth; returns how many are on the move
  let walking = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.t !== 3) continue;
    const w = it.r, g = w.walk, s = w.seat;
    if (s.bag && (!g || g.phase === 'rise' || g.phase === 'sit')) { it.k = s.bag.depth + 1; if (g) walking++; continue; }
    if (s.roam && (!g || g.phase === 'rise' || g.phase === 'sit')) { it.k = zoneKey(s.feet[0], s.feet[1], hAt(s.feet[1]) * 0.32); if (g) walking++; continue; }
    if (!g) it.k = s.clip + 0.1; // behind its own chair back (the bust), or carrying its own chair (turn frames)
    else {
      walking++;
      const b = g.trip?.spot?.bag ? g.trip.spot : null;
      if (g.phase === 'rise' || g.phase === 'stand' || g.phase === 'sit' || g.phase === 'settle') it.k = s.clip + 0.1;
      else if (b && g.phase === 'hang') it.k = b.depth + 1;
      else it.k = zoneKey(g.x, g.y, hAt(g.y) * 0.32);
    }
  }
  D.walking = walking;
  for (let i = 0; i < items.length; i++) if (items[i].t === 5) items[i].k = zoneKey(items[i].r.x, items[i].r.y, hAt(items[i].r.y) * 0.27 * DOG.size);
  items.sort(byKey);
  return walking;
}
function drawItem(it, t, redraw) {
  switch (it.t) {
    case 0: drawMonitor(it.r, t, redraw); break;
    case 1: ctx.setTransform(1, 0, 0, 1, 0, 0); blit(it.r.patch); break;
    case 2: if (!it.r.self) { ctx.setTransform(1, 0, 0, 1, 0, 0); blit(it.r.patch); } break;
    case 3: drawWorker(it.r, t); break;
    case 4: ctx.setTransform(1, 0, 0, 1, 0, 0); blit(over[it.r]); break;
    case 5: drawDog(it.r, t); break;
    case 6: drawBossFx(t); break;
    case 7: drawLounge(t); break;
    case 8: drawSteam(t); break;
    case 9: { const p = it.r; P(); ctx.drawImage(p.im, p.x, p.y, p.w, p.h); break; }
    case 10: drawKitchen(t); break;
  }
}
function drawErrorGlows(t, R) {
  P();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < wl.length; i++) { const w = wl[i]; if (w.bot.status !== 'error' || w.walk) continue;
    const s = w.seat, r = s.h * (0.55 + 0.08 * Math.sin(t * 3));
    if (R && !overlap(glowBox(s), R)) continue;
    ctx.globalAlpha = 0.55; ctx.drawImage(redGlow, s.x + s.h * 0.35 - r, s.top + s.h * 0.35 - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
}
let screenT = 0;
function render(t, dt) {
  rebuildBase(bkkHour());
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(base, 0, 0);
  // city: far FX -> skyline from the plate -> near FX -> window frame + vines from the plate
  const tf = PROF ? performance.now() : 0;
  P(); fx.far(ctx, t, dt, env);
  ctx.setTransform(1, 0, 0, 1, 0, 0); blit(over.sky);
  const tn = PROF ? performance.now() : 0;
  P(); fx.near(ctx, t, dt, env);
  if (PROF) { const n = performance.now(); D.prof = D.prof || { far: 0, near: 0 }; D.prof.far = D.prof.far * 0.95 + (tn - tf) * 0.05; D.prof.near = D.prof.near * 0.95 + (n - tn) * 0.05; }
  ctx.setTransform(1, 0, 0, 1, 0, 0); blit(over.fg);
  const redraw = (screenT -= dt) <= 0; if (redraw) screenT = 0.12;
  const walking = sortItems();
  for (let i = 0; i < items.length; i++) drawItem(items[i], t, redraw);
  drawFeeds(t);
  drawErrorGlows(t);
  fx.lamps(ctx, t, env, lampTint);
  fx.motes(ctx, t, dt, env);
  if (layoutDirty || walking) { layoutLabels(); layoutDirty = false; }
  if (!NOTAGS) drawLabels();
}

// ---------- lite: the same scene for weak devices (smart TVs). A frame repaints only the rectangles that changed, using the same drawing
// code, depth order and labels as the full picture. The city is drawn to its own cached canvas every LITE.cityEvery seconds, and one patch
// of the room is refreshed per frame, so seated bots and monitors update a few times a second while walkers stay smooth. ----------
let cityC = null, cityG = null, cityBox = null, cityT = 0, cityDt = 0, slices = [], sliceI = 0, sliceT = 0;
const dirty = [], FULL = [0, 0, 0, 0];
const dev = (x0, y0, x1, y1) => [offX + x0 * k, offY + y0 * k, offX + x1 * k, offY + y1 * k];
const overlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const union = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
const clampBox = b => { const x0 = Math.max(0, Math.floor(b[0])), y0 = Math.max(0, Math.floor(b[1])), x1 = Math.min(cv.width, Math.ceil(b[2])), y1 = Math.min(cv.height, Math.ceil(b[3])); return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null; };
const patchBox = p => [p.x, p.y, p.x + p.c.width, p.y + p.c.height];
const glowBox = s => { const r = s.h * 0.64, x = s.x + s.h * 0.35, y = s.top + s.h * 0.35; return dev(x - r, y - r, x + r, y + r); };
function staticBox(it) {
  const r = it.r;
  switch (it.t) {
    case 0: return [r.bx, r.by, r.bx + r.wc.width, r.by + r.wc.height];
    case 1: case 2: return r.patch ? patchBox(r.patch) : null;
    case 4: return patchBox(over[r]);
    case 7: return dev(CK.x - 30, CK.y - 30, CK.x + CK.w + 30, CK.y + CK.h + 30);
    case 9: return dev(r.x, r.y, r.x + r.w, r.y + r.h);
    case 10: return dev(0, 425, 180, 520);
    default: return null; // steam and monitor shimmer are left out of lite
  }
}
function workerBox(w) { const b = w.box, a = dev(b[0] - 14, b[1] - 14, b[2] + 14, b[3] + 14); return w.bot.status === 'error' && !w.walk ? union(a, glowBox(w.seat)) : a; }
function moverBox(w) { // generous box round a bot that is turning or walking, computed before it is drawn
  const g = w.walk, s = w.seat, half = s.ts ? L.turn.cell[0] * s.ts * 0.56 : s.h * 0.8, seat = dev(s.x - half, s.top - s.h * 0.5, s.x + half, s.base + 12);
  if (!g || g.phase === 'rise' || g.phase === 'settle') return seat;
  const hu = hAt(g.y), body = dev(g.x - hu * 0.7, g.y - hu * 1.5, g.x + hu * 0.7, g.y + hu * 0.14), bag = g.trip?.spot?.bag ? g.trip.spot : null;
  if (bag) return union(body, dev(bag.sit[0] - hu * 0.8, bag.sit[1] - hu * 1.2, bag.sit[0] + hu * 0.8, bag.sit[1] + hu * 0.4));
  return g.phase === 'stand' || g.phase === 'sit' ? union(body, seat) : body;
}
// only things really in motion repaint every frame; a bot standing in the lounge or holding a pose is refreshed with its patch of the room
const STILL_WALK = { hang: 1, talk: 1, petting: 1 };
const moving = w => { const g = w.walk, P = w.pose; if (g) return !STILL_WALK[g.phase] || (g.sitK > 0 && g.sitK < 1); return P.dur > 0 || (P.a > 0 && P.a < 1); };
const dogMoving = d => d.pose === 'walk' || d.pose === 'happy';
function mergeDirty(list) { // overlapping or neighbouring rectangles become one, so nothing is painted twice
  const size = b => (b[2] - b[0]) * (b[3] - b[1]);
  for (let i = 0; i < list.length; i++) for (let j = list.length - 1; j > i; j--) {
    const u = union(list[i], list[j]);
    if (size(u) <= (size(list[i]) + size(list[j])) * 1.25) { list[i] = u; list.splice(j, 1); j = list.length; }
  }
}
function dogBox(d) { const C = L.corgi, hu = hAt(d.y), W = 0.507 * DOG.size * hu / C.bodyW, H = W * C.cell[1] / C.cell[0]; return dev(d.x - W * 0.66, d.y - H * 1.18, d.x + W * 0.66, d.y + H * 0.14); } // the sprite, its hop and its shadow; lite repaints this every frame while the dog moves
function labelBox(w) {
  const bm = labelBitmap(w), x = Math.round(w.lx - bm.pad), y = Math.round(w.ly - bm.pad); let b = [x - 1, y - 1, x + bm.width + 1, y + bm.height + 1];
  const text = bubbleText(w);
  if (text) { const bb = bubbleBitmap(text, !!w.walk || !!w.sayNow), bx = Math.round(Math.max(0, Math.min(cv.width - bb.width, w.lx + w.lw / 2 - bb.width / 2))), by = Math.round(w.ly - bb.height + bb.pad * 0.6); b = union(b, [bx - 1, by - 1, bx + bb.width + 1, by + bb.height + 1]); }
  w.lt = text; return b;
}
function buildLite() {
  const [x0, y0, x1, y1] = L.masks.fg;
  cityBox = clampBox(dev(x0 * PW, y0 * PH, x1 * PW, y1 * PH));
  const W = cityBox[2] - cityBox[0], H = cityBox[3] - cityBox[1];
  if (!cityC || cityC.width !== W || cityC.height !== H) { cityC = mk(W, H); cityG = cityC.getContext('2d', { alpha: false }); }
  slices = [];
  const cols = LITE.sliceCols, rows = LITE.sliceRows, sw = cv.width / cols, sh = cv.height / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const s = clampBox([c * sw, r * sh, (c + 1) * sw, (r + 1) * sh]); if (s[0] < cityBox[0] || s[1] < cityBox[1] || s[2] > cityBox[2] || s[3] > cityBox[3]) slices.push(s); }
  for (const it of items) if (it.t !== 3 && it.t !== 5) it.b = staticBox(it);
  for (const w of wl) { w.db = null; w.lb = null; }
  cityT = 0;
}
function renderCity(t, dt) {
  const g = cityG, [bx, by, bx1, by1] = cityBox, W = bx1 - bx, H = by1 - by;
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.drawImage(base, bx, by, W, H, 0, 0, W, H);
  g.setTransform(k, 0, 0, k, offX - bx, offY - by); fx.far(g, t, dt, env);
  g.setTransform(1, 0, 0, 1, -bx, -by); g.drawImage(over.sky.c, over.sky.x, over.sky.y);
  g.setTransform(k, 0, 0, k, offX - bx, offY - by); fx.near(g, t, dt, env);
  g.setTransform(1, 0, 0, 1, -bx, -by); g.globalAlpha = 1; g.drawImage(over.fg.c, over.fg.x, over.fg.y);
}
function paintRect(R, all, t) {
  const [x, y, x1, y1] = R, w = x1 - x, h = y1 - y, c = cityBox;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(base, x, y, w, h, x, y, w, h);
  if (overlap(c, R)) { const ix = Math.max(x, c[0]), iy = Math.max(y, c[1]), iw = Math.min(x1, c[2]) - ix, ih = Math.min(y1, c[3]) - iy; ctx.drawImage(cityC, ix - c[0], iy - c[1], iw, ih, ix, iy, iw, ih); }
  for (let i = 0; i < items.length; i++) {
    const it = items[i], b = it.t === 3 ? workerBox(it.r) : it.t === 5 ? dogBox(it.r) : it.b;
    if (!b || !(all || overlap(b, R))) continue;
    if (it.t === 7) drawClock(t); else { drawItem(it, t, it.t === 0 && (all || it.r.due)); if (it.t === 0) it.r.due = false; } // a full paint fills every monitor at once (they were blank until their patch came round)
  }
  drawErrorGlows(t, all ? null : R);
  if (!NOTAGS) { ctx.setTransform(1, 0, 0, 1, 0, 0); for (let i = 0; i < order.length; i++) { const o = order[i]; if (o.lb && (all || overlap(o.lb, R))) drawLabel(o); } }
  ctx.restore();
}
function renderLite(t, dt) {
  rebuildBase(bkkHour());
  sortItems(); const full = fullPaint;
  if (full) { buildLite(); layoutDirty = true; }
  dirty.length = 0;
  let movers = 0;
  for (let i = 0; i < wl.length; i++) {
    const w = wl[i];
    if (moving(w)) { const b = moverBox(w); dirty.push(w.db ? union(w.db, b) : b); w.db = b; movers++; }
    else if (w.db) { dirty.push(w.db); w.db = null; }
  }
  for (const d of dogs) {
    if (d.pose === 'happy' && (d.lt = (d.lt || 0) + dt) < 0.1) continue; // lite: the happy wiggle updates 10 times a second, walking every frame
    d.lt = 0;
    if (dogMoving(d)) { const b = dogBox(d); dirty.push(d.db ? union(d.db, b) : b); d.db = b; }
    else if (d.db) { dirty.push(d.db, dogBox(d)); d.db = null; }
  }
  if (KIT.live > 0) { // the coffee task: only the mug changes; the whole corner (with the bot turning) at the start and the end
    KIT.live -= dt; const k = kitTask();
    if (!k || k.t < 0.3) dirty.push(dev(0, 420, 185, 640)); else dirty.push(dev(100, 432, 156, 498));
  }
  cityDt += dt;
  if ((cityT -= dt) <= 0) { cityT = LITE.cityEvery; renderCity(t, cityDt); cityDt = 0; dirty.push(cityBox); }
  if ((sliceT -= dt) <= 0 && slices.length) {
    sliceT = LITE.sliceEvery;
    const s = slices[sliceI++ % slices.length];
    // a screen whose centre is in this slice is redrawn whole: repainting only the slice left half of it new and half old (David saw
    // screens "partially" updating on the TV)
    for (const m of monitors) if (m.bx + m.wc.width / 2 >= s[0] && m.bx + m.wc.width / 2 < s[2] && m.by + m.wc.height / 2 >= s[1] && m.by + m.wc.height / 2 < s[3]) { m.due = true; dirty.push([m.bx - 1, m.by - 1, m.bx + m.wc.width + 1, m.by + m.wc.height + 1]); }
    dirty.push(s);
  }
  if (layoutDirty || movers) {
    layoutLabels(); layoutDirty = false;
    for (let i = 0; i < wl.length; i++) {
      const w = wl[i], b = labelBox(w);
      if (!w.lb || b[0] !== w.lb[0] || b[1] !== w.lb[1] || b[2] !== w.lb[2] || b[3] !== w.lb[3] || w.lt !== w.lt0) { dirty.push(w.lb ? union(w.lb, b) : b); w.lb = b; w.lt0 = w.lt; syncTag(w); }
    }
  }
  if (full) { fullPaint = false; paintRect([0, 0, cv.width, cv.height], true, t); layoutDirty = true; return; } // labels sit on the bots, which have only just been drawn
  let area = 0;
  mergeDirty(dirty);
  for (let i = 0; i < dirty.length; i++) { const c = clampBox(dirty[i]); if (c) { paintRect(c, false, t); area += (c[2] - c[0]) * (c[3] - c[1]); } }
  D.liteStats = { rects: dirty.length, screens: +(area / (cv.width * cv.height)).toFixed(2) }; // screens: how many screenfuls were repainted this frame
}

// ---------- input ----------
const toPlate = ev => [(ev.clientX * dpr * qual.scale - offX) / k, (ev.clientY * dpr * qual.scale - offY) / k];
const hit = ev => { const [x, y] = toPlate(ev); let best = null; for (const w of workers.values()) { const b = w.box; if (b && x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && (!best || b[3] > best.box[3])) best = w; } return best; };
cv.addEventListener('click', ev => { if (!S) return; const w = hit(ev); if (w) showCard(S, w.bot.id, [ev.clientX, ev.clientY], deskInfo); else hideCard(); });
cv.addEventListener('mousemove', ev => { cv.style.cursor = hit(ev) ? 'pointer' : 'default'; });
const mb = document.getElementById('music');
mb.onclick = () => { const on = window.AC.music.toggle(); mb.setAttribute('aria-pressed', on); mb.textContent = on ? '♪ lofi on' : '♪ lofi off'; };

// ---------- loop: one rAF, delta time, display rate, adaptive quality, paused while hidden ----------
let warmT = performance.now(), autoLite = 0, backFor = 0; document.addEventListener('visibilitychange', () => { warmT = performance.now(); });
let booted = false, rescued = false, labelT = LABEL_EVERY, raf = 0, last = 0, fpsN = 0, fpsT = 0, t = 0, lowFor = 0, highFor = 0, slowFor = 0, lastQChange = 0;
const PROF = q.has('prof'); // ?prof=1: time the city layers (check aid)
const STATS = q.has('stats'); fpsEl.hidden = !STATS; // ?stats=1 shows the speed on screen, for checking a real TV
const applyFx = () => fx.setQuality(qual.fx, qual.lite ? LITE.cityShare : 1);
function setQuality(lv, now) {
  qual = QUALITY[lv]; D.quality = qual; applyFx(); lastQChange = now; if (qual.lite) shrinkForLite(); else if (plates && plates.small) unshrink(); resize();
}
// back from lite to the full picture (a computer that had only been paused): the full-size room pictures and pose sheets come back
function unshrink() {
  Promise.all([img('plate-dusk.webp'), img('plate-night.webp'), img(L.turn.bodies), img(L.turn.heads)])
    .then(([d, n, b, h]) => { if (qual.lite) return; plates = { dusk: d, night: n }; turnB = b; turnH = h; ATL = 1; baseKey = ''; hiLoading = false; maybeHi(); }).catch(() => {});
}
// lite draws at most 1280 wide, so the 2560-wide room pictures and the pose sheets only cost memory at full size there.
// Shrinks them once (about 42 MB less on a TV); the originals are released. A TV stays in lite; a computer that only fell into lite
// while its window was paused goes back to the full picture (unshrink).
function shrinkForLite() {
  if (!plates || plates.small) return;
  const shrink = (im, w, h) => { const c = mk(w, h), g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, w, h); return c; };
  const old = [plates.dusk, plates.night, turnB, turnH];
  plates = { dusk: shrink(plates.dusk, PW, PH), night: shrink(plates.night, PW, PH), small: true };
  turnB = shrink(turnB, Math.round(turnB.width / 2), Math.round(turnB.height / 2)); turnH = shrink(turnH, Math.round(turnH.width / 2), Math.round(turnH.height / 2)); ATL = 0.5;
  for (const i of old) { const n = IMGS.indexOf(i); if (n >= 0) IMGS.splice(n, 1); if (i.src) i.src = ''; }
  baseKey = '';
}
function frame(now) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(qual.lite ? LITE.maxStep : 0.1, (now - (last || now)) / 1000); last = now; t += dt;
  for (let i = 0; i < wl.length; i++) {
    const w = wl[i];
    if (w.walk) stepWalk(w, dt);
    stepPose(w, dt); stepFidget(w, dt);
    if ((w.tiltT -= dt) <= 0) { w.tiltT = 6 + rnd() * 10; w.tiltDir = rnd() < 0.5 ? -1 : 1; w.tiltA = 0; }
    w.tiltA += dt; w.tilt = w.tiltA < 1.8 ? Math.sin(w.tiltA / 1.8 * Math.PI) * w.tiltDir : 0;
  }
  maybeDemo(t); if (pending.length) pump(now);
  stepChat(dt); stepAmbient(dt);
  if (dogs.length) { for (const d of dogs) { dog = d; stepDog(dt); } dog = dogs[0]; stepFeeds(dt); }
  if ((labelT -= dt) <= 0) { labelT = LABEL_EVERY; refreshLabels(); }
  const r0 = performance.now();
  if (qual.lite) renderLite(t, dt); else render(t, dt);
  D.ms = +((D.ms || 0) * 0.95 + (performance.now() - r0) * 0.05).toFixed(2); // average time spent drawing a frame (check aid: __office2d.ms)
  fpsN++; D.frames++;
  if (now - fpsT >= 1000) {
    const fps = fpsN * 1000 / (now - fpsT);
    D.turned = wl.filter(w => w.pose.b > 1).length;
    D.fps = window.__fps = Math.round(fps); fpsEl.textContent = STATS ? `${D.fps} fps · ${qual.lite ? 'lite' : 'full ' + qual.level} · ${cv.width}x${cv.height}` : D.fps + ' fps'; fpsN = 0; fpsT = now;
    // only a truly weak device goes to lite (its city moves in steps): a steady low rate while the page is on screen and warmed up
    // (David, 2026-11-11: a fast PC had fallen into lite and the cars, boats and planes jumped). A rate under LITE.throttledFps is the browser pausing a covered or background window, not a slow computer: it never counts.
    // Lite is never remembered for the next visit (only TV browsers start in it), and a computer that recovers goes back to full.
    const throttled = fps < LITE.throttledFps || document.hidden || now - warmT < LITE.warmup * 1000;
    if (!q.has('q') && !qual.lite) {
      slowFor = !throttled && fps < LITE.enterFps ? slowFor + 1 : 0;
      if (slowFor >= LITE.enterSeconds) { slowFor = 0; autoLite++; setQuality(QUALITY.findIndex(l => l.lite), now); }
    }
    if (!q.has('q') && qual.lite && autoLite && autoLite < 3 && !TV) { // fell into lite on its own: try full again once it runs fast
      backFor = !throttled && fps >= LITE.leaveFps ? backFor + 1 : 0;
      if (backFor >= LITE.leaveSeconds) { backFor = 0; rescued = false; setQuality(0, now); }
    }
    // lite still too slow on this device: one last step down
    if (!q.has('q') && qual.lite && !rescued) {
      lowFor = !throttled && fps < LITE.rescueFps ? lowFor + 1 : 0;
      if (lowFor >= LITE.rescueSeconds) { rescued = true; lowFor = 0; LITE.sliceEvery *= 2; LITE.cityEvery *= 2; LITE.maxWidth = LITE.rescueWidth; resize(); }
    }
    // adaptive quality: < 50 fps for 2 s steps down (fewer FX, then lower internal resolution); recovers slowly
    if (D.frames > 90 && !q.get('q') && !qual.lite) {
      lowFor = !throttled && fps < 50 ? lowFor + 1 : 0; highFor = fps >= 58 ? highFor + 1 : 0;
      if (lowFor >= 2 && qual.level < 3 && now - lastQChange > 2500) { setQuality(qual.level + 1, now); lowFor = 0; }
      else if (highFor >= 20 && qual.level > 0 && now - lastQChange > 30000) { setQuality(qual.level - 1, now); highFor = 0; }
    }
  }
  if (S && D.frames > 5) D.ready = true;
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
  else if (booted && !raf) { last = 0; fpsN = 0; fpsT = performance.now(); raf = requestAnimationFrame(frame); } // booted: never start frame before load() has finished
});

if (q.has('diag')) import('./diag.js'); // ?diag=1: device check instead of the office (see diag.js)
else {
  resize();
  load().then(() => fetch(stateUrl(), { credentials: 'same-origin' }))
    .then(r => r.status === 401 ? (location.href = '/login') : r.json())
    .then(s => { if (!s) return; apply(s); connect(); applyFx(); D.quality = qual; fpsT = performance.now(); booted = true; raf = requestAnimationFrame(frame); })
    .catch(e => { console.error(e); setTimeout(() => location.reload(), 15000); });
}
