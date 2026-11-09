#!/usr/bin/env bash
# Always-on public copy on GitHub Pages: https://dtkimdev.github.io/ac/ (zero AI tokens).
#   bin/pages.sh publish   build + push now (skips the 10 min limit, keeps the hourly cap)
#   bin/pages.sh status    login, last push, pushes this hour, HTTP checks
#   bin/pages.sh off|on    pause / resume watchdog publishing (the site stays up with its last data)
#   bin/pages.sh tick      called every 60 s by bin/public.sh _check: push if 10 min passed or the computer just woke
# gh-pages is ONE orphan commit, force-pushed. build/pages.git keeps the last pushed commit as a remote ref,
# so a push only sends what changed (normally state.json). That ref is also listed in $GD/shallow on purpose: git only
# skips objects of an unrelated (orphan) remote commit when the pushing repo is shallow, else every push resends 4.6 MB.
# Env PAGES_REMOTE=url tests against another remote, no gh.
set -uo pipefail
cd "$(dirname "$0")/.."
REPO=dtkimdev/ac; SITE=https://dtkimdev.github.io/ac/
REMOTE=${PAGES_REMOTE:-https://github.com/$REPO.git}
GD=$PWD/build/pages.git; WT=$PWD/build/pages
MIN_GAP=600; WAKE_GAP=300; MAX_HOUR=8; RETRY=120 # MAX_HOUR: GitHub Pages allows 10 builds/hour
PUSHES=logs/pages-pushes; LAST=logs/pages-lastpush; TICK=logs/pages-lasttick; WAKE=logs/pages-wake
FAIL=logs/pages-lastfail; NOAUTH=logs/pages-noauth; OFF=data/pages-off; READY=data/pages-ready
mkdir -p logs data build
log() { echo "$(date -Is) $*"; }
g() { git -C "$WT" --git-dir="$GD" --work-tree="$WT" "$@"; }
authed() { [ -n "${PAGES_REMOTE:-}" ] || gh auth token >/dev/null 2>&1; } # local check, no network
hour_count() { local c=$(($(date +%s)-3600)); awk -v c="$c" '$1>=c{n++}END{print n+0}' "$PUSHES" 2>/dev/null || echo 0; }
init_git() {
  [ -d "$GD" ] || git init -q --bare "$GD"
  g config core.bare false; g config core.logAllRefUpdates false; g config gc.auto 0
  g config user.name "Agent City"; g config user.email "agent-city@users.noreply.github.com"
  g remote get-url origin >/dev/null 2>&1 && g remote set-url origin "$REMOTE" || g remote add origin "$REMOTE"
}
ensure_repo() {
  [ -n "${PAGES_REMOTE:-}" ] || gh repo view "$REPO" >/dev/null 2>&1 || gh repo create "$REPO" --public --description "Agent City: public view-only office" >/dev/null
}
ensure_pages() {
  [ -n "${PAGES_REMOTE:-}" ] || [ -f "$READY" ] && return 0
  gh api "repos/$REPO/pages" >/dev/null 2>&1 || gh api -X POST "repos/$REPO/pages" -f 'source[branch]=gh-pages' -f 'source[path]=/' 2>&1 | grep -q 'already enabled\|"url"' || return 1 # GitHub may enable it on the first gh-pages push
  touch "$READY"
}
push_now() { # 0 pushed or nothing to do, 1 failed
  local started tree old c out kb
  started=$(date +%s)
  bin/pages-build.sh || return 1
  ensure_repo || { log "repo check/create failed"; return 1; }
  init_git
  git_auth=(-c credential.helper= -c 'credential.helper=!gh auth git-credential')
  g rev-parse -q --verify refs/remotes/origin/gh-pages >/dev/null || g "${git_auth[@]}" fetch -q --depth=1 origin +gh-pages:refs/remotes/origin/gh-pages 2>/dev/null
  g rev-parse -q --verify refs/remotes/origin/gh-pages > "$GD/shallow" || rm -f "$GD/shallow"
  g add -A . || return 1
  tree=$(g write-tree) || return 1
  old=$(g rev-parse -q --verify 'refs/remotes/origin/gh-pages^{tree}' 2>/dev/null || true)
  if [ "$tree" = "$old" ]; then log "nothing changed"; ensure_pages; return 0; fi
  c=$(printf 'Agent City static snapshot\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n' | g commit-tree "$tree") || return 1
  out=$(g "${git_auth[@]}" push --progress --force origin "$c:refs/heads/gh-pages" 2>&1) || { log "push failed: $(echo "$out" | tr '\r' '\n' | tail -3 | tr '\n' ' ')"; return 1; }
  g update-ref refs/remotes/origin/gh-pages "$c"; echo "$c" > "$GD/shallow"; g prune --expire=now
  echo "$started" > "$LAST"; echo "$started" >> "$PUSHES"
  tail -n 50 "$PUSHES" > "$PUSHES.tmp" && mv "$PUSHES.tmp" "$PUSHES"
  kb=$(echo "$out" | tr '\r' '\n' | grep -o 'Writing objects: 100%.*' | tail -1)
  log "pushed ${c:0:7} ${kb:-}"
  ensure_pages || { log "enabling Pages failed"; return 1; }
}
locked() { exec 9>logs/pages.lock; flock -n 9; }
case "${1:-}" in
  publish)
    locked || { echo "another publish is running"; exit 1; }
    authed || { echo "gh is not logged in: run gh auth login"; exit 1; }
    [ "$(hour_count)" -lt "$MAX_HOUR" ] || { echo "hourly cap reached ($MAX_HOUR), try later"; exit 1; }
    push_now || exit 1; rm -f "$WAKE" "$FAIL"; echo "published: $SITE";;
  tick)
    locked || exit 0
    now=$(date +%s); prev=$(cat "$TICK" 2>/dev/null || echo 0); echo "$now" > "$TICK"
    [ "$prev" -gt 0 ] && [ $((now-prev)) -gt "$WAKE_GAP" ] && { touch "$WAKE"; log "wake detected (gap $((now-prev)) s)"; }
    [ -f "$OFF" ] && exit 0
    if ! authed; then [ -f "$NOAUTH" ] || { log "gh not logged in, waiting"; touch "$NOAUTH"; }; exit 0; fi
    rm -f "$NOAUTH"
    last=$(cat "$LAST" 2>/dev/null || echo 0); failed=$(cat "$FAIL" 2>/dev/null || echo 0)
    [ -f "$WAKE" ] || [ $((now-last)) -ge "$MIN_GAP" ] || exit 0
    [ $((now-failed)) -ge "$RETRY" ] || exit 0
    [ "$(hour_count)" -lt "$MAX_HOUR" ] || { log "hourly cap reached, skipping"; exit 0; }
    if push_now; then rm -f "$WAKE" "$FAIL"; else echo "$now" > "$FAIL"; fi
    [ "$(stat -c %s logs/pages.log 2>/dev/null || echo 0)" -lt 1000000 ] || { tail -n 2000 logs/pages.log > logs/pages.log.tmp && cat logs/pages.log.tmp > logs/pages.log; rm -f logs/pages.log.tmp; };;
  off) touch "$OFF"; echo "watchdog publishing OFF (site stays up with its last data)";;
  on) rm -f "$OFF"; echo "watchdog publishing ON";;
  status)
    echo "site: $SITE"; [ -f "$OFF" ] && echo "publishing: OFF" || echo "publishing: on"
    authed && echo "gh: logged in" || echo "gh: NOT logged in"
    last=$(cat "$LAST" 2>/dev/null || echo 0)
    [ "$last" -gt 0 ] && echo "last push: $(date -d "@$last" -Is) ($(( ($(date +%s)-last)/60 )) min ago)" || echo "last push: never"
    echo "pushes last hour: $(hour_count)/$MAX_HOUR"
    echo "site http: $(curl -s -m 10 -o /dev/null -w '%{http_code}' "$SITE")  state.json: $(curl -s -m 10 -o /dev/null -w '%{http_code}' "${SITE}state.json")"
    tail -n 3 logs/pages.log 2>/dev/null;;
  *) echo "usage: $0 publish|status|off|on"; exit 1;;
esac
