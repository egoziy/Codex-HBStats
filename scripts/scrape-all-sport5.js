/**
 * Full Sport5 Scraper — scrapes all Liga Ha'al teams and all player season stats.
 * Run: node scripts/scrape-all-sport5.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const https = require('https');

const SPORT5_BASE = 'https://www.sport5.co.il';
const SOURCE = 'sport5';
const DELAY_MS = 600;

const TEAMS = {
  1639: { nameHe: 'הפועל באר שבע', nameEn: 'Hapoel Beer Sheva' },
  192:  { nameHe: 'מכבי תל אביב', nameEn: 'Maccabi Tel Aviv' },
  191:  { nameHe: 'בית"ר ירושלים', nameEn: 'Beitar Jerusalem' },
  163:  { nameHe: 'מכבי חיפה', nameEn: 'Maccabi Haifa' },
  164:  { nameHe: 'הפועל תל אביב', nameEn: 'Hapoel Tel Aviv' },
  9749: { nameHe: 'הפועל ירושלים', nameEn: 'Hapoel Jerusalem' },
  1632: { nameHe: 'הפועל חיפה', nameEn: 'Hapoel Haifa' },
  198:  { nameHe: 'מ.ס. אשדוד', nameEn: 'Ashdod' },
  193:  { nameHe: 'מכבי נתניה', nameEn: 'Maccabi Netanya' },
  1641: { nameHe: 'מכבי בני ריינה', nameEn: 'Maccabi Bnei Raina' },
  197:  { nameHe: 'הפועל פתח תקווה', nameEn: 'Hapoel Petach Tikva' },
  195:  { nameHe: 'בני סכנין', nameEn: 'Bnei Sakhnin' },
  845:  { nameHe: 'עירוני קריית שמונה', nameEn: 'Hapoel Kiryat Shmona' },
  2973: { nameHe: 'עירוני טבריה', nameEn: 'Ironi Tiberias' },
};

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'he-IL,he;q=0.9',
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function scrapeTeam(folderId) {
  const info = TEAMS[folderId] || { nameHe: 'Unknown', nameEn: '' };
  const html = await fetchPage(`${SPORT5_BASE}/team.aspx?FolderID=${folderId}`);

  // Season detection
  const allSeasons = [...html.matchAll(/(?<!\d)(\d{4})\/(\d{4})(?!\d)/g)]
    .filter((m) => +m[1] >= 2000 && +m[2] >= 2000);
  const season = allSeasons.length > 0 ? allSeasons[0][0] : 'current';

  // Upsert team
  const team = await prisma.scrapedTeam.upsert({
    where: { source_sourceId_season: { source: SOURCE, sourceId: String(folderId), season } },
    update: { nameHe: info.nameHe, nameEn: info.nameEn, scrapedAt: new Date() },
    create: { source: SOURCE, sourceId: String(folderId), nameHe: info.nameHe, nameEn: info.nameEn, season },
  });

  // Extract players with names and slugs
  const nameMap = new Map();
  const nameRe = /\/Player\/\d+\/(\d+)\/[^"]+"\s*[^>]*>([^<]+)/g;
  let m;
  while ((m = nameRe.exec(html)) !== null) {
    if (!nameMap.has(m[1])) nameMap.set(m[1], m[2].trim());
  }

  const playerRe = /\/Player\/(\d+)\/(\d+)\/([^"\s]+)"/g;
  const seen = new Set();
  const players = [];
  while ((m = playerRe.exec(html)) !== null) {
    if (seen.has(m[2])) continue;
    seen.add(m[2]);
    const name = nameMap.get(m[2]) || decodeURIComponent(m[3]).replace(/-/g, ' ');
    const player = await prisma.scrapedPlayer.upsert({
      where: { source_sourceId_teamId: { source: SOURCE, sourceId: m[2], teamId: team.id } },
      update: { nameHe: name, scrapedAt: new Date() },
      create: { source: SOURCE, sourceId: m[2], nameHe: name, teamId: team.id },
    });
    players.push({ id: player.id, sourceId: m[2], teamFolderId: m[1], name, slug: m[3] });
  }

  // Standings
  const rowRe = /<tr[^>]*>\s*<td>(\d+)<\/td>\s*<td[^>]*>.*?FolderID=(\d+)[^>]*>([^<]+)<\/a><\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td[^>]*>(\d+):(\d+)<\/td>\s*<td>([^<]+)<\/td>\s*<td>(\d+)<\/td>/g;
  while ((m = rowRe.exec(html)) !== null) {
    await prisma.scrapedStanding.upsert({
      where: { source_season_leagueNameHe_position: { source: SOURCE, season, leagueNameHe: 'ליגת העל', position: +m[1] } },
      update: { teamNameHe: m[3].trim(), played: +m[4], wins: +m[5], draws: +m[6], losses: +m[7], goalsFor: +m[8], goalsAgainst: +m[9], points: +m[11], scrapedAt: new Date() },
      create: { source: SOURCE, season, leagueNameHe: 'ליגת העל', position: +m[1], teamNameHe: m[3].trim(), played: +m[4], wins: +m[5], draws: +m[6], losses: +m[7], goalsFor: +m[8], goalsAgainst: +m[9], points: +m[11] },
    });
  }

  return { team: info.nameHe, season, players };
}

async function scrapePlayer(player) {
  const url = `${SPORT5_BASE}/Player/${player.teamFolderId}/${player.sourceId}/${player.slug}`;
  const html = await fetchPage(url);

  const rowRe = /<tr>\s*<td>(\d{4}\/\d{2,4})<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>/g;
  let count = 0;
  let sm;
  while ((sm = rowRe.exec(html)) !== null) {
    await prisma.scrapedPlayerSeason.upsert({
      where: { source_season_playerId: { source: SOURCE, season: sm[1], playerId: player.id } },
      update: { appearances: +sm[2], starts: +sm[3], goals: +sm[4], subsIn: +sm[5], subsOut: +sm[6], yellowCards: +sm[7], redCards: +sm[8], scrapedAt: new Date() },
      create: { source: SOURCE, season: sm[1], playerId: player.id, appearances: +sm[2], starts: +sm[3], goals: +sm[4], subsIn: +sm[5], subsOut: +sm[6], yellowCards: +sm[7], redCards: +sm[8] },
    });
    count++;
  }
  return count;
}

async function main() {
  const startTime = Date.now();
  const folderIds = Object.keys(TEAMS).map(Number);
  let totalPlayers = 0;
  let totalSeasons = 0;
  let errors = 0;
  const allPlayers = [];

  console.log(`\n=== Sport5 Full Scrape — ${folderIds.length} teams ===\n`);

  // Phase 1: Scrape all team pages
  console.log('Phase 1: Team pages...');
  for (const folderId of folderIds) {
    try {
      const result = await scrapeTeam(folderId);
      totalPlayers += result.players.length;
      allPlayers.push(...result.players);
      console.log(`  ✓ ${result.team}: ${result.players.length} players (${result.season})`);
    } catch (e) {
      errors++;
      console.log(`  ✗ FolderID ${folderId}: ${e.message}`);
    }
    await sleep(DELAY_MS);
  }
  console.log(`\nPhase 1 done: ${totalPlayers} players from ${folderIds.length - errors} teams\n`);

  // Phase 2: Scrape all player pages
  console.log(`Phase 2: Player pages (${allPlayers.length} players)...`);
  let processed = 0;
  for (const player of allPlayers) {
    processed++;
    try {
      const seasons = await scrapePlayer(player);
      totalSeasons += seasons;
      if (processed % 20 === 0 || processed === allPlayers.length) {
        console.log(`  [${processed}/${allPlayers.length}] ${totalSeasons} season records so far`);
      }
    } catch (e) {
      errors++;
      // Silent — many players have encoding issues
    }
    await sleep(DELAY_MS);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n=== Done in ${elapsed}s ===`);
  console.log(`Teams: ${folderIds.length - errors}`);
  console.log(`Players: ${totalPlayers}`);
  console.log(`Season stats: ${totalSeasons}`);
  console.log(`Errors: ${errors}`);

  // DB totals
  const dbPlayers = await prisma.scrapedPlayer.count({ where: { source: SOURCE } });
  const dbSeasons = await prisma.scrapedPlayerSeason.count({ where: { source: SOURCE } });
  const dbStandings = await prisma.scrapedStanding.count({ where: { source: SOURCE } });
  console.log(`\nDB totals: ${dbPlayers} players, ${dbSeasons} season stats, ${dbStandings} standings`);

  await prisma.$disconnect();
}

main().catch(console.error);
