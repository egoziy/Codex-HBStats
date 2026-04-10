const https = require('https');

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept-Language': 'he-IL,he;q=0.9' },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function cleanText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, '|')
    .replace(/\|+/g, '|')
    .replace(/^\||\|$/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim();
}

async function main() {
  // Check all stat types for league 17 (2000/01)
  for (let stat = 3; stat <= 27; stat++) {
    const url = `https://sports.walla.co.il/stats?leagueId=17&stat=${stat}`;
    const html = await fetchPage(url);

    // Get page title/heading
    const title = html.match(/<h[23][^>]*>([^<]+)/)?.[1]?.trim() || '?';

    // Get table
    const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1];
    if (!tbody) {
      console.log('stat=' + stat + ' | ' + title + ' | NO TABLE (length: ' + html.length + ')');
      continue;
    }

    const rows = [...tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
    const sample = rows.slice(0, 3).map((r) => cleanText(r[1]).slice(0, 100));

    console.log('stat=' + stat + ' | ' + title + ' | ' + rows.length + ' rows');
    for (const s of sample) console.log('  ' + s);
    console.log();

    await new Promise((r) => setTimeout(r, 500));
  }
}

main().catch(console.error);
