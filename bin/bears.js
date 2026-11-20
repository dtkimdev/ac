#!/usr/bin/env node
// The Bears banner's data (David, 2026-11-20): the Chicago Bears' next games, written next to state.json on every publish, so the ↻
// button, a Grok refresh and every push all bring a fresh schedule. Source: ESPN's public schedule (no key, no account).
//   node bin/bears.js <out.json>
// Rules:
//  - upcoming games of the current season (regular season, then the playoffs), soonest first, up to 4 (the page rolls over to the next
//    one by itself four hours after a kickoff);
//  - none left (off season): the first game, week 1, of the next season;
//  - next season's schedule not out yet (the NFL releases it in May): no games, "next": { season, week: 1 }, the banner says "schedule TBA".
// It never fails a build: if ESPN cannot be reached it keeps the copy that is live now, and if that fails too it writes nothing
// (the page then simply shows no banner). Node 18+ (global fetch).
'use strict';
const fs = require('fs');

const TEAM = 'chi'; // ESPN team code
const API = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${TEAM}/schedule`;
const LIVE = 'https://dtkimdev.github.io/ac/bears.json';
const out = process.argv[2];
if (!out) { console.error('usage: node bin/bears.js <out.json>'); process.exit(0); }

const get = async url => {
  const r = await fetch(url, { headers: { 'User-Agent': 'agent-city-banner/1' }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
};
const logo = t => (t && t.logos && t.logos[0] && t.logos[0].href) || (t && t.logo) || '';

function games(j, kind) {
  return (j.events || []).map(e => {
    const c = (e.competitions || [])[0] || {}, cs = c.competitors || [];
    const us = cs.find(x => x.team && x.team.abbreviation === 'CHI'), them = cs.find(x => x !== us);
    if (!us || !them) return null;
    return {
      date: e.date, timeValid: c.timeValid !== false, state: (c.status && c.status.type && c.status.type.state) || 'pre',
      week: (e.week && e.week.text) || '', kind, home: us.homeAway === 'home',
      opp: { abbr: them.team.abbreviation, name: them.team.shortDisplayName || them.team.nickname || them.team.displayName, logo: logo(them.team) },
      tv: ((c.broadcasts || [])[0] || {}).media ? c.broadcasts[0].media.shortName : '',
    };
  }).filter(Boolean);
}

async function build() {
  const reg = await get(API + '?seasontype=2');
  const Y = (reg.season && reg.season.year) || (reg.requestedSeason && reg.requestedSeason.year) || new Date().getUTCFullYear();
  const t = reg.team || {};
  const team = { abbr: 'CHI', name: t.shortDisplayName || 'Bears', logo: logo(t) || 'https://a.espncdn.com/i/teamlogos/nfl/500/chi.png', record: t.recordSummary || '', standing: t.standingSummary || '' };
  let all = games(reg, 'reg');
  try { all = all.concat(games(await get(API + '?seasontype=3'), 'post')); } catch { /* no playoff page: fine */ }
  const now = Date.now(), left = g => g.state !== 'post' && Date.parse(g.date) + 4 * 3600e3 > now;
  let up = all.filter(left).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)), season = Y, next = null;
  if (!up.length) { // off season: next season's week 1, once the schedule is out
    season = all.length ? Y + 1 : Y;
    try { up = games(await get(`${API}?season=${season}&seasontype=2`), 'reg').filter(left).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)).slice(0, 1); } catch { up = []; }
    if (up.length) team.record = '';
    else next = { season, week: 1 };
  }
  return { v: 1, fetched: new Date().toISOString(), source: 'espn', season, team, games: up.slice(0, 4), next };
}

(async () => {
  let data = null;
  try { data = await build(); } catch (e) { console.error('bears: ESPN failed (' + e.message + '), keeping the live copy'); }
  if (!data) { try { data = await get(LIVE + '?t=' + Date.now()); data.stale = true; } catch { console.error('bears: no live copy either; no banner data this time'); return; } }
  fs.writeFileSync(out, JSON.stringify(data) + '\n');
  const g = data.games[0];
  console.log('bears: ' + (g ? `${g.week} ${g.home ? 'vs' : '@'} ${g.opp.name} ${g.date}` : `season ${data.next && data.next.season} week 1, schedule TBA`) + (data.stale ? ' (kept live copy)' : ''));
})().catch(() => {});
