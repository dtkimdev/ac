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
export const BEHAVIOR = {
  default: {
    wanders: true,          // false: never leaves the desk for the lounge
    tripEvery: [120, 360],  // how often an idle bot walks to the lounge
    tripStay: [22, 62],     // how long it stays there
    turnEvery: [30, 90],    // how often it turns round in its chair
    fidgetEvery: [6, 26],   // how often it fidgets while seated
    deskChat: ['…', 'haha', '👍', 'lunch?', '😂', 'nice', '👀', 'really?', '🙂', 'ok!', '☕?', 'hmm'], // said to a desk neighbour
    loungeChat: ['…', 'haha', '😂', '👍', '🙂', 'nice', '👀', '☕?'],                                 // said in the lounge
    snacks: ['☕', '🍪', '☕', '🍩', '🍎'],                                                           // shown while on a break
  },
  byBot: {
    14: { tripEvery: [28, 83] }, // Dashboards roams far more often
  },
};
export const behaviorOf = num => ({ ...BEHAVIOR.default, ...(BEHAVIOR.byBot[num] || {}) });

// Corgi moods: bigger number = picked more often. begWithVisitors replaces beg while a bot is in the lounge.
export const DOG_MOODS = { wander: 34, affection: 16, belly: 6, nap: 14, rest: 12, beg: 6, begWithVisitors: 40, zoomies: 5 };

// ---------- items ----------
// Extra pictures placed in the room. Put the image in assets/, then add a line. x, y, w, h are in plate pixels (the room is 1280 x 720).
// depth is the floor line: things lower on screen (bigger y) draw in front. Use the item's bottom edge, y + h, unless it should sit behind something.
// Example: { file: 'plant-new.png', x: 600, y: 560, w: 60, h: 90, depth: 650 },
export const PROPS = [];

// ---------- speed ----------
// Levels 0-3 are the full picture, for PCs and phones. Level 4 is lite: same scene, far fewer drawing operations. Force one with ?q=0 .. ?q=4
export const QUALITY = [
  { level: 0, scale: 1, fx: 1 }, { level: 1, scale: 1, fx: 0.6 }, { level: 2, scale: 0.8, fx: 0.5 }, { level: 3, scale: 0.66, fx: 0.35 },
  { level: 4, scale: 1, fx: 0, lite: true },
];
export const LITE = {
  tvBrowsers: /smart-?tv|smarttv|hbbtv|netcast|tizen|web0s|webos|vidaa|viera|bravia|philipstv|roku|crkey|android ?tv|\bAFT[A-Z0-9]|\bTV\b/i, // these start in lite straight away
  enterFps: 25,       // below this for enterSeconds, switch to lite
  enterSeconds: 3,
  rememberFps: 12,    // below this the device is remembered, so it starts in lite next time (?q=0 clears that)
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
