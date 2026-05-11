#!/usr/bin/env node
/**
 * 34-detect-transfers.js — create Player rows for mid-season transfers.
 *
 * Problem: API-Football /players returns each player's INITIAL team for a season.
 * If a player transfers mid-season (e.g. Abu Rumi, J. East joining Hapoel BS in Jan 2026),
 * the destination team's squad query returns no rows for that player, even though events
 * and lineups already record him playing for the new team.
 *
 * Detection: for every (apiFootballId, eventTeamId, season) tuple appearing in game_events
 * or game_lineup_entries, ensure a Player row exists for (apiFootballId, eventTeamId).
 * If missing, clone the most-recent Player row for that apiFootballId and set teamId to
 * the destination team. Link via canonicalPlayerId so cross-season aggregation still works.
 *
 * Usage:
 *   node scripts/rebuild/34-detect-transfers.js               # dry-run (default: all seasons)
 *   node scripts/rebuild/34-detect-transfers.js --apply
 *   node scripts/rebuild/34-detect-transfers.js --season 2025/26 --apply
 */

'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const seasonIdx = process.argv.indexOf('--season');
const SEASON_FILTER = seasonIdx >= 0 ? process.argv[seasonIdx + 1] : null;

async function main() {
  console.log(`${APPLY ? '✓ Applying' : '[DRY RUN]'} mid-season transfer detection${SEASON_FILTER ? ` (season=${SEASON_FILTER})` : ''}`);

  const seasonClause = SEASON_FILTER
    ? `AND s.name = '${SEASON_FILTER.replace(/'/g, "''")}'`
    : '';

  const missing = await prisma.$queryRawUnsafe(`
    WITH evt_pairs AS (
      SELECT DISTINCT p."apiFootballId" AS api_id, ge."teamId" AS dest_team_id
      FROM game_events ge
      JOIN games g ON g.id = ge."gameId"
      JOIN seasons s ON s.id = g."seasonId"
      JOIN players p ON p.id = ge."playerId"
      WHERE p."apiFootballId" IS NOT NULL ${seasonClause}
      UNION
      SELECT DISTINCT p."apiFootballId" AS api_id, gle."teamId" AS dest_team_id
      FROM game_lineup_entries gle
      JOIN games g ON g.id = gle."gameId"
      JOIN seasons s ON s.id = g."seasonId"
      JOIN players p ON p.id = gle."playerId"
      WHERE p."apiFootballId" IS NOT NULL ${seasonClause}
    )
    SELECT ep.api_id, ep.dest_team_id, t."nameHe" AS dest_team_he, t."nameEn" AS dest_team_en, t."seasonId" AS dest_season_id
    FROM evt_pairs ep
    JOIN teams t ON t.id = ep.dest_team_id
    WHERE NOT EXISTS (
      SELECT 1 FROM players p2
      WHERE p2."apiFootballId" = ep.api_id AND p2."teamId" = ep.dest_team_id
    );
  `);

  console.log(`  ${missing.length} missing (apiFootballId, teamId) pairs`);
  if (missing.length === 0) {
    await prisma.$disconnect();
    return;
  }

  let created = 0, skipped = 0, errors = 0, eventsRebound = 0, lineupsRebound = 0;

  for (const row of missing) {
    const apiId = Number(row.api_id);
    const destTeamId = row.dest_team_id;

    // Pick the best source Player row for this apiFootballId — prefer one with the most non-null fields,
    // tiebreak by most recent (largest createdAt).
    const candidates = await prisma.player.findMany({
      where: { apiFootballId: apiId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
    if (candidates.length === 0) { skipped++; continue; }

    const score = (p) => [
      p.nameHe, p.nameEn, p.firstNameEn, p.lastNameEn, p.firstNameHe, p.lastNameHe,
      p.photoUrl, p.birthDate, p.nationalityEn, p.nationalityHe, p.position, p.height, p.weight,
    ].filter((v) => v != null && v !== '').length;
    const src = candidates.slice().sort((a, b) => score(b) - score(a))[0];

    const canonicalId = src.canonicalPlayerId || src.id;

    if (!APPLY) {
      console.log(`  + ${src.nameEn} (api=${apiId}) → ${row.dest_team_he || row.dest_team_en} [from ${src.id}]`);
      created++;
      continue;
    }

    try {
      const newPlayer = await prisma.player.create({
        data: {
          nameEn: src.nameEn,
          nameHe: src.nameHe,
          firstNameEn: src.firstNameEn,
          firstNameHe: src.firstNameHe,
          lastNameEn: src.lastNameEn,
          lastNameHe: src.lastNameHe,
          jerseyNumber: null, // unknown for new team
          photoUrl: src.photoUrl,
          position: src.position,
          birthDate: src.birthDate,
          nationalityEn: src.nationalityEn,
          nationalityHe: src.nationalityHe,
          age: src.age,
          height: src.height,
          weight: src.weight,
          birthCountryEn: src.birthCountryEn,
          birthCountryHe: src.birthCountryHe,
          birthPlaceEn: src.birthPlaceEn,
          birthPlaceHe: src.birthPlaceHe,
          apiFootballId: apiId,
          footyStatsId: src.footyStatsId,
          teamId: destTeamId,
          canonicalPlayerId: canonicalId,
        },
      });
      created++;

      // Promote canonical: ensure source rows for this player point at canonicalId
      if (!src.canonicalPlayerId) {
        await prisma.player.updateMany({
          where: { apiFootballId: apiId, canonicalPlayerId: null, id: { not: src.id } },
          data: { canonicalPlayerId: canonicalId },
        });
      }

      // Rebind events for this player on the destination team to the new Player row
      const eventUpdate = await prisma.gameEvent.updateMany({
        where: {
          teamId: destTeamId,
          player: { apiFootballId: apiId, NOT: { id: newPlayer.id } },
        },
        data: { playerId: newPlayer.id },
      });
      eventsRebound += eventUpdate.count;

      const lineupUpdate = await prisma.gameLineupEntry.updateMany({
        where: {
          teamId: destTeamId,
          player: { apiFootballId: apiId, NOT: { id: newPlayer.id } },
        },
        data: { playerId: newPlayer.id },
      });
      lineupsRebound += lineupUpdate.count;
    } catch (e) {
      errors++;
      console.error(`  ✗ api=${apiId} dest=${destTeamId}: ${e.message}`);
    }
  }

  console.log(`\n${APPLY ? '✓ Applied' : '[DRY RUN]'}: ${created} new Player rows, ${eventsRebound} events rebound, ${lineupsRebound} lineups rebound, ${skipped} skipped, ${errors} errors`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
