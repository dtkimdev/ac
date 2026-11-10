#!/usr/bin/env node
'use strict';
/**
 * The office rebuilt (portable/art/scene.js): clean floor, black four-leg desks, one monitor per bot, team desks, small corner bamboo.
 *   node portable/art/run-scene.js <out-dir> [--install]
 * 1. room.js (bamboo step only) fixes the corners from the seed pictures, 2. scene.js builds the room on top, 3. the result is put into
 * the preview and shot at dusk and night (<out-dir>/render-*.png). --install copies the files into public/office2d/assets as well.
 * Needs the preview server (node portable/serve.js).
 */
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const out = path.resolve(process.argv[2] || 'scene'), install = process.argv.includes('--install'), root = path.resolve(__dirname, '..', '..'), prev = path.join(root, 'portable', 'preview'), pa = path.join(prev, 'office2d', 'assets');
const node = (...a) => execFileSync(process.execPath, a, { cwd: root, maxBuffer: 1 << 30 }).toString();
fs.mkdirSync(out, { recursive: true });
node(path.join(root, 'portable', 'rebuild.js'));
console.log(node(path.join(__dirname, 'run-room.js'), path.join(prev, 'scene-base'), 'bamboo').trim().split('\n').pop().slice(0, 80));
fs.copyFileSync(path.join(__dirname, 'scene.js'), path.join(prev, 'scene.js'));
// the layout and water mask from before the first scene build (74a4042), so the tool can be run again on top of its own output
fs.mkdirSync(path.join(prev, 'scene-src'), { recursive: true });
for (const f of ['layout.json', 'water-mask.png']) fs.writeFileSync(path.join(prev, 'scene-src', f), execFileSync('git', ['show', '74a4042:public/office2d/assets/' + f], { cwd: root, maxBuffer: 1 << 28 }));
const res = node(path.join(root, 'portable', 'shot.js'), '--url', 'http://127.0.0.1:8791/?q=0&notags=1', '--size', '400x300', '--wait', '1',
  '--js', "import('/scene.js').then(m => m.run('/scene-base/', '/orig/', '/office2d/assets/', '/scene-src/')).then(r => { window.__sceneDone = r; }, e => { window.__sceneDone = { error: String(e && e.stack || e) }; })",
  '--print', 'JSON.stringify({ done: window.__sceneDone, out: window.__sceneOut })', '--out', path.join(out, 'page.png'));
const j = JSON.parse(JSON.parse(res.split('\n').find(l => l.startsWith('"{'))));
console.log(JSON.stringify(j.done).slice(0, 300));
if (!j.out) process.exit(1);
for (const [k, v] of Object.entries(j.out)) fs.writeFileSync(path.join(out, k), k.endsWith('.json') ? v : Buffer.from(v.split(',')[1], 'base64'));
for (const k of Object.keys(j.out)) fs.copyFileSync(path.join(out, k), path.join(pa, k));
if (install) for (const k of Object.keys(j.out)) fs.copyFileSync(path.join(out, k), path.join(root, 'public', 'office2d', 'assets', k));
for (const t of (process.env.TIMES || '18:30,22:30').split(',')) console.log(node(path.join(root, 'portable', 'shot.js'), '--url', `http://127.0.0.1:8791/?q=0&notags=1&t=${t}`, '--size', '1600x900', '--dpr', '1.5', '--wait', '9', '--out', path.join(out, `render-${t.replace(':', '')}.png`)).trim().split('\n').slice(-2).join(' '));
