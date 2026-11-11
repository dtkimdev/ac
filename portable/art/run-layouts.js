#!/usr/bin/env node
'use strict';
/**
 * Layout options (portable/art/layouts.js): edits the current room pictures for each option and renders it with the real viewer.
 *   node portable/art/run-layouts.js <out-dir>
 *   -> <out-dir>/opt<N>/ (room pictures, layout.json, desk-fr-mask.png when the front-right desk grows) and <out-dir>/option-<N>.png
 * Needs the preview server (node portable/serve.js) and a fresh node portable/rebuild.js; it swaps each option into the preview's
 * assets to shoot it, then rebuilds the preview from public/ again. Nothing in public/ changes.
 */
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const pack = require(path.join(__dirname, '..', '..', 'bin', 'art-pack.js')); // the art pack: where each file lives
const out = path.resolve(process.argv[2] || 'layouts'), root = path.resolve(__dirname, '..', '..'), prev = path.join(root, 'portable', 'preview'), pa = path.join(prev, 'office2d', 'assets');
const shot = (...a) => execFileSync(process.execPath, [path.join(root, 'portable', 'shot.js'), ...a], { maxBuffer: 1 << 30 }).toString();
fs.mkdirSync(out, { recursive: true });
for (const f of ['layouts.js', 'room.js', 'inpaint.js']) fs.copyFileSync(path.join(__dirname, f), path.join(prev, f));
const res = shot('--url', 'http://127.0.0.1:8791/?q=0&notags=1', '--size', '400x300', '--wait', '1',
  '--js', "import('/layouts.js').then(m => m.run('/office2d/assets/')).then(r => { window.__layDone = r; }, e => { window.__layDone = { error: String(e && e.stack || e) }; })",
  '--print', 'JSON.stringify({ done: window.__layDone, out: window.__layOut })', '--out', path.join(out, 'page.png'));
const j = JSON.parse(JSON.parse(res.split('\n').find(l => l.startsWith('"{'))));
if (!j.out) { console.error(JSON.stringify(j.done)); process.exit(1); }
const opts = Object.keys(j.out);
for (const id of opts) {
  const o = j.out[id], dir = path.join(out, 'opt' + id); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'layout.json'), o.layout);
  for (const [k, v] of Object.entries(o)) if (/\.(webp|png)$/.test(k) && v) fs.writeFileSync(path.join(dir, k), Buffer.from(v.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(dir, 'name.txt'), o.name);
}
const t = process.env.T || '18:30';
try {
  for (const id of opts) {
    const dir = path.join(out, 'opt' + id);
    for (const f of fs.readdirSync(dir)) if (/\.(webp|png|json)$/.test(f)) pack.previewPut(f, path.join(dir, f));
    console.log(shot('--url', `http://127.0.0.1:8791/?q=0&t=${t}${process.env.TAGS ? '' : '&notags=1'}`, '--size', '1600x900', '--dpr', '1.5', '--wait', '9', '--out', path.join(out, `option-${id}.png`)).trim().split('\n').pop());
  }
} finally { execFileSync(process.execPath, [path.join(root, 'portable', 'rebuild.js')], { cwd: root }); }
console.log('options:', opts.join(' '));
