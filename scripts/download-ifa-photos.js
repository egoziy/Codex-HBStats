/**
 * Download IFA player photos locally and update photoUrl in DB
 *
 * Usage:
 *   node scripts/download-ifa-photos.js [--season "2024/2025"] [--limit 100] [--delay 200]
 *
 * Downloads from football.org.il/ImageServer and saves to public/uploads/players/{year}/{team-slug}/
 */

const { execSync } = require('child_process');
const { existsSync, mkdirSync } = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BASE_DIR = path.join(process.cwd(), 'public', 'uploads', 'players');

const args = process.argv.slice(2);
const getArg = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : null; };
const SEASON_FILTER = getArg('season') || null;
const LIMIT = parseInt(getArg('limit') || '0', 10);
const DELAY = parseInt(getArg('delay') || '150', 10);

function slugify(text) {
  return text
    .replace(/['"״׳]/g, '')
    .replace(/[^a-zA-Z0-9\u0590-\u05FF]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function englishSlug(text) {
  // Transliterate common Hebrew team names to English slugs
  const map = {
    'מכבי תל אביב': 'maccabi-tel-aviv', 'הפועל באר שבע': 'hapoel-beer-sheva',
    'מכבי חיפה': 'maccabi-haifa', 'הפועל חיפה': 'hapoel-haifa',
    'בית"ר ירושלים': 'beitar-jerusalem', 'הפועל תל אביב': 'hapoel-tel-aviv',
    'מכבי נתניה': 'maccabi-netanya', 'בני סכנין': 'bnei-sakhnin',
    'הפועל ירושלים': 'hapoel-jerusalem', 'מכבי פתח תקווה': 'maccabi-petah-tikva',
    'הפועל פתח תקווה': 'hapoel-petah-tikva', 'מ.ס. אשדוד': 'ms-ashdod',
    'בני יהודה': 'bnei-yehuda', 'הפועל כפר סבא': 'hapoel-kfar-saba',
    'הפועל רעננה': 'hapoel-raanana', 'הפועל עכו': 'hapoel-acre',
    'עירוני קריית שמונה': 'ironi-kiryat-shmona', 'הפועל רמת גן': 'hapoel-ramat-gan',
    'סקציה נס ציונה': 'sektzia-nes-tziona', 'הפועל נוף הגליל': 'hapoel-nof-hagalil',
    'עירוני טבריה': 'ironi-tiberias', 'מכבי בני ריינה': 'maccabi-bnei-raina',
    'הפועל חדרה': 'hapoel-hadera', 'הפועל ראשון לציון': 'hapoel-rishon-lezion',
    'מכבי הרצליה': 'maccabi-herzliya', 'הפועל הרצליה': 'hapoel-herzliya',
    'מכבי קריית גת': 'maccabi-kiryat-gat', 'הפועל אום אל פאחם': 'hapoel-umm-al-fahm',
    'הפועל אשקלון': 'hapoel-ashkelon', 'הפועל עפולה': 'hapoel-afula',
    'בית"ר תל אביב': 'beitar-tel-aviv', 'הפועל בני לוד': 'hapoel-bnei-lod',
    'הפועל ניר רמת השרון': 'hapoel-nir-ramat-hasharon',
    'הפועל ק"ש': 'hapoel-kiryat-shmona', 'הפועל ב"ש': 'hapoel-beer-sheva',
    'מכבי ת"א': 'maccabi-tel-aviv', 'הפועל ת"א': 'hapoel-tel-aviv',
  };
  return map[text] || slugify(text);
}

function seasonYear(seasonStr) {
  // "2024/2025" → "2024"
  const m = seasonStr.match(/^(\d{4})/);
  return m ? m[1] : 'unknown';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   IFA Player Photo Downloader            ║');
  console.log('╚══════════════════════════════════════════╝');

  // Get players with IFA photo URLs that haven't been downloaded yet
  const where = {
    source: 'footballOrgIl',
    photoUrl: { startsWith: 'https://www.football.org.il/' },
  };
  if (SEASON_FILTER) {
    // Need to join through team
    const teams = await prisma.scrapedTeam.findMany({
      where: { source: 'footballOrgIl', season: SEASON_FILTER },
      select: { id: true },
    });
    where.teamId = { in: teams.map(t => t.id) };
  }

  let players = await prisma.scrapedPlayer.findMany({
    where,
    include: { team: { select: { nameHe: true, season: true } } },
    orderBy: { scrapedAt: 'desc' },
  });

  if (LIMIT > 0) players = players.slice(0, LIMIT);

  console.log(`Players to download: ${players.length}`);
  if (SEASON_FILTER) console.log(`Season filter: ${SEASON_FILTER}`);
  console.log(`Delay: ${DELAY}ms\n`);

  let downloaded = 0, skipped = 0, failed = 0;

  for (const player of players) {
    const teamName = player.team?.nameHe || 'unknown';
    const season = player.team?.season || 'unknown';
    const year = seasonYear(season);
    const teamSlug = englishSlug(teamName);
    const playerSlug = `ifa-${player.sourceId}`;

    const dir = path.join(BASE_DIR, year, teamSlug);
    const filename = `${playerSlug}.jpg`;
    const filepath = path.join(dir, filename);
    const publicPath = `/uploads/players/${year}/${teamSlug}/${filename}`;

    // Skip if already downloaded
    if (existsSync(filepath)) {
      // Just update DB if needed
      if (player.photoUrl !== publicPath) {
        await prisma.scrapedPlayer.update({ where: { id: player.id }, data: { photoUrl: publicPath } });
      }
      skipped++;
      continue;
    }

    // Create directory
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    // Download via curl
    try {
      const url = player.photoUrl;
      execSync(`curl -s --max-time 15 -H "User-Agent: ${UA}" -o "${filepath}" "${url}"`, {
        timeout: 20000,
      });

      // Check if file was actually downloaded (not empty/error page)
      const { statSync } = require('fs');
      const stats = statSync(filepath);
      if (stats.size < 500) {
        // Too small — probably an error or placeholder
        require('fs').unlinkSync(filepath);
        failed++;
        continue;
      }

      // Update DB with local path
      await prisma.scrapedPlayer.update({ where: { id: player.id }, data: { photoUrl: publicPath } });
      downloaded++;

      if (downloaded % 100 === 0) {
        console.log(`  → ${downloaded} downloaded, ${skipped} skipped, ${failed} failed`);
      }
    } catch (e) {
      failed++;
    }

    await sleep(DELAY);
  }

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║              Summary                     ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`  Downloaded: ${downloaded}`);
  console.log(`  Skipped (already local): ${skipped}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total: ${players.length}`);

  await prisma.$disconnect();
  console.log('\nDone!');
}

main().catch((err) => {
  console.error('FATAL:', err);
  prisma.$disconnect();
  process.exit(1);
});
