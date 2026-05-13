#!/usr/bin/env node
/**
 * matchday-update.js — refresh data for matches on a given date.
 *
 * Pipeline (each step is independent; failures don't abort the run):
 *   1. Find games for that date+league in the DB
 *   2. Refresh API-Football raw payloads (events, lineups, statistics) per fixture
 *      → project raw → canonical: replace game_events, game_lineup_entries, game_statistics
 *   3. Scrape FootyStats per match for xG + advanced stats (Cloudflare; needs --headful in dev)
 *   4. Refresh IFA details for the current season+league (events, lineups, refs in Hebrew)
 *   5. Refresh Walla games for the current season (results, half-time scores)
 *   6. Run enrichment merge to fold scraped values into game_statistics
 *
 * Usage:
 *   node scripts/matchday-update.js                                # today, Ligat HaAl
 *   node scripts/matchday-update.js --date 2026-05-09
 *   node scripts/matchday-update.js --league all                   # all Israeli leagues
 *   node scripts/matchday-update.js --no-apifootball               # skip API refresh
 *   node scripts/matchday-update.js --no-footystats                # skip the FS scrape
 *   node scripts/matchday-update.js --no-ifa                       # skip IFA refresh
 *   node scripts/matchday-update.js --no-walla                     # skip Walla refresh
 *   node scripts/matchday-update.js --no-merge                     # skip final merge
 *   node scripts/matchday-update.js --headful                      # show FootyStats browser
 *   node scripts/matchday-update.js --dry-run                      # plan only, no writes
 */

'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// .env loader (mirrors dump-apifootball.js)
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadEnv(path.resolve(__dirname, '..', '.env'));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';

// API-Football league mapping (matches dump-apifootball.js)
const LEAGUE_MAP = {
  ipl:        383,
  leumit:     382,
  stateCup:   384,
  totoCupAl:  385,
  superCup:   659,
};

// IFA (football.org.il) league mapping
const IFA_LEAGUE_MAP = {
  ipl:        '40',  // ליגת העל
  leumit:     '41',  // ליגה לאומית
  stateCup:   '618', // גביע המדינה (national_cup_id)
  totoCupAl:  '625', // גביע טוטו ליגת העל
  totoCupLeumit: '630', // גביע טוטו ליגה לאומית
};

// season_id N → start year = 1998 + N
// 2025-26 season → start year 2025 → season_id = 27
function ifaSeasonIdFromDate(dateStr) {
  const d = new Date(dateStr);
  // Israeli season runs Aug-May. Date before July uses previous year's season.
  const startYear = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return String(startYear - 1998);
}

// Walla season string for a given date
function wallaSeasonFromDate(dateStr) {
  const d = new Date(dateStr);
  const startYear = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return `${startYear}/${startYear + 1}`;
}

const args = process.argv.slice(2);
function getArg(name, dflt = null) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
}
const DRY_RUN = args.includes('--dry-run');
const SKIP_AF = args.includes('--no-apifootball');
const SKIP_FS = args.includes('--no-footystats');
const SKIP_IFA = args.includes('--no-ifa');
const SKIP_WALLA = args.includes('--no-walla');
const SKIP_MERGE = args.includes('--no-merge');
const HEADFUL = args.includes('--headful');
const DATE = getArg('--date') || new Date().toISOString().slice(0, 10);
const LEAGUE = getArg('--league', 'ipl');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastApiAt = 0;
async function fetchAF(urlPath) {
  const wait = Math.max(0, lastApiAt + 200 - Date.now());
  if (wait > 0) await sleep(wait);
  lastApiAt = Date.now();
  const res = await fetch(`${BASE_URL}${urlPath}`, {
    headers: { 'x-rapidapi-host': 'v3.football.api-sports.io', 'x-apisports-key': API_KEY },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`${urlPath} → HTTP ${res.status}`);
  return res.json();
}

/**
 * Refresh fixture metadata (referee, venue, status, elapsed) on the canonical
 * Game record. API-Football's /fixtures?id=X returns these — our previous
 * matchday job only refreshed lineups/events/statistics, so games that didn't
 * exist before the original full-season dump had no referee.
 */
async function refreshFixtureMetadata(game) {
  const fixtureId = game.apiFootballId;
  const data = await fetchAF(`/fixtures?id=${fixtureId}`).catch((e) => ({ _err: e.message }));
  if (data._err) return { _err: data._err };
  const f = data?.response?.[0];
  if (!f) return { _err: 'empty response' };

  const updates = {};
  const refEn = f.fixture?.referee;
  if (refEn) {
    if (!game.refereeEn) updates.refereeEn = refEn;
    // Only fill Hebrew when missing — manual admin entries take precedence.
    if (!game.refereeHe) updates.refereeHe = refEn;
  }
  const venueName = f.fixture?.venue?.name;
  if (venueName) {
    if (!game.venueNameEn) updates.venueNameEn = venueName;
    if (!game.venueNameHe) updates.venueNameHe = venueName;
  }
  const st = f.fixture?.status;
  if (st?.short) updates.statusShort = st.short;
  if (st?.long)  updates.statusLong = st.long;
  if (typeof st?.elapsed === 'number') updates.elapsed = st.elapsed;
  if (typeof st?.extra === 'number')   updates.extra = st.extra;

  if (Object.keys(updates).length === 0) return { skipped: true };
  await prisma.game.update({ where: { id: game.id }, data: updates });
  return { updated: Object.keys(updates) };
}

function mapEventType(type, detail) {
  if (type === 'Goal') {
    if (detail === 'Own Goal') return 'OWN_GOAL';
    if (detail === 'Penalty') return 'PENALTY_GOAL';
    if (detail === 'Missed Penalty') return 'PENALTY_MISSED';
    return 'GOAL';
  }
  if (type === 'Card') {
    if (detail === 'Red Card') return 'RED_CARD';
    if (detail === 'Yellow Card') return 'YELLOW_CARD';
  }
  if (type === 'subst') return 'SUBSTITUTION_IN';
  return null;
}

async function findGamesOnDate(dateStr, league) {
  const start = new Date(`${dateStr}T00:00:00`);
  const end = new Date(`${dateStr}T23:59:59`);
  const where = {
    dateTime: { gte: start, lte: end },
    apiFootballId: { not: null },
  };
  // League filter: by competitionId (using existing canonical IDs)
  if (league !== 'all') {
    const compMap = {
      ipl: 'comp_liga_haal',
      leumit: 'comp_liga_leumit',
      stateCup: 'comp_state_cup',
      totoCupAl: 'comp_toto_cup',
      superCup: 'comp_super_cup',
    };
    if (compMap[league]) where.competitionId = compMap[league];
  }
  return prisma.game.findMany({
    where,
    select: { id: true, apiFootballId: true, footyStatsId: true, homeTeamId: true, awayTeamId: true, seasonId: true, dateTime: true,
              homeTeam: { select: { nameHe: true } }, awayTeam: { select: { nameHe: true } } },
    orderBy: { dateTime: 'asc' },
  });
}

async function refreshRawApiFootball(game, leagueId, season) {
  // Replace existing raw rows so reprocessing picks up the latest payload.
  const fixtureId = game.apiFootballId;
  const [lineup, events, stats] = await Promise.all([
    fetchAF(`/fixtures/lineups?fixture=${fixtureId}`).catch((e) => ({ _err: e.message })),
    fetchAF(`/fixtures/events?fixture=${fixtureId}`).catch((e) => ({ _err: e.message })),
    fetchAF(`/fixtures/statistics?fixture=${fixtureId}`).catch((e) => ({ _err: e.message })),
  ]);
  if (DRY_RUN) return { lineup, events, stats };

  if (!lineup._err) await prisma.apiFootballRawFixtureLineup.upsert({
    where: { fixtureId }, update: { payload: lineup, fetchedAt: new Date() },
    create: { fixtureId, leagueId, season, payload: lineup },
  });
  if (!events._err) await prisma.apiFootballRawFixtureEvents.upsert({
    where: { fixtureId }, update: { payload: events, fetchedAt: new Date() },
    create: { fixtureId, leagueId, season, payload: events },
  });
  if (!stats._err) await prisma.apiFootballRawFixtureStatistics.upsert({
    where: { fixtureId }, update: { payload: stats, fetchedAt: new Date() },
    create: { fixtureId, leagueId, season, payload: stats },
  });
  return { lineup, events, stats };
}

async function projectFixtureToGame(game, raw, lookups) {
  const { players, teamApiToIds } = lookups;
  const findPlayer = (apiPlayerId) => {
    if (!apiPlayerId) return null;
    for (const tId of [game.homeTeamId, game.awayTeamId]) {
      const p = players.get(`${apiPlayerId}|${tId}`);
      if (p) return p;
    }
    // Fall back to any teamId
    for (const [key, val] of players.entries()) {
      if (key.startsWith(`${apiPlayerId}|`)) return val;
    }
    return null;
  };

  // Wipe existing canonical rows for this game so we reset cleanly
  await prisma.gameEvent.deleteMany({ where: { gameId: game.id } });
  await prisma.gameLineupEntry.deleteMany({ where: { gameId: game.id } });

  // Lineups
  const lineupResp = raw.lineup?.response || [];
  for (const teamLineup of lineupResp) {
    const apiTeamId = teamLineup.team?.id;
    const sideTeamId = (teamApiToIds.get(apiTeamId) || []).find((id) => id === game.homeTeamId || id === game.awayTeamId)
                      || (apiTeamId === lineupResp[0].team?.id ? game.homeTeamId : game.awayTeamId);
    const startXi = teamLineup.startXI || [];
    const subs = teamLineup.substitutes || [];
    const allEntries = [...startXi.map((p) => ({ ...p, role: 'STARTER' })), ...subs.map((p) => ({ ...p, role: 'SUBSTITUTE' }))];
    for (const entry of allEntries) {
      const playerInfo = entry.player || {};
      const playerId = findPlayer(playerInfo.id);
      if (!playerId) continue;
      await prisma.gameLineupEntry.create({
        data: {
          gameId: game.id, teamId: sideTeamId, playerId, role: entry.role,
          jerseyNumber: playerInfo.number ?? null, positionName: playerInfo.pos ?? null,
        },
      }).catch((e) => console.error(`    LINEUP err: ${e.message?.split('\n').slice(0, 6).join(' | ')}`));
    }
  }

  // Events
  const evResp = raw.events?.response || [];
  for (const ev of evResp) {
    const evType = mapEventType(ev.type, ev.detail);
    if (!evType) continue;
    const apiTeamId = ev.team?.id;
    const teamId = (teamApiToIds.get(apiTeamId) || []).find((id) => id === game.homeTeamId || id === game.awayTeamId);
    if (!teamId) continue;
    const playerId = findPlayer(ev.player?.id);
    const relatedPlayerId = findPlayer(ev.assist?.id);
    if (!playerId) continue;

    const sideTag = teamId === game.homeTeamId ? 'home' : 'away';
    if (ev.type === 'subst') {
      // create both IN and OUT
      const subInPlayer = findPlayer(ev.assist?.id) || playerId;
      const subOutPlayer = playerId;
      await prisma.gameEvent.create({
        data: { gameId: game.id, team: sideTag, teamId, playerId: subInPlayer, type: 'SUBSTITUTION_IN', minute: ev.time?.elapsed ?? 0, extraMinute: ev.time?.extra ?? null, relatedPlayerId: subOutPlayer },
      }).catch((e) => console.error(`    SUB_IN err: ${e.message?.split('\n')[0]}`));
      await prisma.gameEvent.create({
        data: { gameId: game.id, team: sideTag, teamId, playerId: subOutPlayer, type: 'SUBSTITUTION_OUT', minute: ev.time?.elapsed ?? 0, extraMinute: ev.time?.extra ?? null, relatedPlayerId: subInPlayer },
      }).catch((e) => console.error(`    SUB_OUT err: ${e.message?.split('\n')[0]}`));
    } else {
      await prisma.gameEvent.create({
        data: { gameId: game.id, team: sideTag, teamId, playerId, type: evType, minute: ev.time?.elapsed ?? 0, extraMinute: ev.time?.extra ?? null, relatedPlayerId: relatedPlayerId || null },
      }).catch((e) => console.error(`    ${evType} err: ${e.message?.split('\n')[0]}`));
    }
  }

  // Statistics
  const stResp = raw.stats?.response || [];
  if (stResp.length === 2) {
    const homeStats = stResp.find((r) => r.team?.id && (teamApiToIds.get(r.team.id) || []).includes(game.homeTeamId)) || stResp[0];
    const awayStats = stResp.find((r) => r !== homeStats) || stResp[1];
    const num = (statBlock, key) => {
      const found = (statBlock?.statistics || []).find((s) => s.type === key);
      if (!found) return null;
      const v = found.value;
      if (typeof v === 'string' && v.endsWith('%')) return parseInt(v, 10);
      return typeof v === 'number' ? v : null;
    };
    const data = {
      homeShotsTotal: num(homeStats, 'Total Shots'),
      awayShotsTotal: num(awayStats, 'Total Shots'),
      homeShotsOnTarget: num(homeStats, 'Shots on Goal'),
      awayShotsOnTarget: num(awayStats, 'Shots on Goal'),
      homeCorners: num(homeStats, 'Corner Kicks'),
      awayCorners: num(awayStats, 'Corner Kicks'),
      homeFouls: num(homeStats, 'Fouls'),
      awayFouls: num(awayStats, 'Fouls'),
      homeOffsides: num(homeStats, 'Offsides'),
      awayOffsides: num(awayStats, 'Offsides'),
      homeYellowCards: num(homeStats, 'Yellow Cards'),
      awayYellowCards: num(awayStats, 'Yellow Cards'),
      homeRedCards: num(homeStats, 'Red Cards'),
      awayRedCards: num(awayStats, 'Red Cards'),
      homeTeamPossession: num(homeStats, 'Ball Possession'),
      awayTeamPossession: num(awayStats, 'Ball Possession'),
    };
    await prisma.gameStatistics.upsert({
      where: { gameId: game.id }, update: data, create: { gameId: game.id, ...data },
    });
  }
}

async function buildLookups() {
  const players = new Map();
  const playersList = await prisma.player.findMany({ where: { apiFootballId: { not: null } }, select: { id: true, apiFootballId: true, teamId: true } });
  for (const p of playersList) players.set(`${p.apiFootballId}|${p.teamId}`, p.id);
  const teamApiToIds = new Map();
  const teams = await prisma.team.findMany({ where: { apiFootballId: { not: null } }, select: { id: true, apiFootballId: true } });
  for (const t of teams) {
    if (!teamApiToIds.has(t.apiFootballId)) teamApiToIds.set(t.apiFootballId, []);
    teamApiToIds.get(t.apiFootballId).push(t.id);
  }
  return { players, teamApiToIds };
}

async function main() {
  console.log(`\n=== matchday-update — date=${DATE} league=${LEAGUE}${DRY_RUN ? ' (DRY RUN)' : ''} ===\n`);

  const games = await findGamesOnDate(DATE, LEAGUE);
  console.log(`Found ${games.length} game(s) with apiFootballId on ${DATE}`);
  for (const g of games) {
    console.log(`  • ${g.dateTime.toISOString().slice(11, 16)} ${g.homeTeam.nameHe} vs ${g.awayTeam.nameHe} (af=${g.apiFootballId} fs=${g.footyStatsId || '—'})`);
  }
  if (games.length === 0) { await prisma.$disconnect(); return; }

  const lookups = await buildLookups();

  // Resolve season+league for raw upserts (use the first existing raw row for these IDs to figure out season)
  const seasonByGame = new Map();
  for (const g of games) {
    const existing = await prisma.apiFootballRawFixtureLineup.findUnique({ where: { fixtureId: g.apiFootballId } }).catch(() => null);
    if (existing) seasonByGame.set(g.apiFootballId, { leagueId: existing.leagueId, season: existing.season });
    else seasonByGame.set(g.apiFootballId, { leagueId: LEAGUE_MAP[LEAGUE] || 383, season: new Date(g.dateTime).getFullYear() });
  }

  // 1. API-Football refresh + project
  if (!SKIP_AF) {
    if (!API_KEY) { console.error('API_FOOTBALL_KEY missing — skipping AF refresh'); }
    else {
      console.log(`\n→ Refreshing API-Football data...`);
      // First pass: pull the full canonical Game row (with refereeHe etc.) so
      // refreshFixtureMetadata can decide whether to fill empty fields.
      const fullGames = !DRY_RUN
        ? await prisma.game.findMany({
            where: { id: { in: games.map((g) => g.id) } },
            select: { id: true, apiFootballId: true, refereeHe: true, refereeEn: true, venueNameHe: true, venueNameEn: true },
          })
        : [];
      const fullById = new Map(fullGames.map((g) => [g.id, g]));

      for (const g of games) {
        const seasonMeta = seasonByGame.get(g.apiFootballId);
        try {
          // Fixture metadata (referee, venue, status, elapsed)
          if (!DRY_RUN) {
            const fixtureMeta = await refreshFixtureMetadata(fullById.get(g.id) || g);
            if (fixtureMeta.updated) console.log(`    → fixture meta updated: ${fixtureMeta.updated.join(', ')}`);
          }
          // Lineups + events + statistics + project to canonical
          const raw = await refreshRawApiFootball(g, seasonMeta.leagueId, seasonMeta.season);
          if (!DRY_RUN) await projectFixtureToGame(g, raw, lookups);
          console.log(`  ✓ ${g.apiFootballId} ${g.homeTeam.nameHe} vs ${g.awayTeam.nameHe}`);
        } catch (e) {
          console.error(`  ✗ ${g.apiFootballId}: ${e.message}`);
        }
      }
    }
  } else { console.log('\n(skipping API-Football refresh)'); }

  // 2. FootyStats scrape (per-match invocation, sequential to share browser session)
  if (!SKIP_FS && !DRY_RUN) {
    const matchIds = games.map((g) => g.footyStatsId).filter((x) => x);
    if (matchIds.length === 0) console.log(`\n(no FootyStats IDs — skipping scrape)`);
    else {
      console.log(`\n→ Scraping FootyStats for ${matchIds.length} match(es)...`);
      for (const id of matchIds) {
        const cmd = ['scripts/dump-footystats-scrape.js', '--refresh', '--match', String(id)];
        if (HEADFUL) cmd.push('--headful');
        const result = spawnSync('node', cmd, { stdio: 'inherit' });
        if (result.status !== 0) console.error(`  ✗ scrape failed for match ${id}`);
      }
    }
  } else if (SKIP_FS) console.log('\n(skipping FootyStats scrape)');

  // 3. IFA refresh — scrape ONLY the matchday's specific round, not the whole season.
  //    Find the round number from the matchday's games (e.g. 'Championship Group - 32'
  //    → round 32). Pass --from N --to N to scrape-ifa-full.js so it targets that round.
  //    Idempotent: upserts by IFA game id.
  if (!SKIP_IFA && !DRY_RUN) {
    const ifaLeagueId = IFA_LEAGUE_MAP[LEAGUE];
    if (!ifaLeagueId) {
      console.log(`\n(no IFA league mapping for "${LEAGUE}" — skipping)`);
    } else {
      const ifaSeason = ifaSeasonIdFromDate(DATE);
      // Extract round numbers from games' roundNameEn (e.g. 'Championship Group - 32' → 32)
      const gameRecords = await prisma.game.findMany({
        where: { id: { in: games.map((g) => g.id) } },
        select: { roundNameEn: true },
      });
      const rounds = new Set();
      for (const gr of gameRecords) {
        const m = (gr.roundNameEn || '').match(/(\d+)\s*$/);
        if (m) rounds.add(parseInt(m[1], 10));
      }
      const roundList = Array.from(rounds);
      const from = roundList.length ? Math.min(...roundList) : 1;
      const to   = roundList.length ? Math.max(...roundList) : 36;
      console.log(`\n→ Refreshing IFA details (season=${ifaSeason}, league=${ifaLeagueId}, rounds=${from}-${to})...`);
      const result = spawnSync('node', [
        'scripts/scrape-ifa-full.js',
        '--mode', 'details',
        '--season', ifaSeason,
        '--league', ifaLeagueId,
        '--from', String(from),
        '--to',   String(to),
      ], { stdio: 'inherit' });
      if (result.status !== 0) console.error('  ✗ IFA refresh failed (continuing)');
    }
  } else if (SKIP_IFA) console.log('\n(skipping IFA refresh)');

  // 4. Walla refresh — scrape current season games + advanced stats
  //    Idempotent: upserts by Walla game id.
  if (!SKIP_WALLA && !DRY_RUN) {
    const wallaSeason = wallaSeasonFromDate(DATE);
    console.log(`\n→ Refreshing Walla games (season=${wallaSeason})...`);
    const result = spawnSync('node', [
      'scripts/scrape-walla-games.js',
      '--season', wallaSeason,
    ], { stdio: 'inherit' });
    if (result.status !== 0) console.error('  ✗ Walla games scrape failed (continuing)');
  } else if (SKIP_WALLA) console.log('\n(skipping Walla refresh)');

  // 5. Enrichment merge — Flashscore fills only the gaps API-Football leaves.
  if (!SKIP_MERGE && !DRY_RUN) {
    console.log(`\n→ Running Flashscore enrichment...`);
    spawnSync('node', ['scripts/rebuild/44-flashscore-enrichment.js', '--apply'], { stdio: 'inherit' });
  } else if (SKIP_MERGE) console.log('\n(skipping enrichment merge)');

  console.log('\n=== matchday-update done ===\n');
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
