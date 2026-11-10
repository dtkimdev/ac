#!/usr/bin/env node
'use strict';
/**
 * Runs portable/art/desks.js in headless Chrome against the preview and writes the repainted room pictures to a folder for review:
 *   node portable/art/run-desks.js <out-dir>   -> plate-dusk(.hi).webp, plate-night(.hi).webp, nochair-dusk.webp, nochair-night.webp
 * Needs the preview server and a fresh node portable/rebuild.js, run from the ORIGINAL pictures (it repaints whatever is in assets/).
 * Copy the files into public/office2d/assets yourself after checking them, and raise ?v= in main.js.
 */
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const out = path.resolve(process.argv[2] || 'art-desks'), root = path.resolve(__dirname, '..', '..');
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(__dirname, 'desks.js'), path.join(root, 'portable', 'preview', 'desks.js'));
const res = execFileSync(process.execPath, [path.join(root, 'portable', 'shot.js'), '--url', 'http://127.0.0.1:8791/?q=0&notags=1', '--size', '400x300', '--wait', '2',
  '--js', "import('/desks.js').then(m => m.run('/office2d/assets/')).then(r => { window.__deskDone = r; }, e => { window.__deskDone = { error: String(e && e.stack || e) }; })",
  '--after', '40', '--print', 'JSON.stringify({ done: window.__deskDone, out: window.__deskOut })', '--out', path.join(out, 'page.png')], { maxBuffer: 1 << 30 }).toString();
const line = res.split('\n').find(l => l.startsWith('"{'));
const j = JSON.parse(JSON.parse(line));
if (!j.out) { console.error('no output', j.done); process.exit(1); }
for (const [name, url] of Object.entries(j.out)) fs.writeFileSync(path.join(out, name), Buffer.from(url.split(',')[1], 'base64'));
console.log('wrote', Object.keys(j.out).join(' '), 'to', out);
