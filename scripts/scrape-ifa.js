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
const targetSeason = getArg('season') || null;

async function main() {
  console.log('\n=== football.org.il Scraper ===');
  console.log('League:', targetLeague, '| Season:', targetSeason || 'all available');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    page.setDefaultTimeout(15000);

    // Navigate to league page
    const leagueUrl = `${IFA_BASE}/leagues/league/?league_id=${targetLeague}&season_id=27`;
    console.log('Loading:', leagueUrl);
    await page.goto(leagueUrl, { waitUntil: 'networkidle2' });

    // Wait for season dropdown to populate
    await page.waitForSelector('.box-ajax-changer option', { timeout: 10000 }).catch(() => null);

    // Get available seasons
    const seasons = await page.evaluate(() => {
      const options = document.querySelectorAll('.box-ajax-changer option');
      return Array.from(options).map((opt) => ({
        value: opt.value,
        text: opt.textContent.trim(),
        minRound: opt.getAttribute('data-min-round'),
        maxRound: opt.getAttribute('data-max-round'),
        sectionId: opt.getAttribute('data-section-id'),
        currentRound: opt.getAttribute('data-current-round'),
      }));
    });

    console.log('\nAvailable seasons:', seasons.length);
    for (const s of seasons) {
      console.log('  value=' + s.value, ':', s.text, '| rounds:', s.minRound + '-' + s.maxRound);
    }

    // Filter seasons
    const targetSeasons = targetSeason
      ? seasons.filter((s) => s.value === targetSeason)
      : seasons;

    // Scrape each season
    for (const season of targetSeasons) {
      console.log('\n--- Scraping: ' + season.text + ' (value=' + season.value + ') ---');

      // Select the season in dropdown
      if (season.value !== seasons[0]?.value) {
        await page.select('.box-ajax-changer', season.value);
        await page.waitForTimeout(3000);
      }

      // Wait for table to load
      await page.waitForSelector('.tables-container table, .score-list table', { timeout: 8000 }).catch(() => null);

      // Extract standings
      const standings = await page.evaluate(() => {
        const rows = document.querySelectorAll('.tables-container table tr, .score-list table tr');
        const data = [];
        for (const row of rows) {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 9) {
            const pos = parseInt(cells[0]?.textContent?.trim(), 10);
            const teamName = cells[1]?.textContent?.trim();
            const played = parseInt(cells[2]?.textContent?.trim(), 10);
            const wins = parseInt(cells[3]?.textContent?.trim(), 10);
            const draws = parseInt(cells[4]?.textContent?.trim(), 10);
            const losses = parseInt(cells[5]?.textContent?.trim(), 10);
            const goalsRatio = cells[6]?.textContent?.trim() || '';
            const goalDiff = cells[7]?.textContent?.trim() || '0';
            const points = parseInt(cells[8]?.textContent?.trim(), 10);

            if (pos && teamName && !isNaN(played)) {
              const [gf, ga] = goalsRatio.split(/[:\-]/).map((v) => parseInt(v.trim(), 10));
              data.push({ pos, teamName, played, wins, draws, losses, goalsFor: gf || 0, goalsAgainst: ga || 0, goalDiff: parseInt(goalDiff, 10) || 0, points: points || 0 });
            }
          }
        }
        return data;
      });

      console.log('Standings rows:', standings.length);
      for (const s of standings.slice(0, 5)) {
        console.log('  ' + s.pos + '. ' + s.teamName + ' | ' + s.played + ' | ' + s.wins + '-' + s.draws + '-' + s.losses + ' | ' + s.goalsFor + ':' + s.goalsAgainst + ' | ' + s.points + ' pts');
      }

      // Save standings to DB
      for (const row of standings) {
        await prisma.scrapedStanding.upsert({
          where: { source_season_leagueNameHe_position: { source: SOURCE, season: season.text, leagueNameHe: 'ליגת העל', position: row.pos } },
          update: { teamNameHe: row.teamName, played: row.played, wins: row.wins, draws: row.draws, losses: row.losses, goalsFor: row.goalsFor, goalsAgainst: row.goalsAgainst, goalDifference: row.goalDiff, points: row.points, scrapedAt: new Date() },
          create: { source: SOURCE, season: season.text, leagueNameHe: 'ליגת העל', position: row.pos, teamNameHe: row.teamName, played: row.played, wins: row.wins, draws: row.draws, losses: row.losses, goalsFor: row.goalsFor, goalsAgainst: row.goalsAgainst, goalDifference: row.goalDiff, points: row.points },
        });
      }

      // Extract games list if available
      const games = await page.evaluate(() => {
        const gameRows = document.querySelectorAll('.games-table tr, .game-row');
        const data = [];
        for (const row of gameRows) {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 4) {
            const text = row.textContent || '';
            // Try to extract: date, home team, score, away team
            const scoreMatch = text.match(/(\d+)\s*[-:]\s*(\d+)/);
            if (scoreMatch) {
              data.push({ raw: text.trim().slice(0, 200), homeScore: +scoreMatch[1], awayScore: +scoreMatch[2] });
            }
          }
        }
        return data;
      });

      console.log('Games found:', games.length);
      if (games[0]) console.log('  Sample:', games[0].raw.slice(0, 100));
    }
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);
