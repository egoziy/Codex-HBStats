const puppeteer = require('puppeteer-core');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

(async () => {
  console.log('Launching Chrome via Puppeteer...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

    const url = 'https://www.football.org.il/leagues/league/?league_id=40&season_id=27';
    console.log('Navigating to', url);
    const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    console.log('HTTP status:', response.status());

    const title = await page.title();
    console.log('Page title:', title);

    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 300));
    console.log('Body preview:', bodyText.replace(/\s+/g, ' '));

    const tables = await page.$$('table');
    console.log('Tables found on page:', tables.length);
  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await browser.close();
  }
})();
