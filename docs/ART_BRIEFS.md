# Art briefs

**Status 2026-11-10 (evening):** all three are settled in code. Desks: `portable/art/run-room.js` repaints them dark walnut with slim legs and open space where the drawers were (it replaced the first repaint, which had painted drawer boxes over the bean bags). Bamboo: David asked for the corner plants to be removed, not replaced; the same tool fills both corners with floor, rug, fridge, desk and chair, and the site no longer draws the plant overlays (`room-l` / `room-r` masks are kept only as input for the tool). Boats: drawn by `public/office2d/boats.js`. A painter may still improve any of them; the briefs below say how to fit new art.

Requested by David on 2026-11-10. These three need new painted art; code cannot make them convincingly. Each brief says what to make, the exact files and sizes, and how to check the result. Anyone may make the art with any image tool that can edit a masked area of a reference picture. Hand the files to Claude on DPro or push them to `main` following `AGENTS.md`; the code side is listed under each brief.

The room is painted at 1280 x 720 "plate pixels". The files are 2x (`plate-*.webp`, 2560 x 1440) and 3x (`plate-*-hi.webp`, 3840 x 2160). Every room picture exists twice: dusk (`plate-dusk*`) and night (`plate-night*`), with the same layout and different lighting. Keep the painted style: soft, warm, slightly stylised 3D illustration, cozy cyberpunk Bangkok, the existing light direction (window behind, warm lamps inside).

Check any change with the screenshot tool, for example:
`node portable/shot.js --url "http://127.0.0.1:8791/?q=0&notags=1&t=18:30" --size 1600x900 --dpr 2 --wait 6 --out check.png`
Use `&t=12:00` for day and `&t=22:00` for night.

## 1. Minimalist desks

**What David wants:** the desks refreshed to a minimalist look, without the drawers and cabinets underneath.

**Where:** the desks are painted into the room pictures. Repaint only the desk bodies, the parts below the desktop edge, on all four room files (dusk and night, 2x and 3x).

**Must not move**, or the bots and screens stop lining up:
- the desktop surfaces and their front edges
- every monitor (the live screens are mapped onto the painted monitor glass; positions in `assets/layout.json`, `desks[].monitors`)
- every chair (`desks[].seats[].chair`) and the floor where bots walk (`nav`)

**Style:** thin-legged, light wood or matte top, open underneath (legs or a slim frame), no drawers. Keep each desk's footprint and height.

**Also update:**
- `boss-mask.png` (660 x 400) and `desk-fr-mask.png` (520 x 370): the soft cut-outs of the boss desk and the front desk, used to draw bots behind them. They must follow the new desk shapes.
- `nochair-dusk.webp` and `nochair-night.webp` (3371 x 291): small patches of floor under each chair, shown while a bot turns in its chair. If desk legs now show behind a chair, these need repainting too.

**Code side:** none if positions are kept. Check every desk with a bot turning: `__office2d.turn('Studio')` in `--js`.

## 2. Foreground bamboo

**What David wants:** the plants in the bottom corners replaced; they look low resolution and untidy.

**Where now:** painted into the room pictures, then cut out and drawn over the bots by two masks:
- left: `room-l-mask.png`, plate area x 0 to 183, y 360 to 720
- right: `room-r-mask.png`, plate area x 1005 to 1280, y 421 to 719

**Deliver:**
1. The four room pictures with the old corner plants painted out (wall and floor continued naturally), dusk and night.
2. Two new plant pictures as PNG with a transparent background, at 3x plate size so they stay sharp on 4K screens:
   - `plant-left.png`, about 550 x 1080, for the bottom-left corner
   - `plant-right.png`, about 825 x 900, for the bottom-right corner
   Healthy, full, softly lit; for example a bamboo palm in a matte ceramic planter. They sit in the foreground, slightly out of focus at the edges, and must not cover the lounge or the front desk more than the current plants do.
3. Optional: night versions, darker and lit by the room lamps (`plant-left-night.png`, `plant-right-night.png`).

**Code side (Claude):** add both as front-most items (`PROPS` in `config.js`) and retire the `room-l` and `room-r` cut-outs. Small change once the art exists.

## 3. Photorealistic boats

**What David wants:** the harbour boats less blocky, more photographic, still matching the painted city.

**Already done in code:** boats are now built at their on-screen size, so they are sharp. The look itself is the flat illustration in the sheets.

**Deliver:** two new sheets replacing `boats.webp` and `boats-lit.webp`:
- 6 boats side by side, in this order: longtail boat, container freighter, speedboat, passenger ferry, sailboat, motor yacht
- each cell 720 x 360 px (the sheet is 4320 x 360), transparent background, side view, bow pointing right
- the waterline on the same row in every cell, at y 276 (276 of 360). Below it, leave the cell empty: reflections and wakes are drawn by code
- `boats-lit.webp`: same cells, only the lights (windows, deck lamps, navigation lights) on a transparent background, lined up exactly with `boats.webp`. Shown at dusk and night.
- realistic materials and proportions, lit by a warm low sun from behind, so the code can tint them for distance and time of day

**Code side (Claude):** set `boats.cell` to `[720, 360]` and `boats.water` to `276` in `layout.json`, then check all lanes at day, dusk and night.
