const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME_PATH = path.join('C:', 'Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe');

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  // 1. Check IFA club page for players
  console.log('=== IFA Club page (Hapoel Beer Sheva) ===');
  await page.goto('https://www.football.org.il/clubs/club/?club_id=4669', { waitUntil: 'networkidle2', timeout: 20000 });
  await page.evaluate(() => window.scrollTo(0, 1500));
  await new Promise((r) => setTimeout(r, 5000));

  const clubData = await page.evaluate(() => {
    const playerLinks = document.querySelectorAll('a[href*="player_id"]');
    const players = Array.from(playerLinks).map((a) => ({
      name: a.textContent.trim(),
      href: a.getAttribute('href'),
    })).filter((p) => p.name.length > 2);

    const sections = Array.from(document.querySelectorAll('h2, h3, .title, caption')).map((s) => s.textContent.trim()).filter(Boolean);
    const allText = document.body.innerText.slice(0, 3000);

    return { players: players.slice(0, 15), playerCount: players.length, sections: sections.slice(0, 20), textSample: allText.slice(0, 500) };
  });

  console.log('Players:', clubData.playerCount);
  for (const p of clubData.players) console.log('  ' + p.name + ' → ' + p.href);
  console.log('Sections:', clubData.sections);

  // 2. Check IFA games/results page
  console.log('\n=== IFA Games page ===');
  await page.goto('https://www.football.org.il/leagues/games/game/?league_id=40&season_id=27', { waitUntil: 'networkidle2', timeout: 20000 });
  await page.evaluate(() => window.scrollTo(0, 800));
  await new Promise((r) => setTimeout(r, 5000));

  const gamesData = await page.evaluate(() => {
    const allText = document.body.innerText;
    const scorePattern = /\d+\s*[-:]\s*\d+/g;
    const scores = allText.match(scorePattern) || [];
    const gameLinks = document.querySelectorAll('a[href*="game_id"]');
    return {
      scores: scores.slice(0, 10),
      gameLinksCount: gameLinks.length,
      gameLinks: Array.from(gameLinks).slice(0, 5).map((a) => ({ text: a.textContent.trim(), href: a.getAttribute('href') })),
      textSample: allText.slice(0, 500),
    };
  });

  console.log('Scores found:', gamesData.scores.length, gamesData.scores.slice(0, 5));
  console.log('Game links:', gamesData.gameLinksCount);
  for (const g of gamesData.gameLinks) console.log('  ' + g.text + ' → ' + g.href);
  console.log('Text:', gamesData.textSample.slice(0, 300));

  // 3. Try an older season
  console.log('\n=== IFA Games 2010/11 (season_id=16) ===');
  await page.goto('https://www.football.org.il/leagues/games/game/?league_id=40&season_id=16', { waitUntil: 'networkidle2', timeout: 20000 });
  await page.evaluate(() => window.scrollTo(0, 800));
  await new Promise((r) => setTimeout(r, 5000));

  const oldGamesData = await page.evaluate(() => {
    const allText = document.body.innerText;
    const scores = (allText.match(/\d+\s*[-:]\s*\d+/g) || []).slice(0, 10);
    const gameLinks = document.querySelectorAll('a[href*="game_id"]');
    return { scores, gameLinksCount: gameLinks.length, textSample: allText.slice(0, 500) };
  });

  console.log('Scores:', oldGamesData.scores.length, oldGamesData.scores.slice(0, 5));
  console.log('Game links:', oldGamesData.gameLinksCount);
  console.log('Text:', oldGamesData.textSample.slice(0, 300));

  await browser.close();
}

main().catch(console.error);
