/**
 * Walla Player Stats Scraper — full player lists (not just top 5)
 * Uses /stats?leagueId=X&stat=Y pages which have all players in HTML tables.
 *
 * Run: node scripts/scrape-walla-player-stats.js
 *
 * Stats: 3=goals, 4=assists, 5=subIn, 6=subOut, 7=yellow, 8=red
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const https = require('https');

const SOURCE = 'walla';

const STAT_TYPES = [
  { id: 3, key: 'goals_full', label: 'מלך השערים' },
  { id: 4, key: 'assists_full', label: 'מלך הבישולים' },
  { id: 5, key: 'substitutedIn_full', label: 'הופעות כמחליף' },
  { id: 6, key: 'substitutedOut_full', label: 'מוחלף' },
  { id: 7, key: 'yellowCards_full', label: 'כרטיסים צהובים' },
  { id: 8, key: 'redCards_full', label: 'כרטיסים אדומים' },
];

const LIGA_HAAL_SEASONS = [
  { id: 17, season: '2000/2001' }, { id: 86, season: '2001/2002' }, { id: 188, season: '2002/2003' },
  { id: 243, season: '2003/2004' }, { id: 300, season: '2004/2005' }, { id: 361, season: '2005/2006' },
  { id: 1004, season: '2006/2007' }, { id: 1184, season: '2007/2008' }, { id: 1347, season: '2008/2009' },
  { id: 1482, season: '2009/2010' }, { id: 1665, season: '2010/2011' }, { id: 1802, season: '2011/2012' },
  { id: 1918, season: '2012/2013' }, { id: 2019, season: '2013/2014' }, { id: 2133, season: '2014/2015' },
  { id: 2231, season: '2015/2016' }, { id: 2343, season: '2016/2017' }, { id: 2437, season: '2017/2018' },
  { id: 2506, season: '2018/2019' }, { id: 2568, season: '2019/2020' }, { id: 2623, season: '2020/2021' },
  { id: 2690, season: '2021/2022' }, { id: 2732, season: '2022/2023' }, { id: 2833, season: '2024/2025' },
  { id: 2874, season: '2025/2026' },
];

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept-Language': 'he-IL,he;q=0.9' },
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

function cleanText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, '|')
    .replace(/\|+/g, '|')
    .replace(/^\||\|$/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim();
}

function parsePlayers(tbody) {
  const rows = [...tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
  return rows.map((row) => {
    const text = cleanText(row[1]);
    const parts = text.split('|').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const value = parseInt(parts[parts.length - 1], 10);
      const team = parts[parts.length - 2];
      const name = parts.slice(0, parts.length - 2).join(' ');
      if (!isNaN(value) && name.length > 1) return { name, team, value };
    }
    return null;
  }).filter(Boolean);
}

async function main() {
  console.log('\n=== Walla Full Player Stats Scraper ===\n');
  let totalSaved = 0;

  for (const entry of LIGA_HAAL_SEASONS) {
    let seasonTotal = 0;

    for (const stat of STAT_TYPES) {
      const url = `https://sports.walla.co.il/stats?leagueId=${entry.id}&stat=${stat.id}`;
      try {
        const html = await fetchPage(url);
        const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
        if (!tbodyMatch) continue;

        const players = parsePlayers(tbodyMatch[1]);
        for (let rank = 0; rank < players.length; rank++) {
          const p = players[rank];
          await prisma.scrapedLeaderboard.upsert({
            where: { source_season_category_rank: { source: SOURCE, season: entry.season, category: stat.key, rank: rank + 1 } },
            update: { playerName: p.name, teamName: p.team, value: p.value, leagueNameHe: 'ליגת העל', scrapedAt: new Date() },
            create: { source: SOURCE, season: entry.season, category: stat.key, rank: rank + 1, playerName: p.name, teamName: p.team, value: p.value, leagueNameHe: 'ליגת העל' },
          });
          totalSaved++;
          seasonTotal++;
        }
      } catch (e) {
        // skip
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    console.log('  ' + entry.season + ': ' + seasonTotal + ' player records');
  }

  const total = await prisma.scrapedLeaderboard.count({ where: { source: SOURCE, category: { endsWith: '_full' } } });
  console.log('\n=== Done: ' + totalSaved + ' saved, DB total full stats: ' + total + ' ===');
  await prisma.$disconnect();
}

main().catch(console.error);
