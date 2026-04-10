const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME_PATH = path.join('C:', 'Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe');

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  // Test stats 9-27 for league 2623 (2020/21) which has more data
  for (const stat of [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]) {
    await page.goto(`https://sports.walla.co.il/stats?leagueId=2623&stat=${stat}`, { waitUntil: 'networkidle2', timeout: 15000 }).catch(() => null);
    await new Promise((r) => setTimeout(r, 2000));

    const data = await page.evaluate(() => {
      const title = document.querySelector('h2, h3')?.textContent?.trim() || '?';
      const rows = document.querySelectorAll('tbody tr');
      const sample = Array.from(rows).slice(0, 3).map((r) => r.innerText.trim().slice(0, 100));
      return { title, rowCount: rows.length, sample };
    });

    console.log('stat=' + stat + ' | ' + data.title + ' | ' + data.rowCount + ' rows');
    for (const s of data.sample) console.log('  ' + s);
    console.log();
  }

  await browser.close();
}

main().catch(console.error);
