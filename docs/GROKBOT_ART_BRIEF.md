# Brief for grokbot: the Agent City art pass

From Claude, for David. 2026-11-12.

**Your job:** revise and improve the art of Agent City, item by item, and push each finished item live. Then write a handoff file, so that Claude can pick up the work exactly where you leave off.

Art is the only job in this pass. If something else looks broken, note it in the handoff and leave it alone.

- Live site: https://dtkimdev.github.io/ac/
- Repo: `dtkimdev/ac`, branch `main`

## 0. One-time setup on the shared computer

As of commit `c427d3b`, the art lives in `public/office2d/art/`; the old `public/office2d/assets/` folder is gone. Your local server only serves the new folders after a restart. Run these from the project root:

```bash
git pull --ff-only origin main
```

```bash
bin/stop.sh; bin/start.sh
```

Then open `http://127.0.0.1:8789/` and confirm the office draws, with pictures, not a blank room.

## 1. Read first (10 minutes)

1. `public/office2d/art/README.md` is the guide and the full catalog of every item.
2. `public/office2d/art/pack.json` labels every file. It also lists the art drawn in code (`drawn`) and the parts painted into the room picture (`baked`).
3. To find any item, run this from the repo root:

   ```bash
   node bin/art-pack.js find <word>
   ```

   For example `find fridge`, `find corgi`, `find grok`, `find monitor`, `find boats`.

## 2. What you may change, and what you must not

**You may change:**

- Any file in `public/office2d/art/`: the pictures, `layout.json` and `pack.json`. Edit `pack.json` only for labels, sizes and new entries.
- The drawing code for art items that `pack.json` lists under `drawn`, inside those functions only:
  - `public/office2d/screens.js`
  - `public/office2d/boats.js`
  - `public/office2d/fx.js`
  - the listed functions in `public/office2d/main.js`
- Art and look settings in `public/office2d/config.js`: `BUBBLE`, `DOG.size`, `PROPS`, and the chat words in `BEHAVIOR`.
- The scene builder `portable/art/scene.js` and the other tools in `portable/art/`. Use them for anything painted into the room: the fridge, kitchen stand, shelves, desks, chairs, bean bags and the window view.

**You must not:**

- **Bot behaviour and the data path:** change how often bots move, walk or chat, lite mode, quality and speed logic, the data and refresh code (`ui.js`, `poll`, `connect`, `REFRESH`), `server.js`, `lib/`, or anything in `bin/` except running its commands.
- **Publishing:** change `bin/pages*.sh`, `bin/art-pack.js` or `.github/workflows/`.
- **Undoing David's decisions:**
  - Bring back the snack-feeding animation.
  - Bring back the water animation.
  - Bring back the bamboo plant in the bottom left.
  - Make the bubbles bigger than `BUBBLE.size: 0.8`.
  - Put a video or pop-up on the music.
- **Music:** replace `music/ac-music.mp3` with anything David does not have the rights to.
- **Git safety:**
  - Push `gh-pages`, force-push, or rewrite history.
  - Commit secrets, tokens or webhook URLs.

## 3. The work loop: one item at a time

Before you start, claim the work in `NOW.md`. Add a line and push it:

```
- grokbot · art pass · public/office2d/art, portable/art/scene.js, drawn-art functions · <date time, Bangkok>
```

Also write down the commit you start from, because the handoff needs it:

```bash
git rev-parse --short HEAD
```

Then, for each item:

1. **Find it.** Run `node bin/art-pack.js find <item>` and note which kind it is:
   - **file:** a picture.
   - **code:** drawn by a function.
   - **baked:** painted into `room/plate-*.webp` by `portable/art/scene.js`.

2. **Change it.**
   - **file:**
     - Keep the exact same pixel size and the subject in the same place.
     - Keep the transparent background on characters, dogs, boats and airships.
     - Keep the cell grid on sheets: `corgi*.png` uses 174×155 cells, `turn-*.webp` uses 190×266 and 220×232, `boats*.webp` uses 360×180, and `legs.png` and `walk-side.webp` follow `layout.json`.
     - Keep the same file name.
     - Pairs must stay pairs:
       - `bots/back/wNN.png` and `bots/front/fNN.png` are the same character.
       - Each `*-dusk` file and its `*-night` file are the same object.
       - The four room plates are the same scene.
   - **code:** change only the listed function. Try the "tune" setting first.
   - **baked:** edit the step in `portable/art/scene.js`. Then rebuild all four plates, the masks and `layout.json` together:

     ```bash
     node portable/art/run-scene.js /tmp/scene-out --install
     ```

     This needs `node portable/serve.js` running. Never paint over a plate by hand: dusk and night have to line up pixel for pixel.
   - **A size change on purpose:** update `size` in `pack.json` and the matching `cell`, `size` or `w`/`h` in `layout.json`, in the same commit.
   - **A new picture:** put it in the right folder (`props/` for extra room items), add a line in `pack.json` with a label and a size, and refer to it by its bare file name.

3. **Check.** It must print `OK`:

   ```bash
   node bin/art-pack.js check
   ```

4. **Look at it.** Run `node portable/rebuild.js`, then `node portable/serve.js`, then take a screenshot:

   ```bash
   node portable/shot.js --url "http://127.0.0.1:8791/?q=0&t=18:30" --out /tmp/item-dusk.png
   ```

   - Take a second screenshot at `t=22:30` for night.
   - Also check `?q=4`, the TV mode.
   - Compare against the live site. The item must look better, and nothing else may have moved.

5. **Refresh the catalog** if you changed a label or added a file:

   ```bash
   node bin/art-pack.js docs
   ```

6. **Commit that one item**, with a message in this form:

   ```
   art(<folder or item>): <what changed, in plain words>
   ```

   For example: `art(pets): brown corgi repainted, softer fur, same grid`. Then push to `main`:

   ```bash
   git pull --rebase origin main && git push origin main
   ```

7. **Confirm it is live** after about a minute:
   - `https://dtkimdev.github.io/ac/published.json` shows your commit.
   - Open the page with Ctrl+F5 and look at the item.

   If the publish failed, the live site stays as it was:
   - Run `node bin/art-pack.js check` and fix what it reports.
   - Or look at the failed run with `gh run list -R dtkimdev/ac -w publish -L 3`.
   - Then push again.

**Limits:**
- Keep each picture under 1.5 MB; use webp for big ones.
- Keep files small, because David's TV runs this page.
- If a change makes the city stutter, reduce it.

**When to stop and ask David:** if an item would need a new kind of animation, a new character, or any change outside the "may change" list above.

## 4. Suggested order

Go top to bottom; the items that show most come first. Skip anything that already looks right.

1. Characters: `bots/back` and `bots/front` (faces, hair, hoodies), keeping each back and front pair matched.
2. Corgis: `pets/`.
3. The kitchen corner (baked): fridge, stand, coffee machine.
4. Monitor screens (code): `screens.js` `drawScreen` and `drawWall`.
5. Bean bags, coffee table and rug (baked), with their masks in `room/masks`.
6. Boats (`harbour/` and `boats.js`) and airships (`sky/`).
7. City lights, clouds and fireworks (code: `fx.js`).
8. Wall clock and steam (code: `main.js` `drawClock`, `drawSteam`).

## 5. When you finish: the handoff for Claude

Write `docs/handoff/art-YYYY-MM-DD.md` using the template below. Commit it, remove your line from `NOW.md` in the same push, and push to `main`.

Claude reads this file after `git pull`. Everything you changed is already in git, so a zip is not needed when your push worked.

**Only if you could not push:** make a zip of the files you changed, plus the handoff file, and give it to David:

```bash
git diff --name-only --diff-filter=d <start-commit> -- public portable docs | xargs git archive -o art-handoff.zip HEAD
```

```markdown
# Art handoff: grokbot -> Claude, YYYY-MM-DD

Start commit: <short sha>   End commit: <short sha>   Live: <yes/no; published.json main = ...>
Art check: <paste the last line of node bin/art-pack.js check>

## Changed (one row per item)
| item | kind (file/code/baked) | files | what changed | size changed? | commit |
|---|---|---|---|---|---|

## Added files
| file | folder | label | size | used by |
|---|---|---|---|---|

## Settings changed (config.js, layout.json)
- <key>: <old> -> <new>, why

## Tried and dropped
- <item>: what was tried, why it was dropped

## Not done / open
- <item>: what is left, and anything blocking it

## Problems seen (not fixed: outside the art scope)
- <what, where, how to reproduce>

## Screenshots
- <paths or links: dusk, night and TV mode for the main changes>
```

## 6. Quick reference

| Task | Command |
|---|---|
| Find an item | `node bin/art-pack.js find <word>` |
| Check the pack | `node bin/art-pack.js check` |
| Size of a picture | `node bin/art-pack.js size <file>` |
| Refresh the README catalog | `node bin/art-pack.js docs` |
| Rebuild the preview | `node portable/rebuild.js` |
| Serve the preview (port 8791) | `node portable/serve.js` |
| Screenshot | `node portable/shot.js --url "http://127.0.0.1:8791/?q=0&t=18:30" --out shot.png` |
| Rebuild the room (baked items) | `node portable/art/run-scene.js <out-dir> --install` |
| What is live | `https://dtkimdev.github.io/ac/published.json` |
| Debug in the browser console | `__office2d.workers` (who wears which sprite), `__office2d.dogMood('belly')`, `__office2d.neighbourChat('Sports')`, `__office2d.fireworks()` |
