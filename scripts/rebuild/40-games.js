#!/usr/bin/env node
/**
 * 40-games.js — Build canonical games (one row per fixture).
 *
 * Sources:
 *   1. apifootball_raw_fixtures — primary, gives apiFootballId, score, status, referee, venue.
 *   2. IFA scraped_matches — enrich Hebrew referee + venue + half-time score.
 *
 * Usage:
 *   node scripts/rebuild/40-games.js              # dry-run
 *   node scripts/rebuild/40-games.js --apply
 */

'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

// API-Football league id → competition id
const LEAGUE_TO_COMP = {
  383: 'comp_liga_haal',
  382: 'comp_liga_leumit',
  384: 'comp_state_cup',
  385: 'comp_toto_cup_al',
  659: 'comp_super_cup',
};

function mapStatus(short) {
  // API-Football short codes
  if (['FT', 'AET', 'PEN'].includes(short)) return 'COMPLETED';
  if (['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'].includes(short)) return 'ONGOING';
  if (['CANC', 'ABD', 'AWD', 'WO'].includes(short)) return 'CANCELLED';
  return 'SCHEDULED';
}

async function main() {
  console.log(`${APPLY ? '✓ Applying' : '[DRY RUN]'} canonical games build`);

  // Index: apiTeamId+seasonId → DB team id
  const teams = await prisma.team.findMany({ select: { id: true, apiFootballId: true, seasonId: true } });
  const teamLookup = new Map();
  for (const t of teams) if (t.apiFootballId) teamLookup.set(`${t.apiFootballId}|${t.seasonId}`, t.id);

  const seasons = await prisma.season.findMany({ select: { id: true, year: true } });
  const seasonByYear = new Map(seasons.map((s) => [s.year, s.id]));

  // Walk fixtures
  const afRows = await prisma.apiFootballRawFixtures.findMany({ select: { leagueId: true, season: true, payload: true } });

  let total = 0, created = 0, missingTeam = 0, errors = 0;

  for (const row of afRows) {
    const compId = LEAGUE_TO_COMP[row.leagueId] || null;
    const seasonId = seasonByYear.get(row.season);
    if (!seasonId) continue;

    const fixtures = row.payload?.response || [];
    for (const f of fixtures) {
      const fx = f?.fixture;
      const teams_ = f?.teams;
      const goals = f?.goals;
      const score = f?.score;
      if (!fx || !teams_ || !teams_.home?.id || !teams_.away?.id) continue;

      const homeTeamId = teamLookup.get(`${teams_.home.id}|${seasonId}`);
      const awayTeamId = teamLookup.get(`${teams_.away.id}|${seasonId}`);
      if (!homeTeamId || !awayTeamId) { missingTeam++; continue; }

      total++;

      const data = {
        seasonId,
        competitionId: compId,
        homeTeamId,
        awayTeamId,
        apiFootballId: fx.id,
        dateTime: new Date(fx.date),
        timestamp: fx.timestamp || null,
        timezone: fx.timezone || null,
        status: mapStatus(fx.status?.short),
        statusShort: fx.status?.short || null,
        statusLong: fx.status?.long || null,
        elapsed: fx.status?.elapsed ?? null,
        homeScore: goals?.home ?? null,
        awayScore: goals?.away ?? null,
        homeScoreRegular: score?.fulltime?.home ?? null,
        awayScoreRegular: score?.fulltime?.away ?? null,
        homePenalty: score?.penalty?.home ?? null,
        awayPenalty: score?.penalty?.away ?? null,
        roundNameEn: f?.league?.round || null,
        venueNameEn: fx.venue?.name || null,
        refereeEn: fx.referee || null,
      };

      if (!APPLY) {
        if (total <= 5) console.log(`  ${data.dateTime.toISOString().slice(0,10)} ${teams_.home.name.slice(0,18).padEnd(18)} - ${teams_.away.name.slice(0,18).padEnd(18)} ${data.homeScore ?? '-'}-${data.awayScore ?? '-'}`);
        continue;
      }

      try {
        await prisma.game.upsert({
          where: { apiFootballId: fx.id },
          update: data,
          create: data,
        });
        created++;
      } catch (e) {
        errors++;
        if (errors <= 5) console.log(`  ✗ fixture ${fx.id}: ${e.message.slice(0, 120)}`);
      }
    }
  }

  console.log(`\n${APPLY ? '✓ Applied' : '[DRY RUN]'}: ${total} fixtures processed | missing team match: ${missingTeam}${APPLY ? ` | upserted: ${created}, errors: ${errors}` : ''}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
