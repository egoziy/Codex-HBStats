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
  // Hapoel Beer Sheva (team 3987) in 2002/03 (league 188)
  console.log('=== Hapoel Beer Sheva 2002/03 ===');
  const html = await fetchPage('https://sports.walla.co.il/team/3987/188');
  console.log('Page length:', html.length);

  // Get all captions
  const captions = [...html.matchAll(/<caption[^>]*>([\s\S]*?)<\/caption>/g)].map((c) => c[1].replace(/<[^>]+>/g, '').trim());
  console.log('\nCaptions:', captions);

  // Get all tables
  const tbodies = [...html.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)];
  console.log('\nTables:', tbodies.length);

  // Parse each table
  for (let i = 0; i < tbodies.length; i++) {
    const rows = [...tbodies[i][1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
    const sampleText = rows.slice(0, 3).map((r) => cleanText(r[1]).slice(0, 120));
    console.log('\n[' + i + '] ' + (captions[i] || '?') + ' — ' + rows.length + ' rows:');
    for (const t of sampleText) console.log('  ' + t);
  }

  // Check for game/match specific tables — look for score patterns (N:N or N-N)
  console.log('\n=== Looking for match results ===');
  for (let i = 0; i < tbodies.length; i++) {
    const text = cleanText(tbodies[i][1]);
    if (text.match(/\d+\s*:\s*\d+/) || text.match(/\d+\s*-\s*\d+.*\d+\s*-\s*\d+/)) {
      console.log('[' + i + '] Has scores! (' + (captions[i] || '?') + ')');
      const rows = [...tbodies[i][1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
      for (const r of rows.slice(0, 5)) {
        console.log('  ' + cleanText(r[1]).slice(0, 150));
      }
    }
  }

  // Check what team IDs are available for Beer Sheva across seasons
  console.log('\n=== Team links on page ===');
  const teamLinks = [...html.matchAll(/\/team\/(\d+)\/(\d+)/g)];
  const uniqueTeamSeasons = new Map();
  for (const t of teamLinks) {
    const key = t[1] + '/' + t[2];
    if (!uniqueTeamSeasons.has(key)) uniqueTeamSeasons.set(key, 0);
    uniqueTeamSeasons.set(key, uniqueTeamSeasons.get(key) + 1);
  }
  console.log('Unique team/league combos:', uniqueTeamSeasons.size);
  for (const [key, count] of [...uniqueTeamSeasons.entries()].slice(0, 10)) {
    console.log('  /team/' + key + ' (' + count + 'x)');
  }
}

main().catch(console.error);
