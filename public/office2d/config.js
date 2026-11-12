// Agent City settings. Change behaviour, speed and items here; no drawing code needed. Recipes: AGENTS.md, "Common edits".
// Art and positions live in the art pack: art/README.md (find anything: node bin/art-pack.js find <word>), positions in art/layout.json.

// ↻ button on the live site: rings a GitHub workflow that the publisher watches (see main.js setupPagesRefresh).
export const REFRESH = { repo: 'dtkimdev/ac', workflow: 'refresh.yml', ref: 'main', waitSeconds: 300 };

// ---------- bots ----------
export const BOTS = {
  // never shown in the office; the bots themselves are untouched (bot11 Notes; old 14, replaced by the new Dashboards, David 2026-11-12)
  hiddenIds: ['a80017dc-128b-4534-8cde-674d5b094b4f', 'fa5eb849-f363-4153-8c97-77a89556137f'],
  loungeBotIdPrefix: 'e0bf5277-',                      // this bot (bot14 Dashboards) wears the Dashboards art (bots/dash) and visits the blue bean bag
  // bot number -> fixed row in the sprite set (every current bot pinned, David 2026-11-12). A new bot draws a free row by its seed:
  // rows 12-15 are four different designs made for new bots (layout.json baseSprites = 16).
  spriteByNum: { 0: 0, 1: 1, 2: 7, 3: 6, 4: 2, 5: 8, 6: 10, 7: 3, 8: 4, 9: 5, 10: 9, 11: 11 },
};

// Behaviour. `default` applies to every bot; `byBot` overrides it per bot number. Times are [shortest, longest] seconds.
// David, 2026-11-11: the bots move about 60% less (every interval below is 2.5 times what it was) and spend more time at their desks.
export const BEHAVIOR = {
  default: {
    wanders: true,          // false: never leaves the desk for the lounge
    tripEvery: [300, 900],  // how often an idle bot walks to the lounge
    tripStay: [14, 40],     // how long it stays there
    turnEvery: [75, 225],   // how often it turns round in its chair
    fidgetEvery: [15, 65],  // how often it fidgets while seated
    deskChat: ['…', 'haha', '👍', 'lunch?', '😂', 'nice', '👀', 'really?', '🙂', 'ok!', '☕?', 'hmm'], // said to a desk neighbour
    loungeChat: ['…', 'haha', '😂', '👍', '🙂', 'nice', '👀', '☕?'],                                 // said in the lounge
    snacks: ['☕', '🍪', '☕', '🍩', '🍎'],                                                           // shown while on a break
  },
  byBot: {
    14: { tripEvery: [70, 208] }, // Dashboards roams more often than the others
  },
};
export const behaviorOf = num => ({ ...BEHAVIOR.default, ...(BEHAVIOR.byBot[num] || {}) });

// Bots with no desk (not listed on any desk in layout.json, for example Shopper and future bots) live in the kitchen. Between trips to
// the coffee machine, fridge, bean bags, table and the dogs they idle at a kitchen spot. These override BEHAVIOR for them.
export const LOITER = { tripEvery: [12, 45], tripStay: [10, 32] };
// Desk neighbours turning to chat: how often a pair starts, in seconds (David, 2026-11-11: rarely).
export const CHAT = { every: [150, 400] };
// Speech bubbles over the bots: 1 = the old size (David, 2026-11-12: 20% smaller). Text, padding and tail all scale with it.
export const BUBBLE = { size: 0.8 };

// Corgi moods: bigger number = picked more often. David (2026-11-10): the dogs only act cute or ask a bot for attention, so the moods
// aimed at a bot dominate. affection: trot up, happy wiggle. ask: beg at a bot until it answers. belly: roll over at a bot's feet.
// (The snack-feeding mood was removed, David 2026-11-12.)
// beg / begWithVisitors: beg near the lounge visitors. wander and zoomies (running about alone) are off; nap and rest are short breaks.
export const DOG_MOODS = { wander: 0, affection: 24, ask: 10, belly: 12, nap: 6, rest: 5, beg: 4, begWithVisitors: 30, zoomies: 0 };
// Corgi size: 1 = the original size, 1.5 = 50% bigger (David, 2026-11-10).
export const DOG = { size: 1.5 };
// Walking: at most this many bots move about the room at once (David, 2026-11-10: no more than 3). Others wait their turn: a trip, a visit
// or the walk home starts when someone else has arrived. Real interactions from the feed wait too (up to 90 s).
// quietShare: only this share of the bots, those with the lowest usage, take breaks, loiter or roam (0.5 = the bottom half). Busy bots stay at
// their desks; walks for real interactions from the feed still happen.
export const WALK = { maxMoving: 3, quietShare: 0.5 };

// ---------- skill books (David, 2026-11-12) ----------
// The tall bookcase under the clock holds one book per skill, 4 to a shelf, top shelf first. Rename or reorder labels freely; keep them short,
// they are printed on the spine. Grok (found by name) now and then takes up to 3 books to a bot at its desk, they talk about using them, and
// the books stay on that desk until he fetches them back (keep) or carries them on to another bot that needs them (passOn). Times in seconds.
export const BOOKS = {
  labels: ['sk1', 'sk2', 'sk3', 'sk4', 'sk5', 'sk6', 'sk7', 'sk8', 'sk9', 'sk10', 'sk11', 'sk12', 'sk13', 'sk14', 'sk15', 'sk16', 'sk17', 'sk18', 'sk19', 'sk20'],
  colors: ['#7b2d26', '#2d4b6e', '#3f5e3a', '#8a6326', '#5b3a6e', '#2a5f5c', '#8c4a2a', '#3e3f70', '#6e5232', '#1f4a3c'], // spine colours, repeating
  carrier: 'Grok',          // the bot that fetches the books
  first: [120, 360],        // before the first run after the page loads
  every: [900, 2400],       // between runs
  keep: [7200, 14400],      // how long books stay on a desk before Grok takes them back (2-4 hours)
  passOn: 0.35,             // chance a run carries books from one desk straight on to another bot
  talk: 12, line: 2.3,      // talk at the desk, and each bubble
  lines: {                  // {b} = the books, {1} {2} = the first and second book
    give: ['brought you {b}', '{b} for this job', 'try {b} here'],
    grok: ['start with {1}', '{1} covers step one', 'then {2} for the rest', 'ping me if stuck', 'keep them a while'],
    worker: ['oh, {1}!', 'how do I use {1}?', 'got it 👍', 'perfect, thanks', 'makes sense'],
    collect: ['done with {b}?', 'need {b} back'],
    passOn: ['{b} is needed next door', 'borrowing {b} 🙏'],
    thanks: ['all yours', 'thanks!', 'sure 👍'],
  },
};

// ---------- items ----------
// Extra pictures placed in the room. Put the image in art/props/ and list it in art/pack.json, then add a line here. x, y, w, h are in plate pixels (the room is 1280 x 720).
// depth is the floor line: things lower on screen (bigger y) draw in front. Use the item's bottom edge, y + h, unless it should sit behind something.
// Example: { file: 'plant-new.png', x: 600, y: 560, w: 60, h: 90, depth: 650 },
export const PROPS = [];

// ---------- speed ----------
// Levels 0-3 are the full picture, for PCs and phones. Level 4 is lite: same scene, far fewer drawing operations. Force one with ?q=0 .. ?q=4
// The full picture is drawn at most this many pixels wide, and the browser scales it up to the screen (David, 2026-11-11: on large
// high-resolution screens the city stuttered; 2560 keeps it smooth and still sharp).
export const VIEW = { maxWidth: 2560 };
export const QUALITY = [
  { level: 0, scale: 1, fx: 1 }, { level: 1, scale: 1, fx: 0.6 }, { level: 2, scale: 0.8, fx: 0.5 }, { level: 3, scale: 0.66, fx: 0.35 },
  { level: 4, scale: 1, fx: 0, lite: true },
];
export const LITE = {
  tvBrowsers: /smart-?tv|smarttv|hbbtv|netcast|tizen|web0s|webos|vidaa|viera|bravia|philipstv|roku|crkey|android ?tv|\bAFT[A-Z0-9]|\bTV\b/i, // these start in lite straight away
  enterFps: 18,       // below this for enterSeconds (page on screen, after warmup seconds), switch to lite
  enterSeconds: 8,
  warmup: 10,
  throttledFps: 6,    // a sample below this is a covered or background window being paused by the browser: ignored
  leaveFps: 50, leaveSeconds: 10, // a computer that fell into lite by itself returns to the full picture when lite runs this fast
  maxWidth: 1280,     // internal drawing width; the browser scales it up to the screen
  sliceEvery: 0.12,   // seconds between room patch refreshes; seated bots and monitors update through these
  sliceCols: 6, sliceRows: 3,
  cityEvery: 0.6,     // seconds between city refreshes
  rescueFps: 20,      // lite itself below this for rescueSeconds: halve the refresh rates and lower maxWidth to rescueWidth
  rescueSeconds: 5, rescueWidth: 960,
  cityShare: 0.2,     // share of cars and other city effects that are kept
  monitorStrips: 4,   // warp quality of monitor pictures (12 on the full picture)
  maxStep: 0.25,      // longest simulated step in seconds; keeps movement at real speed at low fps
};
