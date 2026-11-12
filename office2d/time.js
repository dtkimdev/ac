// Bangkok clock (Intl, Asia/Bangkok; ?t=HH:MM override) and the continuous time-of-day state of the painted office:
// sunrise ~06:15, sunset ~18:00. day -> golden dusk (17:00-18:45) -> night -> rosy dawn, as smooth ramps.
const q = new URLSearchParams(location.search);
const tm = (q.get('t') || '').match(/^(\d{1,2}):(\d{2})$/);
export const timeOverride = tm ? (+tm[1] % 24) + +tm[2] / 60 : null;
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
let cacheT = 0, cacheH = 0;
export function bkkHour() {
  if (timeOverride != null) return timeOverride;
  const now = Date.now();
  if (now - cacheT > 1000) {
    cacheT = now;
    let h = 0, m = 0, s = 0;
    for (const p of fmt.formatToParts(new Date(now))) { if (p.type === 'hour') h = +p.value; else if (p.type === 'minute') m = +p.value; else if (p.type === 'second') s = +p.value; }
    cacheH = (h % 24) + m / 60 + s / 3600;
  }
  return cacheH;
}

const ramp = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a)));
const smooth = (x, a, b) => { const t = ramp(x, a, b); return t * t * (3 - 2 * t); };
// night = how much of the night plate shows (0 dusk plate .. 1 night plate)
export function nightMix(h) {
  if (h < 12) return 1 - smooth(h, 5.0, 6.6);
  return smooth(h, 18.0, 19.3);
}
// grade keys: [hour, rgb wash (soft-light), alpha, lift (screen, cool daylight)]; the dusk plate is golden hour,
// so midday is cooled and lifted, golden hour keeps it warm, night stays close to the night plate, dawn goes rosy.
const G = [
  [0, [40, 50, 110], 0.10, 0], [5.0, [60, 60, 120], 0.12, 0], [5.9, [255, 150, 170], 0.16, 0], [6.6, [255, 175, 150], 0.18, 0.04],
  [8.0, [200, 225, 255], 0.30, 0.10], [12, [195, 222, 255], 0.34, 0.13], [15.5, [215, 225, 250], 0.24, 0.08],
  [17.0, [255, 190, 140], 0.10, 0], [18.3, [255, 140, 110], 0.16, 0], [19.4, [100, 70, 160], 0.12, 0], [24, [40, 50, 110], 0.10, 0],
];
export function grade(h) {
  let i = 0; while (i < G.length - 2 && G[i + 1][0] <= h) i++;
  const [h0, c0, a0, l0] = G[i], [h1, c1, a1, l1] = G[i + 1], t = ramp(h, h0, h1);
  const c = c0.map((v, k) => Math.round(v + (c1[k] - v) * t));
  const day = Math.min(smooth(h, 6.8, 8.2), 1 - smooth(h, 15.5, 17.0));
  return { rgb: c, a: a0 + (a1 - a0) * t, lift: l0 + (l1 - l0) * t, day };
}
// everything the FX need, continuous in h
export function envAt(h) {
  const n = nightMix(h), G = grade(h);
  const golden = Math.max(Math.min(smooth(h, 16.2, 17.2), 1 - smooth(h, 18.5, 19.4)), Math.min(smooth(h, 5.6, 6.2), 1 - smooth(h, 6.6, 7.6)));
  const dark = Math.max(n, 0.35 * golden); // how much artificial light matters (windows, headlights, nav lights)
  return {
    h, n, day: G.day, golden, dark,
    lights: 0.12 + 0.88 * dark,               // city window / car light level
    stars: n * n,
    boats: 1 - 0.25 * n,                        // a few less at night
    headlights: Math.max(0.25, dark),
    grade: G,
  };
}
// the painted sky steps every 3 hours (0, 3, .. 21) and each step crossfades over FADE minutes. ?t= shows that exact hour; add &tsnap=1 to run the override through the steps
export const FADE = 10;
const snap = timeOverride == null || q.has('tsnap'), lerp = (a, b, f) => a + (b - a) * f;
function mixEnv(a, b, f) {
  const o = { ...b }; for (const k in b) if (typeof b[k] === 'number') o[k] = lerp(a[k], b[k], f);
  const A = a.grade, B = b.grade; o.grade = { rgb: B.rgb.map((v, i) => Math.round(lerp(A.rgb[i], v, f))), a: lerp(A.a, B.a, f), lift: lerp(A.lift, B.lift, f), day: lerp(A.day, B.day, f) };
  return o;
}
export function skyAt(h) { // { env, key }: key changes when the base has to be repainted
  if (!snap) return { env: envAt(h), key: `h${Math.round(h * 30)}`, bucket: null, f: 1 };
  const b = Math.floor(h / 3) * 3, m = (h - b) * 60, A = envAt(b);
  if (m >= FADE) return { env: A, key: `b${b}`, bucket: b, f: 1 };
  const u = m / FADE, f = u * u * (3 - 2 * u); // a repaint every 30 s of the fade
  return { env: mixEnv(envAt((b + 21) % 24), A, f), key: `b${b}.${Math.round(m * 2)}`, bucket: b, f };
}
