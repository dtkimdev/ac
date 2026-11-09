#!/usr/bin/env bash
# Preview server for the staged v9 build, isolated from the live site: its own root with COPIES of data and auth, ports 8797 (login) 8798 (local) 8799 (public).
#   bin/v9-stage.sh start|stop     The live server, Funnel and GitHub Pages never see design/v9/stage.
set -euo pipefail
cd "$(dirname "$0")/.."
R=/tmp/agent-city-v9-root
case "${1:-start}" in
  stop) pkill -f "$R/server.js" || true ;;
  start)
    pkill -f "$R/server.js" || true
    rm -rf "$R"; mkdir -p -m 700 "$R"
    cp -a lib data .secret "$R/"
    ln -s "$PWD/node_modules" "$R/node_modules"; ln -s "$PWD/design/v9/stage/public" "$R/public"
    sed -e 's/const LOCAL_VIEW_PORT = 8788;/const LOCAL_VIEW_PORT = 8798;/' server.js > "$R/server.js"
    cd "$R"; AGENT_CITY_PORT=8797 AGENT_CITY_HOST=127.0.0.1 AGENT_CITY_PUBLIC_PORT=8799 nohup node "$R/server.js" > "$R/log" 2>&1 &
    sleep 1; curl -sf -m 5 http://127.0.0.1:8798/healthz >/dev/null 2>&1 || true; echo "stage on http://127.0.0.1:8798/" ;;
esac
