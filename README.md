# Agent City

**Default view (since 2026-11-03, second pass): a painted 2.5D office** at `/`. It uses the approved render's own plates (`design/plate-dusk.jpg`, `design/plate-night.jpg`) with Canvas-2D layers on top, with no libraries and no WebGL. Each live bot is one chibi worker (from `design/workers-back.jpg`) seated at a desk.
- **Single view:** old `?view=` links and `/city` open the office.

## Always-on copy on GitHub Pages (2026-11-05)
**https://dtkimdev.github.io/ac/** is a static, view-only copy that stays up while this computer sleeps; the Tailscale Funnel link is unchanged. Zero AI tokens. Data is the same as the public link (`http://127.0.0.1:8789/api/state`), including the portfolio total; the page carries noindex.
- **Build:** `bin/pages-build.sh` writes `build/pages/` from the same `public/` code. Only `index.html` is transformed (relative paths, no sign out, `window.AC_STATIC = true`). In static mode `main.js` uses relative asset URLs and polls `./state.json?t=...` every 60 s instead of `/api/*`. When the state's `now` is older than 15 min, `#asof` shows "Data as of 10:25 Bangkok"; bots keep animating.
- **Publish:** `bin/pages.sh publish` pushes now (first run creates the repo and enables Pages); `bin/pages.sh status` shows the state. Needs `gh auth login` once as dtkimdev.
- **Automatic:** `bin/public.sh _check` starts `bin/pages.sh tick` detached with a 300 s timeout, log `logs/pages.log`. It pushes every 10 min, immediately after a wake (tick gap > 5 min; retried every 2 min until it works), never more than 8 pushes/h (GitHub's soft limit is 10 builds/h). No watchdog (`bin/public.sh stop`) means no updates.
- **Git:** `gh-pages` is one orphan commit, force-pushed. `build/pages.git` remembers the last pushed commit and lists it in its `shallow` file so git sends only changes (about 300 bytes for a state update, 4.6 MB without it). Earlier commits leave the branch, but GitHub can keep unreferenced commits reachable by hash for a while. Deleting `build/pages.git` is safe: the next push resends everything.
- **Turn off:** `bin/pages.sh off` stops pushing, the site stays with its last data and caption (`on` resumes). Take the site down: `gh api -X DELETE repos/dtkimdev/ac/pages`. Remove everything: `gh repo delete dtkimdev/ac` (needs `gh auth refresh -s delete_repo`).
- **Check:** `bin/pages-build.sh && node bin/pages-verify.js` serves the build under `/agent-city/` and checks render, 12 tags, no 404s, 40+ fps, cache-buster, polling, stale caption; writes `shots/pages.png`.

## v8 (2026-11-05): new office, lounge, painted chair turns, Ferris wheel, hourly tags
Art in `design/v8/` (sources, kept). `python3 bin/preprocess_v8.py [plates] [city] [room] [turn] [dash] [ferris]` (Pillow + numpy, no AI, about 1 min) rebuilds the assets and `layout.json`; `V8_ASSETS=dir` writes to a staging folder. `bin/preprocess_v7.py` must not be run any more (it would overwrite layout.json); `corgi.png` and `legs.png` stay as it built them.
- **Plates:** the dusk art is about 0.5% taller than the night art, so it is warped onto the night geometry; the magenta fringe around the pasted front-right desk is neutralised. Sky, water and glass masks, stars, lights, neon, bridge lanes and boat lanes are re-measured.
- **Seating:** back row L->R Video, SB Pallet, Messages, far right Housekeeping (bot0 + bot8); curved desk Boss (Grok alone); pasted front-right desk Numbers (the charts desk). 11 desk seats. bot14 Dashboards lives on the blue bean bag (`lounge` desk). bot11 Notes is hidden by id (`HIDDEN_IDS`, display only). Nook desk, `kitchen.png`, `trees-mask.png`, `w12/f12` are gone.
- **Geometry:** seats derive from the chair in the plate (`ctop`, `base`, backrest polygon); `ts` = plate px per turn-atlas px. One floor graph `layout.nav` for walkers and the corgi (Dijkstra), seat feet are nodes. Occluders with depth: `boss`, `desk-fr` (with a `zone`: walkers behind them sort under the patch), `bag-r/b/m`, `table`; floor plants `room-l/r` on top.
- **Turning (no squash, no flip of a seated body):** `turn-bodies.webp` = the 6 painted frames per bot (hoodie recoloured, head removed, swivel chair included); `turn-heads.webp` = each bot's head at 9 yaws, wrapped from the front and back busts on a per-row spheroid. `pose.b` eases 0 (back) to 4 (front), the head leads, weight shifts, the frames dissolve into each other. While `pose.a > 0` a chair-less patch (`nochair-*.webp`, graded with the base) hides the plate chair. Leaving: turn, stand up (dissolve), walk; returning is the reverse. Walkers also dissolve on direction changes and ease their start and stop.
- **Neighbour chat (cosmetic, never in the feed):** two idle desk neighbours turn to each other, take turns gesturing (`chat-right` frame) and nodding, with small bubbles. Every 25-75 s at most one pair.
- **Lounge:** idle bots walk to the red or mustard bag (front bust + sitting legs) or stand at the espresso machine, fridge, rug or table, snack, chat, pet the dog. Max 3 away. Dashboards uses `dash-mug` idle and `dash-laptop` working (glow pulse, typing bob, task bubble), and takes her own lounge walks. All corgi moods stay, `layout.dog.beg` are the begging spots.
- **Ferris wheel:** 56 rotation frames cached at the on-screen size in one sheet plus 3 tinted sheets, rebuilt on resize; 1 rev / 90 s, cross-faded frames and tints, glow by darkness, hazed at dusk, drawn before the frame mask.
- **Tags:** age is colour-graded green to red at 7 d; the counters refresh once an hour (`LABEL_EVERY` in main.js, `hourly()` in lib/city.js freezes `last_active` between plain file reads). Status (working/idle) still updates every 5 s from those same reads; no AI at runtime. Tags are clamped to the screen edges. `?fakeages=1` fakes a spread of ages for screenshots only.
- **Debug hooks:** `.ambient` = `{away, lounge, onBag}`, `.loungeTrip(i|name)`, `.neighbourChat(i|name)`, `.turn(i|name)`, `.dogMood(m)`, `.ferris.bench()`. Assets use `?v=8`.
- `shots/v8-{night,dusk,tags}.png` are written by `node bin/verify.js --shots`.

## v7 (2026-11-05): trees, kitchen, full-body bots, moody corgi, ambient idle life
All new art lives in `design/v7/`; pristine pre-v7 plates, water mask and layout are in `design/v7/orig/`. `python3 bin/preprocess_v7.py [trees] [kitchen] [corgi] [legs]` (Pillow + numpy, idempotent) rebuilds the assets and always rewrites `layout.json` from `orig/layout.json`, so every v7 layout value (kitchen spots, dog graph) is edited there. `bin/preprocess.py` can no longer run: its sources were deleted.
- **Trees:** foliage is extracted from the two AI edits (colour + difference from the plate, glass panes only) and composited into all four plates. The edits grew different palms, so the silhouette is the union of both, and a pixel only one edit has is filled from the other, regraded; both plates share one outline and the crossfade cannot ghost. `trees-mask.png` is redrawn from the plate after the city FX (`over.trees`), so cars, neon, boats and ripples pass behind the trees. Trees are subtracted from `water-mask.png`, and window lights under them were dropped from `layout.lights` (260 -> 59).
- **Kitchen:** `kitchen.png` (keyed; the pendant was moved to hang through the gap between the Video monitors, on a cable to the ceiling beam, so it never crosses a worker). It sorts at `layout.kitchen.depth` in the painter's list: bots behind the counter are hidden by it, bots at the stools are in front. Baked per time bucket (cooler at night), contact shadow baked into the base, cached glows on bulb + neon heart, a small steam wisp.
- **Legs:** `legs.png` + `layout.legs`. The 4 painted side frames barely differ, so one painted leg is swung around the hip into a true 8-frame stride (the far leg is darker; a hip drop per frame sits in `sideFoot`). Front walk = the standing legs with each leg lifted in turn, back walk = the 2 back frames, `sit` = the sitting legs (front-turned workers and stools). Waist width follows the sprite; the hem line and centre per sprite are in `layout.sprites[i].hem/hemF`. The row-2 figures on the sheet are unused.
- **Corgi:** `corgi.png` atlas (walk x6, sit, beg, sleep, belly, happy, lie; one scale, bottom-centre anchor). Moods with weighted picks and random durations: `wander` (trot or slow sniff), `affection`, `belly`, `nap`, `rest`, `beg` (more likely while bots are in the kitchen; they may drop a treat), `zoomies`, plus `happy` when petted. Eased starts and stops, smooth turns, breathing/tail motion from small scale and tilt.
- **Ambient idle life (cosmetic, client-side, zero-token):** idle bots fidget in the chair (lean, swivel, stretch, look, scratch). Each takes a kitchen trip roughly every 2-6 min (max 3 away, never everyone): walks the walkway, sits on a stool or stands at the counter/fridge, snack and small-talk emoji bubbles, sometimes walks over to pet the dog, then returns. A bot whose status becomes `working` or `error` walks back at once; a real interaction recalls both bots. None of this touches the interactions feed or `bin/interact.sh`, and it is never labelled as a handoff.
- **Debug hooks:** `window.__office2d.ambient` = `{away:[names], kitchen:[names]}`; `.kitchenTrip(i | name)`; `.dogMood(name)` (`wander|affection|belly|nap|rest|beg|zoomies|happy`, or a pose such as `lie`); `.corgi` = `{mode, mood, x, y, node, by}`; `.assets` (decoded widths).
- **Assets are requested with `?v=N`** (bump `V` in `main.js` on the next art change), since they are cached for 1 h.
- `shots/v7-{dusk,night,kitchen}.png` are written by `node bin/verify.js --shots`.

## 2D office (default)
- **Desks and seating:**
  | desk | bots |
  |---|---|
  | Boss (centre front) | bot1 Grok |
  | Numbers (front right) | bot2 $tonks + bot10 Sports |
  | Video (back left) | bot4 Studio + bot5 Media |
  | SB Pallet (back centre) | bot6 SBP + bot9 Cyber |
  | Messages (back right) | bot3 Ops + bot7 LF |
  | Housekeeping (far right) | bot0 Usage + bot8 Archivist |
  | Lounge (blue bean bag) | bot14 Dashboards |
  - There are 11 desk chairs, no spare; 12 base sprites + the Dashboards art. bot11 Notes is hidden from the office (v8).
  - Chairs painted in the plate are redrawn from the plate over the worker. Seats without a painted chair get a drawn chair.
  - A bot's optional `"desk"` field in `data/bots.json` overrides its seat. The value is a desk id or label.
  - New bots fill the empty chairs, then the spare chair. Any bots beyond that use standing spots.
  - Moved-out bots are not seated.
- **Workers:**
  - Every worker has a distinct sprite, picked as `sprite_seed % 12` with probing on clashes.
  - **Idle:** breathing bob and an occasional head tilt.
  - **Working:** typing jiggle, a brighter monitor with glow, and a speech bubble showing the task.
  - **Error:** a red lamp tint, a slump, and a red-tinted screen.
  - **Walks (interactions):** when the interactions feed (below) says bot A talked to bot B, A's worker rises from the chair, walks the walkway to B's desk, shows a short talk bubble while B turns towards them, then walks back and sits. Walkers reuse the painted sprites with a painted lower body (dark trousers and shoes in 8 stride frames), bob and sway, a soft floor shadow, and scale with floor depth. Behind the boss desk, the desk and monitors hide their lower body. Foreground floor plants are redrawn over them.
  - **Normal mode never invents interactions.** The old random "paper note" glides are gone. Under `?demo=1` a random walk (carrying a paper note) starts within 2 s and then every 8–12 s.
  - **Name tags:** bold 15.5 px glass pills at 1280x800, scaled with the viewport (minimum 13 px). They have a dark glass body, a thin desk-accent border and a status dot. They are cached bitmaps drawn on the canvas, staggered upwards so that neighbouring tags and bubbles never overlap. Transparent DOM pills on top keep click-to-card working. Task and talk bubbles are cached rounded glass bubbles.

## v6 (2026-11-03): hi-res, water, occlusion, living city, turns, corgi, boss desk, last-active, Claude usage
- **Resolution:** the canvas renders at devicePixelRatio (capped at 2; the adaptive quality steps can lower the internal scale). There are two plate sets: `plate-{dusk,night}.webp` (2560x1440) for normal canvases, and `plate-{dusk,night}-hi.webp` (3840x2160, q85). The hi set is loaded lazily only when the canvas is wider than 2600 px or taller than 1460 px. All FX are in plate coordinates, so they scale with the canvas.
- **One-time art (`design/v6/`, magenta key in `preprocess.py`):**
  - `f00..f11.png`: front sprites, matched to `w00..w11` (same canvas size, head width matched, bottom-centred).
  - `corgi.png`: an atlas plus frame metadata in `layout.corgi`.
  - Boss desk (`boss-desk.jpg`): baked into both plates. The old desk is inpainted away (push-pull), the new wood is graded to each plate, a contact shadow is added, and Grok's painted chair is put back on top. `boss-mask.png` is the desk silhouette, used as the painter's occluder, so workers on the walkway, the back-row bodies and the corgi pass behind it.
  - Boss desk FX: screen glow, a scanline shimmer on all 3 curved monitors and a holo-city flicker with a scan sweep. The boss router and team screens are drawn translucently on the two outer monitors.
- **Water (`fx.water`):** an offscreen water layer masked by `water-mask.png` (painted water only, never on bridges, piers or land). It holds two scrolling ripple textures in 3 perspective bands, shimmering vertical reflections of the city lights and neon above the shore (stronger at night), boat reflections, and V wakes that grow and fade.
- **Occlusion:** all city FX are clipped to a Path2D of the glass panes (between the mullions, above and below the transom). The frame, mullions, vines and the interior are then redrawn from the plate (`fg-mask.png`, now also covering the sill lamp post and both floor plants via `FG_EXTRA`). Far FX go under the skyline mask. `window.__office2d.glassClip = {panes, masks, water}`.
- **City:**
  - 64 cars on the two painted bridge decks, one lane per direction, with varied speed and length per depth. By day they have soft painted bodies in muted colours; at night warm headlights, red taillights and trails.
  - 96 window lights fade on and off slowly; the lit fraction follows darkness.
  - 6 neon signs measured on the night plate flicker, buzz, and sometimes go dark for a few seconds.
  - 7 drifting painted cloud layers (soft puffs tinted from the plate palette) sit behind the skyline.
- **Workers:**
  - Turns: every 20–60 s a worker swivels in the chair. The back sprite crossfades to the front one while scaleX goes 1 → 0.6 → 1. They hold for 2–5 s, then turn back. At most 2 are turned at once. The look-around is a head tilt plus a small lean.
  - Under `?demo=1`, turns are more frequent (the first within about 6 s). `window.__office2d.turn(i)` forces a turn, and `window.__office2d.turned` reports the count.
  - Walkers show the front sprite when walking toward the camera and the back one when walking away.
- **Corgi:**
  - (Superseded by the v7 moods above.) Wanders a waypoint graph (`layout.dog`, edited in `bin/preprocess_v7.py`). The walk cycle is synced to distance, at about 10 fps.
  - It is mirrored when going left, scaled by floor depth, has a soft shadow, and is depth-sorted by its feet. It goes behind the boss desk inside `boss.zone`.
  - It naps (sleep frame with rising "z" puffs), sits, and sometimes trots to a worker and sits by them; that worker usually turns around to look. `window.__office2d.corgi = {mode,x,y,node,by}`.
- **Labels:** each tag reads `Name · 1.4d` / `2.3h` / `15m` / `now`, or `Name · —` when no activity is known. The value is `bot.last_active` from `/api/state`, computed in `lib/city.js` as the max of the bot's `store.db` / `store.db-wal` mtime and the heartbeat `last_run`. It refreshes once an hour (v8), and the bitmap is rebuilt only when the text changes.
- **Top bar:**
  - `Grok 19% wk · resets Thu 20:32` comes from the weekly pool (`usage.used_pct`, `usage.reset`).
  - The Claude cell shows either `Claude 21% wk · resets …` (plus `as of HH:MM` when the reading is more than 3 h old) or `Claude ~1.2M tok this wk (box only, est.)`.
  - Items with lower priority (next job, last activity, 5 h and projection notes) drop at smaller widths.

### Claude usage (`claude_usage` in `/api/state` and SSE `claude`, also on 8789)
- **Collector:** `bin/claude-usage.js` writes `data/claude_usage.json` and makes zero model calls. `server.js` runs it as a detached child once at start and then hourly. Its output is `{ts, source, week_pct, resets_at, five_hour_pct, five_hour_resets_at, ratelimit_ts, window_start, tokens_week:{in,out,cache_write,cache_read,total_billable,messages}, note}`.
- **(a) Real % (`source:'ratelimit'`):** read from `data/claude_ratelimit.json` if it is less than 7 days old. The file holds `{seven_day:{used_pct,resets_at}, five_hour:{...}, ts}`. Two things write it:
  - `bin/claude-run.sh -p "…"`: a wrapper for headless runs. It runs `claude … --output-format stream-json --verbose` through `bin/claude-rl-filter.js`, which passes the stream through unchanged and saves the newest `rate_limit_event` (`unifiedWindows.seven_day/five_hour.utilization` and `resetsAt`).
  - `bin/claude-statusline.sh`: an optional statusLine command. It is **not installed**. To enable it, add `"statusLine": {"type":"command","command":"/workspace/agent-city/bin/claude-statusline.sh"}` to `~/.claude/settings.json`. It saves `rate_limits.seven_day/five_hour` when Claude Code provides them.
  - This % is the account-wide weekly limit **as of the last reading**. Once the window rolls past `resets_at`, the % is dropped and the estimate is used until a new reading arrives.
- **(b) Estimate (`source:'local-estimate'`):**
  - Sums `input + output + cache_creation` tokens (`cache_read` is reported separately) from the assistant messages in `~/.claude/projects/**/*.jsonl` (read-only), deduped by message id.
  - The window starts at `resets_at − 7 d` if known, otherwise it is a rolling 7 days. Results are cached per file by mtime and size (`data/claude_usage_cache.json`).
  - It only sees **this box**. Claude Code on David's PC (DPro) is not visible, and tokens are not the same thing as the plan's % (Anthropic weights them by model).

### Interactions contract (like heartbeats)
- **Feed:** `data/interactions.jsonl`, one JSON object per line: `{"ts":"2026-11-03T14:05:00Z","from":"bot3","to":"bot1","note":"optional short text"}`. `from` and `to` take `botN`, a bot id, or a bot name. `note` is at most 80 characters.
- **Writing:** `bin/interact.sh FROM TO [note]` appends a line. Bots can call it; nothing calls it yet. It trims the file to 500 lines once it passes 256 KB.
- **Serving:** the server re-reads the file only when its mtime or size changes, and only parses the last 64 KB. It exposes the last 20 entries from the last 10 minutes as `interactions` in `/api/state` and in the SSE `init`/`status` events, behind the same auth. It never writes to the file.
- **Playing:** the client plays each entry once (dedupe key `ts|from|to`). On page load it only replays entries from the last 2 minutes. A walk waits while either worker is busy, and is dropped after 90 s. Unknown or standing-spot bots are ignored. There is no real bot-to-bot signal on this box today, so without entries nobody walks.
- **Screens:** each monitor quad shows themed content that refreshes at about 8 Hz.
  - **Numbers:** charts, plus a portfolio mini screen. It is gold when the day is up, blue when down, and shows a red **STALE** badge when the snapshot is more than 30 min old.
  - **Video:** film reels and a filmstrip.
  - **SB Pallet:** shields and pallets.
  - **Messages:** paper planes and an inbox.
  - **Housekeeping:** books, plus a water gauge of weekly usage %.
  - **Boss:** a router graph and a team status board.
- **Time of day:** real Bangkok time via `Intl` (`Asia/Bangkok`), with `?t=HH:MM` to override it. Sunrise is about 06:15 and sunset about 18:00. Everything ramps smoothly:
  - **Day:** the dusk plate with a cooler, lifted grade, faint city lights and contrails.
  - **Golden dusk (17:00–18:45):** warm overlay and stronger light shafts.
  - **Night:** the night plate crossfades in from 18:00 to 19:18 and stays until 05:00. More windows are lit, headlights are full, stars twinkle, there are fewer boats, and fireflies appear.
  - **Dawn:** a rosy grade as the night plate fades out (05:00–06:36).
  - The cached base is re-composited only when the 2-minute bucket, the size or the quality level changes.
- **City (behind the glass, all painterly):**
  - Colours are sampled from the plates by `preprocess.py` into `layout.palette` and re-tinted per time bucket. Glows are pre-rendered radial sprites drawn with `lighter`.
  - Far objects are smaller, slower and lerped towards the local haze, with pre-softened sprites.
  - Far layer: star twinkles on the painted stars, planes (shaded silhouettes with red/green nav lights, a white double-strobe, and contrails by day), and two far airships. These are drawn under a skyline mask cut from the plate, so they pass behind towers, clouds and vines.
  - Near layer: switching windows from the night plate (a window goes dark in its own wall colour or lights up, with a fade), sea glints, and boats on four water lanes. Boats are shaded silhouettes in 3 kinds with warm cabin windows, a shimmering mirrored reflection, a foam wake, and mast lights with long reflections after dark.
  - Bridge traffic on lanes measured onto the two painted bridges: paired warm headlights and red taillights with light trails over a faint dark body, at varied speeds, with occasional long buses and smeared reflections where the deck crosses water.
  - One near airship. The airships are the painted ones lifted out of the plate (`airship*-{dusk,night}.png`), at 3 depths with nav lights and a warm gondola glow at night.
  - Everything is clipped to the glass, then the window frame, mullions and vines are redrawn from the plate on top (`fg-mask.png`).
- **Room:** lamp bloom pulses. Dust motes drift in the light shafts. Fireflies appear at night.
- **Unchanged UI:** the KPI glass strip, info card and clock come from `public/office2d/ui.js`. The music toggle (`/audio.js`, off by default) and `?embed=1` work as before.
- **Performance:**
  - A single requestAnimationFrame loop runs at display rate with delta-time motion. There is no idle cap any more, and the loop pauses while the tab is hidden.
  - These are all cached offscreen: the plate + grade + window-light bloom, the mask overlays, the chair and occluder patches, every glow, trail, plane, boat, reflection, airship, leg, shadow, tag and bubble bitmap.
  - There is no `shadowBlur` and no gradient creation per frame. FX objects live in fixed pools, and the painter's list is a persistent array sorted in place.
  - Screens redraw at about 8 Hz. devicePixelRatio is capped at 2.
  - **Adaptive quality:** after 2 s below 50 fps it steps down: fewer FX, then internal resolution 0.8 and then 0.66. It steps back up after 20 s at 58 fps or more. `?q=0..3` forces a level. `window.__office2d.quality = {level, scale, fx}`.
  - Headless Chrome (CPU raster) at 1280x800 renders 60 fps at noon, at night, and during a demo walk.
  - Page weight is about 1.4 MB.
  - `window.__fps` and the hidden `#fps` element report fps. `window.__office2d = {workers:[{id,name,desk,seat,sprite,status}], fps, frames, ready, walking, interactions, quality}`.
- **Code:** `public/office2d/` contains:
  - `index.html`
  - `main.js`: data, seating, workers, draw order, loop.
  - `fx.js`: city effects (far and near layers), lamps, motes.
  - `screens.js`
  - `time.js`
  - `assets/`

### Preprocess and layout tuning
- **Command:** `python3 bin/preprocess.py [--debug]` (Pillow + numpy) regenerates `public/office2d/assets/`.
  - **Sprites:** chroma-keys the 4x3 worker sheet into `w00..w11.png`. Edges are soft, and green despill only touches the rim so green hoodies survive.
  - **Plates:** upscales them 2x with Lanczos and a light unsharp mask, then saves `plate-dusk.webp` and `plate-night.webp` at q82.
  - **Masks:** `fg-mask.png` (window frame, mullions, vines), `sky-mask.png` (skyline and clouds in the sky band) and `room-{l,r}-mask.png` (foreground floor plants).
  - **Airships:** lifts the two painted airships out of the sky into `airship-{dusk,night}.png` and `airship1-{dusk,night}.png`. The alpha comes from colour distance to the row-wise sky, using the largest blob with holes filled and feathered edges. Colours are de-contaminated from the sky.
  - **Layout:** writes `layout.json`, including the sampled `palette`, `lights` (with each window's "off" wall colour), the painted `stars`, `lanes`, `boatLanes`, `skyBand` and the `walk` graph.
- **Tuning:** all coordinates are hand-measured in plate pixels (1280x720) in the `DESKS` (including per-seat `visit` and `via` walk points), `OCCLUDERS`, `STANDING`, `LAMPS`, `WINDOW`, `SEA`, `SHAFTS`, `LANES`, `BOAT_LANES`, `SKYBAND`, `WALK_Y`, `WALK_H` and `MULLIONS` constants at the top of the script. They are normalised to 0..1 in the JSON.
  - **Seat fields:**
    - `x`: sprite centre.
    - `top`: head top.
    - `h`: sprite height.
    - `clip`: where the body disappears behind the chair or desk.
    - `chair`: a plate polygon, or `'draw'`.
  - **Painter's order:** items are sorted by plate y. Monitors sort by their bottom edge, workers by `clip`, and occluders by `depth`.
  - **Checking:** `--debug` draws every quad, seat, polygon, car lane, boat lane, the sky band, the walkway and the visit routes onto the plate as `shots/layout-debug.png`.

## Viewer URL parameters
| param | effect |
|---|---|
| `?t=HH:MM` | Freeze the Bangkok clock. In the 2D office, 12:00 is day, 17:45 is golden dusk (the night crossfade runs 18:00–19:18) and 22:30 is night. |
| `?demo=1` | **Preview only**, client-side: Grok, $tonks and Ops are working and Cyber is in error, and the KPI is adjusted to match. In the 2D office a random worker walks a paper note to another desk within 2 s, then every 8–12 s. The real interactions feed is ignored. |
| `?q=0..3` | 2D office: force a quality level instead of adapting. |
| `?embed=1` | Compact layout for iframes. |

`node bin/verify.js --shots` checks the following:
- Login on 8787, the 8788 local view, and the 401 response for unauthenticated API calls.
- The default `/`: no console errors, 11 named workers with distinct sprites, name tags, and the info card.
- 1280x800 on 8788: fps of at least 40. With `?demo=1`, a walk starts within 6 s. `/api/state` carries an `interactions` array.
- v7: assets decoded, a forced kitchen trip arrives, forced corgi moods take, removed files give 404, legacy `?view=` links open the office.

It writes `shots/v7-{dusk,night,kitchen}.png`. v6 adds these checks: last-active label suffixes, the corgi state, the glass clip, a demo turn within 6 s, 12 front sprites, `claude_usage` on 8788 and 8789, 8789 `/healthz`, fps ≥ 50 at both `?t=12:00` and `?t=22:30`, and the hi plate set on a 3200x1800 canvas.

## Password / auth
- On first run the server creates `.secret/` (mode 700) containing:
  - `.secret/password.txt` (mode 600): a random password. It is never printed to stdout or the logs.
  - `.secret/auth.json` (mode 600): the scrypt hash and salt (N=16384, r=8, p=1), an HMAC session key, and `embed_token`.
- `/login` sets an HttpOnly, SameSite=Lax cookie (`ac_session`, valid 30 days). `/logout` clears it. After 8 failed logins, an IP is blocked for 10 minutes.
- To change the password, stop the server, delete `.secret/`, and start the server again. This also rotates the embed token.

## Discovery rules (lib/city.js)
- Every **directory** in `/home/box/agent-data/agents/` is a bot (`active-agent.json` and other plain files are ignored). The directory is read-only: the server only uses `readdir`, `stat` and `readFile`.
- **Name and number:** the `profile.json` `name` is parsed as `"N. Name"`. If it doesn't match (bot0's live name is its usage text, e.g. `19% 2.5d`), the number and name come from `/workspace/david-stack/BOTS.md` by id, then from a leading `botN` in the description. The live name is still shown on the card as "Shown as".
- **Activity:** last active = mtime of `store.db-wal` (falls back to `store.db`).
- **State:**
  - **working:** the WAL changed within the last 90 s, or a heartbeat says `working` and was updated within 15 min.
  - **error:** a heartbeat says `error`, or the heartbeat is stale (`now - last_run > 2 × (next_run - last_run)`).
  - **idle:** anything else.
- **Discovery** runs at startup and every 5 minutes. Status is re-read every 5 s, which is just a few `stat` calls.
- **Registry:** `data/bots.json` holds `{id,num,name,live_name,type,schedule,district,sprite_seed,pinned,renamed,first_seen,last_seen,status}`.
  - **New bot:** it gets a free district. Approved districts by number come first, then the spares: Ferry Wharf, Windmill Ridge, Lighthouse Point, Tram Terminal Heights, Teahouse Terraces. Its character is generated from `sprite_seed` (a sha1 of the id), and the viewer plays a tram-arrival animation.
  - **Gone for less than 24 h:** "away".
  - **Gone for more than 24 h:** "moved out". The district is faded with a little "moved out" sign. Entries are never deleted.
  - BOTS.md rows that have no folder are added as moved out. Rows marked RETIRED or stale are skipped. This is how **bot12 Notes** ends up moved out of Roundtable Teahouse.
- **Districts:**
  - Approved: bot0 Waterworks, bot1 Castle Hill, bot2 Bank Quarter & Observatory, bot3 Post Office Docks, bot4 Lantern Film Lot, bot5 Canal Darkrooms, bot6 Pallet Yards, bot7 Neon Garden Promenade, bot8 Library Stacks, bot9 Watchtower Wall, bot10 Sports Stadium Fields.
- **Schedules** (best effort, Bangkok time):
  - The parser scans any files under `agents/<id>/automations/` (currently all empty) and the profile description.
  - It understands `every Nh`/`every Nm`, `daily HH:MM`, `Sun HH:MM` (any weekday), and 5-field cron.
  - From this it computes the next run. A heartbeat `next_run` overrides it.
  - Found today: bot0 (every 2h, daily 9:00), bot1 (Sun 10:00), bot8 (Sun 9:00).

## Rename / pin (one line)
```
bin/agentcity rename bot5 "Media Lab"        # or a full/short (≥6 chars) id; sticky, discovery won't overwrite
bin/agentcity reset-name bot5                # go back to the profile name
bin/agentcity pin bot7 "Lighthouse Point"    # district; the bot displaced from it is re-assigned a free one
bin/agentcity unpin bot7
bin/agentcity list
```
The server picks up changes to `bots.json` within 5 s.

## Heartbeat helper (optional, not installed into any bot)
```
bin/heartbeat.sh <id|botN> <working|idle|error> [task] [k=v ...]
# e.g. bin/heartbeat.sh bot3 working "triaging inbox" next_run=2026-11-03T12:00:00+07:00 model=… tokens_in=1200
```
- Writes `data/heartbeats/<id>.json` with `{id,state,task,started_at,last_run,next_run,last_alert,tokens_in,tokens_out,model,updated_at}`. The server merges it into that bot's status.
- `working` sets `started_at`. `idle` and `error` set `last_run`.
- Changing `last_alert` makes the viewer fly a paper plane to the Post Office.

## Weekly limit / reset
- **Weekly %:** the latest line of `~/usage/snapshots.jsonl` (`{ts,used_pct,reset}`). `data/usage_split.json` also counts if it is newer.
- **Reset:** always the `reset` field, i.e. the real Thu 20:32 Bangkok reset. It is never assumed to be Monday.
- **Burn rate:** a direct port of `~/usage/burn.py build()`.
  - The current cycle starts at a % drop or when the reset moves by more than 1 h.
  - The rate comes from the snapshot closest to 24 h ago (at least 1 h old).
  - The KPI shows "empty by <Day HH:MM>" only if the 100% ETA falls before the reset. Otherwise it shows "≈N% at reset".
- **Per-bot split:** from `data/usage_split.json` (`bots[].pct_of_pool`). If the file is missing, the shares are simply hidden.
- **Water tower:** the Waterworks tank level is `100 − used%`. Colour: green below 60, amber 60–85, red above 85.
- **District lanterns:** each glows in proportion to that bot's share.

## Portfolio
- **Source:** `data/portfolio.json` (`{ts,total,day_change,day_change_pct,history}`).
- **Fallback:** the newest `/workspace/david-stack/out/latest-portfolio-YYYY-MM-DD.json`.
  - total = `netEquity`
  - day change = Σ(`marketValue − prevValue`) over positions
  - history = `netEquity` from every dated file
- **Bank Quarter placard and clock tower:** total with a flip-digit animation, day $/% with a sparkline, and the snapshot age. The glow is warm gold when the day is up and soft blue when it is down. The placard says "stale" when the snapshot is more than 30 min old.

## API
- `GET /api/state`: full JSON.
- `GET /api/stream` (SSE): `init`, then `status` every 5 s and `usage` + `portfolio` every 60 s.
- Both require the session cookie. Without it they return 401.

## R$ Terminal embed
I inspected R$ Terminal before adding anything:
- `/workspace/rterm-build`: Node scripts (`build.js`, `final.js`) that turn the `rterm-data` Robinhood dumps into `data.json`.
- `/workspace/rterminal-ref`: reference React widgets (Next.js + Tailwind, `"use client"`, default-export `XxxWidget`, `SectionLabel` header).

The app source itself isn't on this box, so the diff is additive only:
- **Added** `/workspace/rterminal-ref/AgentCityWidget.tsx`. It is a new file in the same widget style: a `SectionLabel` "Agent City · Bots" with an "Open ↗" link, and an iframe of `NEXT_PUBLIC_AGENT_CITY_URL` (default `http://localhost:8787/embed`).
- **Added** the server route `/embed?token=<embed_token>`. It checks the token from `.secret/auth.json`, sets the HttpOnly session cookie, and redirects to `/?embed=1` (compact mode). `/embed` without a token, from a logged-in browser, also redirects to `/?embed=1`.
- **No existing file was modified**, so no `*.bak-agentcity` backups were needed.
- **To wire it in:** import `AgentCityWidget` wherever the terminal registers its widgets, and set `NEXT_PUBLIC_AGENT_CITY_URL=http://<box>:8787/embed?token=<embed_token>`.

## Files
- `server.js`: http server, auth, SSE.
- `lib/city.js`: discovery, status, schedules, usage, portfolio.
- `public/office2d/`: `index.html`, `main.js` (workers, walks, ambient life, corgi, kitchen, render loop), `fx.js` (city FX), `screens.js`, `time.js`, `ui.js` (KPI strip, card, roster, clock), `assets/`.
- `public/`: `audio.js` (an original WebAudio piano loop, off by default), `style.css`, `login.html`, `favicon.svg`.
- `bin/`: `start.sh`, `stop.sh`, `public.sh`, `agentcity`, `heartbeat.sh`, `interact.sh`, `verify.js`, `fpsbench.js`, `preprocess_v7.py` (`preprocess.py` is kept for reference only).
- `design/v7/`: v7 source art and `orig/`.
- `shots/`: `v7-dusk.png`, `v7-night.png`, `v7-kitchen.png` plus older shots.

## Public link (view-only, no password)
- **Listener:** `127.0.0.1:8789`, started by `server.js` alongside 8787/8788. It is GET-only with an allowlist: the viewer page (`/`, alias `/city`), static JS/CSS/assets, `/api/state`, `/api/stream` (max 40 public SSE clients), `/healthz`, `/robots.txt` (disallow all). Everything else is 404 (`/login`, `/logout`, `/embed`, `.secret/`, any other path); non-GET is 405. The "sign out" link is stripped from public pages. Pages send `noindex` and `no-referrer`.
- **`POST /api/pages-refresh` (8789 only):** after the Bearer token (`.secret/pages-refresh-token`) and the 1 h cooldown (`logs/pages-lastpush`) it answers 202 at once, then in the background (`runPagesRefreshJobs` in `lib/pages-refresh.js`): (1) pings Claude once via `bin/claude-run.sh -p "Reply with OK only." --model claude-haiku-4-5` and runs `bin/claude-usage.js`, so `data/claude_ratelimit.json` and `data/claude_usage.json` are fresh; (2) POSTs the Grok usage-refresh webhook if configured; (3) then runs `bin/pages.sh publish`. A 409 `busy` holds until the publish exits. Webhook config (gitignored, never logged): `.secret/usage-webhook-url`, `.secret/usage-webhook-key`, optional `.secret/usage-webhook-header` (a header name that carries the raw key instead of `Authorization: Bearer`). Runtime stays zero AI tokens except these two approved refresh actions: the small Haiku call and the Grok routine the webhook wakes. The public page reaches this endpoint only through Funnel.
- **Live ↻ (Actions workflow):** `refresh_requested` in `bin/pages-pull.sh` now also runs the same Claude ping + usage and Grok usage webhook (`node lib/pages-refresh.js --usage-only "$PWD"`, no publish; tick publishes after), at most once per hour (stamp `logs/usage-refresh-last`, written even if a step failed). Presses within the hour still publish, logging `pages-refresh: usage cooldown, publishing without a new reading`, and spend no Claude/Grok; the zero-token `bin/claude-usage.js` collector still runs on every press. Webhook files stay gitignored and are never logged.
- **What a visitor sees:** exactly the 8788 view: bot names/status/schedules/usage shares, the weekly usage pool, and the portfolio total and day change from `data/portfolio.json`.
- **Tunnel: Tailscale Funnel** (`~/.local/bin/tailscale{,d}`, userspace networking, state in `~/.local/tailscale/`). Chosen because this box only allows outbound TLS on 443: cloudflared (edge port 7844), localtunnel (random TCP port), tunnelmole (8083), bore (7835), and ssh services (pinggy/serveo/localhost.run) all fail here.
- **URL:** `https://agentcity.<tailnet>.ts.net/`. It is stable across restarts (tied to the node name and tailnet), with no interstitial page. Current URL: `bin/public.sh url` or `data/public_url.txt`.
- **One-time setup (needs David):** a free Tailscale account. Open the login link from `bin/public.sh status`, then run `bin/public.sh start`; if it prints a "FUNNEL NEEDS ENABLING" link, open it once and run start again.
- **Commands:** `bin/public.sh start` (server + tailscaled + funnel + a 60 s watchdog loop that restarts dead pieces), `bin/public.sh stop` (turns the public link OFF; the local 8787/8788 views keep running), `bin/public.sh url`, `bin/public.sh status`. Log: `logs/public.log`. Backup of the pre-public server: `server.js.bak-public`.
