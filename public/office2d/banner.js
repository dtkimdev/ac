// The Bears board (David, 2026-11-20): the Chicago Bears' next game, written on the kitchen's menu board on the slanted left wall: the
// Bears logo, vs / @ and the opponent's logo (no names), the date and the kickoff time (Bangkok time, the office's clock). Only what reads
// from across the room. In the off season: next season's week 1 game, or "WEEK 1 / 2027 · TBA" until the NFL releases the schedule.
// The data is bears.json, written by bin/bears.js on every publish (so the ↻ button, a Grok refresh and every push bring a fresh
// schedule); the page re-reads it every few minutes and after ↻. Four hours after a kickoff it moves on to the next game by itself.
// The board itself (frame, plain chalkboard face) is painted into the room pictures by portable/art/scene.js, which writes its place to
// layout.json kitchen.board (front-on px). This draws the writing front-on into a bitmap and lays it onto the wall with the bookcase's
// perspective (layout.json bookcase.warp), in vertical strips; both only when the text changes or a logo arrives, so a frame costs one
// drawImage. Hide it with config.js BANNER.show.
const S = 10; // bitmap pixels per plate px: the board is small, so draw it fine for big screens and TVs
const CHALK = 'rgba(240,236,224,.93)', ORANGE = '#f07a2e';
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const GAME_HOURS = 4; // a game stays "on" this long after kickoff, then the next one shows
const STRIPS = 16;    // vertical strips for the perspective (the wall shrinks towards the window corner)

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
  let data = null, bmp = null, out = null, shade = null, key = '', changed = false, ver = 0, ob = null; // ver: bumped when a logo arrives
  const logos = {};
  const logoOf = url => {
    if (!url) return null;
    if (!logos[url]) { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { ver++; changed = true; }; im.onerror = () => { im.bad = true; }; im.src = url; logos[url] = im; }
    const im = logos[url]; return im.complete && im.naturalWidth && !im.bad ? im : null;
  };
  // a logo shrunk in halves to the size it is drawn at (one big jump from 500 px down to ~140 px looks blocky in canvas)
  const small = (im, px) => { const k = 'c' + px; if (im[k]) return im[k]; let c = im, w = im.naturalWidth || im.width; while (w / 2 >= px) { const n = document.createElement('canvas'); n.width = n.height = Math.round(w / 2); const g = n.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, n.width, n.height); c = n; w = n.width; } return (im[k] = c); };
  const s = x => wv ? 1 / (1 + x / wv.ds) : 1;
  const toWall = (x, y) => wv ? [wv.vx - wv.vx * s(x), wv.vy + (y - wv.vy) * s(x)] : [x, y];
  function bounds() { // the board's face on screen (plate px)
    const P = [toWall(B.x, B.y), toWall(B.x + B.w, B.y), toWall(B.x, B.y + B.h), toWall(B.x + B.w, B.y + B.h)];
    return [Math.min(...P.map(p => p[0])), Math.min(...P.map(p => p[1])), Math.max(...P.map(p => p[0])), Math.max(...P.map(p => p[1]))];
  }

  // what the board says right now: the two logos, the date and the time
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

  const font = (px, w = 800) => `${w} ${px * S}px ${sans}`;
  function fit(g, t, maxW, px, w) { let p = px; g.font = font(p, w); while (p > 2 && g.measureText(t).width > maxW * S) { p -= 0.1; g.font = font(p, w); } return p; }
  function say(g, t, cx, y, px, color, maxW) {
    fit(g, t, maxW, px); g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.shadowColor = 'rgba(240,236,224,.25)'; g.shadowBlur = 0.6 * S; g.fillText(t, cx * S, y * S); g.shadowBlur = 0; // chalk bleeds a little
  }

  // front-on, in board px from the face's top-left. Two columns, so everything can be big (David, 2026-11-20: readable from across the
  // room): left, the Bears logo, vs / @ and the opponent's logo; right, the date over the kickoff time; a chalk line between them.
  function paint(T) {
    const w = B.w, h = B.h, m = 3; // m: margin inside the frame
    if (!bmp) bmp = document.createElement('canvas');
    bmp.width = w * S; bmp.height = h * S;
    const g = bmp.getContext('2d'); g.clearRect(0, 0, bmp.width, bmp.height);
    const L = logoOf(data.team && data.team.logo), lg = Math.min(h - 2 * m - 4, 19.5), ly = (h - lg) / 2; // logos sized so the date and time get half the board
    const logo = (im, x, abbr) => { if (im) { g.imageSmoothingQuality = 'high'; g.drawImage(small(im, lg * S), x * S, ly * S, lg * S, lg * S); } else say(g, abbr, x + lg / 2, ly + lg * 0.68, lg * 0.5, ORANGE, lg); };
    // left column
    let split;
    if (T.tba) { logo(L, m, 'CHI'); split = m + lg + 3; }
    else {
      g.font = font(5, 700); const vw = g.measureText(T.vs).width / S, gap = 1.2;
      logo(L, m, 'CHI');
      g.fillStyle = 'rgba(240,236,224,.75)'; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(T.vs, (m + lg + gap) * S, (h / 2 + 2) * S);
      logo(logoOf(T.opp.logo), m + lg + gap * 2 + vw, T.opp.abbr || '');
      split = m + lg * 2 + gap * 3 + vw;
    }
    g.fillStyle = 'rgba(240,236,224,.28)'; g.fillRect(split * S, (m + 4) * S, 0.6 * S, (h - 2 * m - 8) * S); // the chalk line
    // right column: date over time (or WEEK 1 over the season)
    const rx = split + 1.5, rw = w - m - rx, rc = rx + rw / 2;
    const top = T.tba ? T.big : T.date, bottom = T.tba ? T.mid : T.time;
    say(g, top, rc, h / 2 - 2.5, 10, CHALK, rw);
    say(g, bottom, rc, h / 2 + 12.5, 16, T.on ? ORANGE : '#fbf8f2', rw);
    warp();
  }
  // lay the front-on writing onto the wall: each vertical strip keeps its own scale towards the vanishing point, like the board itself
  function warp() {
    ob = bounds(); const [bx0, by0, bx1, by1] = ob, W = Math.ceil((bx1 - bx0) * S), H = Math.ceil((by1 - by0) * S);
    if (!out) { out = document.createElement('canvas'); shade = document.createElement('canvas'); }
    out.width = shade.width = W; out.height = shade.height = H;
    const g = out.getContext('2d'), sw = B.w / STRIPS;
    g.imageSmoothingQuality = 'high';
    for (let i = 0; i < STRIPS; i++) {
      const xa = B.x + i * sw, xb = xa + sw, [Xa] = toWall(xa, 0), [Xb] = toWall(xb, 0), sm = s(xa + sw / 2), top = wv ? wv.vy + (B.y - wv.vy) * sm : B.y;
      g.drawImage(bmp, i * sw * S, 0, sw * S + (i < STRIPS - 1 ? 1 : 0), bmp.height, (Xa - bx0) * S, (top - by0) * S, (Xb - Xa) * S + 0.6, B.h * sm * S);
    }
    const sg = shade.getContext('2d'); sg.drawImage(out, 0, 0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#05030a'; sg.fillRect(0, 0, W, H); // night: the room's shade
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
    draw(ctx, night, now) {
      if (!B) return;
      this.tick(now);
      if (!this.T) return;
      if (!out || this.painted !== key + ver) { paint(this.T); this.painted = key + ver; }
      const [x, y, x1, y1] = ob;
      ctx.drawImage(out, x, y, x1 - x, y1 - y);
      if (night > 0) { ctx.globalAlpha = 0.25 * night; ctx.drawImage(shade, x, y, x1 - x, y1 - y); ctx.globalAlpha = 1; }
    },
  };
}
