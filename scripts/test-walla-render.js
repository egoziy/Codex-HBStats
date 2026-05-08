const puppeteer = require('puppeteer-core');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    const url = 'https://sports.walla.co.il/league/2568?r=1'; // 2019/20 IPL
    console.log('Loading', url);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    // Wait briefly for data hydration
    await new Promise(r => setTimeout(r, 3000));
    const tables = await page.$$('table');
    console.log('Tables found:', tables.length);
    // Pull the first 60 chars of each row in the first table
    const rows = await page.evaluate(() => {
      const t = document.querySelectorAll('table')[0];
      if (!t) return [];
      return Array.from(t.querySelectorAll('tr')).slice(0, 8).map(r => r.innerText.replace(/\s+/g, ' ').slice(0, 80));
    });
    console.log('First table sample rows:');
    rows.forEach(r => console.log(' ', r));
  } finally {
    await browser.close();
  }
})();
