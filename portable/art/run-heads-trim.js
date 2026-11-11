#!/usr/bin/env node
'use strict';
// node portable/art/run-heads-trim.js <out.webp> : runs heads-trim.js on the preview's turn-heads.webp (see that file). Run once, on the
// pictures before this repair (commit 74a4042 or older); copy the result to public/office2d/art/bots/turning/turn-heads.webp after checking it.
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const out = path.resolve(process.argv[2] || 'turn-heads.webp'), root = path.resolve(__dirname, '..', '..');
fs.copyFileSync(path.join(__dirname, 'heads-trim.js'), path.join(root, 'portable', 'preview', 'heads-trim.js'));
const res = execFileSync(process.execPath, [path.join(root, 'portable', 'shot.js'), '--url', 'http://127.0.0.1:8791/?q=0&notags=1', '--size', '400x300', '--wait', '1',
  '--js', "import('/heads-trim.js').then(m => m.run('/office2d/assets/')).then(r => { window.__hd = r; }, e => { window.__hd = String(e && e.stack || e); })",
  '--print', 'JSON.stringify({ done: window.__hd, out: window.__headsOut })', '--out', path.join(path.dirname(out), 'heads-page.png')], { maxBuffer: 1 << 30 }).toString();
const j = JSON.parse(JSON.parse(res.split('\n').find(l => l.startsWith('"{'))));
if (!j.out) { console.error(j.done); process.exit(1); }
fs.writeFileSync(out, Buffer.from(j.out.split(',')[1], 'base64')); console.log('wrote', out, j.done);
