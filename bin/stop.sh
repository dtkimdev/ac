#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
PID=logs/server.pid
if [ -f "$PID" ] && kill -0 "$(cat "$PID")" 2>/dev/null; then kill "$(cat "$PID")"; sleep 0.5; echo "stopped"; else echo "not running"; fi
rm -f "$PID"
