#!/usr/bin/env node
/**
 * Winner.co.il Odds Scraper — Puppeteer version
 * Fetches 1X2 odds for Israeli Premier League matches (and optionally all soccer)
 *
 * Usage:
 *   node scripts/scrape-winner-odds.js              # ליגת העל בלבד
 *   node scripts/scrape-winner-odds.js --all        # כל הכדורגל
 *   node scripts/scrape-winner-odds.js --json       # פלט JSON
 */

const puppeteer = require('puppeteer-core');

const ISRAELI_LEAGUES = ['ליגת העל', 'ליגה לאומית', 'גביע המדינה', 'גביע טוטו', 'ליגת Winner'];

function parseDate(eDate, mHour) {
  const s = String(eDate);
  const yy = s.slice(0, 2);
  const mm = s.slice(2, 4);
  const dd = s.slice(4, 6);
  const hh = String(mHour).padStart(4, '0').slice(0, 2);
  const min = String(mHour).padStart(4, '0').slice(2, 4);
  return `20${yy}-${mm}-${dd} ${hh}:${min}`;
}

function calcOdds(outcomes) {
  if (!outcomes || outcomes.length < 3) return null;
  // Find the 3 basic 1X2 outcomes (no spread, simple desc)
  const basic = outcomes.filter(o => o.spread === '' && !o.desc.match(/\d\s*-\s*\d/));
  if (basic.length !== 3) return null;

  const [home, draw, away] = basic;
  const h = parseFloat(home.price);
  const d = parseFloat(draw.price);
  const a = parseFloat(away.price);
  if (!h || !d || !a) return null;

  const pH = 1 / h;
  const pD = 1 / d;
  const pA = 1 / a;
  const total = pH + pD + pA;
  const margin = ((total - 1) * 100).toFixed(1);

  return {
    home: { name: home.desc, odds: h, pct: ((pH / total) * 100).toFixed(1) },
    draw: { name: draw.desc, odds: d, pct: ((pD / total) * 100).toFixed(1) },
    away: { name: away.desc, odds: a, pct: ((pA / total) * 100).toFixed(1) },
    margin,
  };
}

async function fetchOdds() {
  const browser = await puppeteer.launch({
    headless: false, // Incapsula blocks headless Chrome; must run visible
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800'],
  });

  try {
    const page = await browser.newPage();

    // Intercept the GetDMobileLine API response
    let lineData = null;

    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('GetCMobileLine') && response.status() === 200) {
        try {
          const text = await response.text();
          const json = JSON.parse(text);
          // API uses 'markets' array (not 'lines.u/a')
          const markets = json?.markets || [];
          if (markets.length > 0) {
            if (!lineData) lineData = [];
            lineData.push(...markets);
          }
        } catch {}
      }
    });

    // Navigate and wait for data to load
    await page.goto('https://www.winner.co.il/he/sports/soccer', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait for GetCMobileLine to load (large response ~1.9MB)
    await new Promise(r => setTimeout(r, 8000));

    return lineData || [];
  } finally {
    await browser.close();
  }
}

function printResults(matches, showAll, jsonOutput) {
  // Filter to 1X2 only
  const soccer = matches.filter(m => m.mp && m.mp.includes('1X2'));

  const filtered = showAll
    ? soccer
    : soccer.filter(m => ISRAELI_LEAGUES.some(l => m.league?.includes(l)));

  if (filtered.length === 0) {
    const leagues = [...new Set(soccer.map(m => m.league))].sort();
    console.error(`לא נמצאו משחקים${showAll ? '' : ' ישראליים'}.`);
    console.error('ליגות זמינות:', leagues.join(', ') || 'אין');
    if (!showAll) console.error('השתמש ב --all לראות כל הכדורגל');
    return;
  }

  if (jsonOutput) {
    const out = filtered.map(m => {
      const odds = calcOdds(m.outcomes);
      return {
        matchId: m.mId,
        desc: m.desc,
        league: m.league,
        country: m.country,
        dateTime: parseDate(m.e_date, m.m_hour),
        isLive: m.isLive,
        odds,
      };
    });
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  console.log(`\n📊 יחסי הימורים — Winner.co.il`);
  console.log(`עודכן: ${new Date().toLocaleString('he-IL')}\n`);

  let currentLeague = '';
  for (const m of filtered) {
    if (m.league !== currentLeague) {
      currentLeague = m.league;
      console.log(`\n🏆 ${m.league}${m.country ? ` (${m.country})` : ''}`);
      console.log('─'.repeat(70));
    }

    const dt = parseDate(m.e_date, m.m_hour);
    const live = m.isLive ? ' 🔴 LIVE' : '';
    console.log(`\n  ${m.desc}${live}`);
    console.log(`  📅 ${dt}`);

    const odds = calcOdds(m.outcomes);
    if (odds) {
      console.log(`  1  ${odds.home.name.padEnd(22)} יחס: ${String(odds.home.odds).padStart(5)}   אחוז: ${odds.home.pct}%`);
      console.log(`  X  ${'תיקו'.padEnd(22)} יחס: ${String(odds.draw.odds).padStart(5)}   אחוז: ${odds.draw.pct}%`);
      console.log(`  2  ${odds.away.name.padEnd(22)} יחס: ${String(odds.away.odds).padStart(5)}   אחוז: ${odds.away.pct}%`);
      console.log(`  📈 שולי הימור: ${odds.margin}%`);
    }
  }
  console.log(`\n\nסה"כ ${filtered.length} משחקים.`);
}

async function main() {
  const args = process.argv.slice(2);
  const showAll = args.includes('--all');
  const jsonOutput = args.includes('--json');

  console.error('פותח דפדפן ומושך נתונים מ-Winner...');
  const matches = await fetchOdds();
  console.error(`נמצאו ${matches.length} שורות מה-API.`);

  // Deduplicate by matchId + mp
  const seen = new Set();
  const unique = matches.filter(m => {
    const key = `${m.mId}|${m.mp}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  printResults(unique, showAll, jsonOutput);
}

main().catch(err => {
  console.error('שגיאה:', err.message);
  process.exit(1);
});
