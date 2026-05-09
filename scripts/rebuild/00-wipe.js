#!/usr/bin/env node
/**
 * 00-wipe.js — Truncate main DB tables, keeping raw archives + users intact.
 *
 * Tables WIPED:
 *   teams, players, games, game_events, game_lineup_entries, game_statistics,
 *   game_predictions, game_odds_snapshots, game_odds_values, game_head_to_head_entries,
 *   game_prediction_snapshots, live_game_snapshots,
 *   standings, team_statistics, player_statistics, competition_leaderboard_entries,
 *   player_injuries, player_sidelined_entries, player_transfers, player_trophies,
 *   referees, venues, team_coach_assignments, media_assets,
 *   competitions, competition_seasons (re-created from scratch),
 *   fetch_jobs, merge_operations, activity_logs (history can be wiped or kept — flag controls)
 *
 * Tables KEPT:
 *   - footystats_raw_*  (raw API archives)
 *   - apifootball_raw_* (raw API archives)
 *   - scraped_*         (IFA + Walla + Sport5 + RSSSF raw scrapes)
 *   - users, sessions, telegram_*, app settings (user-facing data)
 *   - seasons (re-used; we'll just upsert)
 *
 * Usage:
 *   node scripts/rebuild/00-wipe.js                # dry-run, lists what would be deleted
 *   node scripts/rebuild/00-wipe.js --confirm      # actually wipe
 *   node scripts/rebuild/00-wipe.js --confirm --keep-history   # don't wipe activity logs / fetch jobs
 */

'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const APPLY = process.argv.includes('--confirm');
const KEEP_HISTORY = process.argv.includes('--keep-history');

// Order matters: child tables before parents to avoid FK constraint failures.
const TABLES_TO_WIPE = [
  // Per-game children
  'game_events',
  'game_lineup_entries',
  'game_statistics',
  'game_predictions',
  'game_odds_snapshots',
  'game_odds_values',
  'game_head_to_head_entries',
  'game_prediction_snapshots',
  'live_game_snapshots',
  // Per-team / per-player tables
  'team_statistics',
  'player_statistics',
  'competition_leaderboard_entries',
  'standings',
  'player_injuries',
  'player_sidelined_entries',
  'player_transfers',
  'player_trophies',
  'team_coach_assignments',
  'media_assets',
  // Reference tables (parents but referenced by games)
  'games',
  'players',
  'teams',
  'referees',
  'venues',
  // Competition catalog (rebuild from scratch)
  'competition_seasons',
  'competitions',
];

const HISTORY_TABLES = ['activity_logs', 'fetch_jobs', 'merge_operations'];

async function main() {
  console.log(APPLY ? '\n⚠️  WIPING main DB tables (raw archives + users kept)...' : '\n[DRY RUN] showing planned wipes:');

  for (const t of TABLES_TO_WIPE) {
    const count = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM "${t}"`).catch(() => null);
    const c = count?.[0]?.c ? Number(count[0].c) : 0;
    console.log(`  ${APPLY ? 'WIPING' : 'would wipe'}: ${t} (${c} rows)`);
    if (APPLY && c > 0) {
      // TRUNCATE CASCADE in dependency order; CASCADE ensures FK consistency.
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${t}" CASCADE`);
    }
  }

  if (!KEEP_HISTORY) {
    for (const t of HISTORY_TABLES) {
      const count = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM "${t}"`).catch(() => null);
      const c = count?.[0]?.c ? Number(count[0].c) : 0;
      console.log(`  ${APPLY ? 'WIPING' : 'would wipe'}: ${t} (${c} rows)  [history]`);
      if (APPLY && c > 0) await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${t}" CASCADE`);
    }
  }

  if (!APPLY) {
    console.log('\n  Re-run with --confirm to actually wipe.');
  } else {
    console.log('\n  ✓ Wipe complete. Now run 10-seasons.js → 11-competitions.js → ... in order.');
  }
  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); prisma.$disconnect(); process.exit(1); });
