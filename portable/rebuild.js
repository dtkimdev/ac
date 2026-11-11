#!/usr/bin/env node
'use strict';
/**
 * Rebuild portable/preview from editable public/ + frozen state snapshot.
 * Node built-ins only. Does not touch live deploy, SSH, Tailscale, or Pages.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'portable', 'preview');
const SNAP = path.join(ROOT, 'data', 'snapshot', 'state.json');

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}
function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }
function cpFile(a, b) { mkdirp(path.dirname(b)); fs.copyFileSync(a, b); }
function cpDir(a, b) {
  mkdirp(b);
  for (const ent of fs.readdirSync(a, { withFileTypes: true })) {
    const from = path.join(a, ent.name), to = path.join(b, ent.name);
    if (ent.isDirectory()) cpDir(from, to);
    else if (ent.isFile()) cpFile(from, to);
  }
}

if (!fs.existsSync(path.join(SRC, 'office2d', 'index.html'))) {
  console.error('rebuild: missing public/office2d/index.html');
  process.exit(1);
}
if (!fs.existsSync(SNAP)) {
  console.error('rebuild: missing data/snapshot/state.json');
  process.exit(1);
}

rmrf(OUT);
mkdirp(path.join(OUT, 'office2d'));
cpFile(path.join(SRC, 'style.css'), path.join(OUT, 'style.css'));
cpFile(path.join(SRC, 'favicon.svg'), path.join(OUT, 'favicon.svg'));
cpFile(path.join(SRC, 'audio.js'), path.join(OUT, 'audio.js'));
for (const f of fs.readdirSync(path.join(SRC, 'office2d'))) {
  const from = path.join(SRC, 'office2d', f);
  if (fs.statSync(from).isFile() && f.endsWith('.js')) cpFile(from, path.join(OUT, 'office2d', f));
}
// the art pack, as published (with content stamps), plus a flat copy of it in office2d/assets/ for the art tools in portable/art,
// which ask for pictures by bare name (they write their results to both: see pack.previewPut)
const pack = require(path.join(ROOT, 'bin', 'art-pack.js')), ART_OUT = path.join(OUT, 'office2d', 'art');
cpDir(path.join(SRC, 'office2d', 'art'), ART_OUT);
pack.stamp(ART_OUT);
for (const p of Object.keys(pack.files(pack.load()))) cpFile(path.join(ART_OUT, p), path.join(OUT, 'office2d', 'assets', path.basename(p)));
cpFile(SNAP, path.join(OUT, 'state.json'));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

let html = fs.readFileSync(path.join(SRC, 'office2d', 'index.html'), 'utf8');
html = html
  .replace(/<a class="m" href="\/logout">sign out<\/a>/, '')
  .replace(/href="\/favicon\.svg"/g, 'href="favicon.svg"')
  .replace(/href="\/style\.css"/g, 'href="style.css"')
  .replace(/src="\/audio\.js"/g, 'src="audio.js"')
  .replace(/src="\/office2d\/main\.js"/g, 'src="office2d/main.js"')
  .replace(/<body>/, '<body class="pages portable">')
  .replace(
    /<script>window\.AC = window\.AC \|\| \{\};/,
    '<script>window.AC = window.AC || {}; window.AC_STATIC = true; window.AC_PORTABLE = true; window.AC_REFRESH = "";'
  )
  .replace(
    /<meta charset="utf-8">/,
    '<meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer">'
  );
if (!html.includes('AC_STATIC = true')) { console.error('rebuild: AC_STATIC not set'); process.exit(1); }
if (!html.includes('AC_PORTABLE = true')) { console.error('rebuild: AC_PORTABLE not set'); process.exit(1); }
if (/((href|src)="\/)/.test(html)) { console.error('rebuild: root paths remain in index.html'); process.exit(1); }
fs.writeFileSync(path.join(OUT, 'index.html'), html);

// Disable remote pages-refresh in PREVIEW copy only (editable public/ untouched)
const mainPath = path.join(OUT, 'office2d', 'main.js');
let main = fs.readFileSync(mainPath, 'utf8');
if (!main.includes('function setupPagesRefresh')) {
  console.error('rebuild: setupPagesRefresh not found');
  process.exit(1);
}
main = main.replace(
  /function setupPagesRefresh\(\) \{/,
  `function setupPagesRefresh() {
  // PORTABLE PREVIEW: remote refresh/publish disabled (no Tailscale/SSH/host mutation)
  const btn = document.getElementById('refresh'), toast = document.getElementById('refresh-toast');
  if (btn) {
    btn.onclick = () => {
      if (toast) { toast.textContent = 'Portable preview: remote refresh disabled'; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 4200); }
    };
  }
}
/* original setupPagesRefresh body kept below but never called in the preview */
function setupPagesRefreshDisabledInPreview() {`
);
fs.writeFileSync(mainPath, main);

const st = JSON.parse(fs.readFileSync(path.join(OUT, 'state.json'), 'utf8'));
console.log('PORTABLE_REBUILD_OK');
console.log('out=' + OUT);
console.log('bots=' + (st.bots || []).length);
console.log('art_files=' + Object.keys(pack.files(pack.load())).length);
