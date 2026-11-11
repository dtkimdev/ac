#!/usr/bin/env node
'use strict';
/**
 * Headless asset/UI resolution check for portable preview (no browser automation).
 * Starts serve on an ephemeral port, GETs key paths, asserts static/portable flags.
 */
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const PREVIEW = path.join(__dirname, 'preview');
const PORT = parseInt(process.env.PORTABLE_CHECK_PORT || '8793', 10);

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path: urlPath, timeout: 5000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks), headers: res.headers }));
    }).on('error', reject);
  });
}

async function main() {
  if (!fs.existsSync(path.join(PREVIEW, 'index.html'))) {
    console.error('check: run node portable/rebuild.js first');
    process.exit(1);
  }
  const child = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(PORT)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let booted = false;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('serve boot timeout')), 8000);
    child.stdout.on('data', (b) => {
      if (String(b).includes('PORTABLE_SERVE_OK')) { booted = true; clearTimeout(t); resolve(); }
    });
    child.on('error', reject);
    child.on('exit', (c) => { if (!booted) { clearTimeout(t); reject(new Error('serve exited ' + c)); } });
  });

  const fails = [];
  const index = await get('/');
  if (index.status !== 200) fails.push('index status ' + index.status);
  const html = index.body.toString('utf8');
  if (!html.includes('AC_STATIC = true')) fails.push('missing AC_STATIC');
  if (!html.includes('AC_PORTABLE = true')) fails.push('missing AC_PORTABLE');
  if (/tailacdee6\.ts\.net|\/api\/pages-refresh/.test(html)) fails.push('remote funnel/refresh URL leaked into index');

  const main = await get('/office2d/main.js');
  if (main.status !== 200) fails.push('main.js status ' + main.status);
  const mainTxt = main.body.toString('utf8');
  if (!mainTxt.includes('PORTABLE PREVIEW')) fails.push('main.js missing portable refresh disable');
  if (!mainTxt.includes('remote refresh disabled')) fails.push('main.js refresh not disabled');

  const state = await get('/state.json');
  if (state.status !== 200) fails.push('state.json status ' + state.status);
  let bots = 0;
  try {
    const j = JSON.parse(state.body.toString('utf8'));
    bots = (j.bots || []).length;
    if (!bots) fails.push('state has 0 bots');
  } catch (e) { fails.push('state json parse'); }

  // sample assets from layout/public
  // every file of the art pack, at the path the viewer asks for (office2d/art/<folder>/<file>)
  const samples = Object.keys(require(path.join(__dirname, '..', 'bin', 'art-pack.js')).files(JSON.parse(fs.readFileSync(path.join(PREVIEW, 'office2d', 'art', 'pack.json'), 'utf8'))));
  for (const name of samples) {
    const r = await get('/office2d/art/' + name.split('/').map(encodeURIComponent).join('/'));
    if (r.status !== 200) fails.push('asset ' + name + ' ' + r.status);
  }

  // CSS/JS chain
  for (const p of ['/style.css', '/audio.js', '/office2d/fx.js', '/office2d/ui.js', '/favicon.svg']) {
    const r = await get(p);
    if (r.status !== 200) fails.push(p + ' ' + r.status);
  }

  try { child.kill('SIGTERM'); } catch {}
  if (fails.length) {
    console.error('PORTABLE_CHECK_FAIL');
    fails.forEach((f) => console.error('- ' + f));
    process.exit(1);
  }
  console.log('PORTABLE_CHECK_OK');
  console.log('url=http://127.0.0.1:' + PORT + '/');
  console.log('bots=' + bots);
  console.log('assets_sampled=' + samples.length);
  console.log('note=headless HTTP resolution only; no browser UI automation');
}
main().catch((e) => { console.error('PORTABLE_CHECK_FAIL', e); process.exit(1); });
