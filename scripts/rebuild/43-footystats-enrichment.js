#!/usr/bin/env node
/**
 * 43-footystats-enrichment.js — Phase 2: pull xG + advanced match stats from FootyStats.
 *
 * For each game in the DB, find the matching footystats_raw_match by (date + teams)
 * and copy: xG (home/away), possession, shots, shots on target, corners, fouls, etc.,
 * into game_statistics. Also tags the game with footyStatsId for future fast lookup.
 *
 * Usage:
 *   node scripts/rebuild/43-footystats-enrichment.js              # dry-run
 *   node scripts/rebuild/43-footystats-enrichment.js --apply
 */

'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

function dayKey(d) { return d ? new Date(d).toISOString().slice(0, 10) : null; }

async function main() {
  console.log(`${APPLY ? '✓ Applying' : '[DRY RUN]'} FootyStats enrichment`);

  // 1. Build (date, footyStats teamId) → game lookup. We'll match FS matches against DB games.
  // Since we don't have FS team IDs on DB teams (only API-Football), we match by date + teamName fuzzy.
  // Easiest: build a map (dayKey, footyStatsHomeId, footyStatsAwayId) directly from FS raw match payloads.

  // FootyStats raw_match contains a single match's full detail. The list endpoint (match_list)
  // gives all matches per league-season with home/away IDs. Use match_list to build day+teamIds index.

  // Step: load FS match_list per league-season → for each fixture, save {date, homeID, awayID, fsMatchId}
  // Index DB teams by their footyStatsId per season. Many DB teams have NO footyStatsId.
  // Plan B: use full-match payload which has homeName + awayName text. Match by (date, normalized homeName+awayName) to DB games.

  const dbGames = await prisma.game.findMany({
    select: { id: true, dateTime: true, homeTeam: { select: { nameEn: true, nameHe: true } }, awayTeam: { select: { nameEn: true, nameHe: true } } },
  });
  const gameByKey = new Map();
  for (const g of dbGames) {
    if (!g.dateTime) continue;
    const k = `${dayKey(g.dateTime)}|${g.homeTeam?.nameEn || ''}|${g.awayTeam?.nameEn || ''}`;
    gameByKey.set(k.toLowerCase(), g.id);
  }

  // Helper to normalise English names — strip "FC", trailing "FC" etc.
  function normEn(s) { return (s || '').replace(/\s*FC$/i, '').trim().toLowerCase(); }
  // Build a tolerant lookup: (date, homeNorm, awayNorm) → gameId
  const gameByLooseKey = new Map();
  for (const g of dbGames) {
    if (!g.dateTime) continue;
    const k = `${dayKey(g.dateTime)}|${normEn(g.homeTeam?.nameEn)}|${normEn(g.awayTeam?.nameEn)}`;
    gameByLooseKey.set(k, g.id);
  }

  // 2. Walk FS match details
  const fsMatches = await prisma.footyStatsRawMatch.findMany({ select: { matchId: true, payload: true } });
  console.log(`  FootyStats match details available: ${fsMatches.length}`);

  let matched = 0, statsUpserted = 0, fsLinked = 0, errors = 0;

  for (const fs of fsMatches) {
    const data = fs.payload?.data;
    if (!data) continue;
    const dt = data.date_unix ? new Date(data.date_unix * 1000) : null;
    if (!dt) continue;

    const homeName = data.home_name || data.homeName || data.team_a_name || '';
    const awayName = data.away_name || data.awayName || data.team_b_name || '';

    let gameId = gameByLooseKey.get(`${dayKey(dt)}|${normEn(homeName)}|${normEn(awayName)}`);
    if (!gameId) continue;
    matched++;

    if (!APPLY) {
      if (matched <= 5) console.log(`  match ${fs.matchId} → game ${gameId} (xG home=${data.team_a_xg}, away=${data.team_b_xg})`);
      continue;
    }

    try {
      // Set footyStatsId on the game (if not already set)
      await prisma.game.update({
        where: { id: gameId },
        data: { footyStatsId: fs.matchId },
      }).then(() => fsLinked++).catch(() => null);

      // Upsert game_statistics with xG + advanced stats
      const stats = {
        homeTeamPossession: data.team_a_possession ?? null,
        awayTeamPossession: data.team_b_possession ?? null,
        homeShotsOnTarget:  data.team_a_shotsOnTarget ?? null,
        awayShotsOnTarget:  data.team_b_shotsOnTarget ?? null,
        homeShotsTotal:     data.team_a_shots ?? null,
        awayShotsTotal:     data.team_b_shots ?? null,
        homeCorners:        data.team_a_corners ?? null,
        awayCorners:        data.team_b_corners ?? null,
        homeFouls:          data.team_a_fouls ?? null,
        awayFouls:          data.team_b_fouls ?? null,
        homeOffsides:       data.team_a_offsides ?? null,
        awayOffsides:       data.team_b_offsides ?? null,
        homeYellowCards:    data.team_a_yellow_cards ?? null,
        awayYellowCards:    data.team_b_yellow_cards ?? null,
        homeRedCards:       data.team_a_red_cards ?? null,
        awayRedCards:       data.team_b_red_cards ?? null,
        homeXg:             data.team_a_xg ?? null,
        awayXg:             data.team_b_xg ?? null,
      };
      await prisma.gameStatistics.upsert({
        where: { gameId },
        update: stats,
        create: { gameId, ...stats },
      });
      statsUpserted++;
    } catch (e) { errors++; }

    if (matched % 500 === 0) console.log(`  ...${matched} matched, ${statsUpserted} stats upserted`);
  }

  console.log(`\n${APPLY ? '✓ Applied' : '[DRY RUN]'}: ${matched} games matched, ${statsUpserted} stats rows, ${fsLinked} games tagged with footyStatsId, errors: ${errors}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
