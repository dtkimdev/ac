// Music. The button plays the Lofi Trance Mix by Velvet Vinyl in YouTube's embedded player (bottom of this file); if YouTube cannot load,
// this original 90s-style lofi hip-hop, synthesized live with WebAudio (no files, no samples), plays instead. Off by default.
// Nothing ever restarts: the groove is scheduled bar by bar forever (the chords and the voicings drift, seeded).
'use strict';
(function () {
const AC = window.AC;
const MIX = 0.4, BPM = 74, BEAT = 60 / BPM, S16 = BEAT / 4, SWING = 0.17, LOOK = 1.7; // lookahead outlasts the 1 s timer clamp of a hidden tab
// two-bar chords, Rhodes voicings: Fmaj9 Em7 | Dm9 G13 | Bbmaj7 Am7 | Gm9 C7b9 ... and an answer that lands somewhere else
const SONG = [
  [[53, 60, 64, 67, 69], [52, 59, 62, 67, 71]], [[50, 60, 65, 69, 64], [43, 59, 65, 69, 64]],
  [[46, 57, 62, 65, 69], [45, 55, 60, 64, 67]], [[43, 58, 62, 65, 69], [48, 58, 64, 68, 73]],
  [[53, 60, 64, 67, 69], [50, 60, 65, 69, 72]], [[46, 57, 62, 65, 72], [48, 58, 64, 67, 70]],
];
const PENTA = [69, 72, 74, 76, 79, 81, 84];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
let ctx = null, master = null, keys = null, drums = null, bassB = null, wobble = null, timer = null, offT = null;
let bar = 0, step = 0, nextT = 0, seed = 7;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
function curve(k) { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); } return c; }
const white = r => { for (let i = 0; i < r.length; i++) r[i] = Math.random() * 2 - 1; };
function build() {
  master = ctx.createGain(); master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
  const tape = ctx.createWaveShaper(); tape.curve = curve(1.25); tape.oversample = '2x';
  const roll = ctx.createBiquadFilter(); roll.type = 'lowpass'; roll.frequency.value = 5200; roll.Q.value = 0.3; // the 12-bit, cassette top end
  const body = ctx.createBiquadFilter(); body.type = 'lowshelf'; body.frequency.value = 180; body.gain.value = 2.5;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 32;
  master.connect(comp).connect(tape).connect(roll).connect(body).connect(hp).connect(ctx.destination);
  keys = ctx.createGain(); keys.gain.value = 0.62; drums = ctx.createGain(); drums.gain.value = 0.72; bassB = ctx.createGain(); bassB.gain.value = 0.6;
  const trem = ctx.createGain(); trem.gain.value = 0.9; const tl = ctx.createOscillator(), tg = ctx.createGain(); tl.frequency.value = 3.1; tg.gain.value = 0.1; tl.connect(tg).connect(trem.gain); tl.start(); // Rhodes tremolo
  // a short dark room: one short delay feeding itself, cheap and warm
  const dl = ctx.createDelay(0.5), fb = ctx.createGain(), dk = ctx.createBiquadFilter(); dl.delayTime.value = BEAT * 0.75; fb.gain.value = 0.28; dk.type = 'lowpass'; dk.frequency.value = 1600;
  keys.connect(trem).connect(master); trem.connect(dl); dl.connect(dk).connect(fb).connect(dl); const wet = ctx.createGain(); wet.gain.value = 0.3; dk.connect(wet).connect(master);
  drums.connect(master); bassB.connect(master);
  // tape wow: every key note's pitch hangs off this one slow LFO pair
  wobble = ctx.createGain(); wobble.gain.value = 1;
  const w1 = ctx.createOscillator(), g1 = ctx.createGain(), w2 = ctx.createOscillator(), g2 = ctx.createGain(); w1.frequency.value = 0.37; g1.gain.value = 5.5; w2.frequency.value = 5.3; g2.gain.value = 1.3;
  w1.connect(g1).connect(wobble); w2.connect(g2).connect(wobble); w1.start(); w2.start();
}
function rhodes(m, t, vel, dur) {
  const f = mtof(m), g = ctx.createGain(), c = ctx.createOscillator(), cg = ctx.createGain(), md = ctx.createOscillator(), mg = ctx.createGain(), bell = ctx.createOscillator(), bg = ctx.createGain();
  c.type = 'sine'; c.frequency.value = f; md.frequency.value = f; mg.gain.setValueAtTime(f * 1.1, t); mg.gain.exponentialRampToValueAtTime(f * 0.12, t + 0.6); // bark that settles
  bell.frequency.value = f * 14; bg.gain.setValueAtTime(vel * 0.09, t); bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.09); // the tine
  md.connect(mg).connect(c.frequency); wobble.connect(c.detune); c.connect(cg).connect(g); bell.connect(bg).connect(g); cg.gain.value = 1;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.012); g.gain.setTargetAtTime(vel * 0.55, t + 0.04, 0.5); g.gain.setTargetAtTime(0, t + dur, 0.22);
  g.connect(keys); const end = t + dur + 1.3; for (const o of [c, md, bell]) { o.start(t); o.stop(end); }
  c.onended = () => { try { wobble.disconnect(c.detune); } catch (e) {} g.disconnect(); };
}
function kick(t, v) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(115, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.09);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.32); o.connect(g).connect(drums); o.start(t); o.stop(t + 0.35);
}
let nb = null;
function hit(t, v, type, freq, q, dur) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = nb; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); s.connect(f).connect(g).connect(drums); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
}
function snare(t, v) { hit(t, v * 0.8, 'bandpass', 1750, 0.7, 0.2); hit(t, v * 0.36, 'lowpass', 900, 0.5, 0.11); const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(205, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.07); g.gain.setValueAtTime(v * 0.34, t); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.11); o.connect(g).connect(drums); o.start(t); o.stop(t + 0.13); }
function bass(m, t, v, dur) {
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), h = ctx.createGain(); o.frequency.value = mtof(m); o2.type = 'triangle'; o2.frequency.value = mtof(m) * 2; h.gain.value = 0.1;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.02); g.gain.setTargetAtTime(v * 0.65, t + 0.05, 0.3); g.gain.setTargetAtTime(0, t + dur, 0.07); o.connect(g); o2.connect(h).connect(g); g.connect(bassB); for (const x of [o, o2]) { x.start(t); x.stop(t + dur + 0.5); }
}
const KICKS = [[0, 7, 10], [0, 7, 10, 13], [0, 3, 10]];
function playBar(t) { // t = start of the bar. The drums loop tightly, the keys drift, as a beat tape would
  const s = i => t + i * S16 + (i % 2 ? SWING * S16 : 0) + (rnd() - 0.5) * 0.006; // lazy swung sixteenths, a little human
  const k = KICKS[bar % 8 === 7 ? 2 : (bar % 4 === 3 ? 1 : 0)];
  for (const i of k) kick(s(i), i === 0 ? 0.92 : 0.72);
  for (const i of [4, 12]) snare(s(i) + 0.012, 0.5);
  if (bar % 8 === 7 && rnd() < 0.6) snare(s(15), 0.14); // ghost into the turnaround
  for (let i = 0; i < 16; i += 2) hit(s(i), (i % 4 ? 0.1 : 0.17) * (0.85 + rnd() * 0.3), 'highpass', 6200, 0.6, i === 14 && bar % 4 === 1 ? 0.16 : 0.05);
  for (const i of [3, 11]) if (rnd() < 0.38) hit(s(i), 0.06, 'highpass', 6800, 0.6, 0.04);
  const pair = SONG[Math.floor(bar / 2) % SONG.length], half = bar % 2;
  const ch = pair[half], root = ch[0], up = ch.slice(1), arp = rnd() < 0.3;
  up.forEach((m, i) => { const late = 0.012 * i + rnd() * 0.012; rhodes(m + (m < 57 ? 12 : 0), t + (arp ? i * S16 * 1.5 : late), 0.13 + rnd() * 0.035, BEAT * 3.1); });
  if (rnd() < 0.45) up.forEach((m, i) => rhodes(m + (m < 57 ? 12 : 0), s(14) + 0.01 * i, 0.07, BEAT * 0.9)); // the pickup stab
  bass(root - 12 + (root < 45 ? 12 : 0), s(0), 0.62, BEAT * 1.5); if (rnd() < 0.7) bass(root - 12 + (root < 45 ? 12 : 0), s(7), 0.44, BEAT * 0.7); if (rnd() < 0.5) bass(root - 12 + (root < 45 ? 12 : 0) + 7, s(10), 0.4, BEAT);
  if (rnd() < 0.42) { // a few lazy notes on top, never a tune to tire of
    const n = 1 + Math.floor(rnd() * 3); let at = 4 + Math.floor(rnd() * 6);
    for (let j = 0; j < n && at < 15; j++) { rhodes(PENTA[Math.floor(rnd() * PENTA.length)], s(at), 0.075 + rnd() * 0.03, BEAT * 1.2); at += 2 + Math.floor(rnd() * 3); }
  }
}
const BAR = BEAT * 4;
function pump(until) { while (nextT < until) { playBar(nextT); bar++; nextT += BAR; } }
const tick = () => pump(ctx.currentTime + LOOK);
function init(c) {
  ctx = c; const n = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate); white(n.getChannelData(0)); nb = n; build();
}
const synth = {
  on: false,
  toggle() {
    if (!ctx) init(new (window.AudioContext || window.webkitAudioContext)());
    this.on = !this.on; clearTimeout(offT);
    const T = ctx.currentTime;
    if (this.on) {
      ctx.resume(); if (nextT < T + 0.1) nextT = T + 0.12; // picks the groove up where it stood
      tick(); timer = setInterval(tick, 400);
      master.gain.setTargetAtTime(MIX, T, 0.6);
    } else {
      clearInterval(timer); master.gain.setTargetAtTime(0, T, 0.3);
      offT = setTimeout(() => { if (!this.on) ctx.suspend(); }, 1600); // silent = no CPU
    }
    return this.on;
  },
  _render: async sec => { // preview check only: renders offline, nothing is played
    const c = new OfflineAudioContext(2, 44100 * sec, 44100), keep = [ctx, nextT, bar]; bar = 0; nextT = 0.1; init(c); master.gain.value = MIX; pump(sec);
    const buf = await c.startRendering(); ctx = keep[0]; nextT = keep[1]; bar = keep[2]; return buf;
  },
};
// The music (David, 2026-11-10): "Lofi Trance Mix" by Velvet Vinyl on YouTube (HTOf4foA5LE), its first 30 minutes on a loop. It plays in
// YouTube's own embedded player, shown small in the corner while it plays (YouTube's terms ask for a visible player of at least
// 200 x 200 px); nothing is downloaded or re-hosted. youtube-nocookie.com: no tracking cookies until it plays. If YouTube cannot load
// (offline, blocked, an old TV browser), the generated lofi above plays instead.
const YT_ID = 'HTOf4foA5LE', LOOP_S = 1800;
let yt = null, ytBox = null, ytReady = false, ytFailed = false, ytLoop = null;
function ytOpen() {
  ytBox = document.createElement('div'); ytBox.id = 'yt';
  ytBox.style.cssText = 'position:fixed;right:14px;bottom:46px;width:200px;height:200px;z-index:3;border-radius:12px;overflow:hidden;background:#000;box-shadow:0 6px 24px rgba(0,0,0,.45)';
  const f = document.createElement('iframe'); f.title = 'Lofi Trance Mix (Velvet Vinyl) on YouTube'; f.width = '200'; f.height = '200';
  f.src = 'https://www.youtube-nocookie.com/embed/' + YT_ID + '?enablejsapi=1&autoplay=1&playsinline=1&rel=0&start=0&end=' + LOOP_S + '&origin=' + encodeURIComponent(location.origin);
  f.allow = 'autoplay; encrypted-media; picture-in-picture'; f.referrerPolicy = 'strict-origin-when-cross-origin'; f.style.cssText = 'border:0;width:100%;height:100%';
  ytBox.appendChild(f); document.body.appendChild(ytBox);
  const made = () => { try { yt = new window.YT.Player(f, { events: {
    onReady: e => { ytReady = true; if (AC.music.on) e.target.playVideo(); },
    onStateChange: e => { if (e.data === 0) { e.target.seekTo(0, true); e.target.playVideo(); } }, // ended (at 30:00): back to the start
    onError: () => fallback() } }); } catch (e) { fallback(); } };
  if (window.YT && window.YT.Player) made(); else { const prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { if (prev) prev(); made(); };
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.onerror = fallback; document.head.appendChild(s); }
  setTimeout(() => { if (!ytReady) fallback(); }, 12000);
  ytLoop = setInterval(() => { try { if (ytReady && AC.music.on && yt.getCurrentTime() >= LOOP_S - 1) yt.seekTo(0, true); } catch (e) {} }, 4000);
}
function fallback() {
  if (ytFailed) return; ytFailed = true; clearInterval(ytLoop); if (ytBox) ytBox.remove(); ytBox = null;
  if (AC.music.on && !synth.on) synth.toggle();
}
AC.music = {
  on: false,
  toggle() {
    this.on = !this.on;
    if (ytFailed) { if (synth.on !== this.on) synth.toggle(); return this.on; }
    if (this.on) { if (!ytBox) ytOpen(); else { ytBox.style.display = ''; if (ytReady) yt.playVideo(); } }
    else if (ytBox) { if (ytReady) yt.pauseVideo(); ytBox.style.display = 'none'; }
    return this.on;
  },
  _render: synth._render,
  _state() { try { return ytFailed ? 'synth' : ytReady ? { state: yt.getPlayerState(), at: Math.round(yt.getCurrentTime()) } : 'loading'; } catch (e) { return 'error'; } }, // check aid
};
})();
