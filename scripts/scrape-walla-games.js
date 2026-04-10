/**
 * Walla Sports Games Scraper — match results via Puppeteer
 * Scrapes team pages for match results (home/away teams, scores, half-time scores)
 *
 * Run: node scripts/scrape-walla-games.js [--season "2002/2003"]
 *
 * Format found: "{awayTeam}\n({halfAway}){fullAway} : {fullHome}({halfHome})\n{homeTeam}"
 */

const puppeteer = require('puppeteer-core');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CHROME_PATH = path.join('C:', 'Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe');
const SOURCE = 'walla';

// Team IDs per season from Walla (team_id/league_id)
// We'll get team IDs dynamically from the league page
const LIGA_HAAL_SEASONS = [
  { id: 17, season: '2000/2001' }, { id: 86, season: '2001/2002' }, { id: 188, season: '2002/2003' },
  { id: 243, season: '2003/2004' }, { id: 300, season: '2004/2005' }, { id: 361, season: '2005/2006' },
  { id: 1004, season: '2006/2007' }, { id: 1184, season: '2007/2008' }, { id: 1347, season: '2008/2009' },
  { id: 1482, season: '2009/2010' }, { id: 1665, season: '2010/2011' }, { id: 1802, season: '2011/2012' },
  { id: 1918, season: '2012/2013' }, { id: 2019, season: '2013/2014' }, { id: 2133, season: '2014/2015' },
  { id: 2231, season: '2015/2016' }, { id: 2343, season: '2016/2017' }, { id: 2437, season: '2017/2018' },
  { id: 2506, season: '2018/2019' }, { id: 2568, season: '2019/2020' },
];

const targetSeason = process.argv.find((a, i) => process.argv[i - 1] === '--season');

async function getTeamIds(page, leagueId) {
  await page.goto(`https://sports.walla.co.il/league/${leagueId}?r=1`, { waitUntil: 'networkidle2', timeout: 20000 });

  return page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="/team/"]');
    const teams = new Map();
    for (const link of links) {
      const match = link.getAttribute('href')?.match(/\/team\/(\d+)\/(\d+)/);
      const name = link.textContent?.trim();
      if (match && name && name.length > 2 && !teams.has(match[1])) {
        teams.set(match[1], { teamId: match[1], leagueId: match[2], name });
      }
    }
    return Array.from(teams.values());
  });
}

async function scrapeTeamGames(page, teamId, leagueId, teamName) {
  await page.goto(`https://sports.walla.co.il/team/${teamId}/${leagueId}`, { waitUntil: 'networkidle2', timeout: 20000 });

  // Scroll to load all games
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, 1000));
    await new Promise((r) => setTimeout(r, 1500));
  }

  return page.evaluate((team) => {
    const gameElements = document.querySelectorAll('.game');
    const games = [];

    for (const el of gameElements) {
      const text = el.innerText.trim();
      // Format: "TeamA\n(halfA)fullA : fullB(halfB)\nTeamB"
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length < 3) continue;

      const awayTeam = lines[0];
      const scoreStr = lines[1];
      const homeTeam = lines[2];

      // Parse: (1)2 : 3(0) or similar
      const scoreMatch = scoreStr.match(/\((\d+)\)(\d+)\s*:\s*(\d+)\((\d+)\)/);
      if (!scoreMatch) continue;

      games.push({
        homeTeam,
        awayTeam,
        homeScore: parseInt(scoreMatch[3], 10),
        awayScore: parseInt(scoreMatch[2], 10),
        homeHalf: parseInt(scoreMatch[4], 10),
        awayHalf: parseInt(scoreMatch[1], 10),
      });
    }

    return games;
  }, teamName);
}

async function main() {
  console.log('\n=== Walla Games Scraper ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  const seasonsToScrape = targetSeason
    ? LIGA_HAAL_SEASONS.filter((s) => s.season === targetSeason)
    : LIGA_HAAL_SEASONS;

  let totalGames = 0;

  for (const entry of seasonsToScrape) {
    console.log('--- ' + entry.season + ' (league ' + entry.id + ') ---');

    // Get team IDs for this season
    const teams = await getTeamIds(page, entry.id);
    console.log('  Teams: ' + teams.length);

    const allGames = new Map(); // dedup by homeTeam+awayTeam+score
    let teamCount = 0;

    // Scrape first team only (they play everyone, so we get all games)
    // Actually we need multiple teams to get all games — each team page shows only their games
    // But scraping ALL teams doubles the data. Let's scrape half the teams.
    const teamsToScrape = teams.slice(0, Math.ceil(teams.length / 2));

    for (const team of teamsToScrape) {
      try {
        const games = await scrapeTeamGames(page, team.teamId, team.leagueId, team.name);
        for (const g of games) {
          const key = `${g.homeTeam}|${g.awayTeam}|${g.homeScore}:${g.awayScore}`;
          if (!allGames.has(key)) allGames.set(key, g);
        }
        teamCount++;
      } catch (e) {
        console.log('  Error scraping ' + team.name + ': ' + e.message);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Save to DB
    let saved = 0;
    const gamesList = Array.from(allGames.values());
    for (let i = 0; i < gamesList.length; i++) {
      const g = gamesList[i];
      try {
        await prisma.scrapedMatch.upsert({
          where: { source_sourceId: { source: SOURCE, sourceId: `${entry.season}|${g.homeTeam}|${g.awayTeam}|${g.homeScore}:${g.awayScore}` } },
          update: { scrapedAt: new Date() },
          create: {
            source: SOURCE,
            sourceId: `${entry.season}|${g.homeTeam}|${g.awayTeam}|${g.homeScore}:${g.awayScore}`,
            season: entry.season,
            leagueNameHe: 'ליגת העל',
            homeTeamName: g.homeTeam,
            awayTeamName: g.awayTeam,
            homeScore: g.homeScore,
            awayScore: g.awayScore,
            status: 'completed',
            rawJson: { homeHalf: g.homeHalf, awayHalf: g.awayHalf },
          },
        });
        saved++;
      } catch (e) {
        // skip dups
      }
    }

    console.log('  Scraped ' + teamCount + ' teams → ' + gamesList.length + ' unique games → ' + saved + ' saved');
    totalGames += saved;
  }

  await browser.close();

  const dbTotal = await prisma.scrapedMatch.count({ where: { source: SOURCE } });
  console.log('\n=== Done: ' + totalGames + ' games saved, DB total: ' + dbTotal + ' ===');
  await prisma.$disconnect();
}

main().catch(console.error);
