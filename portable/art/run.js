#!/usr/bin/env node
'use strict';
/**
 * Runs portable/art/heads-fix.js in headless Chrome against the preview and writes the results to a folder for review:
 *   node portable/art/run.js <out-dir>        -> <out-dir>/turn-heads.webp, walk-side.webp, walk-side.json
 * Needs the preview server (node portable/serve.js) and a fresh node portable/rebuild.js. Copy the files into
 * public/office2d/assets yourself after checking them, and raise ?v= in main.js.
 */
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const out = path.resolve(process.argv[2] || 'art-out'), root = path.resolve(__dirname, '..', '..');
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(__dirname, 'heads-fix.js'), path.join(root, 'portable', 'preview', 'heads-fix.js'));
const dump = path.join(out, 'raw.json');
const res = execFileSync(process.execPath, [path.join(root, 'portable', 'shot.js'), '--url', 'http://127.0.0.1:8791/?q=0&notags=1', '--size', '400x300', '--wait', '2',
  '--js', "import('/heads-fix.js').then(m => m.run('/office2d/assets/')).then(r => { window.__artDone = r; }, e => { window.__artDone = { error: String(e) }; })",
  '--after', '25', '--print', 'JSON.stringify({ done: window.__artDone, out: window.__artOut })', '--out', path.join(out, 'page.png')], { maxBuffer: 1 << 28 }).toString();
const line = res.split('\n').find(l => l.startsWith('"{')) || res.split('\n').find(l => l.startsWith('{'));
const j = JSON.parse(line.startsWith('"') ? JSON.parse(line) : line);
if (!j.out) { console.error('no output', j.done); process.exit(1); }
const save = (name, url) => fs.writeFileSync(path.join(out, name), Buffer.from(url.split(',')[1], 'base64'));
save('turn-heads.webp', j.out.heads); save('walk-side.webp', j.out.side);
fs.writeFileSync(path.join(out, 'walk-side.json'), JSON.stringify(j.out.sideMeta, null, 1));
console.log('filled', j.out.report.join(' '));
console.log('wrote', out);
