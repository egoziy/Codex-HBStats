/**
 * Walla Sports Advanced Stats Scraper
 * Scrapes tables 7-25 from league pages — team-level and player-level advanced stats.
 *
 * Run: node scripts/scrape-walla-advanced.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const https = require('https');

const SOURCE = 'walla';

// Only newer seasons have advanced stats (tables 7+)
const SEASONS = [
  { id: 2623, season: '2020/2021' },
  { id: 2690, season: '2021/2022' },
  { id: 2732, season: '2022/2023' },
  { id: 2833, season: '2024/2025' },
  { id: 2874, season: '2025/2026' },
  // Older seasons might have fewer tables
  { id: 2568, season: '2019/2020' },
  { id: 2506, season: '2018/2019' },
  { id: 2437, season: '2017/2018' },
  { id: 2343, season: '2016/2017' },
  { id: 2231, season: '2015/2016' },
  { id: 2133, season: '2014/2015' },
  { id: 2019, season: '2013/2014' },
  { id: 1918, season: '2012/2013' },
  { id: 1802, season: '2011/2012' },
  { id: 1665, season: '2010/2011' },
  { id: 1482, season: '2009/2010' },
  { id: 1347, season: '2008/2009' },
  { id: 1184, season: '2007/2008' },
  { id: 1004, season: '2006/2007' },
  { id: 361, season: '2005/2006' },
  { id: 300, season: '2004/2005' },
  { id: 243, season: '2003/2004' },
  { id: 188, season: '2002/2003' },
  { id: 86, season: '2001/2002' },
  { id: 17, season: '2000/2001' },
];

const ADVANCED_CATEGORIES = [
  { index: 7, key: 'goalsByMinutes', label: 'שערים לפי דקות' },
  { index: 8, key: 'minutesPerGoalScored', label: 'כל כמה דקות כובשת' },
  { index: 9, key: 'minutesPerGoalConceded', label: 'כל כמה דקות סופגת' },
  { index: 10, key: 'homeSuccessRate', label: 'אחוזי הצלחה בבית' },
  { index: 11, key: 'awaySuccessRate', label: 'אחוזי הצלחה בחוץ' },
  { index: 12, key: 'winWhenScoringFirst', label: 'ניצחון כשכובשת ראשונה' },
  { index: 13, key: 'winWhenNotScoringFirst', label: 'ניצחון כשלא כובשת ראשונה' },
  { index: 14, key: 'freeKickGoalPct', label: 'אחוז שערים בבעיטות חופשיות' },
  { index: 15, key: 'headerGoalPct', label: 'אחוז שערים בנגיחות' },
  { index: 16, key: 'avgHomeAttendance', label: 'ממוצע קהל ביתי' },
  { index: 17, key: 'penaltyConversionRate', label: 'אחוז ניצול פנדלים' },
  { index: 18, key: 'homeGoalsPerGame', label: 'שערים למשחק בית' },
  { index: 19, key: 'awayGoalsPerGame', label: 'שערים למשחק חוץ' },
  { index: 20, key: 'assistedGoalPct', label: 'אחוז השערים שבושלו' },
  { index: 21, key: 'goalsPerStadium', label: 'שערים לאצטדיון' },
  { index: 22, key: 'avgGoalsScoredPerGame', label: 'ממוצע הבקעות למשחק' },
  { index: 23, key: 'avgGoalsConcededPerGame', label: 'ממוצע ספיגות למשחק' },
  { index: 24, key: 'yellowCardsPerGame', label: 'כרטיסים צהובים למשחק' },
  { index: 25, key: 'redCardsPerGame', label: 'כרטיסים אדומים למשחק' },
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

function parseAdvancedTable(tbody) {
  const rows = [...tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
  return rows.map((row) => {
    const text = cleanText(row[1]);
    const parts = text.split('|').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const value = parseFloat(parts[parts.length - 1]);
      const name = parts.slice(0, parts.length - 1).join(' ');
      if (!isNaN(value)) return { name, value };
    }
    return null;
  }).filter(Boolean);
}

async function main() {
  console.log('\n=== Walla Advanced Stats Scraper ===\n');
  let saved = 0;

  for (const entry of SEASONS) {
    const url = `https://sports.walla.co.il/league/${entry.id}?r=1`;
    try {
      const html = await fetchPage(url);
      const tbodies = [...html.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)];
      let seasonSaved = 0;

      for (const cat of ADVANCED_CATEGORIES) {
        if (tbodies[cat.index]) {
          const items = parseAdvancedTable(tbodies[cat.index][1]);
          for (let rank = 0; rank < items.length; rank++) {
            const item = items[rank];
            const catKey = 'adv_' + cat.key;
            await prisma.scrapedLeaderboard.upsert({
              where: { source_season_category_rank: { source: SOURCE, season: entry.season, category: catKey, rank: rank + 1 } },
              update: { playerName: item.name, teamName: '', value: Math.round(item.value * 100) / 100, leagueNameHe: 'ליגת העל', scrapedAt: new Date() },
              create: { source: SOURCE, season: entry.season, category: catKey, rank: rank + 1, playerName: item.name, teamName: '', value: Math.round(item.value * 100) / 100, leagueNameHe: 'ליגת העל' },
            }).catch(() => null); // Skip if value doesn't fit Int
            seasonSaved++;
          }
        }
      }

      console.log('  ' + entry.season + ': ' + seasonSaved + ' advanced stats');
      saved += seasonSaved;
    } catch (e) {
      console.log('  ' + entry.season + ': ERROR - ' + e.message);
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  const total = await prisma.scrapedLeaderboard.count({ where: { source: SOURCE, category: { startsWith: 'adv_' } } });
  console.log('\n=== Done: ' + saved + ' saved, DB total advanced: ' + total + ' ===');
  await prisma.$disconnect();
}

main().catch(console.error);
