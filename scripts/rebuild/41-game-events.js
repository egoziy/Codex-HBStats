#!/usr/bin/env node
/**
 * 41-game-events.js — Insert game events (goals, cards, subs) per fixture.
 *
 * Source: apifootball_raw_fixture_events (one row per fixture).
 *
 * Usage:
 *   node scripts/rebuild/41-game-events.js              # dry-run
 *   node scripts/rebuild/41-game-events.js --apply
 */

'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

function mapEventType(type, detail) {
  // API-Football: type ∈ {Goal, Card, subst, Var}
  // Goal detail: "Normal Goal", "Penalty", "Own Goal", "Missed Penalty"
  // Card detail: "Yellow Card", "Red Card"
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
  if (type === 'subst') return 'SUBSTITUTION_IN'; // we'll create both IN+OUT
  return null;
}

async function main() {
  console.log(`${APPLY ? '✓ Applying' : '[DRY RUN]'} game events build`);

  // Lookup: apiFootballId (game) → game.id, home/away teamId
  const games = await prisma.game.findMany({ where: { apiFootballId: { not: null } }, select: { id: true, apiFootballId: true, homeTeamId: true, awayTeamId: true } });
  const gameLookup = new Map(games.map((g) => [g.apiFootballId, g]));

  // Lookup: apiFootballId (player) + teamId → player.id
  const players = await prisma.player.findMany({ where: { apiFootballId: { not: null } }, select: { id: true, apiFootballId: true, teamId: true } });
  const playerLookup = new Map();
  for (const p of players) playerLookup.set(`${p.apiFootballId}|${p.teamId}`, p.id);

  // Lookup: apiFootballId (team) → set of teamId across all seasons (for cross-season player lookup)
  const teams = await prisma.team.findMany({ select: { id: true, apiFootballId: true } });
  const teamApiToIds = new Map();
  for (const t of teams) {
    if (!t.apiFootballId) continue;
    if (!teamApiToIds.has(t.apiFootballId)) teamApiToIds.set(t.apiFootballId, []);
    teamApiToIds.get(t.apiFootballId).push(t.id);
  }

  function findPlayer(apiPlayerId, apiTeamId, game) {
    if (!apiPlayerId) return null;
    // Prefer the player row whose teamId matches the game's home/away team (same season).
    const preferred = [game.homeTeamId, game.awayTeamId];
    for (const tId of preferred) {
      const pid = playerLookup.get(`${apiPlayerId}|${tId}`);
      if (pid) return pid;
    }
    // Fallback: any team with this apiFootballId
    for (const tId of (teamApiToIds.get(apiTeamId) || [])) {
      const pid = playerLookup.get(`${apiPlayerId}|${tId}`);
      if (pid) return pid;
    }
    return null;
  }

  const evRows = await prisma.apiFootballRawFixtureEvents.findMany({ select: { fixtureId: true, payload: true } });

  let totalEvents = 0, inserted = 0, skipped = 0, errors = 0;

  for (const row of evRows) {
    const game = gameLookup.get(row.fixtureId);
    if (!game) { skipped++; continue; }
    const events = row.payload?.response || [];

    if (APPLY) {
      // Wipe existing events for this game first (idempotent re-runs)
      await prisma.gameEvent.deleteMany({ where: { gameId: game.id } });
    }

    let order = 0;
    for (const ev of events) {
      const eventType = mapEventType(ev.type, ev.detail);
      if (!eventType) continue;

      const isHome = ev.team?.id === undefined ? false : ev.team.id === (await getApiHomeId(row.fixtureId));
      // ^ hmm this is async-in-sync; switch approach: derive isHome by comparing ev.team.id to the home apiFootballId.
      // We'll just look it up from gameLookup but we need API home/away ids — easier: compare ev.team.id directly.

      const teamId = ev.team?.id ? findTeamId(ev.team.id, game) : null;
      const playerId = findPlayer(ev.player?.id, ev.team?.id, game);
      const relatedPlayerId = findPlayer(ev.assist?.id, ev.team?.id, game);
      const minute = (ev.time?.elapsed ?? 0) + (ev.time?.extra ?? 0);

      totalEvents++;

      if (!APPLY) {
        if (totalEvents <= 6) console.log(`  fixture ${row.fixtureId}: ${eventType} @${minute}' team=${ev.team?.name} player=${ev.player?.name}`);
        continue;
      }

      try {
        await prisma.gameEvent.create({
          data: {
            gameId: game.id,
            minute,
            extraMinute: ev.time?.extra ?? null,
            type: eventType,
            team: teamId === game.homeTeamId ? 'home' : 'away',
            teamId,
            playerId: playerId || null,
            relatedPlayerId: relatedPlayerId || null,
            participantName: ev.player?.name || null,
            relatedParticipantName: ev.assist?.name || null,
            sortOrder: order++,
            notesEn: ev.detail || null,
          },
        });
        inserted++;

        // Also create SUBSTITUTION_OUT pair for substitutions
        if (eventType === 'SUBSTITUTION_IN' && ev.assist?.id) {
          await prisma.gameEvent.create({
            data: {
              gameId: game.id,
              minute,
              extraMinute: ev.time?.extra ?? null,
              type: 'SUBSTITUTION_OUT',
              team: teamId === game.homeTeamId ? 'home' : 'away',
              teamId,
              playerId: relatedPlayerId || null,
              relatedPlayerId: playerId || null,
              participantName: ev.assist?.name || null,
              relatedParticipantName: ev.player?.name || null,
              sortOrder: order++,
            },
          });
          inserted++;
        }
      } catch (e) {
        errors++;
      }
    }
  }

  console.log(`\n${APPLY ? '✓ Applied' : '[DRY RUN]'}: ${totalEvents} events processed${APPLY ? ` | inserted: ${inserted}, errors: ${errors}` : ''} | games skipped (no DB game): ${skipped}`);
  await prisma.$disconnect();

  // Helpers (defined here so closures work)
  function findTeamId(apiTeamId, game) {
    const candidates = teamApiToIds.get(apiTeamId) || [];
    if (candidates.includes(game.homeTeamId)) return game.homeTeamId;
    if (candidates.includes(game.awayTeamId)) return game.awayTeamId;
    return null;
  }
  async function getApiHomeId() { return null; } // stubbed; not used after refactor
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
