# Agent City art pack

Everything the office looks like is listed here: every picture, sound and position file, and every piece of art the code draws itself.
This guide is for any bot or person who works on the art, whether Claude, grokbot, Gemini, ChatGPT or David.

**Find anything in one line** (from the repo root):

```bash
node bin/art-pack.js find fridge
```

Other searches work the same way: `find corgi`, `find grok`, `find monitor`, `find boats`, `find bubble`. The answer gives the file or the function, and how to change it.

## The three kinds of art

1. **Files in this folder.** There is one folder per kind of thing: `room`, `room/masks`, `bots/…`, `pets`, `harbour`, `sky` and `music`. `pack.json` labels every file.
2. **Drawn in code.** Monitor screens, speech bubbles, the clock, the city lights, boats moving, the dogs' moods and so on. `pack.json` (`drawn`) names the file and the function; most of them have a setting in `public/office2d/config.js` that you can change without touching any drawing code.
3. **Painted into the room picture.** The fridge, kitchen stand, shelves, desks, chairs, bean bags and the city view are part of `room/plate-*.webp`. They are not separate files. The scene builder (`portable/art/scene.js`) draws them, and `pack.json` (`baked`) says which step.

## Replacing a picture

1. Find it: `node bin/art-pack.js find <word>`.
2. Make the new picture at the **same size** and with the thing in the **same place** inside it. Sheets with cells (corgis, turning poses, boats, legs) must keep their grid.
3. Save it over the old file, with the same name and the same folder.
4. Check the pack, from the repo root:

   ```bash
   node bin/art-pack.js check
   ```

   It must say `OK`.
5. Look at it locally:

   ```bash
   node portable/rebuild.js
   ```

   ```bash
   node portable/serve.js
   ```

   Then open http://127.0.0.1:8791/. Add `?t=18:30` or `?t=22:30` to see dusk or night.
6. Commit and push to `main`.
   - The site publishes by itself in about a minute.
   - `https://dtkimdev.github.io/ac/published.json` shows the commit that is live.
   - Visitors download again only the files that changed, because each file carries its own content stamp.
   - There is no version number to raise by hand.

**A different size on purpose?** Change `size` for the file in `pack.json`. Then change the numbers that depend on it in `layout.json` too: the `cell`, `size` and `w`/`h` entries for that picture. The check refuses a size that differs from `pack.json`. This is deliberate, because a picture with the wrong size draws in the wrong place.

## Adding a new picture

1. Put it in the folder where it belongs. To make a new kind of thing, make a new folder; `props/` is the place for extra items in the room.
2. Add one line for it to that folder's `files` in `pack.json`, with a `label` and a `size` of `[width, height]`. To read the size:

   ```bash
   node bin/art-pack.js size <file>
   ```

3. Use it by its **bare file name**. Code calls `img('name.png')`; an extra item in the room goes in `config.js` as `PROPS` with `file: 'name.png'`. The pack finds the folder.
4. Run `node bin/art-pack.js check`, then `node bin/art-pack.js docs`, which refreshes the catalog below.

File names must be unique across the whole pack. To move or rename a file, move it and change its line in `pack.json`; nothing else changes.

## Changing something drawn in code

- `find` gives the function, for example `screens.js#drawScreen`. Open `public/office2d/<file>` and search for that name.
- Try the "tune" setting first: sizes, how often things happen and which screen each desk shows are all settings in `config.js` or `screens.js`.
- If you rename a function that the pack lists, update its entry in `pack.json`. The check warns when it can no longer find one.

## Changing something painted into the room

- Don't paint over `room/plate-*.webp` by hand. The four plates (dusk and night, normal and `-hi`) and the masks must stay in line pixel for pixel.
- Change the step in `portable/art/scene.js` instead. Then rebuild everything at once:

  ```bash
  node portable/art/run-scene.js <out-dir> --install
  ```

  This needs `node portable/serve.js` running. It writes the plates, the masks and `layout.json` into this pack, and screenshots at dusk and night into `<out-dir>`.
- Look at those screenshots before you push.

## Rules

- Push to `main` only. Never push `gh-pages` and never force-push. The publishers build the site from `main`.
- `bin/pages-build.sh` runs `node bin/art-pack.js check` before every publish. If the check fails, the live site stays as it was. Fix the problem and push again.
- Keep pictures light, because a TV in the office runs this page:
  - Use `webp` for big pictures.
  - The check warns above 1.5 MB.
- Music: only tracks David has the rights to.
- Retired scripts that still use the old flat `office2d/assets/` folder are kept for history only: `bin/preprocess_v*.py`, `bin/verify.js`, `bin/v9-*.sh` and `bin/v10-*.sh`. Don't run them.
- The art tools in `portable/art/` read pictures by bare name from the preview's flat copy (`portable/preview/office2d/assets/`, made by `rebuild.js`). They write their results back through `bin/art-pack.js` (`artPath`, `previewPut`).

## Catalog

<!-- catalog:start (generated by node bin/art-pack.js docs; edit pack.json, not this part) -->

### (art root)/ — Positions

layout.json says where everything is: desks, seats, monitors, the dogs' paths, boats' lanes, lamps, masks, sprite cells. Coordinates are 0..1 of the room (1280 x 720) unless noted.

**To change:** Edit by hand for small moves. Desks and seats are generated by portable/art/run-scene.js (scene.js PLAN and DESKS), so change those there.

| file | what it is | size |
|---|---|---|
| `layout.json` | Where everything is (positions, sprite cells, masks, lanes) |  |

### room/ — Room pictures (the painted office)

The whole office as one painting, at dusk and at night, in two sizes (-hi for screens wider than 2560 px). Everything that does not move is in here: walls, floor, desks, chairs, kitchen, shelves, bean bags, and the city and river through the window. nochair-*: patches that paint a seat without its chair, for empty seats.

**To change:** Do not repaint by hand: run node portable/art/run-scene.js <out-dir> --install, which rebuilds the four plates, the masks and layout.json together. The four plates must stay the same picture; dusk and night line up pixel for pixel.

| file | what it is | size |
|---|---|---|
| `plate-dusk.webp` | The office at dusk (normal screens) | 2560×1440 |
| `plate-night.webp` | The office at night (normal screens) | 2560×1440 |
| `plate-dusk-hi.webp` | The office at dusk, high resolution (big screens) | 3840×2160 |
| `plate-night-hi.webp` | The office at night, high resolution (big screens) | 3840×2160 |
| `nochair-dusk.webp` | Empty-seat patches without chairs, dusk (cells: layout.json nochair) | 2968×286 |
| `nochair-night.webp` | Empty-seat patches without chairs, night | 2968×286 |

### room/masks/ — Cut-outs (masks)

Shapes that cut one part out of the room picture, so it can be drawn in front of or behind moving things. White is the part. Same frame as the plates.

**To change:** Made by the scene builder together with the plates. If something moves in the room picture, its mask has to move with it.

| file | what it is | size |
|---|---|---|
| `fg-mask.png` | Window frame, mullions and vines: drawn over the city effects | 1138×379 |
| `sky-mask.png` | Skyline: clouds and planes pass behind it | 1138×226 |
| `water-mask.png` | The river through the window (boats stay inside it) | 1296×224 |
| `boss-mask.png` | Boss desk front: hides bots walking behind it | 416×378 |
| `desk-fr-mask.png` | Front-right desk front | 468×379 |
| `table-mask.png` | Lounge coffee table | 236×176 |
| `bag-r-mask.png` | Red bean bag (left) | 292×256 |
| `bag-b-mask.png` | Blue bean bag (Dash's seat) | 248×220 |
| `bag-m-mask.png` | Mustard bean bag (right) | 288×238 |
| `room-l-mask.png` | Left corner (art tools only, not used by the site) | 275×540 |
| `room-r-mask.png` | Right corner (art tools only, not used by the site) | 412×446 |

### bots/back/ — Bots seen from behind

One picture per character seen from behind: sitting at the desk facing the monitors, or walking away. Which bot wears which picture: config.js BOTS.spriteByNum fixes some, the rest are handed out in order. The names below are who wore them on 2026-11-12 (check __office2d.workers in the browser console).

**To change:** Replace the picture with one of the same size and the same placement (body centred, feet at the bottom). The front view with the same number is in bots/front.

| file | what it is | size |
|---|---|---|
| `w00.png` | Usage, back view | 138×216 |
| `w01.png` | Grok, back view | 133×228 |
| `w02.png` | Studio, back view | 136×225 |
| `w03.png` | LF, back view | 136×225 |
| `w04.png` | Archives, back view | 137×216 |
| `w05.png` | Cyber, back view | 136×222 |
| `w06.png` | Ops, back view | 137×233 |
| `w07.png` | $tonks, back view | 137×254 |
| `w08.png` | Media, back view | 137×218 |
| `w09.png` | Sports, back view | 137×213 |
| `w10.png` | SBP, back view | 138×226 |
| `w11.png` | Shopper, back view | 137×229 |

### bots/front/ — Bots seen from the front

The same characters facing the room: turned round in the chair, or walking towards you. Same numbers as bots/back.

**To change:** Same size and placement as the old picture. Change the back and the front together so the character still matches.

| file | what it is | size |
|---|---|---|
| `f00.png` | Usage, front view | 138×216 |
| `f01.png` | Grok, front view | 133×228 |
| `f02.png` | Studio, front view | 136×225 |
| `f03.png` | LF, front view | 136×225 |
| `f04.png` | Archives, front view | 137×216 |
| `f05.png` | Cyber, front view | 136×222 |
| `f06.png` | Ops, front view | 137×233 |
| `f07.png` | $tonks, front view | 137×254 |
| `f08.png` | Media, front view | 137×218 |
| `f09.png` | Sports, front view | 137×213 |
| `f10.png` | SBP, front view | 138×226 |
| `f11.png` | Shopper, front view | 137×229 |

### bots/turning/ — Bots turning in the chair

Pose sheets for turning from back to front (back, 3/4 back, side, 3/4 front, front): bodies and heads separately, one row per character in the bots/back numbering. Cells: layout.json turn.

**To change:** Cells are 190 x 266 (bodies) and 220 x 232 (heads). A repaint must keep the grid.

| file | what it is | size |
|---|---|---|
| `turn-bodies.webp` | Turning poses, bodies (one row per character) | 1140×3192 |
| `turn-heads.webp` | Turning poses, heads (one row per character) | 1320×2784 |

### bots/walking/ — Bots walking

walk-side: every character in profile, for walking sideways. legs: the painted legs all walkers share (side, front and back steps).

**To change:** Cells in layout.json walkSide and legs. Keep the grid.

| file | what it is | size |
|---|---|---|
| `walk-side.webp` | Every character in side view, for walking sideways (one cell each) | 2376×284 |
| `legs.png` | Walking legs, shared by all bots (side, front, back steps) | 1600×300 |

### bots/dash/ — Dash (Dashboards) and her things

Dash lives on the blue bean bag instead of at a desk.

**To change:** Same sizes; positions in layout.json dash.

| file | what it is | size |
|---|---|---|
| `dash-back.png` | Dash, back view | 138×243 |
| `dash-front.png` | Dash, front view | 138×241 |
| `dash-laptop.png` | Dash's laptop (on the bean bag) | 200×314 |
| `dash-mug.png` | Dash's mug | 212×337 |

### pets/ — Corgis

Pose sheets for the two office dogs: walk cycle, sit, beg, sleep, lie, belly, happy. Cells: layout.json corgi.

**To change:** Keep the 174 x 155 cell grid and the frame order. Size on screen: config.js DOG.size.

| file | what it is | size |
|---|---|---|
| `corgi.png` | The red-and-white corgi, all poses | 696×465 |
| `corgi-brown.png` | The brown corgi, all poses (same grid) | 696×465 |

### harbour/ — Boats

Boat pictures for the river, one per cell; -lit holds their cabin lights for dusk and night.

**To change:** Cells are 360 x 180; kinds and speeds in layout.json boats.kinds. Boats without a cell are built in code (boats.js).

| file | what it is | size |
|---|---|---|
| `boats.webp` | Boats on the river, one per cell | 2160×180 |
| `boats-lit.webp` | The boats' lights (added at dusk and night) | 2160×180 |

### sky/ — Sky

Airships drifting over the city, in a dusk and a night version each.

**To change:** Same size. Where they fly: layout.json airships.

| file | what it is | size |
|---|---|---|
| `airship-dusk.png` | Airship 1 at dusk | 91×43 |
| `airship-night.png` | Airship 1 at night | 91×43 |
| `airship1-dusk.png` | Airship 2 at dusk | 96×50 |
| `airship1-night.png` | Airship 2 at night | 96×50 |

### music/ — Music

The music button's track: David's own file, used with the creator's permission. It loops with a 7-second crossfade.

**To change:** Replace the file and keep its name. If the title changes, change "title" here. Only use music David has the rights to.

| file | what it is | size |
|---|---|---|
| `ac-music.mp3` | Lofi Trance Mix by Velvet Vinyl (background music) |  |

### Drawn in code (no picture file)

Find the function named in the "code" column (search for it); "tune" is a setting you can change without touching drawing code.

**Monitors**

| item | code | tune |
|---|---|---|
| Desk monitor screens (portfolio, NFL, reels, filmstrip, shield, inbox, books, gauge, usage, router, code, log) | `screens.js#drawScreen` | screens.js THEME_KINDS picks the screens for each desk |
| Wall monitors on the right (Grok, Claude usage) | `screens.js#drawWall` | positions: layout.json wall |
| Fitting the screens onto the painted monitors (perspective) | `main.js#buildMonitors`, `main.js#warpMonitor` | positions: layout.json desks[].monitors |
| Boss desk screen glow and scanlines | `main.js#drawBossFx` |  |

**Bots**

| item | code | tune |
|---|---|---|
| Seated bot (body, head, turning in the chair) | `main.js#drawSeated`, `main.js#drawBust`, `main.js#stepPose` | config.js BEHAVIOR turnEvery |
| Walking bot (legs, side view) | `main.js#drawWalker`, `main.js#drawLegSet` | config.js WALK, BEHAVIOR tripEvery |
| Seated fidgets (lean, stretch, look around) | `main.js#stepFidget` | config.js BEHAVIOR fidgetEvery |
| Neighbour chats at the desk | `main.js#startChat`, `main.js#stepChat` | config.js CHAT.every, BEHAVIOR deskChat |
| Kitchen bots (coffee at the machine, mug in hand) | `main.js#drawKitchen`, `main.js#drawHeld`, `main.js#drawLoiter` | config.js LOITER |
| Dash on the bean bag | `main.js#drawOnBag`, `main.js#drawDash` | config.js BEHAVIOR byBot 14 |
| Name tags | `main.js#labelBitmap` |  |
| Speech bubbles | `main.js#bubbleBitmap` | config.js BUBBLE.size (1 = the old size, now 0.8); words: BEHAVIOR deskChat, loungeChat, snacks |
| Red error glow over a failing bot | `main.js#drawErrorGlows` |  |

**Corgis**

| item | code | tune |
|---|---|---|
| Dog moods (affection, ask, belly, nap, rest, beg) | `main.js#dogMood`, `main.js#dogNext` | config.js DOG_MOODS (bigger = more often) |
| Dog movement and drawing (poses, bounce, sleeping z's) | `main.js#stepDog`, `main.js#drawDog` | config.js DOG.size; paths: layout.json dog |

**Room life**

| item | code | tune |
|---|---|---|
| Wall clock (digital, walnut case) | `main.js#drawClock` |  |
| Coffee steam | `main.js#drawSteam`, `main.js#curl` | positions: layout.json steam |
| Bean bag visits (lounge) | `main.js#initLounge`, `main.js#drawLounge` | seats: layout.json lounge |
| Lamp glow | `fx.js#lamps` | positions: layout.json lamps |
| Dust in the light | `fx.js#motes` |  |
| Soft floor shadow under bots and dogs | `main.js#buildStatic` |  |
| Extra pictures placed in the room | `main.js#propImgs` | config.js PROPS (put the picture in a folder here and list it in pack.json) |

**City and sky**

| item | code | tune |
|---|---|---|
| Clouds, planes, airships | `fx.js#far` | airships: layout.json airships |
| Fireworks over the river at night | `fx.js#fireworks` |  |
| City windows switching on and off, neon signs, tower lights | `fx.js#near` | layout.json lights |
| Bridge traffic (head and tail lights) | `fx.js#near` | lanes: layout.json lanes |
| Boats moving on the river (wakes, lights) | `fx.js#near`, `boats.js#buildBoat`, `boats.js#drawLeds` | kinds and speeds: layout.json boats, boatLanes |
| Dusk and night colours (time of day, Bangkok time) | `time.js#envAt`, `time.js#grade` |  |

**Sound**

| item | code | tune |
|---|---|---|
| Music button: player, gapless loop, track label | `../audio.js#TRACK` | audio.js TRACK (volume, fade); the file and title: music/ in this pack |

### Painted into the room picture (no file of its own)

These are part of `room/plate-*.webp`. They are drawn by the scene builder, then baked into the four plates. See "Changing something painted into the room" above.

| item | made by | notes |
|---|---|---|
| Floor (wood boards), walls, ceiling | `portable/art/scene.js` | step 1: one clean floor |
| Desks (black, four legs) and chairs | `portable/art/scene.js` | DESKS and PLAN: who sits where, desk sizes |
| Monitor frames on the desks | `portable/art/scene.js` | the screens inside them are drawn in code (screens.js) |
| Kitchen fridge (retro, two doors) | `portable/art/scene.js` | step 1b, FR |
| Kitchen stand, coffee machine, canisters | `portable/art/scene.js` | step 1b, CT |
| Snack shelves (walnut, on the back wall) | `seed painting (commit 83b9edb)` | kept from the original painting |
| Bean bags (red, blue, mustard), coffee table, rug, floor lamp | `seed painting (commit 83b9edb)` | kept; their masks are in room/masks |
| Boss desk | `portable/art/scene.js` | DESKS boss |
| Window, city skyline, bridges, river (the still view) | `seed painting + portable/art/scene.js` | step 2b redraws the lower window band |
| Corner repairs (bamboo removed, gaps filled) | `portable/art/room.js` | run with run-room.js |

<!-- catalog:end -->
