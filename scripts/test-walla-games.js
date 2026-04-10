const https = require('https');
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, (res) => {
      if (res.statusCode >= 300 && res.headers.location) return fetchPage(res.headers.location).then(resolve).catch(reject);
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  // Try 2020/21 league page with round=1
  console.log('=== League 2623 (2020/21) round 1 ===');
  const html = await fetchPage('https://sports.walla.co.il/league/2623?r=1');
  console.log('Length:', html.length);

  // Look for match/game related HTML structure
  const gameClasses = [...html.matchAll(/class="([^"]*(?:match|game|fixture|result|round-game|score)[^"]*)"/gi)];
  const unique = new Set(gameClasses.map((g) => g[1]));
  console.log('Game-related classes:', [...unique].slice(0, 15));

  // Extract game rows from the page (not tables — might be divs)
  const gameRows = [...html.matchAll(/class="game-row[^"]*"([\s\S]*?)<\/(?:div|tr|li)>/g)];
  console.log('Game rows:', gameRows.length);

  // Look for sections with two team names
  const sections = [...html.matchAll(/<section[^>]*>([\s\S]*?)<\/section>/g)];
  console.log('Sections:', sections.length);

  // Try to find any structured game data
  const allTbodies = [...html.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)];
  console.log('\nTables (tbody):', allTbodies.length);
  for (let i = 0; i < allTbodies.length; i++) {
    const rows = [...allTbodies[i][1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
    const text = rows[0]?.[1]?.replace(/<style[\s\S]*?<\/style>/g, '')?.replace(/<[^>]+>/g, '|')?.replace(/\|+/g, '|')?.trim()?.slice(0, 120);
    console.log('  Table ' + i + ': ' + rows.length + ' rows | ' + text);
  }

  // Check the round dropdown options on this page
  const roundOptions = [...html.matchAll(/<option[^>]*value="(\d+)"[^>]*>([^<]*מחזור[^<]*)/g)];
  console.log('\nRound options:', roundOptions.length);
  for (const r of roundOptions.slice(0, 5)) {
    console.log('  r=' + r[1] + ': ' + r[2].trim());
  }

  // Does the page have games rendered as react components?
  const gameData = html.match(/\"games\"\s*:\s*\[/);
  console.log('\nHas games JSON:', !!gameData);

  // Check for game links
  const gameLinks = [...html.matchAll(/\/game\/(\d+)/g)];
  console.log('Game link count:', new Set(gameLinks.map((g) => g[1])).size);

  // Check match result divs specifically
  const resultDivs = [...html.matchAll(/class="[^"]*result[^"]*"[\s\S]{0,100}/g)];
  console.log('\nResult divs:', resultDivs.length);
  if (resultDivs[0]) console.log('  Sample:', resultDivs[0][0].slice(0, 100));
}

main().catch(console.error);
