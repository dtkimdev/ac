#!/usr/bin/env node
'use strict';
/**
 * Character fixes (portable/art/chars.js): Cyber without the hair bun, Studio without the cap, LF in a dark blue hoodie.
 *   node portable/art/run-chars.js <out-dir> [--install]
 * Starts from the pictures as they were at commit 2eb30a1, so it can be run again. --install writes them into the art pack (public/office2d/art) and
 * gives Studio's sprite entries LF's measurements (Studio is now drawn from LF's art). Needs the preview server (node portable/serve.js).
 */
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const pack = require(path.join(__dirname, '..', '..', 'bin', 'art-pack.js')); // the art pack: where each file lives
const out = path.resolve(process.argv[2] || 'chars'), install = process.argv.includes('--install'), root = path.resolve(__dirname, '..', '..'), prev = path.join(root, 'portable', 'preview');
const SRC = '2eb30a1', FILES = ['layout.json', 'w02.png', 'w03.png', 'w05.png', 'f02.png', 'f03.png', 'f05.png', 'walk-side.webp', 'turn-heads.webp', 'turn-bodies.webp'];
fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(path.join(prev, 'chars-src'), { recursive: true });
for (const f of FILES) fs.writeFileSync(path.join(prev, 'chars-src', f), execFileSync('git', ['show', `${SRC}:public/office2d/assets/${f}`], { cwd: root, maxBuffer: 1 << 28 }));
fs.copyFileSync(path.join(__dirname, 'chars.js'), path.join(prev, 'chars.js'));
const res = execFileSync(process.execPath, [path.join(root, 'portable', 'shot.js'), '--url', 'http://127.0.0.1:8791/?q=0&notags=1', '--size', '400x300', '--wait', '1',
  '--js', "import('/chars.js').then(m => m.run('/chars-src/')).then(r => { window.__charsDone = r; }, e => { window.__charsDone = { error: String(e && e.stack || e) }; })",
  '--print', 'JSON.stringify({ done: window.__charsDone, out: window.__charsOut })', '--out', path.join(out, 'page.png')], { maxBuffer: 1 << 30 }).toString();
const j = JSON.parse(JSON.parse(res.split('\n').find(l => l.startsWith('"{'))));
console.log(JSON.stringify(j.done).slice(0, 400));
if (!j.out) process.exit(1);
for (const [k, v] of Object.entries(j.out)) fs.writeFileSync(path.join(out, k), Buffer.from(v.split(',')[1], 'base64'));
if (install) {
  for (const k of Object.keys(j.out)) fs.copyFileSync(path.join(out, k), pack.artPath(k));
  const lp = pack.artPath('layout.json'), L = JSON.parse(fs.readFileSync(lp, 'utf8'));
  for (const k of ['w', 'h', 'hem', 'hemF']) L.sprites[2][k] = L.sprites[3][k];
  L.walkSide.hem[2] = L.walkSide.hem[3];
  fs.writeFileSync(lp, JSON.stringify(L));
  console.log('installed', Object.keys(j.out).join(' '));
}
