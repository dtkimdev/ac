#!/usr/bin/env bash
# Usage: bin/heartbeat.sh <id|botN> <state:working|idle|error> [task] [k=v ...]
# Writes data/heartbeats/<id>.json. Known keys: started_at last_run next_run last_alert tokens_in tokens_out model.
# Times: ISO-8601 or epoch seconds. Unknown keys are kept as strings. Fields omitted keep their previous value.
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)/data/heartbeats"
[ $# -ge 2 ] || { sed -n 2,4p "$0"; exit 2; }
mkdir -p "$DIR"
exec /usr/bin/node - "$DIR" "$@" <<'JS'
const fs = require('fs'), path = require('path');
const [dir, id, state, task, ...kv] = process.argv.slice(2);
if (!/^[\w.-]+$/.test(id)) { console.error('bad id'); process.exit(2); }
if (!['working', 'idle', 'error'].includes(state)) { console.error('state must be working|idle|error'); process.exit(2); }
const f = path.join(dir, id + '.json');
let h = {}; try { h = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
const now = new Date().toISOString();
if (state === 'working' && h.state !== 'working') h.started_at = now;
Object.assign(h, { id, state, task: task !== undefined && task !== '' ? task : (h.task ?? null), last_run: h.last_run ?? null });
if (state !== 'working') h.last_run = now;
for (const p of kv) { const i = p.indexOf('='); if (i > 0) { const k = p.slice(0, i), v = p.slice(i + 1); h[k] = /^(tokens_in|tokens_out)$/.test(k) ? +v : v; } }
for (const k of ['started_at', 'next_run', 'last_alert', 'tokens_in', 'tokens_out', 'model']) if (!(k in h)) h[k] = null;
h.updated_at = now;
fs.writeFileSync(f + '.tmp', JSON.stringify(h, null, 1)); fs.renameSync(f + '.tmp', f);
JS
