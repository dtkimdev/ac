#!/usr/bin/env bash
# Pages-only watcher: keeps https://dtkimdev.github.io/ac/ fresh without Funnel (zero AI tokens).
#   bin/pages-watch.sh start    run bin/pages.sh tick now, then every 60 s (pages.sh keeps its 10 min / wake / 8 per h rules)
#   bin/pages-watch.sh stop     stop this watcher only (never touches server.js, public.sh, tailscaled)
#   bin/pages-watch.sh status
# Does not start Funnel or tailscaled and never calls bin/public.sh. Log logs/pages-watch.log, pid logs/pages-watch.pid.
set -uo pipefail
cd "$(dirname "$0")/.."
PID=logs/pages-watch.pid; LOG=logs/pages-watch.log; EVERY=60
mkdir -p logs
alive() { # 0 if the pidfile names a live process that is this watcher's loop
  local p; p=$(cat "$PID" 2>/dev/null) || return 1
  [[ "$p" =~ ^[0-9]+$ ]] && kill -0 "$p" 2>/dev/null && tr '\0' ' ' < "/proc/$p/cmdline" 2>/dev/null | grep -q 'pages-watch.sh _loop'
}
bkk() { local f=$1 v; v=$(cat "$f" 2>/dev/null) && [[ "$v" =~ ^[0-9]+$ ]] && echo "$(basename "$f"): $(TZ=Asia/Bangkok date -d "@$v" -Is)"; }
case "${1:-}" in
  start)
    if alive; then echo "pages-watch already running (pid $(cat "$PID"))"; exit 0; fi
    rm -f "$PID"
    setsid nohup "$PWD/bin/pages-watch.sh" _loop >> "$LOG" 2>&1 < /dev/null &
    echo $! > "$PID"; echo "pages-watch started (pid $!), tick every ${EVERY}s, log $LOG" ;;
  _loop)
    trap 'kill "${s:-}" 2>/dev/null; exit 0' TERM INT
    echo "$(date -Is) pages-watch loop start (pid $$)"
    while true; do
      timeout -k 10 300 bin/pages.sh tick
      sleep "$EVERY" & s=$!; wait "$s"
    done ;;
  stop)
    if ! alive; then rm -f "$PID"; echo "pages-watch not running"; exit 0; fi
    kill "$(cat "$PID")" 2>/dev/null; rm -f "$PID"; echo "pages-watch stopped" ;;
  status)
    if alive; then echo "pages-watch running (pid $(cat "$PID"))"; else echo "pages-watch not running"; fi
    echo "interval ${EVERY}s; log $PWD/$LOG"
    bkk logs/pages-lasttick; bkk logs/pages-lastpush
    echo "note: this watcher does not manage Funnel (bin/public.sh does)" ;;
  *) echo "usage: bin/pages-watch.sh start|stop|status"; exit 1 ;;
esac
