#!/usr/bin/env node
'use strict';
/**
 * Runs portable/art/room.js in headless Chrome against the preview and writes the repainted room pictures to a folder for review:
 *   node portable/art/run-room.js <out-dir> [bamboo,desks,nochair]
 *   -> plate-dusk(-hi).webp, plate-night(-hi).webp, nochair-dusk.webp, nochair-night.webp
 * Always starts from the ORIGINAL pictures of the seed commit (83b9edb), so it can be run again after a change.
 * Needs the preview server (node portable/serve.js). Copy the files into the art pack (node bin/art-pack.js find <file> says where) yourself after checking them,
 * and raise ?v= in main.js.
 */
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const out = path.resolve(process.argv[2] || 'art-room'), only = process.argv[3] || '', root = path.resolve(__dirname, '..', '..'), prev = path.join(root, 'portable', 'preview');
fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(path.join(prev, 'orig'), { recursive: true });
for (const f of ['room.js', 'inpaint.js']) fs.copyFileSync(path.join(__dirname, f), path.join(prev, f));
for (const f of ['plate-dusk.webp', 'plate-night.webp', 'plate-dusk-hi.webp', 'plate-night-hi.webp', 'nochair-dusk.webp']) fs.writeFileSync(path.join(prev, 'orig', f), execFileSync('git', ['show', '83b9edb:public/office2d/assets/' + f], { cwd: root, maxBuffer: 1 << 28 }));
fs.mkdirSync(path.join(prev, 'scene-src'), { recursive: true }); // the layout from before the scene build (74a4042): the room tool reads the seed desks and masks
for (const f of ['layout.json', 'water-mask.png']) fs.writeFileSync(path.join(prev, 'scene-src', f), execFileSync('git', ['show', '74a4042:public/office2d/assets/' + f], { cwd: root, maxBuffer: 1 << 28 }));
const arg = only ? JSON.stringify(only.split(',')) : 'null';
const res = execFileSync(process.execPath, [path.join(root, 'portable', 'shot.js'), '--url', `http://127.0.0.1:${process.env.PORTABLE_PORT || 8791}/?q=0&notags=1`, '--size', '400x300', '--wait', '1',
  '--js', `import('/room.js').then(m => m.run('/orig/', '/office2d/assets/', ${arg}, '/scene-src/')).then(r => { window.__roomDone = r; }, e => { window.__roomDone = { error: String(e && e.stack || e) }; })`,
  '--print', 'JSON.stringify({ done: window.__roomDone, out: window.__roomOut })', '--out', path.join(out, 'page.png')], { maxBuffer: 1 << 30 }).toString();
const line = res.split('\n').find(l => l.startsWith('"{'));
const j = JSON.parse(JSON.parse(line));
console.log(JSON.stringify(j.done));
if (!j.out) process.exit(1);
for (const [name, url] of Object.entries(j.out)) fs.writeFileSync(path.join(out, name), Buffer.from(url.split(',')[1], 'base64'));
console.log('wrote', Object.keys(j.out).join(' '), 'to', out);
