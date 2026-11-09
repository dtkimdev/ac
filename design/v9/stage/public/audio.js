// Original ambient piano loop, synthesized with WebAudio (no files). Off by default.
'use strict';
(function () {
const AC = window.AC;
let ctx = null, master = null, timer = null, step = 0, nextT = 0;
// Dmaj9 – Bm7 – Gmaj7 – Asus4, slow and sparse
const CHORDS = [[50, 57, 62, 64, 66], [47, 54, 57, 62, 66], [43, 50, 54, 59, 62], [45, 52, 57, 59, 64]];
const SCALE = [62, 64, 66, 69, 71, 74, 76, 78, 81];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function rnd(seed) { let a = seed; return () => (a = (a * 1664525 + 1013904223) >>> 0) / 4294967296; }
const melody = (() => { const r = rnd(1793); const out = []; for (let i = 0; i < 64; i++) out.push(r() < 0.42 ? SCALE[(r() * SCALE.length) | 0] : null); return out; })();
function reverb() {
  const len = ctx.sampleRate * 3.2, b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  const cv = ctx.createConvolver(); cv.buffer = b; return cv;
}
function note(m, t, vel, dur) {
  const f = mtof(m), g = ctx.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.01); g.gain.exponentialRampToValueAtTime(vel * 0.3, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  [[1, 1], [2, 0.35], [3, 0.12], [4.01, 0.06]].forEach(([h, a]) => { const o = ctx.createOscillator(); o.type = h === 1 ? 'triangle' : 'sine'; o.frequency.value = f * h; o.detune.value = (Math.random() - 0.5) * 4; const og = ctx.createGain(); og.gain.value = a; o.connect(og).connect(g); o.start(t); o.stop(t + dur + 0.1); });
  g.connect(master);
}
function tick() {
  const beat = 60 / 64 / 2; // eighth notes at 64 bpm
  while (nextT < ctx.currentTime + 0.4) {
    const bar = Math.floor(step / 8) % 4, pos = step % 8;
    if (pos === 0) CHORDS[bar].forEach((m, i) => note(m, nextT + i * 0.06, 0.05, 5));
    const mm = melody[step % 64]; if (mm) note(mm, nextT, 0.06 + (step % 3) * 0.01, 3);
    step++; nextT += beat;
  }
}
AC.music = {
  on: false,
  toggle() {
    if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = 0.5; const rv = reverb(), wet = ctx.createGain(); wet.gain.value = 0.5; master.connect(ctx.destination); master.connect(rv).connect(wet).connect(ctx.destination); }
    this.on = !this.on;
    if (this.on) { ctx.resume(); nextT = ctx.currentTime + 0.1; timer = setInterval(tick, 150); master.gain.setTargetAtTime(0.5, ctx.currentTime, 0.5); }
    else { clearInterval(timer); master.gain.setTargetAtTime(0, ctx.currentTime, 0.3); }
    return this.on;
  },
};
})();
