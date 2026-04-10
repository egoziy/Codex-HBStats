const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME_PATH = path.join('C:', 'Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe');

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  console.log('=== Walla Team page with Puppeteer ===');
  await page.goto('https://sports.walla.co.il/team/3987/188', { waitUntil: 'networkidle2', timeout: 30000 });

  // Scroll down to load lazy content
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, 1000));
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Check for game elements
  const data = await page.evaluate(() => {
    // Look for game containers
    const gameElements = document.querySelectorAll('.game, [class*="game-row"], [class*="match"]');
    const gameData = Array.from(gameElements).slice(0, 10).map((el) => el.innerText.trim().slice(0, 100));

    // Look for score elements
    const scoreElements = document.querySelectorAll('.score, [class*="score"]');
    const scores = Array.from(scoreElements).slice(0, 10).map((el) => el.innerText.trim());

    // Get all visible text sections
    const allText = document.body.innerText;

    // Find match-like patterns: team 0:1 team or team 0 - 1 team
    const matchResults = allText.match(/.*\d+\s*[-:]\s*\d+.*/g) || [];
    const filteredResults = matchResults.filter((r) => r.length < 100 && r.length > 10).slice(0, 20);

    // Look for 'משחקים' section
    const headings = Array.from(document.querySelectorAll('h2, h3, h4')).map((h) => h.innerText.trim());

    return { gameElements: gameData, scores, matchResults: filteredResults, headings };
  });

  console.log('Game elements:', data.gameElements.length);
  for (const g of data.gameElements) console.log('  ' + g);

  console.log('\nScores:', data.scores.length);
  for (const s of data.scores) console.log('  ' + s);

  console.log('\nMatch result patterns:', data.matchResults.length);
  for (const r of data.matchResults) console.log('  ' + r);

  console.log('\nHeadings:', data.headings.slice(0, 15));

  await browser.close();
}

main().catch(console.error);
