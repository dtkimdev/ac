#!/usr/bin/env bash
# Start Agent City in the background (setsid nohup), pidfile logs/server.pid, log logs/server.log
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p logs
PID=logs/server.pid
if [ -f "$PID" ] && kill -0 "$(cat "$PID")" 2>/dev/null; then echo "already running (pid $(cat "$PID"))"; exit 0; fi
setsid nohup /usr/bin/node server.js >> logs/server.log 2>&1 < /dev/null &
echo $! > "$PID"
sleep 1
if kill -0 "$(cat "$PID")" 2>/dev/null; then echo "agent-city started (pid $(cat "$PID")) on port ${AGENT_CITY_PORT:-8787}; password in .secret/password.txt"; else echo "failed; see logs/server.log"; exit 1; fi
