#!/usr/bin/env bash
# Static view-only build of the office for GitHub Pages (https://dtkimdev.github.io/ac/). No AI, no secrets.
#   bin/pages-build.sh   writes build/pages/ from public/ (same front-end code) + state.json from the public listener
# Only public/office2d/index.html is transformed: root paths become relative, sign out is dropped, window.AC_STATIC is set.
# Fails (non-zero, state.json untouched) if the local server gives no valid state.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=${AGENT_CITY_PUBLIC_PORT:-8789}; OUT=build/pages
mkdir -p "$OUT"
find "$OUT" -mindepth 1 ! -name state.json -delete
mkdir -p "$OUT/office2d/assets"
cp public/style.css public/favicon.svg public/audio.js "$OUT/"
cp public/office2d/*.js "$OUT/office2d/"
cp public/office2d/assets/* "$OUT/office2d/assets/"
touch "$OUT/.nojekyll"
FUNNEL=$(tr -d '\n' < data/public_url.txt 2>/dev/null || true)
FUNNEL=${FUNNEL:-https://agentcity.tailacdee6.ts.net}
FUNNEL=${FUNNEL%/}
sed -e 's#<a class="m" href="/logout">sign out</a>##' \
    -e 's#href="/favicon.svg"#href="favicon.svg"#; s#href="/style.css"#href="style.css"#' \
    -e 's#src="/audio.js"#src="audio.js"#; s#src="/office2d/main.js"#src="office2d/main.js"#' \
    -e 's#<body>#<body class="pages">#' \
    -e "s#<script>window.AC = window.AC || {};#<script>window.AC = window.AC || {}; window.AC_STATIC = true; window.AC_REFRESH = '${FUNNEL}/api/pages-refresh';#" \
    -e 's#<meta charset="utf-8">#<meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer">#' \
    public/office2d/index.html > "$OUT/index.html"
grep -q 'AC_STATIC = true' "$OUT/index.html" || { echo "index.html: static flag not set"; exit 1; }
if grep -Eq '(href|src)="/' "$OUT/index.html"; then echo "index.html: root path left"; exit 1; fi
tmp=$(mktemp "$OUT/.state.XXXXXX")
trap 'rm -f "$tmp"' EXIT
# AC_STATE_FILE: use this state.json instead of asking the local server (the GitHub publish workflow passes the last published snapshot)
if [ -n "${AC_STATE_FILE:-}" ]; then cp "$AC_STATE_FILE" "$tmp"
else curl -sf -m 10 "http://127.0.0.1:$PORT/api/state" -o "$tmp" || { echo "state export failed (server down?)"; exit 1; }; fi
python3 -c "import json,sys;d=json.load(open(sys.argv[1]));assert d['now']>0 and d['bots']" "$tmp" 2>/dev/null || { echo "state export invalid"; exit 1; }
chmod 644 "$tmp"; mv "$tmp" "$OUT/state.json"
