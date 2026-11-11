// Agent City settings. Change behaviour, speed and items here; no drawing code needed. Recipes: AGENTS.md, "Common edits".
// Art and positions live in assets/layout.json.

// ↻ button on the live site: rings a GitHub workflow that the publisher watches (see main.js setupPagesRefresh).
export const REFRESH = { repo: 'dtkimdev/ac', workflow: 'refresh.yml', ref: 'main', waitSeconds: 300 };

// ---------- bots ----------
export const BOTS = {
  hiddenIds: ['a80017dc-128b-4534-8cde-674d5b094b4f'], // never shown in the office; the bot itself is untouched (bot11 Notes)
  loungeBotIdPrefix: 'fa5eb849-',                      // this bot (bot14 Dashboards) lives on the blue bean bag instead of a desk
  spriteByNum: { 1: 1, 2: 7, 5: 8, 7: 3, 8: 4 },       // bot number -> fixed row in the sprite set; everyone else draws from the rest
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

// Corgi moods: bigger number = picked more often. David (2026-11-10): the dogs only act cute or ask a bot for attention, so the moods
// aimed at a bot dominate. affection: trot up, happy wiggle. ask: beg at a bot until it answers. belly: roll over at a bot's feet.
// feed: ask a bot for food; it reaches into its pocket and feeds the dog a biscuit (David, 2026-11-10).
// beg / begWithVisitors: beg near the lounge visitors. wander and zoomies (running about alone) are off; nap and rest are short breaks.
export const DOG_MOODS = { wander: 0, affection: 24, ask: 10, feed: 24, belly: 12, nap: 6, rest: 5, beg: 4, begWithVisitors: 30, zoomies: 0 };
// Corgi size: 1 = the original size, 1.5 = 50% bigger (David, 2026-11-10).
export const DOG = { size: 1.5 };
// Walking: at most this many bots move about the room at once (David, 2026-11-10: no more than 3). Others wait their turn: a trip, a visit
// or the walk home starts when someone else has arrived. Real interactions from the feed wait too (up to 90 s).
// quietShare: only this share of the bots, those with the lowest usage, take breaks, loiter or roam (0.5 = the bottom half). Busy bots stay at
// their desks; walks for real interactions from the feed still happen.
export const WALK = { maxMoving: 3, quietShare: 0.5 };

// ---------- items ----------
// Extra pictures placed in the room. Put the image in assets/, then add a line. x, y, w, h are in plate pixels (the room is 1280 x 720).
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
