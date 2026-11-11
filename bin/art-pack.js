#!/usr/bin/env node
'use strict';
/**
 * The art pack (public/office2d/art/): one folder per kind of thing, one catalog (pack.json) that labels every file and every
 * piece of art drawn in code. Node built-ins only, so it runs on GitHub's servers and on every bot's computer.
 *
 *   node bin/art-pack.js find <words>        where is it? e.g. "find fridge", "find corgi", "find grok", "find monitor"
 *   node bin/art-pack.js check [art-dir]     every file listed, nothing missing, sizes as listed, layout/config references found.
 *                                            Exit 1 on a problem. bin/pages-build.sh runs it: a broken pack never goes live.
 *   node bin/art-pack.js docs                rewrite the catalog part of art/README.md from pack.json
 *   node bin/art-pack.js stamp <art-dir>     (publish only) write a content hash per file into <art-dir>/pack.json, so a browser
 *                                            downloads again exactly the pictures that changed, and nothing else
 *   node bin/art-pack.js size <file>         width x height of a png/webp
 *
 * From other tools: const pack = require('<root>/bin/art-pack.js'); pack.where('f03.png') -> 'bots/front/f03.png'
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..'), ART = path.join(ROOT, 'public', 'office2d', 'art');
const SKIP = new Set(['pack.json', 'README.md']); // the catalog and the guide are not art

function load(dir = ART) { return JSON.parse(fs.readFileSync(path.join(dir, 'pack.json'), 'utf8')); }
// every file the pack lists: { 'bots/front/f03.png': { folder, name, item } }
function files(pack) {
  const out = {};
  for (const f of pack.folders) for (const [name, item] of Object.entries(f.files || {})) out[f.path ? `${f.path}/${name}` : name] = { folder: f, name, item };
  return out;
}
let cache = null;
// bare file name -> its path inside art/ (names are unique across the pack; check enforces it)
function where(name, dir = ART) {
  if (!cache || cache.dir !== dir) { cache = { dir, map: {} }; for (const p of Object.keys(files(load(dir)))) cache.map[path.basename(p)] = p; }
  const p = cache.map[path.basename(name)];
  if (!p) throw new Error(`art-pack: ${name} is not in public/office2d/art/pack.json. Put the file in the right folder and add a line for it there first.`);
  return p;
}
const artPath = (name, dir = ART) => path.join(dir, where(name, dir));
// art tools: put a freshly made file into the preview (its pack folder and the flat copy the tools read from)
function previewPut(name, from) {
  const prev = path.join(ROOT, 'portable', 'preview', 'office2d');
  fs.copyFileSync(from, path.join(prev, 'art', where(name))); fs.copyFileSync(from, path.join(prev, 'assets', path.basename(name)));
}

// width/height straight from the file header (png, webp lossy/lossless/extended)
function size(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 1, 4) === 'PNG') return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const c = b.toString('ascii', 12, 16);
    if (c === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (c === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (c === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
  }
  return null;
}
function walk(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(dir, r)); else if (!SKIP.has(r)) out.push(r);
  }
  return out;
}

// every picture layout.json and config.js ask for, by bare name
function referenced(dir) {
  const L = JSON.parse(fs.readFileSync(path.join(dir, where('layout.json', dir)), 'utf8')), r = new Set(['layout.json']);
  const add = (...n) => n.forEach(x => x && r.add(x));
  for (const s of L.sprites || []) add(s.file, s.front);
  add(L.corgi && L.corgi.file, L.corgi2, L.legs && L.legs.file, L.turn && L.turn.bodies, L.turn && L.turn.heads, L.dash && L.dash.laptop, L.dash && L.dash.mug,
    L.boats && L.boats.file, L.boats && L.boats.lit, L.walkSide && L.walkSide.file);
  for (const a of L.airships || []) add(a.file + '-dusk.png', a.file + '-night.png');
  for (const o of L.occluders || []) add(o.mask + '-mask.png');
  for (const m of Object.keys(L.masks || {})) add(m + '-mask.png');
  // config.js PROPS: { file: 'x.png', ... }
  const cfg = fs.readFileSync(path.join(dir, '..', 'config.js'), 'utf8'), props = cfg.slice(cfg.indexOf('export const PROPS'));
  for (const m of props.slice(0, props.indexOf(';')).matchAll(/file:\s*'([^']+)'/g)) add(m[1]);
  return r;
}

function check(dir = ART) {
  const err = [], warn = [];
  let pack; try { pack = load(dir); } catch (e) { console.error('art-pack: pack.json does not parse: ' + e.message); return 1; }
  const listed = files(pack), names = {};
  for (const [p, { item }] of Object.entries(listed)) {
    const n = path.basename(p);
    if (names[n]) err.push(`${n} is listed twice (${names[n]} and ${p}); file names must be unique across the pack`); names[n] = p;
    if (!item.label) err.push(`${p}: no label`);
    const f = path.join(dir, p);
    if (!fs.existsSync(f)) { err.push(`${p}: listed in pack.json but the file is missing`); continue; }
    if (item.size) {
      const s = size(f);
      if (!s) err.push(`${p}: not a readable png/webp`);
      else if (s[0] !== item.size[0] || s[1] !== item.size[1]) err.push(`${p}: is ${s[0]}x${s[1]}, pack.json says ${item.size[0]}x${item.size[1]}. A new size usually needs new cell/size numbers in layout.json too; if you meant it, change both`);
    }
    const kb = fs.statSync(f).size / 1024;
    if (/\.(png|webp)$/.test(p) && kb > 1500) warn.push(`${p}: ${Math.round(kb)} KB, heavy for TVs and phones (webp, smaller)`);
  }
  for (const r of walk(dir)) if (!listed[r]) err.push(`${r}: in the art folder but not in pack.json (add a line with its label, or remove the file)`);
  try { for (const n of referenced(dir)) if (!names[n]) err.push(`${n}: layout.json or config.js PROPS uses it, but it is not in the pack`); }
  catch (e) { err.push('layout.json / config.js: ' + e.message); }
  for (const d of pack.drawn || []) for (const c of [].concat(d.code || [])) {
    const [file, fn] = c.split('#'), src = path.join(dir, '..', file);
    if (!fs.existsSync(src)) warn.push(`drawn "${d.label}": ${file} not found`);
    else if (fn && !new RegExp(`\\b${fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(fs.readFileSync(src, 'utf8'))) warn.push(`drawn "${d.label}": ${fn} not found in ${file} (renamed? update pack.json)`);
  }
  const readme = path.join(dir, 'README.md');
  if (fs.existsSync(readme) && !fs.readFileSync(readme, 'utf8').includes(catalog(pack))) warn.push('README.md catalog is out of date: node bin/art-pack.js docs');
  for (const w of warn) console.log('art-pack warning: ' + w);
  for (const e of err) console.error('art-pack ERROR: ' + e);
  console.log(err.length ? `art-pack: ${err.length} problem(s), not publishable` : `art-pack: OK, ${Object.keys(listed).length} files, ${(pack.drawn || []).length} drawn-in-code items`);
  return err.length ? 1 : 0;
}

// the catalog section of README.md, generated from pack.json so the two never disagree
function catalog(pack) {
  const out = ['<!-- catalog:start (generated by node bin/art-pack.js docs; edit pack.json, not this part) -->', ''];
  for (const f of pack.folders) {
    out.push(`### ${f.path || '(art root)'}/ — ${f.label}`, '');
    if (f.about) out.push(f.about, '');
    if (f.edit) out.push('**To change:** ' + f.edit, '');
    out.push('| file | what it is | size |', '|---|---|---|');
    for (const [n, it] of Object.entries(f.files || {})) out.push(`| \`${n}\` | ${it.label} | ${it.size ? it.size.join('×') : ''} |`);
    out.push('');
  }
  const cats = [...new Set((pack.drawn || []).map(d => d.group))];
  out.push('### Drawn in code (no picture file)', '', 'Find the function named in the "code" column (search for it); "tune" is a setting you can change without touching drawing code.', '');
  for (const c of cats) {
    out.push(`**${c}**`, '', '| item | code | tune |', '|---|---|---|');
    for (const d of pack.drawn.filter(x => x.group === c)) out.push(`| ${d.label} | ${[].concat(d.code || []).map(x => '`' + x + '`').join(', ')} | ${d.tune || ''} |`);
    out.push('');
  }
  out.push('### Painted into the room picture (no file of its own)', '', 'These are part of `room/plate-*.webp`. They are drawn by the scene builder, then baked into the four plates. See "Changing something painted into the room" above.', '');
  out.push('| item | made by | notes |', '|---|---|---|');
  for (const b of pack.baked || []) out.push(`| ${b.label} | \`${b.made}\` | ${b.notes || ''} |`);
  out.push('', '<!-- catalog:end -->');
  return out.join('\n');
}
function docs(dir = ART) {
  const f = path.join(dir, 'README.md'), s = fs.readFileSync(f, 'utf8'), a = s.indexOf('<!-- catalog:start'), b = s.indexOf('<!-- catalog:end -->');
  if (a < 0 || b < 0) throw new Error('README.md has no catalog markers');
  fs.writeFileSync(f, s.slice(0, a) + catalog(load(dir)) + s.slice(b + '<!-- catalog:end -->'.length));
  console.log('art-pack: README.md catalog rewritten');
}
function stamp(dir) {
  const pack = load(dir); pack.stamp = {};
  for (const p of Object.keys(files(pack))) pack.stamp[p] = crypto.createHash('sha1').update(fs.readFileSync(path.join(dir, p))).digest('hex').slice(0, 10);
  fs.writeFileSync(path.join(dir, 'pack.json'), JSON.stringify(pack));
  console.log(`art-pack: stamped ${Object.keys(pack.stamp).length} files`);
}
function find(words) {
  const pack = load(), q = words.join(' ').toLowerCase(), hit = s => q.split(/\s+/).every(w => String(s).toLowerCase().includes(w));
  let n = 0;
  for (const [p, { folder, item }] of Object.entries(files(pack))) if (hit(`${p} ${item.label} ${folder.label}`)) { n++; console.log(`file   public/office2d/art/${p}  ${item.size ? item.size.join('x') : ''}\n       ${item.label}\n       to change: ${item.edit || folder.edit || ''}\n`); }
  for (const d of pack.drawn || []) if (hit(`${d.label} ${d.group} ${[].concat(d.code).join(' ')}`)) { n++; console.log(`code   ${[].concat(d.code).map(c => 'public/office2d/' + c).join(', ')}\n       ${d.label}${d.tune ? '\n       tune: ' + d.tune : ''}\n`); }
  for (const b of pack.baked || []) if (hit(`${b.label} ${b.made}`)) { n++; console.log(`baked  ${b.label}: painted into room/plate-*.webp by ${b.made}\n       ${b.notes || ''}\n`); }
  if (!n) console.log('nothing found; try one word, or read public/office2d/art/README.md');
}

module.exports = { load, files, where, artPath, previewPut, size, check, stamp, docs, ART };
if (require.main === module) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'check') process.exit(check(rest[0] ? path.resolve(rest[0]) : ART));
  else if (cmd === 'stamp') stamp(path.resolve(rest[0]));
  else if (cmd === 'docs') docs();
  else if (cmd === 'find' && rest.length) find(rest);
  else if (cmd === 'size') console.log((size(rest[0]) || ['?']).join('x'));
  else { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(cmd ? 1 : 0); }
}
