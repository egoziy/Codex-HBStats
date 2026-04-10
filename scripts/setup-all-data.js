/**
 * Master Data Setup Script
 * Runs all scraping, merging, and normalization in the correct order.
 *
 * Usage:
 *   node scripts/setup-all-data.js              # Full setup (scrape + merge + normalize)
 *   node scripts/setup-all-data.js --merge-only  # Skip scraping, just merge existing scraped data
 *   node scripts/setup-all-data.js --quick        # Minimal: Walla standings + leaderboards only
 *
 * Prerequisites:
 *   - Database created and schema pushed (npx prisma db push)
 *   - Google Chrome installed (for Puppeteer scrapers)
 *   - API-Football data already fetched via Admin UI (for 2016+ seasons)
 */

const { execSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const mergeOnly = args.includes('--merge-only');
const quick = args.includes('--quick');

function run(label, command) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`▶ ${label}`);
  console.log('='.repeat(60));
  try {
    execSync(command, { cwd: path.resolve(__dirname, '..'), stdio: 'inherit', timeout: 600000 });
    console.log(`✓ ${label} — done`);
  } catch (e) {
    console.log(`✗ ${label} — failed: ${e.message}`);
  }
}

async function main() {
  const startTime = Date.now();
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║         HBStats — Master Data Setup                 ║');
  console.log(`║  Mode: ${quick ? 'QUICK' : mergeOnly ? 'MERGE ONLY' : 'FULL'}`.padEnd(55) + '║');
  console.log('╚══════════════════════════════════════════════════════╝');

  if (!mergeOnly) {
    // Phase 1: Scraping
    console.log('\n\n📡 Phase 1: Scraping external sources...\n');

    run('Walla: Standings + Leaderboards (ליגת העל + ליגה לאומית)',
      'node scripts/scrape-walla.js');

    run('Walla: Full Player Stats (goals, assists, cards, subs)',
      'node scripts/scrape-walla-player-stats.js');

    if (!quick) {
      run('Walla: Match Results (Puppeteer, ~30 min)',
        'node scripts/scrape-walla-games.js');

      run('Walla: Advanced Team Stats (Puppeteer)',
        'node scripts/scrape-walla-advanced-puppeteer.js');

      run('IFA: Liga Ha\'al standings',
        'node scripts/scrape-ifa.js --league 40 --from 2 --to 27');

      run('IFA: Liga Leumit standings',
        'node scripts/scrape-ifa.js --league 45 --from 2 --to 27');

      run('Sport5: Teams + Player Season Stats (~20 min)',
        'node scripts/scrape-all-sport5.js');
    }
  }

  // Phase 2: Merging
  console.log('\n\n🔄 Phase 2: Merging scraped data into main DB...\n');

  run('Merge Walla Standings → Season + Team + Standing',
    'node scripts/merge-walla-standings.js');

  if (!quick) {
    run('Merge Walla Games → Game',
      'node scripts/merge-walla-games.js');

    run('Merge Walla Leaderboards → CompetitionLeaderboardEntry',
      'node scripts/merge-walla-leaderboards.js');
  }

  run('Build Rosters from Leaderboards → Player + PlayerStatistics',
    'node scripts/build-rosters-from-leaderboards.js');

  // Phase 3: Normalization
  console.log('\n\n🔤 Phase 3: Normalization...\n');

  run('Transliterate Player Names to Hebrew',
    'node scripts/transliterate-players.js --all --apply');

  if (!quick) {
    run('Backfill Canonical Players (deduplicate)',
      'node scripts/backfill_canonical_players.js');
  }

  // Summary
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log('\n\n╔══════════════════════════════════════════════════════╗');
  console.log(`║  Setup complete in ${elapsed} seconds`.padEnd(55) + '║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // Show DB stats
  run('DB Summary', 'node -e "' +
    "const{PrismaClient}=require('@prisma/client');" +
    "const p=new PrismaClient();" +
    "(async()=>{" +
    "const s=await p.season.count();" +
    "const t=await p.team.count();" +
    "const st=await p.standing.count();" +
    "const g=await p.game.count();" +
    "const pl=await p.player.count();" +
    "const ps=await p.playerStatistics.count();" +
    "const lb=await p.competitionLeaderboardEntry.count();" +
    "console.log('Seasons:',s,'| Teams:',t,'| Standings:',st,'| Games:',g,'| Players:',pl,'| Stats:',ps,'| Leaderboards:',lb);" +
    "await p.$disconnect();" +
    "})();" +
    '"');
}

main().catch(console.error);
