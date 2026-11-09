#!/usr/bin/env bash
# Publish the approved v10 preview: staged front-end -> public/ (live at once on 8787/8789 + Funnel), then GitHub Pages now.
# Run ONLY after David's yes:  bin/v10-promote.sh
set -euo pipefail
cd "$(dirname "$0")/.."
S=design/v10/stage/public; D=public; B=/workspace/tmp/v10-bak/promote-$(date +%Y%m%d-%H%M%S)
[ -f "$S/office2d/main.js" ] || { echo "no stage at $S"; exit 1; }
mkdir -p "$B"; cp -a "$D/." "$B/"
cp "$S/audio.js" "$S/style.css" "$S/favicon.svg" "$S/login.html" "$D/"
cp "$S/office2d/"*.js "$S/office2d/index.html" "$D/office2d/"
cp "$S/office2d/assets/"* "$D/office2d/assets/"
# cache-bust: assets cached 1 h; stage was ?v=13
sed -i -E "s/V = '\?v=[0-9]+'/V = '?v=14'/" "$D/office2d/main.js"
grep -q "V = '?v=14'" "$D/office2d/main.js"
# live verify still expected 12; Shopper (bot11) is shown now
sed -i -E "s/workers\.length === 12/workers.length === 13/; s/expected 12 bots/expected 13 bots/" bin/verify.js
echo "live files replaced (backup: $B); checking the live site"
node bin/verify.js | tee /tmp/v10-promote-verify.txt | tail -5
grep -q 'VERIFY OK' /tmp/v10-promote-verify.txt || { echo "verify failed — live left replaced; restore from $B if needed"; exit 1; }
echo "pushing GitHub Pages now"
/workspace/agent-city/bin/pages.sh publish
echo "PROMOTE OK  V=?v=14  Pages https://dtkimdev.github.io/ac/  backup $B"
