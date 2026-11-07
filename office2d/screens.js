// Monitor screen content, themed per desk. Each monitor owns a small offscreen canvas that is redrawn at ~8 Hz
// (dirty layer) and then mapped onto the measured screen quad of the plate.
export const SW = 200, SH = 124;

// which picture each monitor shows: [left screen, right screen] per desk theme
export const THEME_KINDS = {
  numbers: ['portfolio', 'nfl'], video: ['reels', 'filmstrip'], sbp: ['shield', 'shieldlist'],
  messages: ['planes', 'inbox'], house: ['books', 'gauge'], boss: ['usage', 'router'], default: ['code', 'log'],
};
const BG = { portfolio: '#12141c', nfl: '#0e2416', reels: '#22121a', filmstrip: '#1c1018', shield: '#0c241c', shieldlist: '#0e2018',
  planes: '#0e1c36', inbox: '#101c32', books: '#261c12', gauge: '#0c1e2c', router: '#141622', usage: '#10131f', code: '#121620', log: '#161a1e' };

function hash(n) { n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d); n = Math.imul(n ^ (n >>> 12), 0x297a2d39); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; }
function shieldPath(g, cx, cy, s) {
  g.beginPath(); g.moveTo(cx, cy - s); g.quadraticCurveTo(cx + s * 0.9, cy - s * 0.85, cx + s * 0.85, cy - s * 0.55);
  g.quadraticCurveTo(cx + s * 0.8, cy + s * 0.5, cx, cy + s); g.quadraticCurveTo(cx - s * 0.8, cy + s * 0.5, cx - s * 0.85, cy - s * 0.55);
  g.quadraticCurveTo(cx - s * 0.9, cy - s * 0.85, cx, cy - s); g.closePath();
}
function plane(g, x, y, s, a) {
  g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.moveTo(s, 0); g.lineTo(-s, -s * 0.6); g.lineTo(-s * 0.45, 0); g.lineTo(-s, s * 0.6); g.closePath();
  g.fill(); g.restore();
}
function bars(g, x, y, w, rows, col, t, seed) {
  for (let i = 0; i < rows; i++) { const l = 0.35 + 0.6 * hash(i * 13 + seed + Math.floor(t * 0.5 + i * 0.3)); g.fillStyle = i === 0 ? col : 'rgba(220,230,255,.32)'; g.fillRect(x, y + i * 13, w * l, 6); }
}

// Sports desk: a Sunday scoreboard. Zero data: the slate comes from the calendar week + seed, the clock from t, so nothing here is a real result.
const TEAMS = 'ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LV LAC LAR MIA MIN NE NO NYG NYJ PHI PIT SF SEA TB TEN WAS'.split(' ');
const nflWeek = () => Math.max(1, Math.min(18, Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 8, 4)) / 6048e5) + 1));
function football(g, x, y, r, a) {
  g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = '#a8602e'; g.beginPath(); g.ellipse(0, 0, r, r * 0.62, 0, 0, 7); g.fill();
  g.strokeStyle = '#f4ead8'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-r * 0.42, 0); g.lineTo(r * 0.42, 0); for (let i = -2; i <= 2; i++) { g.moveTo(i * r * 0.16, -r * 0.14); g.lineTo(i * r * 0.16, r * 0.14); } g.stroke();
  g.beginPath(); g.moveTo(-r * 0.74, -r * 0.3); g.lineTo(-r * 0.74, r * 0.3); g.moveTo(r * 0.74, -r * 0.3); g.lineTo(r * 0.74, r * 0.3); g.stroke(); g.restore();
}
function drawNfl(g, t, seed) {
  const W = SW, H = SH, wk = nflWeek(), X = 132; // the board fills the right of the glass, the part the bot's head leaves free; the field and the ball run behind it
  const off = (t * 5) % 24;
  for (let i = -1; i < 10; i++) { g.fillStyle = i & 1 ? 'rgba(70,150,84,.24)' : 'rgba(40,110,60,.24)'; g.fillRect(i * 24 + off, 0, 24, H); }
  g.strokeStyle = 'rgba(235,245,230,.34)'; g.lineWidth = 1.5;
  for (let i = -1; i < 10; i++) { const x = i * 24 + off; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); for (const y of [34, 86]) { g.beginPath(); g.moveTo(x + 12, y); g.lineTo(x + 12, y + 5); g.stroke(); } }
  g.font = '900 34px system-ui, sans-serif'; g.fillStyle = 'rgba(245,250,240,.82)'; g.fillText('NFL', 10, 12);
  football(g, 40 + Math.sin(t * 0.8) * 22, 78 + Math.cos(t * 1.1) * 8, 15, -0.5 + Math.sin(t * 0.9) * 0.3);
  g.fillStyle = 'rgba(6,14,24,.9)'; g.beginPath(); g.roundRect(X, 0, W - X, H, 5); g.fill();
  g.fillStyle = '#d6324a'; g.fillRect(X, 0, W - X, 17); g.font = '800 13px system-ui, sans-serif'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(`WEEK ${wk}`, (X + W) / 2, 2);
  // two games on the board, the slate rolls up one game every 4 s
  const n = 8, ph = t / 4, first = Math.floor(ph), rowH = 53, y0 = 20, e = Math.min(1, (ph - first) * 3), sc = e * e * (3 - 2 * e) * rowH;
  g.save(); g.beginPath(); g.rect(X, y0, W - X, H - y0); g.clip(); g.font = '800 17px system-ui, sans-serif';
  for (let i = 0; i < 3; i++) {
    const k = (first + i) % n, h = q => hash(k * 37 + wk * 101 + seed * 13 + q), a = (h(1) * 32) | 0, b = (a + 1 + ((h(2) * 31) | 0)) % 32, y = y0 + i * rowH - sc, q = 1 + ((t / 37 + h(3) * 4) % 4 | 0);
    const sa = Math.floor(h(5) * 8) * 3 + q * 3 + Math.floor((t / 40 + h(6) * 9) % 3) * 7, sb = Math.floor(h(7) * 9) * 3 + q * 2 + Math.floor((t / 53 + h(8) * 9) % 3) * 7;
    [[a, sa, sb], [b, sb, sa]].forEach(([tm, mine, other], r) => { const yy = y + 3 + r * 21; g.fillStyle = mine >= other ? '#ffe9a8' : '#b4c6ba'; g.textAlign = 'left'; g.fillText(TEAMS[tm], X + 7, yy); g.textAlign = 'right'; g.fillText(mine, W - 7, yy); });
    g.fillStyle = 'rgba(214,50,74,.8)'; g.fillRect(X + 6, y + rowH - 6, (W - X - 12) * ((t / 37 + h(3) * 4) % 4) / 4, 2.5);
  }
  g.restore(); g.textAlign = 'left';
}

export function drawScreen(g, kind, t, D) {
  const W = SW, H = SH, acc = D.accent, seed = D.seed || 1;
  g.globalAlpha = 1; g.fillStyle = BG[kind] || '#121620'; g.fillRect(0, 0, W, H);
  // faint grid like the plate's chart screens
  g.strokeStyle = 'rgba(160,190,255,.08)'; g.lineWidth = 1;
  for (let x = 20; x < W; x += 30) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 18; y < H; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.font = '600 13px system-ui, sans-serif'; g.textBaseline = 'top'; g.textAlign = 'left';
  switch (kind) {
    case 'portfolio': { // $tonks: the total in thousands dominates the top of the glass (the bot's head sits low on it), then the day move and a sparkline
      const p = D.portfolio || {};
      if (!p.available) { g.font = '800 78px system-ui, sans-serif'; g.fillStyle = '#7a8aa8'; g.textAlign = 'center'; g.fillText('—', W / 2, 2); g.textAlign = 'left'; break; }
      const up = p.day_change_pct >= 0, col = up ? '#9fe08a' : '#7fb4f4', big = String(Math.round(p.total / 1000)), right = W - 7;
      g.fillStyle = up ? 'rgba(150,230,120,.09)' : 'rgba(110,160,250,.12)'; g.fillRect(0, 0, W, H);
      const hist = (p.history || []).slice(-24);
      if (hist.length > 1) { // small sparkline along the bottom
        const mn = Math.min(...hist), mx = Math.max(...hist), x0 = W * 0.6;
        g.beginPath(); hist.forEach((v, i) => { const x = x0 + i * (right - x0) / (hist.length - 1), y = H - 6 - (v - mn) / (mx - mn || 1) * 18; i ? g.lineTo(x, y) : g.moveTo(x, y); });
        g.strokeStyle = col; g.globalAlpha = 0.7; g.lineWidth = 2.4; g.lineJoin = 'round'; g.stroke(); g.globalAlpha = 1;
      }
      g.textAlign = 'center'; g.shadowColor = col; g.shadowBlur = 10; g.fillStyle = '#f2fce8';
      g.font = `800 ${big.length > 3 ? 62 : 80}px system-ui, sans-serif`; g.fillText(big, W / 2, big.length > 3 ? 4 : -4);
      g.textAlign = 'right'; g.fillStyle = col; g.font = '800 19px system-ui, sans-serif'; g.fillText(`${up ? '+' : '−'}${Math.abs(p.day_change_pct).toFixed(1)}%`, right, 72);
      g.shadowBlur = 0; g.textAlign = 'left';
      break;
    }
    case 'nfl': drawNfl(g, t, seed); break;
    case 'reels': {
      for (const [cx, cy, r, sp] of [[62, 64, 38, 1], [146, 64, 38, -1.2]]) {
        g.save(); g.translate(cx, cy); g.rotate(t * sp * 1.4);
        g.fillStyle = '#f08a5c'; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
        g.fillStyle = BG.reels; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(Math.cos(i * 1.2566) * r * 0.55, Math.sin(i * 1.2566) * r * 0.55, r * 0.2, 0, 7); g.fill(); }
        g.beginPath(); g.arc(0, 0, r * 0.12, 0, 7); g.fill(); g.restore();
      }
      g.strokeStyle = '#f08a5c'; g.lineWidth = 3; g.beginPath(); g.moveTo(62, 102); g.lineTo(146, 102); g.stroke();
      break;
    }
    case 'filmstrip': {
      const off = (t * 30) % 46;
      g.fillStyle = '#2c1c22'; g.fillRect(0, 28, W, 68);
      for (let x = -46 + off; x < W; x += 46) {
        g.fillStyle = `hsl(${(hash(Math.round((x - off) / 46) + seed) * 60 + 0) | 0},70%,60%)`; g.fillRect(x + 4, 38, 38, 48);
        g.fillStyle = '#e8d8c8'; for (let y of [30, 88]) g.fillRect(x + 8, y, 8, 6), g.fillRect(x + 28, y, 8, 6);
      }
      g.fillStyle = '#e8806e'; g.fillRect(0, 104, W * ((t * 0.07) % 1), 8); g.fillStyle = '#c8b4b8'; g.fillText('RENDER', 10, 8);
      break;
    }
    case 'shield': {
      const pulse = 0.85 + 0.15 * Math.sin(t * 3);
      g.fillStyle = D.error ? '#e0584a' : '#3fbf74'; shieldPath(g, W / 2, H / 2 + 2, 46 * pulse); g.fill();
      g.strokeStyle = '#d8ffe8'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath();
      if (D.error) { g.moveTo(W / 2 - 14, H / 2 - 12); g.lineTo(W / 2 + 14, H / 2 + 16); g.moveTo(W / 2 + 14, H / 2 - 12); g.lineTo(W / 2 - 14, H / 2 + 16); }
      else { g.moveTo(W / 2 - 16, H / 2 + 2); g.lineTo(W / 2 - 4, H / 2 + 14); g.lineTo(W / 2 + 18, H / 2 - 12); }
      g.stroke(); g.lineCap = 'butt';
      break;
    }
    case 'shieldlist': {
      for (let i = 0; i < 4; i++) {
        g.fillStyle = i === Math.floor(t) % 4 ? '#a6d67e' : '#3c8a5c'; shieldPath(g, 22, 22 + i * 26, 9); g.fill();
        g.fillStyle = 'rgba(200,240,210,.5)'; g.fillRect(40, 18 + i * 26, 60 + 80 * hash(i + seed), 7);
      }
      g.strokeStyle = '#d9b07a'; g.lineWidth = 2; for (let i = 0; i < 3; i++) g.strokeRect(150, 28 + i * 24, 38, 18); // pallets
      break;
    }
    case 'planes': {
      g.fillStyle = '#e6f0ff';
      for (let i = 0; i < 4; i++) {
        const k = (t * 0.22 + i * 0.27) % 1, x = -20 + k * (W + 40), y = 30 + i * 22 + Math.sin(k * 9 + i) * 8;
        plane(g, x, y, 11 - i, Math.cos(k * 9 + i) * 0.35);
        g.strokeStyle = 'rgba(230,240,255,.3)'; g.setLineDash([4, 5]); g.beginPath(); g.moveTo(x - 14, y); g.lineTo(x - 60, y - Math.cos(k * 9 + i) * 10); g.stroke(); g.setLineDash([]);
      }
      break;
    }
    case 'inbox': {
      g.fillStyle = '#9fb4e8'; g.fillText('INBOX', 10, 8);
      for (let i = 0; i < 6; i++) {
        const y = 28 + i * 15; g.fillStyle = i === Math.floor(t * 0.8) % 6 ? 'rgba(134,166,224,.45)' : 'rgba(134,166,224,.12)'; g.fillRect(6, y - 2, W - 12, 13);
        g.fillStyle = '#dfe8ff'; g.fillRect(12, y + 2, 10, 6); g.fillStyle = 'rgba(220,230,255,.55)'; g.fillRect(30, y + 2, 50 + 100 * hash(i * 3 + seed), 5);
      }
      break;
    }
    case 'books': {
      const cols = ['#c8644a', '#d8a84a', '#6a9a6a', '#5a7ab0', '#a06aa0', '#d88a5a', '#4a8a8a'];
      let x = 12;
      for (let i = 0; x < W - 16; i++) {
        const w = 12 + 10 * hash(i + seed), hh = 58 + 30 * hash(i * 5 + seed), lift = i === Math.floor(t * 0.6) % 9 ? 8 : 0;
        g.fillStyle = cols[i % cols.length]; g.fillRect(x, 104 - hh - lift, w, hh);
        g.fillStyle = 'rgba(255,240,200,.5)'; g.fillRect(x + 2, 104 - hh - lift + 8, w - 4, 3); x += w + 3;
      }
      g.fillStyle = '#6a4a2a'; g.fillRect(6, 104, W - 12, 8);
      break;
    }
    case 'gauge': {
      const u = D.usage || {}, pct = u.available ? u.used_pct : 0, left = 100 - pct;
      const col = pct < 60 ? '#6fd0e8' : pct <= 85 ? '#f0c060' : '#ff8a76';
      g.fillStyle = '#9fc4d8'; g.fillText('WEEKLY POOL', 10, 8);
      // water tank: level = what is left, with a moving wave
      const tx = 120, ty = 22, tw = 66, th = 92, lvl = ty + th - th * left / 100;
      g.strokeStyle = '#9fc4d8'; g.lineWidth = 3; g.strokeRect(tx, ty, tw, th);
      g.save(); g.beginPath(); g.rect(tx + 2, ty + 2, tw - 4, th - 4); g.clip();
      g.fillStyle = col; g.globalAlpha = 0.85; g.beginPath(); g.moveTo(tx, ty + th);
      for (let x = 0; x <= tw; x += 4) g.lineTo(tx + x, lvl + Math.sin(x * 0.18 + t * 3) * 2.5);
      g.lineTo(tx + tw, ty + th); g.fill(); g.restore(); g.globalAlpha = 1;
      g.font = '700 30px system-ui, sans-serif'; g.fillStyle = col; g.fillText(u.available ? `${pct.toFixed(0)}%` : '—', 10, 34);
      g.font = '600 12px system-ui, sans-serif'; g.fillStyle = '#9fc4d8'; g.fillText('used', 12, 70); g.fillText(u.available ? `${left.toFixed(0)}% left` : 'no data', 12, 90);
      break;
    }
    case 'router': {
      const nodes = [[100, 62], [38, 30], [162, 30], [38, 96], [162, 96], [100, 16], [100, 108]];
      g.strokeStyle = 'rgba(236,198,124,.45)'; g.lineWidth = 2;
      for (let i = 1; i < nodes.length; i++) { g.beginPath(); g.moveTo(...nodes[0]); g.lineTo(...nodes[i]); g.stroke(); }
      const k = Math.floor(t * 1.2) % 6 + 1, f = (t * 1.2) % 1, [x1, y1] = nodes[k];
      g.fillStyle = '#ffe2a0'; g.beginPath(); g.arc(100 + (x1 - 100) * f, 62 + (y1 - 62) * f, 5, 0, 7); g.fill();
      for (const [x, y] of nodes) { g.fillStyle = '#ecc67c'; g.beginPath(); g.arc(x, y, x === 100 && y === 62 ? 13 : 7, 0, 7); g.fill(); }
      break;
    }
    case 'usage': { // this week's Grok pool by bot: soft neon columns, biggest first, shares from the usage split
      const rows = ((D.usage || {}).bots || []).filter(b => b.pct_of_pool > 0).slice(0, 8);
      if (!rows.length) { g.fillStyle = 'rgba(190,205,235,.35)'; g.font = '600 12px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('no usage data', W / 2, H / 2 - 7); g.textAlign = 'left'; break; }
      const mx = rows[0].pct_of_pool, top = 12, base = H - 19, gap = (W - 16) / rows.length, bw = gap * 0.6;
      rows.forEach((b, i) => {
        const h = Math.max(2, (b.pct_of_pool / mx) * (base - top)), x = 8 + i * gap + (gap - bw) / 2, c = `hsl(${205 + i * 15},82%,${68 - i * 1.6}%)`;
        g.fillStyle = 'rgba(160,190,255,.07)'; g.fillRect(x, top, bw, base - top);
        g.globalAlpha = 0.86 + 0.08 * Math.sin(t * 1.2 + i); g.shadowColor = c; g.shadowBlur = 7; g.fillStyle = c; g.beginPath(); g.roundRect(x, base - h, bw, h, 2); g.fill(); g.shadowBlur = 0; g.globalAlpha = 1;
        g.font = '700 9px system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(214,224,246,.82)'; g.fillText(b.name.replace(/^\d+\.\s*/, '').slice(0, 3).toUpperCase(), x + bw / 2, base + 4);
      });
      g.textAlign = 'left';
      break;
    }
    default: {
      g.fillStyle = acc; bars(g, 10, 14, W - 20, 8, acc, t, seed);
    }
  }
  if (D.error) { g.fillStyle = 'rgba(255,60,50,.22)'; g.fillRect(0, 0, W, H); }
  if (!D.working && !D.error) { g.fillStyle = 'rgba(8,10,20,.18)'; g.fillRect(0, 0, W, H); } // idle screens a touch dimmer
  // scanline sheen
  g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(0, (t * 40) % (H + 30) - 30, W, 14);
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
  const W = WW, H = WH, top = 164, base = H - 24, bw = 62, xs = [18, W - 18 - bw];
  g.globalAlpha = 1; g.shadowBlur = 0; g.fillStyle = '#0d0f1a'; g.fillRect(0, 0, W, H);
  const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, 'rgba(110,130,210,.10)'); sky.addColorStop(1, 'rgba(240,150,110,.05)'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
  g.textBaseline = 'top'; g.textAlign = 'center'; g.font = '700 25px system-ui, sans-serif'; g.fillStyle = 'rgba(214,224,246,.72)'; g.fillText(name, W / 2, 16);
  [pool, time].forEach((f, i) => {
    const x = xs[i], h = base - top, c = f == null ? 'rgba(214,224,246,.6)' : leftCol(f);
    g.fillStyle = 'rgba(160,190,255,.07)'; g.beginPath(); g.roundRect(x, top, bw, h, 5); g.fill();
    if (f == null) { g.strokeStyle = 'rgba(190,205,235,.18)'; g.setLineDash([6, 7]); g.lineWidth = 2; g.strokeRect(x + 1, top + 1, bw - 2, h - 2); g.setLineDash([]); }
    else if (f > 0) {
      const bh = Math.max(4, f * h);
      g.globalAlpha = 0.9 + 0.06 * Math.sin(t * 1.1 + i * 2); g.shadowColor = c; g.shadowBlur = 16; g.fillStyle = c; g.beginPath(); g.roundRect(x, base - bh, bw, bh, 5); g.fill(); g.shadowBlur = 0; g.globalAlpha = 1;
    }
    const num = f == null ? '–' : `${Math.round(f * 100)}`, sz = num.length > 2 ? 46 : 62; // the big number sits over its own bar, in its colour
    g.font = `800 ${sz}px system-ui, sans-serif`; g.fillStyle = c; g.shadowColor = c; g.shadowBlur = 6; g.fillText(num, x + bw / 2, 60 + (62 - sz) / 2); g.shadowBlur = 0;
    if (f != null) { g.font = '700 22px system-ui, sans-serif'; g.fillStyle = 'rgba(214,224,246,.55)'; g.fillText('%', x + bw / 2, 126); }
  });
  g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(0, (t * 33) % (H + 60) - 60, W, 39); // same slow sheen as the desk screens
}
