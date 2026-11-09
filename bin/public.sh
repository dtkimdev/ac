#!/usr/bin/env bash
# Public view-only link for Agent City via Tailscale Funnel (works over outbound 443 only).
#   bin/public.sh start   start server + tailscaled + funnel, plus a watchdog loop (auto-restart)
#   bin/public.sh stop    turn the public link OFF (funnel off, watchdog + tailscaled stopped; server keeps running)
#   bin/public.sh url     print the public URL
#   bin/public.sh status
# _check (every 60 s) also runs bin/pages.sh tick, which keeps the GitHub Pages copy fresh.
# The public listener is 127.0.0.1:8789 (GET-only allowlist in server.js). Nothing else is exposed.
set -uo pipefail
cd "$(dirname "$0")/.."
TS=$HOME/.local/bin/tailscale; TSD=$HOME/.local/bin/tailscaled
DIR=$HOME/.local/tailscale; SOCK=$DIR/tailscaled.sock
PORT=${AGENT_CITY_PUBLIC_PORT:-8789}
mkdir -p logs data "$DIR"
ts() { "$TS" --socket="$SOCK" "$@"; }
tsd_up() { [ -S "$SOCK" ] && ts status --json >/dev/null 2>&1; }
start_tsd() {
  tsd_up && return 0
  setsid nohup "$TSD" --tun=userspace-networking --statedir="$DIR/state" --socket="$SOCK" --port=0 >> "$DIR/tailscaled.log" 2>&1 < /dev/null &
  echo $! > "$DIR/tailscaled.pid"; for i in $(seq 20); do tsd_up && return 0; sleep 0.5; done; return 1
}
url() { ts status --json 2>/dev/null | python3 -c "import json,sys;d=json.load(sys.stdin)['Self']['DNSName'].rstrip('.');print('https://'+d+'/' if d else '')" 2>/dev/null; }
up_once() {
  bin/start.sh >/dev/null 2>&1
  start_tsd || { echo "tailscaled failed; see $DIR/tailscaled.log"; return 1; }
  if [ "$(ts status --json | python3 -c "import json,sys;print(json.load(sys.stdin)['BackendState'])")" != Running ]; then
    ts up --hostname=agentcity --timeout=15s 2>&1 | grep -o 'https://login.tailscale.com[^ ]*' | head -1 | sed 's/^/LOGIN NEEDED: /'
    return 2
  fi
  out=$(timeout 20 "$TS" --socket="$SOCK" funnel --bg "$PORT" 2>&1 < /dev/null); rc=$?; echo "$out" >> logs/public.log
  if [ $rc -ne 0 ] || echo "$out" | grep -q 'login.tailscale.com'; then
    echo "FUNNEL NEEDS ENABLING (one click): $(echo "$out" | grep -o 'https://login.tailscale.com[^ ]*' | head -1)"; return 3; fi
  url > data/public_url.txt
}
case "${1:-}" in
  start)
    up_once; rc=$?; [ $rc -ne 0 ] && exit $rc
    if ! { [ -f logs/public-watch.pid ] && kill -0 "$(cat logs/public-watch.pid)" 2>/dev/null; }; then
      setsid nohup bash -c 'while sleep 60; do "$0" _check; done' "$PWD/bin/public.sh" >> logs/public.log 2>&1 < /dev/null &
      echo $! > logs/public-watch.pid
    fi
    echo "public link ON: $(cat data/public_url.txt)";;
  _check)
    # Pages copy: detached with a timeout so a slow push never delays the Funnel checks below
    ( setsid nohup timeout -k 10 300 bin/pages.sh tick >> logs/pages.log 2>&1 < /dev/null & )
    curl -s -m 5 -o /dev/null "http://127.0.0.1:$PORT/healthz" || { echo "$(date -Is) server down, restarting"; bin/stop.sh >/dev/null 2>&1; bin/start.sh; }
    tsd_up || { echo "$(date -Is) tailscaled down, restarting"; up_once; }
    # reconnect only on a REAL failure: tailscaled not Running/Online or funnel missing, on 2 checks in a row.
    # (dash14: the old trigger on "time jump detected"/PollNetMap log lines fired after every box suspend,
    #  which tailscaled recovers from by itself, and the forced restart itself caused the 2-4 min outage.)
    F=logs/public-fails; ok=$(ts status --json 2>/dev/null | python3 -c "import json,sys;d=json.load(sys.stdin);print(int(d.get('BackendState')=='Running' and bool(d.get('Self',{}).get('Online'))))" 2>/dev/null || echo 0)
    ts funnel status 2>/dev/null | grep -q "127.0.0.1:$PORT" || ok=0
    if [ "$ok" = 1 ]; then echo 0 > "$F"; f=0; else f=$(( $(cat "$F" 2>/dev/null || echo 0) + 1 )); echo "$f" > "$F"; fi
    need=0; [ "$f" -ge 2 ] && need=1
    last=$(cat logs/public-lastfix 2>/dev/null || echo 0); now=$(date +%s)
    if [ $need = 1 ] && [ $((now-last)) -ge 600 ]; then
      echo "$(date -Is) reconnecting (restart tailscaled + funnel)"; echo "$now" > logs/public-lastfix
      kill "$(cat "$DIR/tailscaled.pid" 2>/dev/null)" 2>/dev/null; pkill -f "tailscaled .*--socket=$SOCK" 2>/dev/null; sleep 3
      up_once >/dev/null 2>&1; ts funnel status 2>/dev/null | grep -q "127.0.0.1:$PORT" || timeout 40 "$TS" --socket="$SOCK" funnel --bg "$PORT" >/dev/null 2>&1
      echo 0 > "$F"
    fi;;
  stop)
    [ -f logs/public-watch.pid ] && kill "$(cat logs/public-watch.pid)" 2>/dev/null; rm -f logs/public-watch.pid
    tsd_up && ts funnel reset >/dev/null 2>&1
    [ -f "$DIR/tailscaled.pid" ] && kill "$(cat "$DIR/tailscaled.pid")" 2>/dev/null; pkill -f "tailscaled .*--socket=$SOCK" 2>/dev/null
    rm -f data/public_url.txt; echo "public link OFF";;
  url) tsd_up && url || echo "not running";;
  status) tsd_up && { ts status | head -3; ts funnel status; } || echo "tailscaled not running";;
  *) echo "usage: $0 start|stop|url|status"; exit 1;;
esac
