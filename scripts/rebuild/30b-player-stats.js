#!/usr/bin/env node
/**
 * 30b-player-stats.js — Populate player_statistics from API-Football raw players.
 *
 * For each (player, league, season), parse the rich statistics block:
 *   games (rating, lineups, minutes, position, captain, appearances)
 *   goals/assists/cards/shots/passes/tackles/duels/fouls/dribbles/penalty/substitutes
 *
 * Usage:
 *   node scripts/rebuild/30b-player-stats.js              # dry-run
 *   node scripts/rebuild/30b-player-stats.js --apply
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
  console.log(`${APPLY ? '✓ Applying' : '[DRY RUN]'} player stats populator`);

  // Lookup: (apiFootballId, teamId) → player.id
  const players = await prisma.player.findMany({ where: { apiFootballId: { not: null } }, select: { id: true, apiFootballId: true, teamId: true } });
  const playerLookup = new Map();
  for (const p of players) playerLookup.set(`${p.apiFootballId}|${p.teamId}`, p.id);

  const teams = await prisma.team.findMany({ select: { id: true, apiFootballId: true, seasonId: true } });
  const teamLookup = new Map();
  for (const t of teams) if (t.apiFootballId) teamLookup.set(`${t.apiFootballId}|${t.seasonId}`, t.id);

  const seasons = await prisma.season.findMany({ select: { id: true, year: true } });
  const seasonByYear = new Map(seasons.map((s) => [s.year, s.id]));

  const rows = await prisma.apiFootballRawPlayers.findMany({ select: { leagueId: true, season: true, payload: true } });
  console.log(`  raw rows: ${rows.length}`);

  let total = 0, upserted = 0, skipped = 0;
  for (const row of rows) {
    const compId = LEAGUE_TO_COMP[row.leagueId];
    const seasonId = seasonByYear.get(row.season);
    if (!compId || !seasonId) continue;

    const items = row.payload?.response || [];
    for (const item of items) {
      const p = item?.player;
      const stats = (item?.statistics || []).find((s) => s.league?.id === row.leagueId && s.league?.season === row.season) || (item?.statistics || [])[0];
      if (!p || !stats) continue;

      const apiTeamId = stats.team?.id;
      const teamId = apiTeamId ? teamLookup.get(`${apiTeamId}|${seasonId}`) : null;
      if (!teamId) { skipped++; continue; }
      const playerId = playerLookup.get(`${p.id}|${teamId}`);
      if (!playerId) { skipped++; continue; }

      total++;

      const data = {
        playerId, seasonId, competitionId: compId,
        gamesPlayed:           stats.games?.number ?? 0,
        appearances:           stats.games?.appearences ?? null,
        starts:                stats.games?.lineups ?? 0,
        minutesPlayed:         stats.games?.minutes ?? 0,
        rating:                stats.games?.rating ? parseFloat(stats.games.rating) : null,
        position:              stats.games?.position ?? null,
        goals:                 stats.goals?.total ?? 0,
        assists:               stats.goals?.assists ?? 0,
        yellowCards:           stats.cards?.yellow ?? 0,
        redCards:              (stats.cards?.red ?? 0) + (stats.cards?.yellowred ?? 0),
        shots:                 stats.shots?.total ?? 0,
        shotsOnTarget:         stats.shots?.on ?? null,
        keyPasses:             stats.passes?.key ?? 0,
        passesTotal:           stats.passes?.total ?? null,
        passesAccuracy:        stats.passes?.accuracy ?? null,
        tacklesTotal:          stats.tackles?.total ?? null,
        tacklesBlocks:         stats.tackles?.blocks ?? null,
        tacklesInterceptions:  stats.tackles?.interceptions ?? null,
        duelsTotal:            stats.duels?.total ?? null,
        duelsWon:              stats.duels?.won ?? null,
        foulsCommitted:        stats.fouls?.committed ?? null,
        foulsDrawn:            stats.fouls?.drawn ?? null,
        dribblesAttempts:      stats.dribbles?.attempts ?? null,
        dribblesSuccess:       stats.dribbles?.success ?? null,
        substituteAppearances: stats.substitutes?.in ?? 0,
        timesSubbedOff:        stats.substitutes?.out ?? 0,
        additionalInfo:        { penalty: stats.penalty, captain: stats.games?.captain ?? false, sourceLeague: row.leagueId },
      };

      if (!APPLY) {
        if (total <= 3) console.log(`  ${row.leagueId} ${row.season} ${p.name}: ${data.gamesPlayed}g ${data.goals}/${data.assists} ${data.yellowCards}y rating=${data.rating}`);
        continue;
      }

      try {
        await prisma.playerStatistics.upsert({
          where: { playerId_seasonId_competitionId: { playerId, seasonId, competitionId: compId } },
          update: data, create: data,
        });
        upserted++;
      } catch (e) { skipped++; }
    }
  }

  console.log(`\n${APPLY ? '✓ Applied' : '[DRY RUN]'}: ${total} stats rows${APPLY ? ` | upserted: ${upserted}, errors: ${skipped}` : ''}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
