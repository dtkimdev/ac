#!/usr/bin/env bash
# Optional Claude Code statusLine command (NOT installed automatically). Reads the statusLine JSON on stdin; when it
# carries rate_limits.seven_day / five_hour (used_percentage + resets_at) it saves them to
# /workspace/agent-city/data/claude_ratelimit.json, then prints a short status line.
# Enable by adding to ~/.claude/settings.json yourself:
#   "statusLine": {"type": "command", "command": "/workspace/agent-city/bin/claude-statusline.sh"}
DIR="$(cd "$(dirname "$0")" && pwd)"
exec node -e '
let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
  let j = {}; try { j = JSON.parse(s); } catch {}
  const f = require(process.argv[1]);
  const n = f.normalize(j.rate_limits || {});
  if (n) { try { f.save(n, "statusline"); } catch {} }
  const m = (j.model && (j.model.display_name || j.model.id)) || "Claude";
  const p = k => n && n[k] ? `${k === "seven_day" ? "7d" : "5h"} ${Math.round(n[k].used_pct)}%` : null;
  console.log([m, p("seven_day"), p("five_hour")].filter(Boolean).join(" · "));
});' "$DIR/claude-rl-filter.js"
