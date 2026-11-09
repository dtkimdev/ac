# Agent City — Claude Handoff (v11 / ?v=20)

Handoff written 2026-11-06 (Bangkok), after Agent City v11 was finished and published 2026-11-06 15:51 Bangkok.

## 1. How to use this file

- David gives this file to Claude (Claude Code or Claude chat) so work on Agent City can continue with Claude alone, while Dash can still see and understand every update.
- Read it fully, run the bootstrap in section 2, then follow whatever concrete task David pastes in section 12.
- All paths are relative to the project root `/workspace/agent-city` unless they are written as absolute.
- This file contains **facts and rules only**. It does not contain source code or assets.
- **Claude chat without file access:** treat everything here as background. Do not claim to have read, changed, verified, or published anything. Ask David for the files you need, and say clearly that the work is not applied until it reaches the project.
- **Claude Code:** check which machine you are on before relying on any path (section 9).
- Keep **baseline facts** (this file, live/stage trees) separate from **unverified guesses** in everything you report.

There is no pending Agent City build request right now. Without a pasted task, bootstrap, report state, and wait.

## 2. Bootstrap checklist (first actions every session)

Non-destructive only. No repairs during bootstrap.

1. Confirm where you are running: shared bot Linux computer, or David's Windows PC (DPro), or chat with no filesystem.
2. Inspect paths: does `/workspace/agent-city` exist? Are `public/`, `design/v10/stage/public/`, `design/v10/tools/`, and `bin/` present?
3. Run `git status` only if a git tree actually exists there. Do not initialize one.
4. Read the newest `PROJECT_STATE.md`, `CHANGELOG.md`, and `HANDOFF_TO_DASH.md` if present. If they are newer than this file and consistent, they win over this file for current state.
5. On the **first** session after David gives you this file, set up the continuity files (section 8).
6. Plan stage-first before writing any code (section 10).
7. Tell David what you found, flagging any mismatch with this baseline. Do not silently fix a mismatch.

## 3. Purpose and hard rules

**Purpose:** Agent City is a read-only, zero-AI-token live viewer of David's bots, shown as workers in a painted cozy cyberpunk office.

**Hard rules:**

- Runtime is client paint plus local file/state reads only. **Never call models at runtime.**
- The viewer is read-only. It observes bots; it does not control them.
- Bot roster or behavior changes happen only via bot1. Do not modify bots or private app databases.
- Promote, publish, and Pages actions need David's explicit approval **for that change set**. The historic v11 approval is not future permission.
- Never read or copy `.secret` contents (e.g. `.secret/pages-refresh-token`). Path reference only.

## 4. Current baseline

| Item | Value |
| --- | --- |
| Product | Agent City v11 |
| Finished/published | 2026-11-06 15:51 Bangkok |
| Cache bust | `?v=20` |
| Project root | `/workspace/agent-city` on the shared bot computer (not David's Windows DPro) |
| Pending build request | None |
| Pages tip | Starts `8c93646` (full: `8c936467fcb0deacf0d07b9a291e2b20e063a4a6`); pushed parent-preserving |
| Last reported live verify | VERIFY OK, 60 fps / 13 bots |

**Evidence:**

- `/workspace/archivist/archives/Dash/c2-20261106-1553/v11-handoff.md`
- `/workspace/tmp/v11-followup-report.md`

**Stale docs:** `DASH1.md` and `README.md` still describe older v8/v9. For the current version, trust this handoff plus the live and stage trees over them.

**Links / publish surfaces:**

- Funnel (live machine): https://agentcity.tailacdee6.ts.net/
- GitHub Pages static: https://dtkimdev.github.io/ac/
- GitHub repo `dtkimdev/ac` is **static Pages output only**, not the development source repo. Never clone Pages as replacement source.
- The CDN may lag Funnel/raw briefly.

**Runtime ports (live):**

| Port | Role |
| --- | --- |
| 8787 | Password login |
| 8788 | `127.0.0.1`, no login |
| 8789 | Public view-only (GET allowlist) |

Start/stop: `bin/start.sh` / `bin/stop.sh`. Public Funnel helpers: `bin/public.sh`.

**Stage ports (data copies):**

| Port | Role |
| --- | --- |
| 8797 | Login |
| 8798 | Local — http://127.0.0.1:8798/ |
| 8799 | Public |

## 5. Paths

The current v11 pipeline uses the v10 stage trees. The `v10` in these paths is not a version mistake.

| Purpose | Path |
| --- | --- |
| Live public assets | `public/` — edits go live immediately; watchdog may auto-publish Pages |
| Stage root | `design/v10/stage/public/` |
| Tools | `design/v10/tools/` (e.g. `v11.py`) |
| Stage preview | `bin/v10-stage.sh start` → http://127.0.0.1:8798/ |
| Stage verify | `node design/v10/verify.js` (or `AGENT_CITY_STAGE=1` patterns as existing scripts show) |
| Live verify | `node bin/verify.js` |
| Promote | `bin/v10-promote.sh` — only after explicit David approval for that change set |
| Backups (examples) | `/workspace/tmp/v11-fu3-bak-*`, `v11-fu2-bak-*`, `v11-fu-bak-*`, promote baks under `/workspace/tmp/` |
| Previews | `/workspace/tmp/v11-followup-preview/` |
| Secrets | `.secret/` — path reference only, never read |

## 6. Latest 8 frozen v11 changes

All eight are still present. Do not regress them.

1. LED/neon **sign panels** on buildings removed: blank pink panels plus neon glow/flicker gone, neon count 0.
2. Wall **clock** moved to top left; time digits perfectly centered in the panel.
3. Two **usage charts** shifted down on the right wall so they clear the refresh control and last-update stamp.
4. **Heart** removed from the fridge.
5. **Bamboo** smaller, covering less of the kitchen/desks, with underlighting kept tasteful.
6. **Archives bot hat** removed.
7. **Grok/Boss desk** is a straight, flat matte-black desk, not curved wooden.
8. **Background hiss** removed from audio beds; music only.

**Checks at release:** VERIFY OK at 60 fps / 13 bots; Pages tip starts `8c93646`; Funnel and local `:8789` served `?v=20`.

## 7. Preferences and known gaps

**Preferences:**

- Soft, glowing, warm, painted 2.5D cozy cyberpunk office. Never flat, blocky, or crude 3D.
- Smooth high fps. Token-lean. Zero AI at runtime.
- Use Opus/Claude Code for Agent City thinking and building. Minimize Grok (c3 = conserve Grok, use Claude Pro freely).
- Work in the isolated stage until approved, verify, then promote.
- Preserve existing local project configs. No new external accounts, sync setups, scheduled jobs, source-control edits, force pushes, or background processes unless David explicitly asks.
- Do not silently install or edit `CLAUDE.md` or other bot instruction files.

**Known gaps (honest):**

- Audio: offline RMS/peak were measured, but nobody has listened to it.
- Thin coloured tower edge lines may remain (these are not panels), and a few tiny non-neon pink glows sit low in the city.
- Facade fills look plainer at extreme zoom; the upper-right crown is a simplified dark block.
- Pages CDN may lag the tip.
- `DASH1.md` and `README.md` are stale versus v11.

## 8. Continuity files (create and update while working)

Dash must be able to read these and understand what changed. They do not exist as part of this handoff; Claude creates them on the first session after David gives it this file, not before.

**On the first session:**

1. Keep the canonical source intact on shared `/workspace/agent-city` when that path is available.
2. Create `PROJECT_STATE.md`.
3. Create `CHANGELOG.md`.
4. Create `HANDOFF_TO_DASH.md`.

**`PROJECT_STATE.md`** — the current authoritative short state. Keep it short and current: version, build id, what is live, what is staged, what awaits approval, next step.

**`CHANGELOG.md`** — append-only. Never overwrite full history. Record partial and failed work too. Add one dated Bangkok entry per task:

```markdown
## YYYY-MM-DD HH:MM Bangkok — short task title
- What:
- Why:
- Files:
- Build id:
- Tests:
- Preview or live:
- Approval:
- Backups:
- Known gaps:
- Next step:
```

**`HANDOFF_TO_DASH.md`** — a short catch-up that points to the state file, the log, and the changed files.

Human-requested docs stay durable; do not delete or replace them to tidy up.

## 9. Same computer vs David's PC

- **Claude Code on the shared bot Linux computer:** `/workspace/agent-city` lives here. Edits persist, and Dash can read them on the next request.
- **Claude only on David's Windows PC (DPro):** this is a **different filesystem**.
  - Use an explicit, existing full source copy that David provides.
  - Return, upload, or sync the **full** changed source, assets, and logs back to the shared project.
  - Avoid automatic overwrite of shared trees.
  - No pretend sync and no auto watcher. Do not say Dash can see work that has not reached the shared project.
- **Shared source inaccessible:** ask David for the full existing project folder, with no secrets. Do not invent a clone of Pages as the source.

## 10. Staging, promote, and publish safety

Normal flow for any change:

1. Back up what you will touch, and record the backup path in `CHANGELOG.md`.
2. Change only the stage tree, `design/v10/stage/public/`, using tools under `design/v10/tools/`.
3. Preview with `bin/v10-stage.sh start`, at http://127.0.0.1:8798/.
4. Verify the stage with `node design/v10/verify.js`, and report the real result.
5. Show David the preview or results and ask for approval of **this** change set.
6. Only after explicit approval, run `bin/v10-promote.sh`.
7. Verify live with `node bin/verify.js`, and bump the cache bust if the change requires it.
8. Update `PROJECT_STATE.md`, `CHANGELOG.md`, and `HANDOFF_TO_DASH.md`.

Safety points:

- Editing `public/` is a live change. The watchdog may then auto-publish to Pages, so a "quick fix" there skips approval.
- Any Pages action needs its own explicit approval. If David later requests one, prefer an approved non-destructive workflow.
- After publishing, remember the CDN may lag Funnel/raw; compare before calling it broken.
- Do not invent a new preprocess that rewrites live layout without stage isolation.

## 11. What NOT to do

- Do **not** run `bin/preprocess.py` or `bin/preprocess_v7.py`. They overwrite layout or use broken sources.
- Do not use older `preprocess_v8`/`v9` tools unless a brief explicitly says so. Prefer current tools in `design/v10/tools/`.
- Do not use the legacy Pages script, which may force-push an orphan `gh-pages`, without separate destructive approval.
- Do not force-push, and do not treat `dtkimdev/ac` as source.
- Do not edit `public/` directly for unapproved work.
- Do not promote or publish on the strength of the historic v11 approval.
- Do not read, print, or copy `.secret` contents.
- Do not call models at runtime or add any AI dependency to the viewer.
- Do not change the bot roster or behavior except via bot1, and do not touch bots or private app databases.
- Do not add external accounts, sync setups, scheduled jobs, source-control changes, or background processes unless David explicitly asks.
- Do not silently install or edit `CLAUDE.md` or other bot instruction files.
- Do not trust `DASH1.md` or `README.md` for the live version.
- Do not claim audio quality was heard, or any check passed, unless it actually happened.
- Do not repair destructively during bootstrap.

## 12. Original prompt and next task

David's continuity ask that produced this file:

> give me md to give claude so that i can continue working on it with only claude while preserving it where you can see all updates and changes in my local files and understand them easily to know whats been updated

When David pastes a new concrete Agent City task below or after this handoff, follow **that** task: work stage-first, update the three continuity files, and leave Dash a clear `HANDOFF_TO_DASH.md`.

### Paste next task here

```text
(David: paste your next Agent City task here)
```
