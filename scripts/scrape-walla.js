/**
 * Walla Sports Scraper — standings + player leaderboards from 2000/01 onwards
 * Run: node scripts/scrape-walla.js
 *
 * Data per season:
 *   Table 0: Standings (position, team, played, W/D/L, goals, points)
 *   Table 1: Top scorers (player, team, goals)
 *   Table 2: Top assists (player, team, assists)
 *   Table 3: Yellow cards (player, team, count)
 *   Table 4: Red cards (player, team, count)
 *   Table 5: Substituted out (player, team, count)
 *   Table 6: Appearances as substitute (player, team, count)
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const https = require('https');

const SOURCE = 'walla';

const LEAGUES = [
  {
    name: 'ליגת העל',
    seasons: [
      { id: 17, season: '2000/2001' }, { id: 86, season: '2001/2002' }, { id: 188, season: '2002/2003' },
      { id: 243, season: '2003/2004' }, { id: 300, season: '2004/2005' }, { id: 361, season: '2005/2006' },
      { id: 1004, season: '2006/2007' }, { id: 1184, season: '2007/2008' }, { id: 1347, season: '2008/2009' },
      { id: 1482, season: '2009/2010' }, { id: 1665, season: '2010/2011' }, { id: 1802, season: '2011/2012' },
      { id: 1918, season: '2012/2013' }, { id: 2019, season: '2013/2014' }, { id: 2133, season: '2014/2015' },
      { id: 2231, season: '2015/2016' }, { id: 2343, season: '2016/2017' }, { id: 2437, season: '2017/2018' },
      { id: 2506, season: '2018/2019' }, { id: 2568, season: '2019/2020' }, { id: 2623, season: '2020/2021' },
      { id: 2690, season: '2021/2022' }, { id: 2732, season: '2022/2023' }, { id: 2833, season: '2024/2025' },
      { id: 2874, season: '2025/2026' },
    ],
  },
  {
    name: 'ליגה לאומית',
    seasons: [
      { id: 42, season: '2000/2001' }, { id: 87, season: '2001/2002' }, { id: 189, season: '2002/2003' },
      { id: 246, season: '2003/2004' }, { id: 302, season: '2004/2005' }, { id: 364, season: '2005/2006' },
      { id: 1005, season: '2006/2007' }, { id: 1192, season: '2007/2008' }, { id: 1348, season: '2008/2009' },
      { id: 1483, season: '2009/2010' }, { id: 1666, season: '2010/2011' }, { id: 1803, season: '2011/2012' },
      { id: 1919, season: '2012/2013' }, { id: 2020, season: '2013/2014' }, { id: 2139, season: '2014/2015' },
      { id: 2243, season: '2015/2016' }, { id: 2348, season: '2016/2017' }, { id: 2447, season: '2017/2018' },
      { id: 2507, season: '2018/2019' }, { id: 2569, season: '2019/2020' }, { id: 2631, season: '2020/2021' },
      { id: 2691, season: '2021/2022' }, { id: 2733, season: '2022/2023' }, { id: 2789, season: '2023/2024' },
      { id: 2847, season: '2024/2025' }, { id: 2880, season: '2025/2026' },
    ],
  },
];

const CATEGORIES = [
  { index: 1, key: 'goals', label: 'מלך השערים' },
  { index: 2, key: 'assists', label: 'מלך הבישולים' },
  { index: 3, key: 'yellowCards', label: 'כרטיסים צהובים' },
  { index: 4, key: 'redCards', label: 'כרטיסים אדומים' },
  { index: 5, key: 'substitutedOut', label: 'מוחלף' },
  { index: 6, key: 'substitutedIn', label: 'הופעות כמחליף' },
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

function parseStandings(tbody) {
  const rows = [...tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
  return rows.map((row) => {
    const text = cleanText(row[1]);
    const m = text.match(/^(\d+)\|([^|]+)\|\s*\|?\*?\|?(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)-(\d+)\|(\d+)/);
    if (!m) return null;
    return {
      pos: +m[1], team: m[2].trim(),
      played: +m[3], wins: +m[4], draws: +m[5], losses: +m[6],
      goalsAgainst: +m[7], goalsFor: +m[8], points: +m[9],
    };
  }).filter(Boolean);
}

function parsePlayers(tbody) {
  const rows = [...tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
  return rows.map((row) => {
    const text = cleanText(row[1]);
    const parts = text.split('|').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const count = parseInt(parts[parts.length - 1], 10);
      const team = parts[parts.length - 2];
      const name = parts.slice(0, parts.length - 2).join(' ');
      if (!isNaN(count) && name.length > 1) return { name, team, count };
    }
    return null;
  }).filter(Boolean);
}

async function main() {
  console.log('\n=== Walla Sports Full Scraper ===\n');
  let standingsSaved = 0;
  let leaderboardsSaved = 0;

  for (const league of LEAGUES) {
    console.log('--- ' + league.name + ' (' + league.seasons.length + ' seasons) ---');

    for (const entry of league.seasons) {
      const url = `https://sports.walla.co.il/league/${entry.id}?r=1`;
      try {
        const html = await fetchPage(url);
        const tbodies = [...html.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)];

        // Table 0: Standings
        if (tbodies[0]) {
          const standings = parseStandings(tbodies[0][1]);
          for (const s of standings) {
            await prisma.scrapedStanding.upsert({
              where: { source_season_leagueNameHe_position: { source: SOURCE, season: entry.season, leagueNameHe: league.name, position: s.pos } },
              update: { teamNameHe: s.team, played: s.played, wins: s.wins, draws: s.draws, losses: s.losses, goalsFor: s.goalsFor, goalsAgainst: s.goalsAgainst, points: s.points, scrapedAt: new Date() },
              create: { source: SOURCE, season: entry.season, leagueNameHe: league.name, position: s.pos, teamNameHe: s.team, played: s.played, wins: s.wins, draws: s.draws, losses: s.losses, goalsFor: s.goalsFor, goalsAgainst: s.goalsAgainst, points: s.points },
            });
            standingsSaved++;
          }
        }

        // Tables 1-6: Player leaderboards
        for (const cat of CATEGORIES) {
          if (tbodies[cat.index]) {
            const players = parsePlayers(tbodies[cat.index][1]);
            for (let rank = 0; rank < players.length; rank++) {
              const p = players[rank];
              const catKey = league.name === 'ליגת העל' ? cat.key : cat.key + '_leumit';
              await prisma.scrapedLeaderboard.upsert({
                where: { source_season_category_rank: { source: SOURCE, season: entry.season, category: catKey, rank: rank + 1 } },
                update: { playerName: p.name, teamName: p.team, value: p.count, leagueNameHe: league.name, scrapedAt: new Date() },
                create: { source: SOURCE, season: entry.season, category: catKey, rank: rank + 1, playerName: p.name, teamName: p.team, value: p.count, leagueNameHe: league.name },
              });
              leaderboardsSaved++;
            }
          }
        }

        const playerCount = CATEGORIES.reduce((sum, cat) => {
          return sum + (tbodies[cat.index] ? parsePlayers(tbodies[cat.index][1]).length : 0);
        }, 0);
        console.log('  ' + entry.season + ': standings + ' + playerCount + ' player records');
      } catch (e) {
        console.log('  ' + entry.season + ': ERROR - ' + e.message);
      }
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  const totalStandings = await prisma.scrapedStanding.count({ where: { source: SOURCE } });
  const totalLeaderboards = await prisma.scrapedLeaderboard.count({ where: { source: SOURCE } });
  console.log('\n=== Done ===');
  console.log('Standings saved: ' + standingsSaved + ' (DB total: ' + totalStandings + ')');
  console.log('Leaderboards saved: ' + leaderboardsSaved + ' (DB total: ' + totalLeaderboards + ')');
  await prisma.$disconnect();
}

main().catch(console.error);
