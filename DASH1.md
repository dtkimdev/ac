# dash1 = Agent City (owner: bot14 Dashboards)
Read-only, zero-token live viewer of David's bots as workers in a painted cozy cyberpunk office. Full tech detail: README.md.

## Run
- Server: `bin/start.sh` / `bin/stop.sh` (server.js). Ports: 8787 password, 8788 127.0.0.1 no login, 8789 public view-only (GET allowlist).
- Public link: https://agentcity.tailacdee6.ts.net/ via Tailscale Funnel on David's free Tailscale account (david.dt.kim). `bin/public.sh start|stop|url|status`. After a restart of the shared computer, run `bin/public.sh start`.
- Watchdog (every 60 s, `_check`) restarts server/tailscaled; it restarts tailscaled + funnel only if tailscale is not Running/Online or the funnel is missing on 2 checks in a row (max once per 10 min). It no longer reacts to wake-from-sleep/PollNetMap log lines (box suspends; tailscaled self-recovers).
- Always-on copy: https://dtkimdev.github.io/ac/ (GitHub Pages, static, stays up while this computer sleeps). Top-right ↻ refreshes data via Funnel `POST /api/pages-refresh` + Bearer token (`.secret/pages-refresh-token`, or open once with `?rt=TOKEN`); max once per hour; needs this computer awake. `bin/pages.sh tick` (every 60 s) pushes state.json at most every 10 min, right after wake, max 8 pushes/h, zero tokens. Pages-only: `bin/pages-watch.sh start|stop|status` ticks without Funnel (log logs/pages-watch.log). `bin/public.sh start` still runs Funnel plus the old combined watchdog, which also ticks; it stops with `bin/public.sh stop`. `bin/pages.sh publish|status|off|on`, log logs/pages.log. Needs `gh auth login` once as dtkimdev. Check: `bin/pages-build.sh && node bin/pages-verify.js` (PAGES VERIFY OK, shots/pages.png).
- This computer can't curl its own public URL (DNS 198.18.0.1); test from outside (WebFetch).
- Check: `node bin/verify.js` (must print VERIFY OK, min 40 fps; last 60 fps at 12:00 and 22:30). `--shots` writes shots/v8-*.png.
- Assets: `bin/preprocess_v8.py` (design/v8; rewrites layout.json, `V8_ASSETS=dir` for a staging folder). Don't run preprocess_v7.py or preprocess.py any more. Bump `V` in main.js after an art change.

## What it shows
- Painted 2.5D office (dusk/night plates + 2D layers): one worker per bot, desks: Boss=Grok alone (curved desk), Numbers=$tonks+Sports (front right), back row L->R Video=Studio+Media, SB Pallet=SBP+Cyber, Messages=Ops+LF, far right Housekeeping=Usage+Archivist. Dashboards (bot14) lives in the lounge on the blue bean bag. bot11 Notes hidden by id (HIDDEN_IDS, display only), bot12 Notes moved out. 12 shown, 11 desk chairs, 0 spare: new bots need a seat.
- City window: Ferris wheel on the island (cached frames, 1 rev/90 s), waves, boats, planes, airships, cars on 2 bridges, building lights, neon flicker, moving clouds; day/night follows Bangkok time. Workers sometimes turn to face the viewer.
- Life (v8, cosmetic only, not interactions): painted chair turns per bot (design/v8/turn, head leads, no squash), neighbour chats, idle fidgets, lounge trips (bean bags, espresso, fridge; 2-6 min each, max 3 away, working/error walks back), corgi moods. Hooks: `__office2d.ambient`, `.loungeTrip(i)`, `.neighbourChat(i)`, `.dogMood(m)`.
- Single view: old `?view=` links open the office.
- Labels: name, then age (green to red at 7 d) and week % (green to red for the top user). Ages refresh hourly (store.db/wal mtime + heartbeat last_run, cached in lib/city.js; #1 goal: zero AI tokens).
- Walks: `bin/interact.sh FROM TO [note]` writes data/interactions.jsonl (entries >10 min ignored). Nothing writes it yet; having bots log handoffs needs David's yes (bot change via bot1). `?demo=1` previews.
- Top bar: Grok weekly % (resets Thu 20:32 BKK) and Claude Pro weekly % (data/claude_ratelimit.json from Claude Code rate-limit events on this computer only; DPro usage not visible). Feeds: bot0 Usage per-bot token split, bot2 $tonks portfolio snapshot.

## v9 preview (2026-11-05): built, NOT live, awaiting David's approval
- Staged in `design/v9/stage/public/` (art sources in design/v9/turn + boats, pipeline `bin/preprocess_v9.py`). `public/` is untouched: it is live the moment it changes. The lines above describe live v8 until promote.
- Changes: turn heads are real painted art (bust heads at back/front, painted turn faces + each bot's own hat, hair, headphones at side/3-4/chat; poses step, no dissolve or warp). Ferris wheel gone. 6 painted boat types in the harbour (body + lit sheets, dusk and night). Monitors re-measured at 7x, drawn as true trapezoids, glow and content masked to the glass. Numbers desk: $tonks big total in thousands + day %, Sports NFL board (decorative, from date + seed, no network).
- Preview: `bin/v9-stage.sh start` -> http://127.0.0.1:8798/ (own ports 8797-8799, copies of data). Shots: `node bin/v9-shots.js`. Check: `AGENT_CITY_STAGE=1 node bin/verify.js`.
- **Go live after David's yes: `bin/v9-promote.sh`** (backs up to /workspace/tmp/v9-bak/, copies stage -> live, V=9, verifies; Pages follows on its next tick). Then drop the Ferris wheel from "What it shows" here and don't run preprocess_v8.py any more.

## David's preferences
- Must match his original office render; every animated object soft, glowing, warm, never flat/blocky.
- Smooth high fps, token-lean always (no AI at runtime). One-time art via image generation, magenta chroma-key.
- Cozy startup office, 10-20 workers, big tall city window, bigger readable labels.
- Heavy coding: Claude Code CLI `~/.local/bin/claude -p ... --model claude-opus-5-5`, Pro login only, never an API key.
- He knows anyone with the link sees portfolio total and bot activity.

## Known issues
- SB Pallet and Messages workers partly hidden behind the boss and Numbers monitors. Cars only on the 2 bridges. Floor graph hand-placed (bin/preprocess_v8.py). Headless 3200x1800 needs `?q=0` for hi-res plates.
