const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const https = require('https');

const SPORT5_BASE = 'https://www.sport5.co.il';
const SOURCE = 'sport5';

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'he-IL,he;q=0.9',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  const folderId = 1639;
  console.log('Scraping Beer Sheva (FolderID=' + folderId + ')...');

  const html = await fetchPage(SPORT5_BASE + '/team.aspx?FolderID=' + folderId);
  // Match year/year where both parts are >= 2000
  const allSeasons = [...html.matchAll(/(?<!\d)(\d{4})\/(\d{4})(?!\d)/g)].filter(m => +m[1] >= 2000 && +m[2] >= 2000);
  const season = allSeasons.length > 0 ? allSeasons[0][0] : 'current';
  console.log('Season:', season);

  // Save team
  const team = await prisma.scrapedTeam.upsert({
    where: { source_sourceId_season: { source: SOURCE, sourceId: String(folderId), season } },
    update: { nameHe: 'הפועל באר שבע', nameEn: 'Hapoel Beer Sheva', scrapedAt: new Date() },
    create: { source: SOURCE, sourceId: String(folderId), nameHe: 'הפועל באר שבע', nameEn: 'Hapoel Beer Sheva', season },
  });
  console.log('Team saved:', team.id);

  // Extract players
  const nameMap = new Map();
  const nameRe = /\/Player\/\d+\/(\d+)\/[^"]+"\s*[^>]*>([^<]+)/g;
  let m;
  while ((m = nameRe.exec(html)) !== null) {
    if (!nameMap.has(m[1])) nameMap.set(m[1], m[2].trim());
  }

  const playerRe = /\/Player\/(\d+)\/(\d+)\/([^"\s]+)"/g;
  const seen = new Set();
  const savedPlayers = [];
  while ((m = playerRe.exec(html)) !== null) {
    if (seen.has(m[2])) continue;
    seen.add(m[2]);
    const name = nameMap.get(m[2]) || decodeURIComponent(m[3]).replace(/-/g, ' ');
    const slug = m[3]; // original slug from HTML — preserves special chars
    const player = await prisma.scrapedPlayer.upsert({
      where: { source_sourceId_teamId: { source: SOURCE, sourceId: m[2], teamId: team.id } },
      update: { nameHe: name, scrapedAt: new Date() },
      create: { source: SOURCE, sourceId: m[2], nameHe: name, teamId: team.id },
    });
    savedPlayers.push({ id: player.id, sourceId: m[2], teamFolderId: m[1], name, slug });
  }
  console.log('Players saved:', savedPlayers.length);

  // Scrape ALL player pages for season stats
  for (const p of savedPlayers) {
    const url = SPORT5_BASE + '/Player/' + (p.teamFolderId || folderId) + '/' + p.sourceId + '/' + p.slug;
    try {
      const pHtml = await fetchPage(url);
      const rowRe = /<tr>\s*<td>(\d{4}\/\d{2,4})<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>/g;
      let sm;
      let count = 0;
      while ((sm = rowRe.exec(pHtml)) !== null) {
        await prisma.scrapedPlayerSeason.upsert({
          where: { source_season_playerId: { source: SOURCE, season: sm[1], playerId: p.id } },
          update: { appearances: +sm[2], starts: +sm[3], goals: +sm[4], subsIn: +sm[5], subsOut: +sm[6], yellowCards: +sm[7], redCards: +sm[8], scrapedAt: new Date() },
          create: { source: SOURCE, season: sm[1], playerId: p.id, appearances: +sm[2], starts: +sm[3], goals: +sm[4], subsIn: +sm[5], subsOut: +sm[6], yellowCards: +sm[7], redCards: +sm[8] },
        });
        count++;
      }
      console.log('  ' + p.name + ': ' + count + ' seasons');
    } catch (e) {
      console.log('  ' + p.name + ': ERROR - ' + e.message);
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  // Summary
  const totalPlayers = await prisma.scrapedPlayer.count({ where: { source: SOURCE } });
  const totalSeasons = await prisma.scrapedPlayerSeason.count({ where: { source: SOURCE } });
  console.log('\nTotal in DB: players=' + totalPlayers + ', seasonStats=' + totalSeasons);

  await prisma.$disconnect();
}

main().catch(console.error);
