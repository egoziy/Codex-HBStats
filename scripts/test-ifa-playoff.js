const puppeteer = require('puppeteer-core');
const cheerio = require('cheerio');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'https://www.football.org.il';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Fetch via AJAX
  const data = await page.evaluate(async () => {
    const r = await fetch('https://www.football.org.il/Components.asmx/LeagueTable?league_id=40&season_id=27&box=-1&round_id=-1&componentTitle=', { headers: { 'Accept-Language': 'he-IL,he' }});
    return await r.text();
  });
  const m = data.match(/<HtmlData>([\s\S]*?)<\/HtmlData>/);
  const html = m ? m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'") : data;

  // Print a slice of the HTML to see structure
  console.log('--- HTML excerpt ---');
  console.log(html.replace(/\s+/g, ' ').slice(0, 2500));
  console.log('...');
  console.log('--- end excerpt ---\n');

  // Look for any class/id naming for top vs bottom playoff
  const $ = cheerio.load(html);
  console.log('Total table_row elements:', $('a.table_row, .table_row').length);
  console.log('Distinct class signatures of rows:');
  const sigs = new Set();
  $('a.table_row, .table_row').each((_, el) => sigs.add($(el).attr('class')));
  for (const c of sigs) console.log('  ' + c);

  // Look at sections / headings / dividers
  console.log('\nLooking for headings/section divs:');
  $('h1, h2, h3, h4, .section_title, .header_table, [class*=playoff], [class*=upper], [class*=lower]').each((_, el) => {
    const cls = $(el).attr('class') || '';
    const txt = $(el).text().trim().slice(0, 60);
    console.log(`  <${el.tagName} class="${cls}"> ${txt}`);
  });

  // Look for explicit position numbers
  console.log('\nFirst 3 rows raw HTML:');
  $('a.table_row').slice(0, 3).each((i, el) => {
    console.log(`Row ${i}:`, $(el).html().replace(/\s+/g, ' ').slice(0, 400));
  });

  await browser.close();
})();
