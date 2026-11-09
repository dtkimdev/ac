#!/usr/bin/env bash
# Publish the approved v9 preview: staged front-end -> public/ (live at once on 8787/8789 + Funnel, GitHub Pages on the next tick; `bin/pages.sh publish` pushes now).
# Run ONLY after David's yes:  bin/v9-promote.sh
# Undo:                        cp -a <the backup it prints>/. public/office2d/ && rm -f public/office2d/assets/boats*.webp
set -euo pipefail
cd "$(dirname "$0")/.."
S=design/v9/stage/public/office2d; D=public/office2d; B=/workspace/tmp/v9-bak/promote-$(date +%Y%m%d-%H%M%S)
[ -f "$S/main.js" ] || { echo "no stage at $S"; exit 1; }
mkdir -p "$B"; cp -a "$D/." "$B/"
cp "$S"/*.js "$S"/index.html "$D/"; cp "$S"/assets/* "$D/assets/"
rm -f "$D/assets/ferris-wheel.png"
sed -i -E "s/V = '\?v=[0-9]+'/V = '?v=9'/" "$D/main.js"   # cache-bust: assets are cached for 1 h
grep -q "V = '?v=9'" "$D/main.js"
echo "live files replaced (backup: $B); checking the live site"
node bin/verify.js | tail -3
echo "GitHub Pages follows on its next tick; 'bin/pages.sh publish' pushes it now."
/workspace/agent-city/bin/pages.sh publish
