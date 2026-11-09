#!/usr/bin/env bash
# Headless Claude Code run that records the latest rate-limit reading for the Agent City top bar.
#   bin/claude-run.sh -p "your prompt" [more claude args]
# Runs `claude ... --output-format stream-json --verbose`, passes the stream through unchanged, and saves the newest
# rate_limit_event (seven_day / five_hour utilisation + reset) to data/claude_ratelimit.json.
# It adds no model calls of its own; uses whatever auth `claude` already has (never touches credentials).
set -o pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
claude "$@" --output-format stream-json --verbose | node "$DIR/claude-rl-filter.js"
