#!/usr/bin/env node
/**
 * 50-standings.js — Build standings table per (competition, season).
 *
 * Source: apifootball_raw_standings
 *
 * Usage:
 *   node scripts/rebuild/50-standings.js              # dry-run
 *   node scripts/rebuild/50-standings.js --apply
 */

'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const LEAGUE_TO_COMP = {
  383: 'comp_liga_haal',
  382: 'comp_liga_leumit',
  384: 'comp_state_cup',
  385: 'comp_toto_cup_al',
  659: 'comp_super_cup',
};

async function main() {
  console.log(`${APPLY ? '✓ Applying' : '[DRY RUN]'} standings build`);

  const teams = await prisma.team.findMany({ select: { id: true, apiFootballId: true, seasonId: true } });
  const teamLookup = new Map();
  for (const t of teams) if (t.apiFootballId) teamLookup.set(`${t.apiFootballId}|${t.seasonId}`, t.id);

  const seasons = await prisma.season.findMany({ select: { id: true, year: true } });
  const seasonByYear = new Map(seasons.map((s) => [s.year, s.id]));

  const stRows = await prisma.apiFootballRawStandings.findMany({ select: { leagueId: true, season: true, payload: true } });

  let total = 0, created = 0, errors = 0;

  for (const row of stRows) {
    const compId = LEAGUE_TO_COMP[row.leagueId];
    const seasonId = seasonByYear.get(row.season);
    if (!compId || !seasonId) continue;

    const leagueData = row.payload?.response?.[0]?.league;
    const groups = leagueData?.standings || []; // 2D array: [[...]] or [[group1...], [group2...]]

    if (APPLY) {
      // Wipe existing standings for this comp+season
      await prisma.standing.deleteMany({ where: { competitionId: compId, seasonId } });
    }

    for (const group of groups) {
      for (const s of group) {
        const teamId = teamLookup.get(`${s.team?.id}|${seasonId}`);
        if (!teamId) continue;
        total++;

        if (!APPLY) {
          if (total <= 8) console.log(`  ${row.leagueId} ${row.season} #${s.rank} ${s.team?.name?.padEnd(28)} pts=${s.points}`);
          continue;
        }

        try {
          await prisma.standing.create({
            data: {
              seasonId,
              competitionId: compId,
              teamId,
              position: s.rank ?? 0,
              points: s.points ?? 0,
              played: s.all?.played ?? 0,
              wins: s.all?.win ?? 0,
              draws: s.all?.draw ?? 0,
              losses: s.all?.lose ?? 0,
              goalsFor: s.all?.goals?.for ?? 0,
              goalsAgainst: s.all?.goals?.against ?? 0,
              goalsDiff: s.goalsDiff ?? null,
              form: s.form || null,
              descriptionEn: s.description || null,
              groupNameEn: s.group || null,
              statusEn: s.status || null,
            },
          });
          created++;
        } catch (e) {
          errors++;
        }
      }
    }
  }

  console.log(`\n${APPLY ? '✓ Applied' : '[DRY RUN]'}: ${total} standings rows${APPLY ? ` | inserted: ${created}, errors: ${errors}` : ''}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
