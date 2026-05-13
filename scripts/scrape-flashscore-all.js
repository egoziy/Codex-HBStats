/**
 * scrape-flashscore-all.js — orchestrate the full Phase 1 scrape for Ligat HaAl.
 *
 * Order:
 *   1. fixtures (discover every match in season)
 *   2. teams (every unique homeKey/awayKey + their squads)
 *   3. matches (per-match details for completed games)
 *   4. players (every player on a team's squad)
 *
 * Usage:
 *   node scripts/scrape-flashscore-all.js [--season 2025-2026] [--league-slug ligat-ha-al]
 *   node scripts/scrape-flashscore-all.js --skip-matches   # skip step 3
 *   node scripts/scrape-flashscore-all.js --skip-players   # skip step 4
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}

const SEASON = arg('season', '2025-2026');
const LEAGUE_SLUG = arg('league-slug', 'ligat-ha-al');

function run(script, args) {
  return new Promise((resolve, reject) => {
    const full = [path.join(__dirname, script), ...args];
    console.log(`\n▶ ${script} ${args.join(' ')}`);
    const child = spawn(process.execPath, full, { stdio: 'inherit' });
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`)));
  });
}

(async () => {
  const start = Date.now();
  console.log(`\n=== Flashscore Phase 1 orchestrator ===`);
  console.log(`  League: ${LEAGUE_SLUG}, Season: ${SEASON}\n`);

  // 1. Fixtures — discover the season's match list.
  await run('scrape-flashscore-fixtures.js', ['--league-slug', LEAGUE_SLUG, '--season', SEASON]);

  // 2. Teams — fetch overview + squad + transfers for every team we now know about.
  await run('scrape-flashscore-team.js', ['--season', SEASON, '--all-in-league']);

  // 3. Match details (events, stats, lineups) for completed games.
  if (!process.argv.includes('--skip-matches')) {
    await run('scrape-flashscore-match.js', ['--all-missing', '--limit', '500']);
  }

  // 4. Player profiles. Depends on squad data from step 2.
  if (!process.argv.includes('--skip-players')) {
    await run('scrape-flashscore-player.js', ['--all-in-league']);
  }

  const mins = ((Date.now() - start) / 60000).toFixed(1);
  console.log(`\n=== Done in ${mins} min ===\n`);
})().catch((e) => { console.error(e); process.exit(1); });
