# Shared GitHub workflow, sourced by bin/pages.sh. Every bot pushes source to the main branch of dtkimdev/ac.
# Before each build, pull_main takes the newest main. If that version fails a JavaScript syntax check, it stays on the
# last good version and remembers the bad one. write_receipt records what went live at /published.json.
# Needs: git, node, a log() function, the logs/ folder. Run from the project root.

pull_main() {
  git rev-parse --git-dir >/dev/null 2>&1 || return 0
  git fetch -q origin main 2>/dev/null || { log "main: fetch failed, building what is here"; return 0; }
  local head new bad tmp f
  head=$(git rev-parse HEAD); new=$(git rev-parse origin/main)
  [ "$head" = "$new" ] && return 0
  bad=$(cat logs/main-bad 2>/dev/null || true)
  [ "$new" = "$bad" ] && return 0
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then log "main: uncommitted edits here, not pulling. Commit and push them"; return 0; fi
  git merge -q --ff-only origin/main 2>/dev/null || { log "main: this folder has commits that are not on main, not pulling. Push them"; return 0; }
  tmp=$(mktemp -d)
  for f in public/office2d/*.js; do
    [ -f "$f" ] || continue
    cp "$f" "$tmp/check.mjs"
    if ! node --check "$tmp/check.mjs" 2>"$tmp/err"; then
      log "main: ${new:0:7} breaks $f ($(grep -m1 -E 'Error' "$tmp/err")), staying on ${head:0:7}"
      echo "$new" > logs/main-bad; git reset -q --hard "$head"; rm -rf "$tmp"; return 0
    fi
  done
  for f in bin/*.sh; do # the publisher updates itself from main, so its own scripts must parse too
    [ -f "$f" ] || continue
    if ! bash -n "$f" 2>"$tmp/err"; then
      log "main: ${new:0:7} breaks $f ($(head -c 160 "$tmp/err" | tr '\n' ' ')), staying on ${head:0:7}"
      echo "$new" > logs/main-bad; git reset -q --hard "$head"; rm -rf "$tmp"; return 0
    fi
  done
  rm -rf "$tmp"
  log "main: ${head:0:7} -> ${new:0:7}"
  if git diff --name-only "$head" "$new" | grep -qE '^(server\.js|lib/)'; then log "main: server code changed, restart the server to use it"; fi
  return 0
}

# The ↻ button on the live site starts .github/workflows/refresh.yml, which does nothing itself. A run newer than the last one
# seen means "publish now". Outbound check only, about once a minute from bin/pages.sh tick. The first run ever seen is only recorded.
refresh_requested() {
  local id last
  id=$(gh api "repos/dtkimdev/ac/actions/workflows/refresh.yml/runs?per_page=1" --jq '.workflow_runs[0].id // empty' 2>/dev/null) || return 1
  [ -n "$id" ] || return 1
  last=$(cat logs/refresh-last 2>/dev/null || true)
  [ "$id" = "$last" ] && return 1
  echo "$id" > logs/refresh-last
  [ -n "$last" ] || return 1
  log "refresh button pressed (run $id), publishing now"
  return 0
}

write_receipt() { # the live site serves this as /published.json, so any bot can check its change went out
  printf '{"main":"%s","built":"%s"}\n' "$(git rev-parse HEAD 2>/dev/null || echo none)" "$(date -Is)" > build/pages/published.json
}
