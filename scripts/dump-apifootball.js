#!/usr/bin/env node
/**
 * scripts/dump-apifootball.js
 *
 * Dumps API-Football data to local DB + JSON cache.
 *   - Phase A (full):     2024 + 2025 seasons → teams, fixtures, standings, players,
 *                         lineups, events, statistics per fixture.
 *   - Phase B (listings): 2016-2023 → teams, fixtures, standings, players, lineups only
 *                         (events/stats come from FootyStats).
 *
 * Resumable: skips DB rows that already exist.
 *
 * Usage:
 *   node scripts/dump-apifootball.js                # full dump
 *   node scripts/dump-apifootball.js --league 383   # IPL only
 *   node scripts/dump-apifootball.js --season 2025  # one season only
 *   node scripts/dump-apifootball.js --listings-only
 */

'use strict';

const fs = require('fs');
const path = require('path');

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
if (!API_KEY) { console.error('API_FOOTBALL_KEY missing from .env'); process.exit(1); }

const BASE_URL = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';
const OUT_DIR = path.resolve(__dirname, '..', 'data', 'apifootball');
const RATE_DELAY_MS = 150;       // ~6.6 req/sec — well under Ultra plan's 450/min
const MAX_RETRIES = 5;
const RETRY_BASE_MS = 8000;

// Israeli leagues we track (skipping Liga Alef per user decision).
// Full dump everywhere: lineups + events + statistics for every fixture.
const LEAGUES = [
  { id: 383, key: 'ipl',       seasonsFull: [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025], seasonsListings: [] },
  { id: 382, key: 'leumit',    seasonsFull: [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025], seasonsListings: [] },
  { id: 384, key: 'stateCup',  seasonsFull: [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025], seasonsListings: [] },
  { id: 385, key: 'totoCupAl', seasonsFull: [2019, 2020, 2021, 2022, 2023, 2024, 2025], seasonsListings: [] },
  { id: 659, key: 'superCup',  seasonsFull: [2020, 2021, 2022, 2023, 2024, 2025], seasonsListings: [] },
];

const args = process.argv.slice(2);
const ARG_LEAGUE  = (() => { const i = args.indexOf('--league'); return i >= 0 ? Number(args[i + 1]) : null; })();
const ARG_SEASON  = (() => { const i = args.indexOf('--season'); return i >= 0 ? Number(args[i + 1]) : null; })();
const LISTINGS_ONLY = args.includes('--listings-only');

let lastRequestAt = 0;
let totalCalls = 0;
let cachedSkips = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pace() {
  const wait = Math.max(0, lastRequestAt + RATE_DELAY_MS - Date.now());
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

async function fetchJson(urlPath, attempt = 0) {
  await pace();
  const url = `${BASE_URL}${urlPath}`;
  totalCalls++;
  try {
    const res = await fetch(url, {
      headers: { 'x-rapidapi-host': 'v3.football.api-sports.io', 'x-apisports-key': API_KEY },
      signal: AbortSignal.timeout(30000),
    });
    if (res.status === 429) {
      if (attempt >= MAX_RETRIES) throw new Error(`429 rate-limit after ${attempt} retries`);
      const wait = RETRY_BASE_MS * (attempt + 1);
      console.log(`  ⚠ 429 rate-limit, sleeping ${wait}ms`);
      await sleep(wait);
      return fetchJson(urlPath, attempt + 1);
    }
    const txt = await res.text();
    let payload;
    try { payload = JSON.parse(txt); } catch { throw new Error(`Non-JSON (${res.status}): ${txt.slice(0,200)}`); }
    // API-Football returns errors at payload.errors as an object {} or array.
    if (payload?.errors && (Array.isArray(payload.errors) ? payload.errors.length : Object.keys(payload.errors).length)) {
      const msg = JSON.stringify(payload.errors);
      if (/limit|quota/i.test(msg)) {
        if (attempt >= MAX_RETRIES) throw new Error(`quota error: ${msg}`);
        console.log(`  ⚠ quota error, sleeping 60s: ${msg}`);
        await sleep(60000);
        return fetchJson(urlPath, attempt + 1);
      }
      // For other errors (404, missing param) just return — caller handles empty result.
    }
    return payload;
  } catch (err) {
    if (attempt < 2 && /(timeout|ECONNRESET|fetch failed)/i.test(err.message || '')) {
      console.log(`  ⚠ ${err.message}, retrying`);
      await sleep(2000);
      return fetchJson(urlPath, attempt + 1);
    }
    throw err;
  }
}

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

async function diskCacheGet(filePath) {
  if (fs.existsSync(filePath)) {
    cachedSkips++;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  return null;
}

function diskCachePut(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(payload));
}

// ── Per league-season fetchers ─────────────────────────────────────
async function dumpLeagueSeason(leagueId, leagueKey, season, withMatchDetails) {
  const seasonDir = path.join(OUT_DIR, leagueKey, String(season));
  ensureDir(seasonDir);
  console.log(`\n  ━━━ ${leagueKey} ${season} (league=${leagueId}, full=${withMatchDetails}) ━━━`);

  // 1. Teams
  let teamsPayload = await diskCacheGet(path.join(seasonDir, 'teams.json'));
  if (!teamsPayload) {
    process.stdout.write(`    teams... `);
    teamsPayload = await fetchJson(`/teams?league=${leagueId}&season=${season}`);
    diskCachePut(path.join(seasonDir, 'teams.json'), teamsPayload);
    console.log(`✓ ${teamsPayload?.results || 0}`);
  }
  await prisma.apiFootballRawTeams.upsert({
    where: { leagueId_season: { leagueId, season } },
    update: { payload: teamsPayload, fetchedAt: new Date() },
    create: { leagueId, season, payload: teamsPayload },
  });

  // 2. Standings
  let standingsPayload = await diskCacheGet(path.join(seasonDir, 'standings.json'));
  if (!standingsPayload) {
    process.stdout.write(`    standings... `);
    standingsPayload = await fetchJson(`/standings?league=${leagueId}&season=${season}`);
    diskCachePut(path.join(seasonDir, 'standings.json'), standingsPayload);
    console.log(`✓`);
  }
  await prisma.apiFootballRawStandings.upsert({
    where: { leagueId_season: { leagueId, season } },
    update: { payload: standingsPayload, fetchedAt: new Date() },
    create: { leagueId, season, payload: standingsPayload },
  });

  // 3. Fixtures
  let fixturesPayload = await diskCacheGet(path.join(seasonDir, 'fixtures.json'));
  if (!fixturesPayload) {
    process.stdout.write(`    fixtures... `);
    fixturesPayload = await fetchJson(`/fixtures?league=${leagueId}&season=${season}`);
    diskCachePut(path.join(seasonDir, 'fixtures.json'), fixturesPayload);
    console.log(`✓ ${fixturesPayload?.results || 0}`);
  }
  await prisma.apiFootballRawFixtures.upsert({
    where: { leagueId_season: { leagueId, season } },
    update: { payload: fixturesPayload, fetchedAt: new Date() },
    create: { leagueId, season, payload: fixturesPayload },
  });
  const fixtures = fixturesPayload?.response || [];

  // 4. Players (paginated)
  let playersPayload = await diskCacheGet(path.join(seasonDir, 'players.json'));
  if (!playersPayload) {
    const allResponse = [];
    let totalPages = 1;
    for (let page = 1; page <= totalPages; page++) {
      process.stdout.write(`    players p${page}... `);
      const p = await fetchJson(`/players?league=${leagueId}&season=${season}&page=${page}`);
      allResponse.push(...(p?.response || []));
      totalPages = p?.paging?.total || 1;
      console.log(`✓ +${p?.response?.length || 0}/${p?.paging?.total ? `${p?.paging?.total} pages` : '1 page'}`);
      if (page >= totalPages) break;
    }
    playersPayload = { response: allResponse };
    diskCachePut(path.join(seasonDir, 'players.json'), playersPayload);
  }
  await prisma.apiFootballRawPlayers.upsert({
    where: { leagueId_season: { leagueId, season } },
    update: { payload: playersPayload, fetchedAt: new Date() },
    create: { leagueId, season, payload: playersPayload },
  });

  // 5. Per-fixture details (lineups for ALL phases; events + stats only for full)
  if (!fixtures.length || LISTINGS_ONLY) {
    return;
  }

  const fixtureDir = path.join(seasonDir, 'fixtures');
  ensureDir(fixtureDir);
  let lDone = 0, lSkip = 0;

  for (const f of fixtures) {
    const fixtureId = f.fixture?.id;
    if (!fixtureId) continue;

    // 5a. Lineups (all phases)
    const lineupFile = path.join(fixtureDir, `${fixtureId}-lineup.json`);
    const lineupExisting = await prisma.apiFootballRawFixtureLineup.findUnique({ where: { fixtureId } }).catch(() => null);
    if (!lineupExisting) {
      let lineupPayload = await diskCacheGet(lineupFile);
      if (!lineupPayload) {
        lineupPayload = await fetchJson(`/fixtures/lineups?fixture=${fixtureId}`);
        diskCachePut(lineupFile, lineupPayload);
      }
      await prisma.apiFootballRawFixtureLineup.create({ data: { fixtureId, leagueId, season, payload: lineupPayload } }).catch(() => null);
      lDone++;
    } else { lSkip++; }

    if (withMatchDetails) {
      // 5b. Events
      const eventsFile = path.join(fixtureDir, `${fixtureId}-events.json`);
      const evExisting = await prisma.apiFootballRawFixtureEvents.findUnique({ where: { fixtureId } }).catch(() => null);
      if (!evExisting) {
        let evPayload = await diskCacheGet(eventsFile);
        if (!evPayload) {
          evPayload = await fetchJson(`/fixtures/events?fixture=${fixtureId}`);
          diskCachePut(eventsFile, evPayload);
        }
        await prisma.apiFootballRawFixtureEvents.create({ data: { fixtureId, leagueId, season, payload: evPayload } }).catch(() => null);
      }

      // 5c. Statistics
      const statsFile = path.join(fixtureDir, `${fixtureId}-stats.json`);
      const stExisting = await prisma.apiFootballRawFixtureStatistics.findUnique({ where: { fixtureId } }).catch(() => null);
      if (!stExisting) {
        let stPayload = await diskCacheGet(statsFile);
        if (!stPayload) {
          stPayload = await fetchJson(`/fixtures/statistics?fixture=${fixtureId}`);
          diskCachePut(statsFile, stPayload);
        }
        await prisma.apiFootballRawFixtureStatistics.create({ data: { fixtureId, leagueId, season, payload: stPayload } }).catch(() => null);
      }
    }

    if ((lDone + lSkip) % 25 === 0) {
      console.log(`    fixture details: ${lDone} fetched, ${lSkip} cached, ${fixtures.length - lDone - lSkip} left`);
    }
  }
  console.log(`    fixture details: ${lDone} fetched, ${lSkip} already cached (total ${fixtures.length})`);
}

async function main() {
  ensureDir(OUT_DIR);

  // Master league list (Israeli leagues)
  const llFile = path.join(OUT_DIR, 'league-list.json');
  let ll = await diskCacheGet(llFile);
  if (!ll) {
    console.log('Fetching Israeli leagues list...');
    ll = await fetchJson('/leagues?country=Israel');
    diskCachePut(llFile, ll);
    console.log(`  ✓ ${ll?.results || 0} leagues`);
  }
  const llExisting = await prisma.apiFootballRawLeagueList.findFirst();
  if (llExisting) await prisma.apiFootballRawLeagueList.update({ where: { id: llExisting.id }, data: { payload: ll, fetchedAt: new Date() } });
  else            await prisma.apiFootballRawLeagueList.create({ data: { payload: ll } });

  let count = 0;
  for (const lg of LEAGUES) {
    if (ARG_LEAGUE && lg.id !== ARG_LEAGUE) continue;
    const fullSeasons     = ARG_SEASON ? lg.seasonsFull.filter((s) => s === ARG_SEASON) : lg.seasonsFull;
    const listingsSeasons = ARG_SEASON ? lg.seasonsListings.filter((s) => s === ARG_SEASON) : lg.seasonsListings;

    for (const season of fullSeasons) {
      try { await dumpLeagueSeason(lg.id, lg.key, season, true); count++; }
      catch (err) { console.error(`  ✗ ${lg.key} ${season}: ${err.message}`); }
    }
    for (const season of listingsSeasons) {
      try { await dumpLeagueSeason(lg.id, lg.key, season, false); count++; }
      catch (err) { console.error(`  ✗ ${lg.key} ${season}: ${err.message}`); }
    }
  }

  console.log(`\n══════════════════════════════════════════`);
  console.log(`  Done. ${count} league-seasons, ${totalCalls} API calls, ${cachedSkips} skipped (already cached)`);
  console.log(`  Saved to: ${OUT_DIR} + Postgres tables apifootball_raw_*`);
  await prisma.$disconnect();
}

main().catch(async (err) => { console.error('FATAL:', err); await prisma.$disconnect(); process.exit(1); });
