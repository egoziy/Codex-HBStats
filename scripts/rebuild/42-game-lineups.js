#!/usr/bin/env node
/**
 * 42-game-lineups.js — Insert lineups (starters + subs + jersey + position).
 *
 * Source: apifootball_raw_fixture_lineup
 *
 * Usage:
 *   node scripts/rebuild/42-game-lineups.js              # dry-run
 *   node scripts/rebuild/42-game-lineups.js --apply
 */

'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(`${APPLY ? '✓ Applying' : '[DRY RUN]'} game lineups build`);

  const games = await prisma.game.findMany({ where: { apiFootballId: { not: null } }, select: { id: true, apiFootballId: true, homeTeamId: true, awayTeamId: true } });
  const gameLookup = new Map(games.map((g) => [g.apiFootballId, g]));

  const players = await prisma.player.findMany({ where: { apiFootballId: { not: null } }, select: { id: true, apiFootballId: true, teamId: true } });
  const playerLookup = new Map();
  for (const p of players) playerLookup.set(`${p.apiFootballId}|${p.teamId}`, p.id);

  const teams = await prisma.team.findMany({ select: { id: true, apiFootballId: true } });
  const teamApiToIds = new Map();
  for (const t of teams) { if (!t.apiFootballId) continue; if (!teamApiToIds.has(t.apiFootballId)) teamApiToIds.set(t.apiFootballId, []); teamApiToIds.get(t.apiFootballId).push(t.id); }

  function findPlayer(apiPlayerId, apiTeamId, game) {
    if (!apiPlayerId) return null;
    // Prefer same-season team (game's home or away)
    for (const tId of [game.homeTeamId, game.awayTeamId]) {
      const pid = playerLookup.get(`${apiPlayerId}|${tId}`);
      if (pid) return pid;
    }
    for (const tId of (teamApiToIds.get(apiTeamId) || [])) {
      const pid = playerLookup.get(`${apiPlayerId}|${tId}`);
      if (pid) return pid;
    }
    return null;
  }
  function findGameTeamId(apiTeamId, game) {
    const candidates = teamApiToIds.get(apiTeamId) || [];
    if (candidates.includes(game.homeTeamId)) return game.homeTeamId;
    if (candidates.includes(game.awayTeamId)) return game.awayTeamId;
    return null;
  }

  const lineupRows = await prisma.apiFootballRawFixtureLineup.findMany({ select: { fixtureId: true, payload: true } });

  let totalEntries = 0, inserted = 0, errors = 0;

  for (const row of lineupRows) {
    const game = gameLookup.get(row.fixtureId);
    if (!game) continue;
    const teamsLineups = row.payload?.response || [];

    if (APPLY) await prisma.gameLineupEntry.deleteMany({ where: { gameId: game.id } });

    for (const teamLineup of teamsLineups) {
      const apiTeamId = teamLineup?.team?.id;
      const teamId = findGameTeamId(apiTeamId, game);
      if (!teamId) continue;

      const formation = teamLineup?.formation || null;

      // Starters
      for (const entry of (teamLineup?.startXI || [])) {
        const p = entry?.player;
        if (!p) continue;
        const playerId = findPlayer(p.id, apiTeamId, game);
        totalEntries++;
        if (!APPLY) continue;
        try {
          await prisma.gameLineupEntry.create({
            data: {
              gameId: game.id, teamId,
              role: 'STARTER', participantType: 'PLAYER',
              playerId: playerId || null,
              formation, jerseyNumber: p.number || null,
              positionName: p.pos || null, positionGrid: p.grid || null,
              participantName: p.name || null,
            },
          });
          inserted++;
        } catch (e) { errors++; }
      }

      // Substitutes
      for (const entry of (teamLineup?.substitutes || [])) {
        const p = entry?.player;
        if (!p) continue;
        const playerId = findPlayer(p.id, apiTeamId, game);
        totalEntries++;
        if (!APPLY) continue;
        try {
          await prisma.gameLineupEntry.create({
            data: {
              gameId: game.id, teamId,
              role: 'SUBSTITUTE', participantType: 'PLAYER',
              playerId: playerId || null,
              formation, jerseyNumber: p.number || null,
              positionName: p.pos || null,
              participantName: p.name || null,
            },
          });
          inserted++;
        } catch (e) { errors++; }
      }

      // Coach
      const coach = teamLineup?.coach;
      if (coach?.name) {
        totalEntries++;
        if (APPLY) {
          try {
            await prisma.gameLineupEntry.create({
              data: {
                gameId: game.id, teamId,
                role: 'COACH', participantType: 'COACH',
                participantName: coach.name,
                formation,
              },
            });
            inserted++;
          } catch (e) { errors++; }
        }
      }
    }
  }

  console.log(`\n${APPLY ? '✓ Applied' : '[DRY RUN]'}: ${totalEntries} lineup entries${APPLY ? ` | inserted: ${inserted}, errors: ${errors}` : ''}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
