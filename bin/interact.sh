#!/usr/bin/env bash
# Usage: bin/interact.sh FROM TO [note]
# Appends one interaction to data/interactions.jsonl, e.g. bin/interact.sh bot3 bot1 "inbox triage done".
# FROM/TO: botN, a bot id or a bot name. The 2D office walks FROM's worker over to TO's desk once (entries older
# than 10 minutes are ignored). Read-only for the viewer: this only records that one bot talked to another.
set -euo pipefail
[ $# -ge 2 ] || { sed -n 2,5p "$0"; exit 2; }
F="$(cd "$(dirname "$0")/.." && pwd)/data/interactions.jsonl"
exec /usr/bin/node - "$F" "$@" <<'JS'
const fs = require('fs');
const [f, from, to, note] = process.argv.slice(2);
const ok = s => typeof s === 'string' && /^[\w$.\- ]{1,40}$/.test(s);
if (!ok(from) || !ok(to)) { console.error('bad FROM/TO'); process.exit(2); }
const o = { ts: new Date().toISOString(), from, to };
if (note) o.note = String(note).replace(/\s+/g, ' ').slice(0, 80);
fs.appendFileSync(f, JSON.stringify(o) + '\n');
// keep the file small: trim to the last 500 lines once it passes ~256 KB
try { if (fs.statSync(f).size > 262144) { const l = fs.readFileSync(f, 'utf8').trim().split('\n').slice(-500); fs.writeFileSync(f + '.tmp', l.join('\n') + '\n'); fs.renameSync(f + '.tmp', f); } } catch {}
JS
