/**
 * Walla Advanced Stats Scraper (Puppeteer) — stats 9-27
 * Team-level and referee/stadium stats that require JS rendering.
 *
 * Run: node scripts/scrape-walla-advanced-puppeteer.js
 */

const puppeteer = require('puppeteer-core');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CHROME_PATH = path.join('C:', 'Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe');
const SOURCE = 'walla';

const STAT_TYPES = [
  { id: 9, key: 'adv_goalsByMinutes' },
  { id: 10, key: 'adv_minutesPerGoalScored' },
  { id: 11, key: 'adv_minutesPerGoalConceded' },
  { id: 12, key: 'adv_homeSuccessRate' },
  { id: 13, key: 'adv_awaySuccessRate' },
  { id: 14, key: 'adv_winWhenScoringFirst' },
  { id: 15, key: 'adv_winWhenNotScoringFirst' },
  { id: 16, key: 'adv_freeKickGoalPct' },
  { id: 17, key: 'adv_headerGoalPct' },
  { id: 18, key: 'adv_avgHomeAttendance' },
  { id: 19, key: 'adv_penaltyConversionRate' },
  { id: 20, key: 'adv_yellowCardsPerGame' },
  { id: 21, key: 'adv_redCardsPerGame' },
  { id: 22, key: 'adv_homeGoalsPerGame' },
  { id: 23, key: 'adv_awayGoalsPerGame' },
  { id: 24, key: 'adv_assistedGoalPct' },
  { id: 25, key: 'adv_goalsPerStadium' },
  { id: 26, key: 'adv_avgGoalsScoredPerGame' },
  { id: 27, key: 'adv_avgGoalsConcededPerGame' },
];

const SEASONS = [
  { id: 2874, season: '2025/2026' }, { id: 2833, season: '2024/2025' },
  { id: 2732, season: '2022/2023' }, { id: 2690, season: '2021/2022' },
  { id: 2623, season: '2020/2021' }, { id: 2568, season: '2019/2020' },
  { id: 2506, season: '2018/2019' }, { id: 2437, season: '2017/2018' },
  { id: 2343, season: '2016/2017' }, { id: 2231, season: '2015/2016' },
  { id: 2133, season: '2014/2015' }, { id: 2019, season: '2013/2014' },
  { id: 1918, season: '2012/2013' }, { id: 1802, season: '2011/2012' },
  { id: 1665, season: '2010/2011' }, { id: 1482, season: '2009/2010' },
  { id: 1347, season: '2008/2009' }, { id: 1184, season: '2007/2008' },
  { id: 1004, season: '2006/2007' }, { id: 361, season: '2005/2006' },
  { id: 300, season: '2004/2005' }, { id: 243, season: '2003/2004' },
  { id: 188, season: '2002/2003' }, { id: 86, season: '2001/2002' },
  { id: 17, season: '2000/2001' },
];

async function main() {
  console.log('\n=== Walla Advanced Stats (Puppeteer) ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: 'new', args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  let totalSaved = 0;

  for (const entry of SEASONS) {
    let seasonSaved = 0;

    for (const stat of STAT_TYPES) {
      try {
        await page.goto(`https://sports.walla.co.il/stats?leagueId=${entry.id}&stat=${stat.id}`, {
          waitUntil: 'networkidle2', timeout: 15000,
        }).catch(() => null);
        await new Promise((r) => setTimeout(r, 1500));

        const rows = await page.evaluate(() => {
          const trs = document.querySelectorAll('tbody tr');
          return Array.from(trs).map((tr) => {
            const cells = Array.from(tr.querySelectorAll('td')).map((td) => td.innerText.trim());
            return cells;
          });
        });

        for (let rank = 0; rank < rows.length; rank++) {
          const cells = rows[rank];
          if (cells.length < 2) continue;

          // Last cell is value, name is everything before
          const value = parseFloat(cells[cells.length - 1]);
          const name = cells.slice(0, cells.length - 1).join(' ').trim();
          if (isNaN(value) || !name) continue;

          await prisma.scrapedLeaderboard.upsert({
            where: { source_season_category_rank: { source: SOURCE, season: entry.season, category: stat.key, rank: rank + 1 } },
            update: { playerName: name, value, leagueNameHe: 'ליגת העל', scrapedAt: new Date() },
            create: { source: SOURCE, season: entry.season, category: stat.key, rank: rank + 1, playerName: name, teamName: '', value, leagueNameHe: 'ליגת העל' },
          }).catch(() => null);
          seasonSaved++;
        }
      } catch (e) {
        // skip
      }
    }

    totalSaved += seasonSaved;
    console.log('  ' + entry.season + ': ' + seasonSaved + ' records');
  }

  await browser.close();
  const total = await prisma.scrapedLeaderboard.count({ where: { source: SOURCE, category: { startsWith: 'adv_' } } });
  console.log('\n=== Done: ' + totalSaved + ' saved, DB total advanced: ' + total + ' ===');
  await prisma.$disconnect();
}

main().catch(console.error);
