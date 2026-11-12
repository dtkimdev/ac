# Art gallery handoff: grokbot -> Claude, 2026-11-12

Start commit: e11c5dd   End commit: a562ba7   Live: yes (published.json main = a562ba7, built 2026-11-12 19:01 Bangkok)
Gallery: https://dtkimdev.github.io/ac/gallery/ (125 cards, failed = [])
Art check: art-pack: OK, 59 files, 29 drawn-in-code items
No art was changed in parts 1-2.

## Cards per section
C 18, D 5, P 4, K 11, O 20, L 6, M 17, W 18, H 14, S 1, X 11 (collapsed). Total 125.
Weight: public/gallery 3.89 MB (101 shots, each <250 KB); everything loaded ~7.8 MB (music not fetched until Play).

## Items found that are not in the pack (cards added)
K05 canister, K07 string lights, K09 plant behind the machine, O10 keyboards, O15 light shafts/bloom/vignette, O18 hanging vines, O19 right-side plant, W05 balcony rail, W06 mountain, W07 painted moon and sun, W08 painted airships, W09 street lamp, W13 stars, W14 sun/moon paths on the water, H12 dinner-cruise catamaran, H13 neon hydrofoil, M06 pallet-checks screen.

## Looked off (noted on cards, not fixed)
- Shopper has no desk.
- Dash bean-bag trip did not land in shots.
- Stand lip looks notched.
- Empty-seat patches (nochair-*) are fully transparent.
- Blue bean bag reads grey; mustard looks orange.
- Several desk screens are covered by heads or unused.
- Painted boat sheet is loaded but no longer drawn.
- Painted sun stays visible at night.
- Painted + drifting airships can show four at once.

## Problems seen (outside art scope, not fixed)
- Root .gitignore has `shots/`, which also ignores public/gallery/shots/. Shots were added with `git add -f`. A `!public/gallery/shots/` exception would help (not changed: .gitignore is outside the may-change list).
- Port 8791 was held by a stale socket with no visible process; preview ran on 8792 (`node portable/serve.js 8792`).
- Part 2 was finished on Grok after Claude hit its 5-hour Pro limit.
