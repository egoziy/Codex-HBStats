#!/usr/bin/env node
/**
 * scripts/dump-footystats.js
 *
 * Dumps EVERYTHING accessible via the FootyStats API to local disk as raw JSON.
 * Resumable: skips files that already exist on disk.
 *
 * Layout:
 *   data/footystats/
 *     league-list.json
 *     {leagueKey}/{seasonYear}/teams.json
 *     {leagueKey}/{seasonYear}/matches.json    (concatenation of all paginated pages)
 *     {leagueKey}/{seasonYear}/players.json    (paginated)
 *     {leagueKey}/{seasonYear}/referees.json
 *     {leagueKey}/{seasonYear}/season.json
 *     {leagueKey}/{seasonYear}/matches/{match_id}.json
 *
 * Usage:
 *   node scripts/dump-footystats.js                # dump everything
 *   node scripts/dump-footystats.js --league ipl   # one league
 *   node scripts/dump-footystats.js --no-matches   # skip per-match details (cheap mode)
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Tiny .env loader (avoids needing the `dotenv` npm package)
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

const API_KEY = process.env.FOOTYSTATS_API_KEY;
if (!API_KEY) { console.error('FOOTYSTATS_API_KEY missing from .env'); process.exit(1); }

const BASE_URL = 'https://api.football-data-api.com';
const OUT_DIR = path.resolve(__dirname, '..', 'data', 'footystats');
const RATE_DELAY_MS = 2500;       // safe rate (1800/hr → 2s, +500ms buffer)
const MAX_RETRIES = 5;
const RETRY_BASE_MS = 5000;

// CLI args
const args = process.argv.slice(2);
const ARG_LEAGUE = (() => { const i = args.indexOf('--league'); return i >= 0 ? args[i + 1] : null; })();
const SKIP_MATCHES = args.includes('--no-matches');

// FootyStats season IDs (copied from src/lib/footystats.ts)
const SEASON_IDS = {
  ipl: { 2013: 531, 2014: 530, 2015: 529, 2016: 528, 2017: 527, 2018: 1568, 2019: 2283, 2020: 4695, 2021: 6040, 2022: 7448, 2023: 9564, 2024: 12377, 2025: 16363 },
  leumit: { 2013: 536, 2014: 535, 2015: 534, 2016: 533, 2017: 532, 2018: 1751, 2019: 2722, 2020: 4694, 2021: 6028, 2022: 7451, 2023: 9566, 2024: 12406, 2025: 16356 },
  stateCup: { 2019: 4427, 2020: 5227, 2021: 6574, 2022: 8445, 2023: 11018, 2024: 13730, 2025: 15971 },
  ligatAlWomen: { 2019: 3604, 2020: 5287, 2021: 6763, 2022: 8081, 2023: 10153, 2024: 13208, 2025: 15515 },
  totoCupAl: { 2019: 3605, 2020: 4609, 2021: 6193, 2022: 8449, 2023: 9568, 2024: 12374, 2025: 15109 },
  totoCupLeumit: { 2021: 6483, 2022: 7456, 2023: 9563, 2024: 12375, 2025: 15534 },
  superCup: { 2021: 5954, 2022: 7670, 2023: 9608, 2024: 12373, 2025: 14807 },
  u19Cup: { 2020: 5933, 2021: 6761, 2022: 8572, 2023: 11027, 2024: 13614, 2025: 16594 },
  u19Elite: { 2021: 6436, 2022: 8714, 2023: 10056, 2024: 13231, 2025: 15554 },
  playOffs2nd: { 2020: 5871, 2021: 8555, 2022: 9495, 2023: 12041, 2024: 14753, 2025: 16968 },
  playOffs3rd: { 2022: 9494, 2023: 11954 },
  stateCupWomen: { 2022: 12267, 2023: 12268, 2024: 14041, 2025: 16595 },
};

// ── State ──────────────────────────────────────────────────────────────
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
  const sep = urlPath.includes('?') ? '&' : '?';
  const url = `${BASE_URL}${urlPath}${sep}key=${API_KEY}`;
  totalCalls++;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });

    if (res.status === 429) {
      if (attempt >= MAX_RETRIES) throw new Error(`429 rate-limit after ${attempt} retries`);
      const wait = RETRY_BASE_MS * (attempt + 1);
      console.log(`  ⚠ 429 rate-limit, sleeping ${wait}ms`);
      await sleep(wait);
      return fetchJson(urlPath, attempt + 1);
    }

    const txt = await res.text();
    let payload;
    try { payload = JSON.parse(txt); }
    catch { throw new Error(`Non-JSON response (status ${res.status}): ${txt.slice(0, 200)}`); }

    if (payload?.success === false && /limit/i.test(payload?.message || '')) {
      if (attempt >= MAX_RETRIES) throw new Error(`rate-limit message after ${attempt} retries`);
      console.log(`  ⚠ rate-limit msg, sleeping ${RETRY_BASE_MS * (attempt + 1)}ms`);
      await sleep(RETRY_BASE_MS * (attempt + 1));
      return fetchJson(urlPath, attempt + 1);
    }

    return { payload, raw: txt, status: res.status };
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

// dbWriters: map endpoint kind → function that upserts (leagueKey, year, seasonId, payload) into the right table.
const dbWriters = {
  season:    (k, y, sid, p) => prisma.footyStatsRawSeasonSummary.upsert({ where: { leagueKey_year_unique: { leagueKey: k, year: y } }, update: { seasonId: sid, payload: p, fetchedAt: new Date() }, create: { leagueKey: k, year: y, seasonId: sid, payload: p } }),
  teams:     (k, y, sid, p) => prisma.footyStatsRawTeams.upsert({         where: { leagueKey_year:       { leagueKey: k, year: y } }, update: { seasonId: sid, payload: p, fetchedAt: new Date() }, create: { leagueKey: k, year: y, seasonId: sid, payload: p } }),
  players:   (k, y, sid, p) => prisma.footyStatsRawPlayers.upsert({       where: { leagueKey_year:       { leagueKey: k, year: y } }, update: { seasonId: sid, payload: p, fetchedAt: new Date() }, create: { leagueKey: k, year: y, seasonId: sid, payload: p } }),
  referees:  (k, y, sid, p) => prisma.footyStatsRawReferees.upsert({      where: { leagueKey_year:       { leagueKey: k, year: y } }, update: { seasonId: sid, payload: p, fetchedAt: new Date() }, create: { leagueKey: k, year: y, seasonId: sid, payload: p } }),
  matchList: (k, y, sid, p) => prisma.footyStatsRawMatchList.upsert({     where: { leagueKey_year:       { leagueKey: k, year: y } }, update: { seasonId: sid, payload: p, fetchedAt: new Date() }, create: { leagueKey: k, year: y, seasonId: sid, payload: p } }),
};

async function fetchAndSave(urlPath, filePath, label, dbKind, leagueKey, year, seasonId) {
  if (fs.existsSync(filePath)) {
    cachedSkips++;
    const cached = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (dbKind && dbWriters[dbKind]) {
      try { await dbWriters[dbKind](leagueKey, year, seasonId, cached); } catch (e) { console.log(`    [db-warn] ${e.message}`); }
    }
    return cached;
  }
  process.stdout.write(`    ${label}... `);
  const { payload, raw } = await fetchJson(urlPath);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, raw);
  if (dbKind && dbWriters[dbKind]) {
    try { await dbWriters[dbKind](leagueKey, year, seasonId, payload); } catch (e) { console.log(`    [db-warn] ${e.message}`); }
  }
  const remaining = payload?.metadata?.request_remaining;
  console.log(`✓${remaining != null ? ` (${remaining} left)` : ''}`);
  return payload;
}

// ── Main ───────────────────────────────────────────────────────────────
async function dumpLeagueSeason(leagueKey, year, seasonId) {
  const seasonDir = path.join(OUT_DIR, leagueKey, String(year));
  ensureDir(seasonDir);
  console.log(`\n  ━━━ ${leagueKey} ${year}/${year + 1} (season_id=${seasonId}) ━━━`);

  // Listings
  await fetchAndSave(`/league-season?season_id=${seasonId}`, path.join(seasonDir, 'season.json'), 'season summary', 'season', leagueKey, year, seasonId);
  await fetchAndSave(`/league-teams?season_id=${seasonId}`, path.join(seasonDir, 'teams.json'), 'teams', 'teams', leagueKey, year, seasonId);
  await fetchAndSave(`/league-referees?season_id=${seasonId}`, path.join(seasonDir, 'referees.json'), 'referees', 'referees', leagueKey, year, seasonId);

  // Players (paginated — fetch until empty page)
  const playersFile = path.join(seasonDir, 'players.json');
  let allPlayers = null;
  if (!fs.existsSync(playersFile)) {
    allPlayers = [];
    for (let page = 1; page <= 50; page++) {
      process.stdout.write(`    players p${page}... `);
      const { payload } = await fetchJson(`/league-players?season_id=${seasonId}&page=${page}`);
      const data = payload?.data || [];
      console.log(`✓ +${data.length}`);
      if (!data.length) break;
      allPlayers = allPlayers.concat(data);
      if (data.length < 50) break;
    }
    fs.writeFileSync(playersFile, JSON.stringify(allPlayers, null, 2));
  } else { cachedSkips++; allPlayers = JSON.parse(fs.readFileSync(playersFile, 'utf-8')); }
  try { await dbWriters.players(leagueKey, year, seasonId, allPlayers); } catch (e) { console.log(`    [db-warn players] ${e.message}`); }

  // Matches (paginated, then save per-match details)
  const matchesFile = path.join(seasonDir, 'matches.json');
  let allMatches = null;
  if (!fs.existsSync(matchesFile)) {
    allMatches = [];
    for (let page = 1; page <= 50; page++) {
      process.stdout.write(`    matches p${page}... `);
      const { payload } = await fetchJson(`/league-matches?season_id=${seasonId}&page=${page}`);
      const data = payload?.data || [];
      console.log(`✓ +${data.length}`);
      if (!data.length) break;
      allMatches = allMatches.concat(data);
      if (data.length < 200) break;
    }
    fs.writeFileSync(matchesFile, JSON.stringify(allMatches, null, 2));
  } else { cachedSkips++; allMatches = JSON.parse(fs.readFileSync(matchesFile, 'utf-8')); }
  try { await dbWriters.matchList(leagueKey, year, seasonId, allMatches); } catch (e) { console.log(`    [db-warn match-list] ${e.message}`); }

  // Per-match details
  if (!SKIP_MATCHES && allMatches.length) {
    const matchDir = path.join(seasonDir, 'matches');
    ensureDir(matchDir);
    let mDone = 0, mSkip = 0;
    for (const m of allMatches) {
      const mFile = path.join(matchDir, `${m.id}.json`);
      let payload;
      if (fs.existsSync(mFile)) {
        mSkip++;
        try { payload = JSON.parse(fs.readFileSync(mFile, 'utf-8')); } catch { payload = null; }
      } else {
        const r = await fetchJson(`/match?match_id=${m.id}`);
        payload = r.payload;
        fs.writeFileSync(mFile, r.raw);
        mDone++;
      }
      if (payload) {
        try {
          await prisma.footyStatsRawMatch.upsert({
            where: { matchId: m.id },
            update: { leagueKey, year, seasonId, payload, fetchedAt: new Date() },
            create: { matchId: m.id, leagueKey, year, seasonId, payload },
          });
        } catch (e) { console.log(`    [db-warn match ${m.id}] ${e.message}`); }
      }
      if ((mDone + mSkip) % 50 === 0) console.log(`    match details: ${mDone} fetched, ${mSkip} cached, ${allMatches.length - mDone - mSkip} left`);
    }
    console.log(`    match details: ${mDone} fetched, ${mSkip} already cached (total ${allMatches.length})`);
  }
}

async function main() {
  ensureDir(OUT_DIR);

  // 1. Master list of all leagues
  const leagueListFile = path.join(OUT_DIR, 'league-list.json');
  let leagueListPayload = null;
  if (!fs.existsSync(leagueListFile)) {
    console.log('Fetching master league list...');
    const { raw, payload } = await fetchJson('/league-list?chosen_leagues_only=false');
    fs.writeFileSync(leagueListFile, raw);
    leagueListPayload = payload;
    console.log(`  ✓ ${payload?.data?.length || 0} leagues, ${payload?.metadata?.request_remaining} requests remaining`);
  } else {
    console.log('league-list.json already cached');
    leagueListPayload = JSON.parse(fs.readFileSync(leagueListFile, 'utf-8'));
  }
  try {
    // Refresh the single league-list row each run (no unique key — empty table → insert; otherwise update id=1).
    const existing = await prisma.footyStatsRawLeagueList.findFirst();
    if (existing) await prisma.footyStatsRawLeagueList.update({ where: { id: existing.id }, data: { payload: leagueListPayload, fetchedAt: new Date() } });
    else          await prisma.footyStatsRawLeagueList.create({ data: { payload: leagueListPayload } });
  } catch (e) { console.log(`  [db-warn league-list] ${e.message}`); }

  // 2. Iterate leagues × seasons
  const leagues = ARG_LEAGUE ? [ARG_LEAGUE] : Object.keys(SEASON_IDS);
  let count = 0;
  for (const leagueKey of leagues) {
    const seasons = SEASON_IDS[leagueKey];
    if (!seasons) { console.log(`Unknown league: ${leagueKey}`); continue; }
    for (const [year, seasonId] of Object.entries(seasons)) {
      try {
        await dumpLeagueSeason(leagueKey, +year, seasonId);
        count++;
      } catch (err) {
        console.error(`  ✗ ${leagueKey} ${year}: ${err.message}`);
      }
    }
  }

  console.log(`\n══════════════════════════════════════════`);
  console.log(`  Done. ${count} league-seasons, ${totalCalls} API calls, ${cachedSkips} skipped (already cached)`);
  console.log(`  Saved to: ${OUT_DIR} + Postgres tables footystats_raw_*`);
  await prisma.$disconnect();
}

main().catch(async (err) => { console.error('FATAL:', err); await prisma.$disconnect(); process.exit(1); });
