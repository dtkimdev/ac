#!/usr/bin/env node
'use strict';
/**
 * Localhost-only static preview server. No SSH, Tailscale, auth, or remote publish.
 * Usage: node portable/serve.js [port]
 * Default port 8791 (avoids live 8787-8789).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, 'preview');
const PORT = Math.max(1, parseInt(process.argv[2] || process.env.PORTABLE_PORT || '8791', 10));
const HOST = '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
};

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error('serve: missing portable/preview — run: node portable/rebuild.js');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405); res.end('method not allowed'); return;
  }
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const file = path.join(ROOT, safe);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(file).toLowerCase(), type = TYPES[ext] || 'application/octet-stream';
    // byte ranges, as GitHub Pages serves them: audio needs them to seek and to loop
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && (m[1] || m[2])) {
      let a = m[1] ? +m[1] : buf.length - +m[2], b = m[1] && m[2] ? Math.min(+m[2], buf.length - 1) : buf.length - 1;
      if (a < 0) a = 0; if (a > b) { res.writeHead(416, { 'Content-Range': 'bytes */' + buf.length }); res.end(); return; }
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${a}-${b}/${buf.length}`, 'Content-Length': b - a + 1, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Agent-City-Portable': '1' });
      if (req.method === 'HEAD') res.end(); else res.end(buf.subarray(a, b + 1)); return;
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'X-Agent-City-Portable': '1',
    });
    if (req.method === 'HEAD') res.end();
    else res.end(buf);
  });
});

server.listen(PORT, HOST, () => {
  console.log('PORTABLE_SERVE_OK');
  console.log(`url=http://${HOST}:${PORT}/`);
  console.log('preview_root=' + ROOT);
  console.log('note=localhost only; snapshot state; remote refresh disabled');
});
