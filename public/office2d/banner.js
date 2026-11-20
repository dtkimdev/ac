// The Bears board (David, 2026-11-20): the Chicago Bears' next game, written on the kitchen's menu board on the slanted left wall:
// vs / @ and the opponent's logo (big, no name, no Bears logo), the date and the kickoff time (Bangkok time, the office's clock). Only
// what reads from across the room. In the off season: next season's week 1 game, or "WEEK 1 / 2027 · TBA" until the NFL releases the
// schedule. The data is bears.json, written by bin/bears.js on every publish (so the ↻ button, a Grok refresh and every push bring a
// fresh schedule); the page re-reads it every few minutes and after ↻. Four hours after a kickoff it moves on to the next game by itself.
// The board itself (frame, plain chalkboard face) is painted into the room pictures by portable/art/scene.js, which writes its place to
// layout.json kitchen.board (front-on px). The writing is drawn at the screen's own resolution (David: the first version, drawn big and
// shrunk onto the canvas, looked pixelated): front-on at twice the screen's pixels per plate px, then laid onto the wall with the
// bookcase's perspective (layout.json bookcase.warp) in strips about two screen pixels wide, into a bitmap that is copied 1:1 onto the
// canvas. Both happen again only when the text, a logo or the canvas size changes, so a frame costs one drawImage.
// Hide it with config.js BANNER.show.
const CHALK = 'rgba(240,236,224,.94)', ORANGE = '#f07a2e';
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const GAME_HOURS = 4; // a game stays "on" this long after kickoff, then the next one shows

// time zones by hand (no Intl time-zone data needed, which some TV browsers lack): Bangkok is UTC+7 all year; Chicago is UTC-6, or -5
// from the second Sunday of March 2:00 to the first Sunday of November 2:00 (US daylight time)
const sunday = (y, m, nth) => { const d = new Date(Date.UTC(y, m, 1)); return 1 + ((7 - d.getUTCDay()) % 7) + (nth - 1) * 7; };
function chicagoOffset(ms) {
  const y = new Date(ms).getUTCFullYear(), on = Date.UTC(y, 2, sunday(y, 2, 2), 8), off = Date.UTC(y, 10, sunday(y, 10, 1), 7);
  return ms >= on && ms < off ? -5 : -6;
}
const at = (ms, h) => new Date(ms + h * 3600e3); // read it with the getUTC* methods
const hm = d => { const h = d.getUTCHours(), m = d.getUTCMinutes(); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const dayDate = d => `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;

export function makeBanner(cfg, sans) {
  let B = null, wv = null; // B: the board's face, front-on px { x, y, w, h }; wv: the wall's perspective { vx, vy, ds }
  let data = null, bmp = null, out = null, shade = null, key = '', changed = false, ver = 0, dev = null; // ver: bumped when a logo arrives
  const logos = {};
  const logoOf = url => {
    if (!url) return null;
    if (!logos[url]) { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { ver++; changed = true; }; im.onerror = () => { im.bad = true; }; im.src = url; logos[url] = im; }
    const im = logos[url]; return im.complete && im.naturalWidth && !im.bad ? im : null;
  };
  // a logo shrunk in halves to the size it is drawn at (one big jump down from 500 px looks blocky in canvas)
  const small = (im, px) => { px = Math.max(8, Math.round(px)); const k = 'c' + px; if (im[k]) return im[k]; let c = im, w = im.naturalWidth || im.width; while (w / 2 >= px) { const n = document.createElement('canvas'); n.width = n.height = Math.round(w / 2); const g = n.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, n.width, n.height); c = n; w = n.width; } return (im[k] = c); };
  const s = x => wv ? 1 / (1 + x / wv.ds) : 1;
  const toWall = (x, y) => wv ? [wv.vx - wv.vx * s(x), wv.vy + (y - wv.vy) * s(x)] : [x, y];
  function bounds() { // the board's face on screen (plate px)
    const P = [toWall(B.x, B.y), toWall(B.x + B.w, B.y), toWall(B.x, B.y + B.h), toWall(B.x + B.w, B.y + B.h)];
    return [Math.min(...P.map(p => p[0])), Math.min(...P.map(p => p[1])), Math.max(...P.map(p => p[0])), Math.max(...P.map(p => p[1]))];
  }

  // what the board says right now: the opponent's logo, the date and the time
  function text(now) {
    if (!data) return null;
    const g = (data.games || []).find(x => Date.parse(x.date) + GAME_HOURS * 3600e3 > now);
    if (!g) {
      const season = (data.next && data.next.season) || (data.season || new Date(now).getUTCFullYear()) + 1;
      return { tba: true, big: 'WEEK 1', mid: season + ' · TBA' };
    }
    const ko = Date.parse(g.date), base = { vs: g.home ? 'vs' : '@', opp: g.opp };
    if (now >= ko) return { ...base, date: 'TODAY', time: 'GAME ON', on: true };
    if (!g.timeValid) { const et = at(ko, chicagoOffset(ko) + 1); return { ...base, date: dayDate(et), time: 'TIME TBA' }; } // a US date: ESPN parks undecided games at midnight Eastern
    const bkk = at(ko, 7);
    return { ...base, date: dayDate(bkk), time: hm(bkk) };
  }

  // front-on, in board px from the face's top-left, at F bitmap px per board px. Two columns: left, vs / @ and the opponent's logo;
  // right, the date over the kickoff time; a chalk line between them. Off season: the two lines across the whole board.
  function paint(T, F) {
    const w = B.w, h = B.h, m = 3; // m: margin inside the frame
    if (!bmp) bmp = document.createElement('canvas');
    bmp.width = Math.ceil(w * F); bmp.height = Math.ceil(h * F);
    const g = bmp.getContext('2d'); g.clearRect(0, 0, bmp.width, bmp.height);
    const font = (px, wt = 800) => `${wt} ${px * F}px ${sans}`;
    const say = (t, cx, y, px, color, maxW) => {
      let p = px; g.font = font(p); while (p > 2 && g.measureText(t).width > maxW * F) { p -= 0.1; g.font = font(p); }
      g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.shadowColor = 'rgba(240,236,224,.22)'; g.shadowBlur = 0.5 * F;
      g.fillText(t, cx * F, y * F); g.shadowBlur = 0; // chalk bleeds a little
    };
    if (T.tba) {
      say(T.big, w / 2, h / 2 - 2, 15, CHALK, w - m * 2);
      say(T.mid, w / 2, h / 2 + 13, 11, '#fbf8f2', w - m * 2);
      return;
    }
    const lg = h - 2 * m - 4, ly = (h - lg) / 2; // the opponent's logo: nearly the board's full height
    g.font = font(6, 700); const vw = g.measureText(T.vs).width / F, lx = m + vw + 1.5;
    g.fillStyle = 'rgba(240,236,224,.8)'; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(T.vs, m * F, (h / 2 + 2) * F);
    const OL = logoOf(T.opp.logo);
    if (OL) { g.imageSmoothingQuality = 'high'; g.drawImage(small(OL, lg * F), lx * F, ly * F, lg * F, lg * F); }
    else say(T.opp.abbr || '', lx + lg / 2, h / 2 + 5, lg * 0.45, ORANGE, lg);
    const split = lx + lg + 2;
    g.fillStyle = 'rgba(240,236,224,.28)'; g.fillRect(split * F, (m + 4) * F, 0.6 * F, (h - 2 * m - 8) * F); // the chalk line
    const rx = split + 2, rw = w - m - rx, rc = rx + rw / 2;
    say(T.date, rc, h / 2 - 2.5, 10, CHALK, rw);
    say(T.time, rc, h / 2 + 13, 16, T.on ? ORANGE : '#fbf8f2', rw);
  }
  // lay the front-on writing onto the wall, at the screen's pixels: each strip (about 2 screen px wide) keeps its own scale towards the
  // vanishing point, like the board itself. v: { k, ox, oy } = canvas px per plate px and the plate's offset on the canvas
  function warp(v, F) {
    const [bx0, by0, bx1, by1] = bounds(), X0 = Math.floor(v.ox + bx0 * v.k) - 1, Y0 = Math.floor(v.oy + by0 * v.k) - 1;
    const W = Math.ceil(v.ox + bx1 * v.k) - X0 + 2, H = Math.ceil(v.oy + by1 * v.k) - Y0 + 2;
    if (!out) { out = document.createElement('canvas'); shade = document.createElement('canvas'); }
    out.width = shade.width = W; out.height = shade.height = H;
    const g = out.getContext('2d'), n = Math.max(8, Math.ceil((bx1 - bx0) * v.k / 2)), sw = B.w / n;
    g.imageSmoothingQuality = 'high';
    for (let i = 0; i < n; i++) {
      const xa = B.x + i * sw, xb = xa + sw, [Xa] = toWall(xa, 0), [Xb] = toWall(xb, 0), sm = s(xa + sw / 2), top = wv ? wv.vy + (B.y - wv.vy) * sm : B.y;
      const dx = v.ox + Xa * v.k - X0, dw = (Xb - Xa) * v.k, dy = v.oy + top * v.k - Y0, dh = B.h * sm * v.k;
      g.drawImage(bmp, i * sw * F, 0, Math.min(sw * F + 1, bmp.width - i * sw * F), bmp.height, dx, dy, dw + 0.35, dh);
    }
    const sg = shade.getContext('2d'); sg.drawImage(out, 0, 0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#05030a'; sg.fillRect(0, 0, W, H); // night: the room's shade
    dev = { x: X0, y: Y0 };
  }

  return {
    set(d) { data = d && (d.games || d.next) ? d : null; key = ''; changed = true; },
    get data() { return data; },
    get bitmap() { return bmp; }, // check aid: the front-on writing before it is laid onto the wall
    // where to write: the wall's perspective { vx, vy, ds } (main.js initBooks, from layout.json bookcase.warp) and the board's face
    // [x, y, w, h] in front-on px (layout.json kitchen.board.rect, written by portable/art/scene.js)
    place(v, rect) { wv = v; B = rect ? { x: rect[0], y: rect[1], w: rect[2], h: rect[3] } : null; ver++; changed = true; },
    // plate-px box for the lite mode's repaints
    box: () => B ? bounds() : null,
    // true when the picture changed since the last call (lite then repaints the box)
    tick(now) { if (!B) return false; const T = text(now), k2 = JSON.stringify(T); if (k2 !== key) { key = k2; changed = true; this.T = T; } const c = changed; changed = false; return c; },
    // v: { k, ox, oy } from main.js; draws in canvas px (identity transform)
    draw(ctx, night, now, v) {
      if (!B) return;
      this.tick(now);
      if (!this.T) return;
      const pk = key + ver + '|' + v.k.toFixed(4) + '|' + v.ox.toFixed(2) + '|' + v.oy.toFixed(2);
      if (!out || this.painted !== pk) { const F = v.k * 2; paint(this.T, F); warp(v, F); this.painted = pk; }
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(out, dev.x, dev.y);
      if (night > 0) { ctx.globalAlpha = 0.25 * night; ctx.drawImage(shade, dev.x, dev.y); }
      ctx.restore();
    },
  };
}
