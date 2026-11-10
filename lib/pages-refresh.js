// Work done after an accepted ↻ refresh (server.js handlePagesRefresh): fresh Claude usage, the Grok usage webhook,
// then bin/pages.sh publish. No cooldown or token check here; the caller owns those and the busy flag/lock.
// The webhook URL and key are never logged, only the HTTP status.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function readSecret(root, name) {
  try { return fs.readFileSync(path.join(root, '.secret', name), 'utf8').trim(); } catch { return ''; }
}

// Runs a child with stdout discarded; resolves with a short failure reason, or '' on success. Never rejects.
function runStep(cmd, args, root, timeoutMs) {
  return new Promise(resolve => {
    let err = '', done = false;
    const finish = why => { if (!done) { done = true; resolve(why); } };
    let cp;
    try { cp = spawn(cmd, args, { cwd: root, stdio: ['ignore', 'ignore', 'pipe'], timeout: timeoutMs, env: process.env }); }
    catch (e) { return finish(e.message); }
    cp.stderr.on('data', d => { if (err.length < 300) err += d; });
    cp.on('error', e => finish(e.message));
    cp.on('exit', (code, sig) => finish(code === 0 ? '' : `${sig ? 'signal ' + sig : 'exit ' + code}${err.trim() ? ': ' + err.trim().split('\n').pop().slice(0, 200) : ''}`));
  });
}

async function refreshClaude(root, log) {
  const why = await runStep('bash', [path.join(root, 'bin', 'claude-run.sh'), '-p', 'Reply with OK only.', '--model', 'claude-haiku-4-5'], root, 120e3);
  if (why) log(`pages-refresh: claude ping failed: ${why}`);
  const why2 = await runStep(process.execPath, [path.join(root, 'bin', 'claude-usage.js')], root, 120e3);
  log(why2 ? `pages-refresh: claude usage failed: ${why2}` : 'pages-refresh: claude usage refreshed');
}

function postUsageWebhook(root, log) {
  const url = readSecret(root, 'usage-webhook-url');
  const key = readSecret(root, 'usage-webhook-key');
  if (!url || !key) { log('pages-refresh: usage webhook not configured'); return Promise.resolve(); }
  const header = readSecret(root, 'usage-webhook-header');
  return new Promise(resolve => {
    let done = false;
    const finish = msg => { if (!done) { done = true; log(`pages-refresh: usage webhook ${msg}`); resolve(); } };
    let u;
    try { u = new URL(url); } catch { return finish('failed: bad url'); }
    const body = JSON.stringify({ source: 'agent-city-refresh', ts: new Date().toISOString() });
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
    if (header) headers[header] = key; else headers.Authorization = 'Bearer ' + key;
    const mod = u.protocol === 'http:' ? require('http') : require('https');
    let req;
    try { req = mod.request(u, { method: 'POST', headers, timeout: 15e3 }); }
    catch (e) { return finish(`failed: ${e.code || 'request error'}`); }
    req.on('response', res => { res.resume(); finish(`status ${res.statusCode}`); });
    req.on('timeout', () => { req.destroy(); finish('failed: timeout'); });
    req.on('error', e => finish(`failed: ${e.code || 'network error'}`)); // code only: messages can carry the host
    req.end(body);
  });
}

// Resolves when the publish child exits. Never rejects.
async function runPagesRefreshJobs({ root, log = () => {} }) {
  try { await Promise.all([refreshClaude(root, log), postUsageWebhook(root, log)]); }
  catch (e) { log(`pages-refresh: pre-publish error: ${e.message}`); }
  await new Promise(resolve => {
    let cp;
    try { cp = spawn('bash', [path.join(root, 'bin', 'pages.sh'), 'publish'], { cwd: root, stdio: 'ignore', detached: true, env: process.env }); }
    catch (e) { log(`pages-refresh: publish failed: ${e.message}`); return resolve(); }
    cp.on('exit', code => { if (code) log(`pages-refresh: publish exit ${code}`); resolve(); });
    cp.on('error', e => { log(`pages-refresh: publish failed: ${e.message}`); resolve(); });
    cp.unref();
  });
}

module.exports = { runPagesRefreshJobs };
