// Monitor screen content, themed per desk. Each monitor owns a small offscreen canvas that is redrawn at ~8 Hz on the full picture
// (a few times a second in lite) and then mapped onto the measured screen quad of the plate.
// Design: one modern UI kit for every screen (dark glass, small-caps title, rounded cards, eased motion). No shadowBlur and no
// per-frame gradients beyond a few, because weak TVs pay for them. Data screens use real data only; the rest are animated decoration.
export const SW = 200, SH = 124;

// which picture each monitor shows: [left screen, right screen] per desk theme. To add a picture: add a function to PICS below,
// then name it here.
export const THEME_KINDS = {
  numbers: ['portfolio', 'nfl'], video: ['reels', 'filmstrip'], sbp: ['shield', 'shieldlist'],
  messages: ['planes', 'inbox'], house: ['books', 'gauge'], boss: ['usage', 'router'], default: ['code', 'log'],
};

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const INK = '#e9eefc', DIM = 'rgba(205,215,240,.62)', FAINT = 'rgba(160,180,230,.14)';
const OK = '#7ee0a4', WARN = '#ffcf6e', BAD = '#ff7b6b';
function hash(n) { n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d); n = Math.imul(n ^ (n >>> 12), 0x297a2d39); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; }
const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
function text(g, s, x, y, size, weight = 600, color = INK, align = 'left') { g.font = `${weight} ${size}px ${FONT}`; g.fillStyle = color; g.textAlign = align; g.fillText(s, x, y); }
function title(g, s, acc, right) { // small-caps title row with an accent dot
  g.fillStyle = acc; g.beginPath(); g.arc(12, 13, 3, 0, 7); g.fill();
  text(g, s, 20, 13, 10, 700, DIM);
  if (right) text(g, right, SW - 10, 13, 10, 600, DIM, 'right');
}
function ring(g, cx, cy, r, f, color, w = 8) { // progress ring, f in 0..1, starting at 12 o'clock
  g.lineCap = 'round'; g.lineWidth = w; g.strokeStyle = FAINT; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
  if (f > 0.002) { g.strokeStyle = color; g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); g.stroke(); }
  g.lineCap = 'butt';
}
function check(g, x, y, s, color) { g.strokeStyle = color; g.lineWidth = s * 0.22; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(x - s * 0.45, y); g.lineTo(x - s * 0.1, y + s * 0.35); g.lineTo(x + s * 0.5, y - s * 0.35); g.stroke(); g.lineCap = 'butt'; }
function shieldPath(g, cx, cy, s) {
  g.beginPath(); g.moveTo(cx, cy - s); g.quadraticCurveTo(cx + s * 0.9, cy - s * 0.85, cx + s * 0.85, cy - s * 0.55);
  g.quadraticCurveTo(cx + s * 0.8, cy + s * 0.5, cx, cy + s); g.quadraticCurveTo(cx - s * 0.8, cy + s * 0.5, cx - s * 0.85, cy - s * 0.55);
  g.quadraticCurveTo(cx - s * 0.9, cy - s * 0.85, cx, cy - s); g.closePath();
}

// ---------- the pictures ----------
const TEAMS = 'ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LV LAC LAR MIA MIN NE NO NYG NYJ PHI PIT SF SEA TB TEN WAS'.split(' ');
const nflWeek = () => Math.max(1, Math.min(18, Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 8, 4)) / 6048e5) + 1));

const PICS = {
  portfolio(g, t, D, acc) { // $tonks: the live portfolio total, today's move and a sparkline of recent totals (real data only)
    const p = D.portfolio || {};
    if (!p.available) { title(g, 'PORTFOLIO', acc); text(g, '—', SW / 2, 74, 40, 700, DIM, 'center'); return; }
    const up = p.day_change_pct >= 0, col = up ? OK : '#7fb4ff', k = Math.round(p.total / 1000);
    title(g, 'PORTFOLIO', acc, 'today');
    text(g, String(k), 12, 58, k > 999 ? 40 : 46, 800, INK); g.font = `800 ${k > 999 ? 40 : 46}px ${FONT}`; const kw = g.measureText(String(k)).width;
    text(g, 'k', 14 + kw, 58, 18, 700, DIM);
    rr(g, SW - 74, 30, 64, 22, 11); g.fillStyle = rgba(up ? OK : '#7fb4ff', 0.16); g.fill();
    text(g, `${up ? '▲' : '▼'} ${Math.abs(p.day_change_pct).toFixed(1)}%`, SW - 42, 45, 12, 700, col, 'center');
    const h = (p.history || []).slice(-24);
    if (h.length > 1) { // area sparkline along the bottom
      const mn = Math.min(...h), mx = Math.max(...h), x0 = 10, x1 = SW - 10, y0 = SH - 10, y1 = 72, X = (i) => x0 + i * (x1 - x0) / (h.length - 1), Y = (v) => y0 - (v - mn) / (mx - mn || 1) * (y0 - y1);
      g.beginPath(); h.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)))); g.lineTo(x1, y0); g.lineTo(x0, y0); g.closePath();
      const gr = g.createLinearGradient(0, y1, 0, y0); gr.addColorStop(0, rgba(up ? OK : '#7fb4ff', 0.28)); gr.addColorStop(1, rgba(up ? OK : '#7fb4ff', 0)); g.fillStyle = gr; g.fill();
      g.beginPath(); h.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)))); g.strokeStyle = col; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
      const pulse = 0.5 + 0.5 * Math.sin(t * 3), lx = X(h.length - 1), ly = Y(h[h.length - 1]);
      g.fillStyle = rgba(up ? OK : '#7fb4ff', 0.25 * pulse); g.beginPath(); g.arc(lx, ly, 5 + 3 * pulse, 0, 7); g.fill(); g.fillStyle = col; g.beginPath(); g.arc(lx, ly, 2.6, 0, 7); g.fill();
    }
  },
  nfl(g, t, D, acc, seed) { // Sports: a scoreboard of made-up Sunday games (the slate comes from the week and seed; never a real result)
    const wk = nflWeek(); title(g, 'NFL', acc, `WEEK ${wk}`);
    const slot = t / 5, first = Math.floor(slot), e = ease(clamp((slot - first) * 4)), rowH = 44;
    g.save(); rr(g, 8, 24, SW - 16, SH - 32, 8); g.clip();
    for (let i = 0; i < 3; i++) {
      const k = first + i, h = (q) => hash(k * 37 + wk * 101 + seed * 13 + q), a = (h(1) * 32) | 0, b = (a + 1 + ((h(2) * 31) | 0)) % 32;
      const q = 1 + ((t / 40 + h(3) * 4) % 4 | 0), sa = ((h(5) * 8) | 0) * 3 + q * 3, sb = ((h(7) * 9) | 0) * 3 + q * 2, y = 26 + i * rowH - e * rowH;
      rr(g, 10, y + 2, SW - 20, rowH - 6, 7); g.fillStyle = 'rgba(255,255,255,.045)'; g.fill();
      [[a, sa, sb, 0], [b, sb, sa, 1]].forEach(([tm, mine, other, r]) => {
        const yy = y + 17 + r * 15, lead = mine >= other;
        g.fillStyle = `hsl(${(tm * 47) % 360},55%,55%)`; g.beginPath(); g.arc(22, yy - 4, 4, 0, 7); g.fill();
        text(g, TEAMS[tm], 32, yy, 12, 700, lead ? INK : DIM); text(g, String(mine), SW - 46, yy, 13, 800, lead ? INK : DIM, 'right');
      });
      text(g, `Q${q}`, SW - 18, y + 24, 10, 700, acc, 'right');
    }
    g.restore();
  },
  reels(g, t, D, acc) { // Studio: an editing timeline with a moving playhead
    title(g, 'EDIT', acc, '00:' + String(Math.floor((t * 3) % 60)).padStart(2, '0'));
    const tracks = [[acc, 0.0], ['#b48cff', 0.3], ['#ffb86b', 0.6]], x0 = 12, x1 = SW - 12, ph = x0 + ((t * 0.12) % 1) * (x1 - x0);
    tracks.forEach(([c, o], r) => {
      const y = 36 + r * 24;
      for (let i = 0; i < 6; i++) { const s = x0 + ((i * 0.19 + o * 0.5) % 1) * (x1 - x0), w = 18 + hash(i * 9 + r) * 26; if (s + w > x1) continue; rr(g, s, y, w, 16, 4); g.fillStyle = rgba(c, r === 2 ? 0.35 : 0.55); g.fill(); }
      if (r === 2) { g.strokeStyle = rgba(c, 0.8); g.lineWidth = 1.4; g.beginPath(); for (let x = x0; x < x1; x += 3) { const a = Math.abs(Math.sin(x * 0.21 + t * 2)) * 6; g.moveTo(x, y + 8 - a); g.lineTo(x, y + 8 + a); } g.stroke(); }
    });
    g.fillStyle = INK; g.fillRect(ph - 0.75, 30, 1.5, 76); g.beginPath(); g.moveTo(ph - 4, 28); g.lineTo(ph + 4, 28); g.lineTo(ph, 33); g.fill();
  },
  filmstrip(g, t, D, acc) { // Media: a render in progress
    const f = (t * 0.05) % 1, pct = Math.floor(f * 100);
    title(g, 'RENDER', acc, `${Math.max(0, Math.round((1 - f) * 90))}s left`);
    ring(g, 52, 72, 30, ease(f), acc, 7); text(g, `${pct}%`, 52, 77, 15, 800, INK, 'center');
    for (let i = 0; i < 3; i++) { const y = 38 + i * 26, done = f > (i + 1) / 4; rr(g, 98, y, 90, 18, 5); g.fillStyle = 'rgba(255,255,255,.05)'; g.fill(); rr(g, 98, y, 90 * (done ? 1 : clamp(f * 4 - i)), 18, 5); g.fillStyle = rgba(acc, 0.35); g.fill(); text(g, ['video', 'audio', 'export'][i], 106, y + 13, 10, 600, done ? INK : DIM); }
  },
  shield(g, t, D, acc) { // SBP: security status with a scanning sweep
    const bad = D.error, col = bad ? BAD : OK;
    title(g, 'SECURITY', acc, bad ? 'ALERT' : 'protected');
    const cx = 60, cy = 72, a = t * 1.6;
    g.strokeStyle = rgba(col, 0.18); g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 34, 0, 7); g.stroke();
    g.strokeStyle = col; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.arc(cx, cy, 34, a, a + 1.1); g.stroke(); g.lineCap = 'butt';
    shieldPath(g, cx, cy, 22); g.fillStyle = rgba(col, 0.2); g.fill(); g.strokeStyle = col; g.lineWidth = 2; g.stroke();
    if (bad) text(g, '!', cx, cy + 8, 22, 800, col, 'center'); else check(g, cx, cy + 1, 16, col);
    text(g, bad ? 'Needs a look' : 'All clear', 108, 64, 14, 700, INK); text(g, bad ? 'heartbeat stale' : 'last scan ' + (1 + (Math.floor(t / 7) % 9)) + 'm ago', 108, 82, 10, 600, DIM);
  },
  shieldlist(g, t, D, acc) { // SBP: pallet checks ticking through
    title(g, 'PALLET CHECKS', acc);
    const cur = Math.floor(t / 1.2) % 5;
    for (let i = 0; i < 4; i++) {
      const y = 28 + i * 23, done = i < cur, active = i === cur;
      rr(g, 10, y, SW - 20, 19, 6); g.fillStyle = active ? rgba(acc, 0.16) : 'rgba(255,255,255,.04)'; g.fill();
      if (done) check(g, 22, y + 9.5, 9, OK); else { g.strokeStyle = active ? acc : FAINT; g.lineWidth = 1.6; g.beginPath(); g.arc(22, y + 9.5, 5, 0, 7); g.stroke(); }
      g.fillStyle = done ? 'rgba(220,235,255,.5)' : 'rgba(220,235,255,.22)'; rr(g, 34, y + 7, 40 + 70 * hash(i + 3), 5, 2.5); g.fill();
      if (active) { const w = 110 * ease((t / 1.2) % 1); rr(g, 34, y + 14, w, 2, 1); g.fillStyle = acc; g.fill(); }
    }
  },
  planes(g, t, D, acc) { // Ops: messages flying between places
    title(g, 'ROUTING', acc, 'live');
    g.fillStyle = FAINT; for (let x = 14; x < SW; x += 12) for (let y = 30; y < SH - 6; y += 12) if (hash(x * 7 + y) > 0.55) g.fillRect(x, y, 2, 2);
    const P = [[30, 90], [70, 44], [118, 82], [168, 48], [150, 104]];
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = P[i], [bx, by] = P[(i + 2) % 5], mx = (ax + bx) / 2, my = Math.min(ay, by) - 26, f = ((t * 0.22 + i * 0.27) % 1), e = ease(f);
      g.strokeStyle = rgba(acc, 0.22); g.lineWidth = 1.4; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(mx, my, bx, by); g.stroke(); g.setLineDash([]);
      const x = (1 - e) ** 2 * ax + 2 * (1 - e) * e * mx + e * e * bx, y = (1 - e) ** 2 * ay + 2 * (1 - e) * e * my + e * e * by;
      g.fillStyle = rgba(acc, 0.25); g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); g.fillStyle = INK; g.beginPath(); g.arc(x, y, 2.4, 0, 7); g.fill();
    }
    for (const [x, y] of P) { g.fillStyle = acc; g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill(); }
  },
  inbox(g, t, D, acc, seed) { // LF: an inbox where the newest message slides in
    const n = 3 + (Math.floor(t / 6) % 5); title(g, 'INBOX', acc); rr(g, SW - 34, 6, 24, 14, 7); g.fillStyle = acc; g.fill(); text(g, String(n), SW - 22, 17, 10, 800, '#0b0f1a', 'center');
    const slide = ease(clamp(((t / 6) % 1) * 5));
    g.save(); g.beginPath(); g.rect(0, 24, SW, SH - 24); g.clip(); // the newest row slides in under the title, not over it
    for (let i = 0; i < 4; i++) {
      const y = 26 + i * 24 + (1 - slide) * (i === 0 ? -24 : 0), hue = (hash(i + seed + Math.floor(t / 6)) * 360) | 0, unread = i < 2;
      if (i === 0) { g.globalAlpha = slide; }
      g.fillStyle = `hsl(${hue},50%,60%)`; g.beginPath(); g.arc(20, y + 10, 7, 0, 7); g.fill();
      g.fillStyle = unread ? 'rgba(230,238,255,.75)' : 'rgba(230,238,255,.35)'; rr(g, 34, y + 4, 50 + 60 * hash(i * 3 + seed), 5, 2.5); g.fill();
      g.fillStyle = 'rgba(230,238,255,.2)'; rr(g, 34, y + 13, 80 + 50 * hash(i * 5 + seed), 4, 2); g.fill();
      if (unread) { g.fillStyle = acc; g.beginPath(); g.arc(SW - 16, y + 10, 3, 0, 7); g.fill(); }
      g.globalAlpha = 1;
    }
    g.restore();
  },
  books(g, t, D, acc) { // Archives: backups syncing
    title(g, 'ARCHIVE', acc, 'synced ' + (1 + (Math.floor(t / 9) % 5)) + 'm ago');
    const rows = [['Drive', 0.82], ['Sheets', 0.64], ['Bots', 0.47]];
    rows.forEach(([name, base], i) => {
      const y = 34 + i * 28, f = clamp(base + 0.08 * Math.sin(t * 0.4 + i * 2));
      text(g, name, 12, y + 4, 10, 600, DIM); text(g, `${Math.round(f * 100)}%`, SW - 12, y + 4, 10, 700, INK, 'right');
      rr(g, 12, y + 9, SW - 24, 7, 3.5); g.fillStyle = FAINT; g.fill(); rr(g, 12, y + 9, (SW - 24) * f, 7, 3.5); g.fillStyle = acc; g.fill();
    });
  },
  gauge(g, t, D, acc) { // Usage: what is left of this week's Grok pool (real data only)
    const u = D.usage || {}, ok = !!u.available, used = ok ? u.used_pct : 0, col = used < 60 ? '#6fd6ef' : used <= 85 ? WARN : BAD;
    title(g, 'WEEKLY POOL', acc);
    ring(g, 56, 72, 30, ok ? clamp(used / 100) : 0, col, 8); text(g, ok ? `${Math.round(used)}%` : '—', 56, 77, 15, 800, INK, 'center');
    text(g, ok ? 'used' : 'no data', 108, 62, 11, 600, DIM); if (ok) text(g, `${Math.round(100 - used)}% left`, 108, 82, 14, 700, col);
  },
  usage(g, t, D, acc) { // Grok: this week's pool by bot (real data only)
    const rows = ((D.usage || {}).bots || []).filter((b) => b.pct_of_pool > 0).slice(0, 8);
    title(g, 'POOL BY BOT', acc);
    if (!rows.length) { text(g, 'no usage data', SW / 2, 74, 11, 600, DIM, 'center'); return; }
    const mx = rows[0].pct_of_pool, top = 28, base = SH - 20, gap = (SW - 20) / rows.length, bw = gap * 0.58;
    rows.forEach((b, i) => {
      const h = Math.max(3, (b.pct_of_pool / mx) * (base - top)), x = 10 + i * gap + (gap - bw) / 2, c = `hsl(${205 + i * 14},80%,${70 - i * 2}%)`;
      rr(g, x, top, bw, base - top, 3); g.fillStyle = 'rgba(160,190,255,.06)'; g.fill(); rr(g, x, base - h, bw, h, 3); g.fillStyle = c; g.fill();
      text(g, b.name.replace(/^\d+\.\s*/, '').slice(0, 3).toUpperCase(), x + bw / 2, base + 12, 8, 700, DIM, 'center');
    });
  },
  router(g, t, D, acc) { // Grok: requests routed from the hub out to the bots
    title(g, 'ROUTER', acc, `${40 + Math.floor((Math.sin(t * 0.3) + 1) * 20)} req/m`);
    const cx = SW / 2, cy = 72, N = 7;
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2 - Math.PI / 2, x = cx + Math.cos(a) * 74, y = cy + Math.sin(a) * 36, f = (t * 0.7 + i * 0.37) % 1;
      g.strokeStyle = rgba(acc, 0.22); g.lineWidth = 1.4; g.beginPath(); g.moveTo(cx, cy); g.lineTo(x, y); g.stroke();
      g.fillStyle = INK; g.beginPath(); g.arc(cx + (x - cx) * ease(f), cy + (y - cy) * ease(f), 2.2, 0, 7); g.fill();
      g.fillStyle = rgba(acc, 0.9); g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
    }
    g.fillStyle = rgba(acc, 0.2); g.beginPath(); g.arc(cx, cy, 14, 0, 7); g.fill(); g.fillStyle = acc; g.beginPath(); g.arc(cx, cy, 8, 0, 7); g.fill();
  },
  code(g, t, D, acc, seed) { // a code editor that types
    title(g, 'main.py', acc); const scroll = Math.floor(t * 0.8), cols = [acc, '#c792ea', '#82aaff', '#c3e88d', DIM];
    for (let i = 0; i < 7; i++) {
      const ln = scroll + i, y = 30 + i * 12, ind = (hash(ln * 3 + seed) * 3 | 0) * 8;
      text(g, String(ln % 99 + 1), 18, y + 6, 8, 600, 'rgba(160,180,230,.35)', 'right');
      let x = 26 + ind; for (let j = 0; j < 3; j++) { const w = 10 + hash(ln * 11 + j + seed) * 30; g.fillStyle = cols[(ln + j) % cols.length]; rr(g, x, y, w, 5, 2.5); g.fill(); x += w + 5; }
      if (i === 6 && Math.sin(t * 6) > 0) { g.fillStyle = INK; g.fillRect(x, y - 2, 2, 9); }
    }
  },
  log(g, t, D, acc, seed) { // a log streaming upward
    title(g, 'LOG', acc, D.working ? 'busy' : 'idle'); const s = t * 1.4, off = (s % 1) * 12;
    g.save(); g.beginPath(); g.rect(0, 24, SW, SH - 24); g.clip();
    for (let i = 0; i < 9; i++) {
      const n = Math.floor(s) + i, y = 30 + i * 12 - off, lvl = hash(n * 5 + seed), c = lvl > 0.92 ? WARN : lvl > 0.75 ? acc : DIM;
      g.fillStyle = c; g.beginPath(); g.arc(14, y + 3, 2.4, 0, 7); g.fill();
      g.fillStyle = 'rgba(220,230,255,.32)'; rr(g, 22, y, 22, 5, 2.5); g.fill(); g.fillStyle = rgba(c === DIM ? '#c8d2ee' : c, 0.55); rr(g, 50, y, 40 + hash(n * 7 + seed) * 100, 5, 2.5); g.fill();
    }
    g.restore();
  },
};

export function drawScreen(g, kind, t, D) {
  const acc = D.accent || '#8fb4ff', seed = D.seed || 1;
  g.globalAlpha = 1; g.textBaseline = 'alphabetic';
  const bg = g.createLinearGradient(0, 0, 0, SH); bg.addColorStop(0, '#121828'); bg.addColorStop(1, '#0a0d17'); g.fillStyle = bg; g.fillRect(0, 0, SW, SH);
  g.fillStyle = rgba(acc, 0.06); g.fillRect(0, 0, SW, SH);
  (PICS[kind] || PICS.code)(g, t, D, acc, seed);
  if (D.error) { g.fillStyle = 'rgba(255,70,60,.16)'; g.fillRect(0, 0, SW, SH); rr(g, 1.5, 1.5, SW - 3, SH - 3, 6); g.strokeStyle = 'rgba(255,110,100,.7)'; g.lineWidth = 2; g.stroke(); }
  else if (!D.working) { g.fillStyle = 'rgba(6,8,16,.2)'; g.fillRect(0, 0, SW, SH); } // idle screens a touch dimmer
  const gl = g.createLinearGradient(0, 0, SW * 0.6, SH); gl.addColorStop(0, 'rgba(255,255,255,.06)'); gl.addColorStop(0.5, 'rgba(255,255,255,0)'); g.fillStyle = gl; g.fillRect(0, 0, SW, SH); // glass
}

// Right-wall slim monitors: what is left of a pool. Two bars, blue at 100% through violet to red at 0%: A = pool left, B = time left until it resets.
// A null bar is a soft empty track, never a guess.
export const WW = 189, WH = 720;
const STOPS = [[0, [255, 74, 58]], [0.25, [214, 84, 190]], [0.5, [122, 120, 255]], [1, [70, 170, 255]]];
function leftCol(f) {
  let i = 0; while (i < STOPS.length - 2 && f > STOPS[i + 1][0]) i++;
  const [a, A] = STOPS[i], [b, B] = STOPS[i + 1], u = Math.min(1, Math.max(0, (f - a) / (b - a))); return `rgb(${A.map((v, j) => Math.round(v + (B[j] - v) * u)).join(',')})`;
}
export function drawWall(g, name, pool, time, t) {
  const W = WW, H = WH, top = 176, base = H - 40, bw = 58, xs = [22, W - 22 - bw];
  g.globalAlpha = 1; g.shadowBlur = 0; g.textBaseline = 'alphabetic';
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#121828'); bg.addColorStop(1, '#090c15'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.textAlign = 'center'; g.font = `700 22px ${FONT}`; g.fillStyle = 'rgba(214,224,246,.7)'; g.fillText(name, W / 2, 40);
  [pool, time].forEach((f, i) => {
    const x = xs[i], h = base - top, c = f == null ? 'rgba(214,224,246,.55)' : leftCol(f);
    g.font = `800 ${f == null ? 52 : 46}px ${FONT}`; g.fillStyle = c; g.fillText(f == null ? '–' : String(Math.round(f * 100)), x + bw / 2, 118);
    g.font = `600 17px ${FONT}`; g.fillStyle = 'rgba(214,224,246,.5)'; g.fillText(i ? 'time' : 'pool', x + bw / 2, 146);
    rr(g, x, top, bw, h, bw / 2); g.fillStyle = 'rgba(160,190,255,.07)'; g.fill();
    if (f == null) { g.strokeStyle = 'rgba(190,205,235,.18)'; g.setLineDash([6, 7]); g.lineWidth = 2; rr(g, x + 1, top + 1, bw - 2, h - 2, bw / 2); g.stroke(); g.setLineDash([]); }
    else if (f > 0) { const bh = Math.max(bw, f * h); rr(g, x, base - bh, bw, bh, bw / 2); const gr = g.createLinearGradient(0, base - bh, 0, base); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(40,60,140,.9)'); g.fillStyle = gr; g.fill(); }
  });
  const gl = g.createLinearGradient(0, 0, W, H * 0.5); gl.addColorStop(0, 'rgba(255,255,255,.05)'); gl.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gl; g.fillRect(0, 0, W, H); g.textAlign = 'left';
}
