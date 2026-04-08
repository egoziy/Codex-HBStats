/**
 * football.org.il Scraper (IFA - Israeli Football Association)
 * Uses Puppeteer to navigate the dynamic ASP.NET site.
 *
 * Run: node scripts/scrape-ifa.js [--season 26] [--league 40]
 *
 * Default: league_id=40 (Liga Ha'al), all available seasons
 */

const puppeteer = require('puppeteer-core');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SOURCE = 'footballOrgIl';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const IFA_BASE = 'https://www.football.org.il';

// Parse CLI args
const args = process.argv.slice(2);
const getArg = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : null; };
const targetLeague = getArg('league') || '40';
const targetSeason = getArg('season') || null; // null = all seasons from 2 to 27
const fromSeason = getArg('from') || '2';
const toSeason = getArg('to') || '27';

async function main() {
  const seasonIds = targetSeason
    ? [parseInt(targetSeason, 10)]
    : Array.from({ length: parseInt(toSeason, 10) - parseInt(fromSeason, 10) + 1 }, (_, i) => parseInt(toSeason, 10) - i);

  console.log('\n=== football.org.il Scraper ===');
  console.log('League:', targetLeague, '| Seasons:', seasonIds.join(', '));

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  let totalStandings = 0;

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    page.setDefaultTimeout(15000);

    for (const sid of seasonIds) {
      const url = `${IFA_BASE}/leagues/league/?league_id=${targetLeague}&season_id=${sid}`;
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => null);

      // Scroll to trigger lazy loading
      await page.evaluate(() => window.scrollTo(0, 800));
      await new Promise((r) => setTimeout(r, 4000));

      const result = await page.evaluate(() => {
        const title = document.querySelector('.page_main_title span')?.textContent?.trim() || '';
        const bigTitle = document.querySelector('.page_main_title .big')?.textContent?.trim() || '';

        // Parse div-based grid
        const container = document.querySelector('.table-w-playoff .results-grid') || document.querySelector('.results-grid');
        if (!container) return { title, bigTitle, teams: [] };

        const text = container.textContent;
        const teamPattern = /מיקום(\d+)קבוצה([^מ]+?)משחקים(\d+)ניצחונות(\d+)תיקו(\d+)הפסדים(\d+)שערים(\d+)-(\d+)נקודות(\d+)/g;
        const teams = [];
        let m;
        while ((m = teamPattern.exec(text)) !== null) {
          teams.push({
            pos: +m[1], name: m[2].trim(), played: +m[3],
            wins: +m[4], draws: +m[5], losses: +m[6],
            goalsAgainst: +m[7], goalsFor: +m[8], points: +m[9],
          });
        }
        return { title, bigTitle, teams };
      });

      if (!result.title && result.teams.length === 0) {
        console.log('  season_id=' + sid + ': empty');
        continue;
      }

      const seasonLabel = result.title || 'sid-' + sid;
      const leagueLabel = result.bigTitle || 'ליגת העל';
      console.log('  ' + seasonLabel + ' (' + leagueLabel + '): ' + result.teams.length + ' teams');

      for (const t of result.teams) {
        await prisma.scrapedStanding.upsert({
          where: { source_season_leagueNameHe_position: { source: SOURCE, season: seasonLabel, leagueNameHe: leagueLabel, position: t.pos } },
          update: { teamNameHe: t.name, played: t.played, wins: t.wins, draws: t.draws, losses: t.losses, goalsFor: t.goalsFor, goalsAgainst: t.goalsAgainst, points: t.points, scrapedAt: new Date() },
          create: { source: SOURCE, season: seasonLabel, leagueNameHe: leagueLabel, position: t.pos, teamNameHe: t.name, played: t.played, wins: t.wins, draws: t.draws, losses: t.losses, goalsFor: t.goalsFor, goalsAgainst: t.goalsAgainst, points: t.points },
        });
        totalStandings++;
      }
    }
  } finally {
    await browser.close();
  }

  const dbTotal = await prisma.scrapedStanding.count({ where: { source: SOURCE } });
  console.log('\n=== Done: ' + totalStandings + ' rows saved, DB total: ' + dbTotal + ' ===');
  await prisma.$disconnect();
}

main().catch(console.error);
