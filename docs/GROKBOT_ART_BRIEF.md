# Brief for grokbot: the Agent City art gallery, then edits on David's word

From Claude, for David. Revised 2026-11-12.

**Your job has three parts, in this order:**

1. **Find and understand every piece of art** on the site. That includes the characters, the dogs, the kitchen (with its new fridge and stand), the still pictures of the office, and the city outside the window.
2. **Build one well-organised gallery page** that shows every item with an ID, and put it live. David goes through it there.
3. **Then edit art only when David asks.** He picks an item in the gallery and tells you what to change, for example `Art K02: make the fridge mint green`. You change that one item, push it live, and report back.

Do not change any art on your own initiative in parts 1 and 2. If something looks wrong, write it on the item's card under "notes". If it is not art, put it in the handoff.

- Live site: https://dtkimdev.github.io/ac/
- Gallery, once you build it: https://dtkimdev.github.io/ac/gallery/
- Repo: `dtkimdev/ac`, branch `main`

## 0. One-time setup on the shared computer

As of commit `c427d3b`, the art lives in `public/office2d/art/` and the old `public/office2d/assets/` folder is gone. The publish build now also copies `public/gallery/` to the live site, so a folder you add there appears at `/ac/gallery/`. Run these from the project root:

```bash
git pull --ff-only origin main
```

```bash
bin/stop.sh; bin/start.sh
```

Then open `http://127.0.0.1:8789/` and check that the office draws its pictures, not a blank room.

Claim the work in `NOW.md` and push that line:

```
- grokbot · art gallery + art edits · public/gallery, public/office2d/art, portable/art/scene.js, drawn-art functions · <date time, Bangkok>
```

Write down the commit you start from, because the handoff needs it: `git rev-parse --short HEAD`.

## 1. Read first (10 minutes)

1. `public/office2d/art/README.md` is the guide and the catalog of every art file.
2. `public/office2d/art/pack.json` labels every file. It has three lists:
   - `folders` holds the pictures.
   - `drawn` holds the art drawn in code, with the function for each item.
   - `baked` holds the parts painted into the room pictures, with what makes each one.
3. `public/office2d/art/layout.json` gives every position, sprite cell and mask.
4. `portable/art/scene.js` paints the office and the kitchen. Read its numbered steps: the floor, the kitchen corner (`1b`, with `ITEMS` listing what stands on the stand), desks, monitors, chairs and the window band.
5. To find any item, run `node bin/art-pack.js find <word>`, for example `find fridge`, `find corgi`, `find grok`, `find monitor` or `find boats`.

## 2. What you may change, and what you must not

**You may change:**

- **`public/gallery/`:** the gallery page. It is yours.
- **Files in `public/office2d/art/`:** the pictures, `layout.json` and `pack.json`. Edit `pack.json` only for labels, sizes and new entries.
- **Drawing code for the items `pack.json` lists under `drawn`,** inside those functions only. They are in:
  - `public/office2d/screens.js`
  - `public/office2d/boats.js`
  - `public/office2d/fx.js`
  - the listed functions in `public/office2d/main.js`
- **Look settings in `public/office2d/config.js`:** `BUBBLE`, `DOG.size`, `PROPS`, and the chat words in `BEHAVIOR`.
- **`portable/art/scene.js` and the other tools in `portable/art/`.** Use them for anything painted into the room, such as the fridge, the stand, the shelves, the desks, the chairs, the bean bags and the window view.

**You must not:**

- **Bot behaviour and the data path:**
  - Don't change how often bots move, walk or chat.
  - Don't change lite mode, or the quality and speed logic.
  - Don't touch the data and refresh code (`ui.js`, `poll`, `connect`, `REFRESH`), `server.js`, `lib/`, or anything in `bin/`. You may still run `bin/` commands.
- **Publishing:** don't change `bin/pages*.sh`, `bin/art-pack.js`, `portable/rebuild.js` or `.github/workflows/`.
- **Undoing David's decisions:**
  - Bringing back the snack-feeding animation, the water animation, or the bamboo plant in the bottom left.
  - Making bubbles bigger than `BUBBLE.size: 0.8`.
  - Putting a video or pop-up on the music.
- **Music:** don't replace `music/ac-music.mp3` with anything David doesn't have the rights to.
- **The gallery:**
  - It must not load `state.json`, bot data, tokens or anything secret.
  - It must not pull scripts or fonts from other sites.
  - Don't link to it from the office page.
- **Git safety:**
  - Don't push `gh-pages`, force-push or rewrite history.
  - Don't commit secrets, tokens or webhook URLs.

## 3. Part 1: find and understand every item

Go through the pack, `scene.js` and the running site at dusk (`?t=18:30`) and at night (`?t=22:30`), and list every item a visitor can see. Use the sections below. Give each item an ID: the section letter plus a number. Characters use their sprite number, so `C03` is LF (`w03`/`f03`).

| Section | ID | What it must include |
|---|---|---|
| Characters | `C00`–`C11` | One card per bot, showing its front view (`fNN`), back view (`wNN`), its row in the turning sheets (`turn-bodies`, `turn-heads`) and its cell in `walk-side`. Order: 00 Usage, 01 Grok, 02 Studio, 03 LF, 04 Archives, 05 Cyber, 06 Ops, 07 $tonks, 08 Media, 09 Sports, 10 SBP, 11 Shopper. Also cards for the shared walking legs (`legs.png`), name tags, speech bubbles and the red error glow. |
| Dash | `D` | Dash's back and front views, her laptop and her mug, and Dash sitting on the bean bag (drawn). |
| Corgis | `P` | Each dog with every pose cell shown on its own (174×155 cells), plus the dog moods and movement (drawn). |
| Kitchen | `K` | The fridge, the stand and its drawers, the coffee machine, and **each object on the stand as its own card** (from `ITEMS` in `scene.js`). Also the snack shelves, the floor lamp, the coffee steam (drawn) and the kitchen bots with mugs (drawn). Include anything new in the kitchen. |
| Office | `O` | The whole room picture at dusk and night (still image), then each part on its own: the floor, the walls and ceiling, each desk with its chair, the monitor frames, the boss desk, the empty-seat patches (`nochair-*`), the wall clock (drawn), lamp glow and dust (drawn), and the corner repairs. |
| Lounge | `L` | Each bean bag (red, blue, mustard), the coffee table, the rug, and the bean bag visits (drawn). |
| Monitors | `M` | **Each desk screen design as its own card** (portfolio, NFL, reels, filmstrip, shield, inbox, books, gauge, usage, router, code, log), plus the wall monitors and the boss desk glow. |
| Window and city | `W` | The whole view through the window (still), then the skyline, the bridges and the river. Also the city lights, neon and tower lights, bridge traffic, clouds and planes, fireworks, and the dusk and night colours (all drawn). Each airship gets its own card with its dusk and night versions. |
| Harbour | `H` | Each boat cell on its own, with its lights version (`boats-lit`), and the boats moving (drawn). |
| Sound | `S` | The music: its title and file. There is no picture. |
| Cut-outs | `X` | Each mask, marked "changes together with" its item. Show these last and collapsed: David rarely needs them. |

For each item, record:

- **ID and name**, in plain words: "Fridge", not "kitchen-fr-1".
- **Kind:**
  - `file` is a picture.
  - `cell` is a part of a sprite sheet.
  - `baked` is painted into the room pictures by `scene.js` or the seed painting.
  - `code` is drawn by a function.
- **Where it lives:** the file path and cell, the plate crop box, or the function (`file.js#name`).
- **What it is and where it shows,** in one sentence.
- **Linked items:** what must change with it. Examples: the back and front views of the same bot; dusk and night versions; a baked item and its mask.
- **Easy changes and hard ones,** in one line. Colour and details are easy. Size and position need `layout.json` too. A new pose or animation needs David's OK.
- **Notes:** anything that looks off now.

If you find something on screen that is in neither the pack nor this table, add it to the gallery under the closest section and list it in the handoff.

## 4. Part 2: build the gallery page

Put it in `public/gallery/`:

- `index.html` is one self-contained page, with its CSS and JavaScript inline and no libraries.
- `items.json` holds every item from part 1.
- `shots/` holds pictures of the drawn items.

**How it shows each kind:**

- **`file`:** the picture itself, from `../office2d/art/<path>`. Read `../office2d/art/pack.json` for the folder of each file. Add `?h=<stamp>` from its `stamp` map, as `main.js` does, so the page always shows the current version.
- **`cell`:** the one cell, cut from the sheet with CSS `background-position` or a canvas. Take the cell sizes from `layout.json`. Characters show their front, back, turning and walking cells side by side.
- **`baked`:** a crop of the room picture (`room/plate-dusk.webp` or `plate-night.webp`, 2560×1440). Store the crop box in `items.json` as `{x, y, w, h}` in plate pixels. A baked item then updates in the gallery by itself whenever the plates are rebuilt.
- **`code`:** a screenshot from the running site, saved as `shots/<ID>-dusk.png` and `shots/<ID>-night.png`. Take it with `--clip` and `--dpr 2`. Keep each under 250 KB and all shots together under 6 MB. Retake a shot whenever its item changes.

**The page:**

- **Layout:** a title, a search box, and one heading per section in the order of the table in part 1, with a short jump bar at the top. Each item is a card in a grid.
- **Each card shows:**
  - The ID, large.
  - The name, the kind and the picture or pictures.
  - The one-line description, the linked items and the notes.
  - A small "where" line: the path or the function.
- **Day and night:** a Dusk/Night switch at the top flips every card that has both.
- **Enlarge:** clicking a picture opens it big, on a checkerboard background so transparency shows.
- **Copy button:** each card has a **Copy prompt** button that copies `Art <ID> (<name>): ` to the clipboard, ready for David to finish the sentence.
- **Look:** dark background, readable on a phone at 375 px wide, nothing wider than the screen. Add `<meta name="robots" content="noindex, nofollow">`.
- **Weight:** the page with every picture loaded stays under 15 MB. Use the 2560 plates, never the `-hi` ones.
- **Status for checking:** after loading, the page sets `window.galleryStatus = { cards: <number>, failed: [<IDs whose picture did not load>] }`.

**Check it before you push:**

```bash
node portable/rebuild.js
```

```bash
node portable/serve.js
```

```bash
node portable/shot.js --url "http://127.0.0.1:8791/gallery/index.html" --size 1400x900 --wait 4 --out /tmp/gallery.png --print "window.galleryStatus"
```

- `failed` must be empty.
- Also take a 375×812 screenshot (phone width) and look at both screenshots.
- `node bin/art-pack.js check` must still print `OK`.

Commit with the message `gallery: every art item with an ID, for David to pick from`. Then push:

```bash
git pull --rebase origin main && git push origin main
```

After about a minute:

1. Check that `https://dtkimdev.github.io/ac/published.json` shows your commit.
2. Open `https://dtkimdev.github.io/ac/gallery/`.
3. Check the status in the browser console.

Then write the first handoff (section 6), and send David the gallery link with one line: "Pick an item and tell me: Art <ID>: what to change."

## 5. Part 3: edit on David's word, one item at a time

David's requests look like `Art K02 (Fridge): mint green, keep the chrome handles`. For each one:

1. **Read the card for that ID.** If the request is unclear, or touches something on the must-not list, ask David one short question first. Ask too if it needs a new animation, a new character or a new pose.
2. **Change it.**
   - **`file` or `cell`:**
     - Keep the exact pixel size and the subject in the same place.
     - Keep the transparent background on characters, dogs, boats and airships.
     - Keep the cell grid: `corgi*.png` uses 174×155 cells; `turn-*.webp` uses 190×266 and 220×232; `boats*.webp` uses 360×180; `legs.png` and `walk-side.webp` follow `layout.json`.
     - Keep the file name.
     - Change the linked items with it: a bot's back and front, and the dusk and night versions.
   - **`code`:** change only the listed function. Try its "tune" setting in `pack.json` first.
   - **`baked`:** edit the step in `portable/art/scene.js`, then rebuild all four plates, the masks and `layout.json` together. This needs `node portable/serve.js` running:

     ```bash
     node portable/art/run-scene.js /tmp/scene-out --install
     ```

     Never paint over a plate by hand: dusk and night must line up pixel for pixel.
   - **A size change on purpose:** update `size` in `pack.json` and the matching numbers in `layout.json` in the same commit.
   - **A new picture:** put it in the right folder (`props/` for extra room items), and add a line in `pack.json` with a label and a size. Give it a gallery card.
3. **Keep the gallery current.** Retake the shot of a `code` item. Move the crop box if a `baked` item moved. Update the card's notes.
4. **Check:** `node bin/art-pack.js check` prints `OK`, and `window.galleryStatus.failed` is empty.
5. **Look at it:** take before-and-after screenshots of the item at dusk (`?t=18:30`), at night (`?t=22:30`) and in TV mode (`?q=4`):

   ```bash
   node portable/shot.js --url "http://127.0.0.1:8791/?q=0&t=18:30" --out /tmp/K02-dusk.png
   ```

   Nothing else may move.
6. **Commit that one item** with the message `art(<ID> <name>): <what changed>`, for example `art(K02 fridge): mint green, chrome handles kept`. Push with `git pull --rebase origin main && git push origin main`.
7. **Confirm it is live:**
   - `published.json` shows your commit.
   - The item looks right on the site and on its gallery card.
   - Reply to David with the ID, what changed, and the before and after pictures.

   If the publish failed, the live site stays as it was. Run `node bin/art-pack.js check`, or look at `gh run list -R dtkimdev/ac -w publish -L 3`. Fix the problem and push again.

**Limits:**
- Keep each picture under 1.5 MB, and use webp for big ones. David's TV runs this page.
- If a change makes the city stutter, make it smaller.

## 6. Handoff for Claude

Claude reads these files after `git pull`. Everything is already in git, so a zip is not needed when your push worked.

**After part 2:** write `docs/handoff/art-gallery-YYYY-MM-DD.md` with:
- the start and end commits
- the gallery link
- the number of cards per section
- items you found that were not in the pack
- notes on anything that looked off

**After each round of David's edits:** add rows to `docs/handoff/art-YYYY-MM-DD.md`, one file per day, using the template below. When you stop, remove your line from `NOW.md` in the same push.

**Only if you could not push:** zip the files you changed, plus the handoff, and give the zip to David:

```bash
git diff --name-only --diff-filter=d <start-commit> -- public portable docs | xargs git archive -o art-handoff.zip HEAD
```

```markdown
# Art handoff: grokbot -> Claude, YYYY-MM-DD

Start commit: <short sha>   End commit: <short sha>   Live: <yes/no; published.json main = ...>
Art check: <last line of node bin/art-pack.js check>   Gallery: <cards> cards, failed = <[]>

## Changed (one row per item)
| ID | name | David asked | kind | files | what changed | size changed? | commit |
|---|---|---|---|---|---|---|---|

## Added files or cards
| ID | file | folder | label | size | used by |
|---|---|---|---|---|---|

## Settings changed (config.js, layout.json)
- <key>: <old> -> <new>, why

## Asked David / waiting on David
- <ID>: the question, and the answer if given

## Tried and dropped
- <ID>: what was tried, and why it was dropped

## Problems seen (not fixed: outside the art scope)
- <what, where, how to reproduce>
```

## 7. Quick reference

| Task | Command |
|---|---|
| Find an item | `node bin/art-pack.js find <word>` |
| Check the pack | `node bin/art-pack.js check` |
| Size of a picture | `node bin/art-pack.js size <file>` |
| Refresh the README catalog | `node bin/art-pack.js docs` |
| Rebuild the preview (site and gallery) | `node portable/rebuild.js` |
| Serve the preview (port 8791) | `node portable/serve.js` |
| Screenshot | `node portable/shot.js --url "http://127.0.0.1:8791/?q=0&t=18:30" --out shot.png` |
| Screenshot of one part | add `--clip x,y,w,h --dpr 2` |
| Rebuild the room (baked items) | `node portable/art/run-scene.js <out-dir> --install` |
| Gallery (preview / live) | `http://127.0.0.1:8791/gallery/index.html` and `https://dtkimdev.github.io/ac/gallery/` |
| What is live | `https://dtkimdev.github.io/ac/published.json` |
| Debug in the browser console | `__office2d.workers` (who wears which sprite), `__office2d.dogMood('belly')`, `__office2d.neighbourChat('Sports')`, `__office2d.fireworks()` |
