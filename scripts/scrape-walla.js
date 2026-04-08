/**
 * Walla Sports Scraper — standings + top scorers from 2000/01 onwards
 * Run: node scripts/scrape-walla.js [--from 17] [--to 2874]
 *
 * Known league IDs (ליגת העל):
 *   17=2000/01, 86=2001/02, 188=2002/03, 243=2003/04, 300=2004/05,
 *   361=2005/06, 1004=2006/07, 1184=2007/08, 1347=2008/09, 1482=2009/10,
 *   1665=2010/11, 1802=2011/12, 1918=2012/13, 2019=2013/14, 2133=2014/15,
 *   2231=2015/16, 2343=2016/17, 2437=2017/18, 2506=2018/19, 2568=2019/20,
 *   2623=2020/21, 2690=2021/22, 2732=2022/23, 2833=2024/25, 2874=2025/26
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const https = require('https');

const SOURCE = 'walla';

const LIGA_HAAL_SEASONS = [
  { id: 17, season: '2000/2001' },
  { id: 86, season: '2001/2002' },
  { id: 188, season: '2002/2003' },
  { id: 243, season: '2003/2004' },
  { id: 300, season: '2004/2005' },
  { id: 361, season: '2005/2006' },
  { id: 1004, season: '2006/2007' },
  { id: 1184, season: '2007/2008' },
  { id: 1347, season: '2008/2009' },
  { id: 1482, season: '2009/2010' },
  { id: 1665, season: '2010/2011' },
  { id: 1802, season: '2011/2012' },
  { id: 1918, season: '2012/2013' },
  { id: 2019, season: '2013/2014' },
  { id: 2133, season: '2014/2015' },
  { id: 2231, season: '2015/2016' },
  { id: 2343, season: '2016/2017' },
  { id: 2437, season: '2017/2018' },
  { id: 2506, season: '2018/2019' },
  { id: 2568, season: '2019/2020' },
  { id: 2623, season: '2020/2021' },
  { id: 2690, season: '2021/2022' },
  { id: 2732, season: '2022/2023' },
  { id: 2833, season: '2024/2025' },
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

function parseStandings(html) {
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return [];
  const rows = [...tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
  const results = [];
  for (const row of rows) {
    const text = row[1].replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/^\||\|$/g, '').trim();
    const m = text.match(/^(\d+)\|([^|]+)\|\s*\|?\*?\|?(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)-(\d+)\|(\d+)/);
    if (m) {
      results.push({
        pos: +m[1], team: m[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim(),
        played: +m[3], wins: +m[4], draws: +m[5], losses: +m[6],
        goalsAgainst: +m[7], goalsFor: +m[8], points: +m[9],
      });
    }
  }
  return results;
}

async function main() {
  console.log('\n=== Walla Sports Scraper — Liga Ha\'al ===\n');
  let totalSaved = 0;

  for (const entry of LIGA_HAAL_SEASONS) {
    const url = `https://sports.walla.co.il/league/${entry.id}?r=1`;
    try {
      const html = await fetchPage(url);
      const standings = parseStandings(html);

      for (const s of standings) {
        await prisma.scrapedStanding.upsert({
          where: { source_season_leagueNameHe_position: { source: SOURCE, season: entry.season, leagueNameHe: 'ליגת העל', position: s.pos } },
          update: { teamNameHe: s.team, played: s.played, wins: s.wins, draws: s.draws, losses: s.losses, goalsFor: s.goalsFor, goalsAgainst: s.goalsAgainst, points: s.points, scrapedAt: new Date() },
          create: { source: SOURCE, season: entry.season, leagueNameHe: 'ליגת העל', position: s.pos, teamNameHe: s.team, played: s.played, wins: s.wins, draws: s.draws, losses: s.losses, goalsFor: s.goalsFor, goalsAgainst: s.goalsAgainst, points: s.points },
        });
        totalSaved++;
      }

      console.log('  ' + entry.season + ': ' + standings.length + ' teams');
    } catch (e) {
      console.log('  ' + entry.season + ': ERROR - ' + e.message);
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  const total = await prisma.scrapedStanding.count({ where: { source: SOURCE } });
  console.log('\n=== Done: ' + totalSaved + ' rows saved, DB total: ' + total + ' ===');
  await prisma.$disconnect();
}

main().catch(console.error);
