#!/usr/bin/env node
/**
 * Winner.co.il Odds Scraper
 * Fetches 1X2 odds for Israeli Premier League matches (and optionally all soccer)
 *
 * Usage:
 *   node scripts/scrape-winner-odds.js              # ליגת העל בלבד
 *   node scripts/scrape-winner-odds.js --all        # כל הכדורגל
 *   node scripts/scrape-winner-odds.js --json       # פלט JSON
 *
 * How it works:
 *   - lineChecksum=0 forces the API to return all currently-open bets
 *   - The API returns only matches with open betting lines
 *   - Implied probability = 1/odds, normalized to remove bookmaker margin
 */

const ISRAELI_LEAGUES = ['ליגת העל', 'ליגה לאומית', 'גביע המדינה', 'גביע טוטו'];

const HEADERS = {
  'accept': 'application/json',
  'accept-language': 'he-IL,he;q=0.9,en;q=0.8',
  'appversion': '2.6.0',
  'content-type': 'application/json',
  'deviceid': 'eb28e61e3fb79e583ef0b1e73aa225a9',
  'referer': 'https://www.winner.co.il/',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
  'useragentdata': JSON.stringify({
    devicemodel: 'Macintosh',
    deviceos: 'mac os',
    deviceosversion: '10.15.7',
    appversion: '2.6.0',
    apptype: 'mobileweb',
    originId: '3',
    isAccessibility: false,
  }),
  'x-csrf-token': 'null',
};

function parseDate(eDate, mHour) {
  // eDate format: YYMMDD, mHour: HHMM
  const s = String(eDate);
  const yy = s.slice(0, 2);
  const mm = s.slice(2, 4);
  const dd = s.slice(4, 6);
  const hh = mHour.slice(0, 2);
  const min = mHour.slice(2, 4);
  return `20${yy}-${mm}-${dd} ${hh}:${min}`;
}

function calcOdds(outcomes) {
  // Find 1X2 outcomes (home, draw, away)
  if (!outcomes || outcomes.length < 3) return null;

  // Filter to only 1X2 type (3 outcomes with no spread)
  const basic = outcomes.filter(o => o.spread === '' && !o.desc.includes('-'));
  if (basic.length !== 3) return null;

  const [home, draw, away] = basic;
  const h = parseFloat(home.price);
  const d = parseFloat(draw.price);
  const a = parseFloat(away.price);

  if (!h || !d || !a) return null;

  // Implied probabilities (raw)
  const pH = 1 / h;
  const pD = 1 / d;
  const pA = 1 / a;
  const total = pH + pD + pA; // > 1.0 = bookmaker margin (overround)
  const margin = ((total - 1) * 100).toFixed(1);

  // Normalized probabilities (remove margin)
  const normH = ((pH / total) * 100).toFixed(1);
  const normD = ((pD / total) * 100).toFixed(1);
  const normA = ((pA / total) * 100).toFixed(1);

  return {
    home:  { name: home.desc, odds: h, pct: normH },
    draw:  { name: draw.desc, odds: d, pct: normD },
    away:  { name: away.desc, odds: a, pct: normA },
    margin,
  };
}

async function fetchLine() {
  // Use checksum=0 — server returns full current line (all open bets)
  const url = 'https://www.winner.co.il/api/v2/publicapi/GetDMobileLine?lineChecksum=0';
  const res = await fetch(url, { headers: HEADERS });

  if (!res.ok) {
    // checksum=0 may return 500; fall back to a known-working approach:
    // fetch the page first to get a valid checksum, then use it
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.lines;
}

async function fetchLineWithFallback() {
  // Try checksum=0 first (full line)
  try {
    return await fetchLine();
  } catch {
    // Fallback: use a very old checksum which triggers full response
    const url = 'https://www.winner.co.il/api/v2/publicapi/GetDMobileLine?lineChecksum=3171258493';
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.lines;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const showAll = args.includes('--all');
  const jsonOutput = args.includes('--json');

  console.error('מושך נתונים מ-Winner...');

  const lines = await fetchLineWithFallback();
  const all = [...(lines.u || []), ...(lines.a || [])];

  // Filter: only 1X2 soccer matches
  const soccer = all.filter(m => {
    const isCorrectType = m.mp && m.mp.includes('1X2');
    const isSoccer = m.sId === 240 || m.league; // sId 240 = soccer
    return isCorrectType && isSoccer;
  });

  // Filter by Israeli league if not --all
  const matches = showAll
    ? soccer
    : soccer.filter(m => ISRAELI_LEAGUES.some(l => m.league?.includes(l)));

  if (matches.length === 0) {
    const leagues = [...new Set(soccer.map(m => m.league))].sort();
    console.error(`לא נמצאו משחקים${showAll ? '' : ' ישראליים'}.`);
    console.error('ליגות זמינות:', leagues.join(', ') || 'אין');
    if (!showAll) console.error('השתמש ב --all לראות כל הכדורגל');
    process.exit(0);
  }

  if (jsonOutput) {
    const out = matches.map(m => {
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

  // Pretty print
  console.log(`\n📊 יחסי הימורים — Winner.co.il`);
  console.log(`עודכן: ${new Date().toLocaleString('he-IL')}\n`);

  let currentLeague = '';
  for (const m of matches) {
    if (m.league !== currentLeague) {
      currentLeague = m.league;
      console.log(`\n🏆 ${m.league} (${m.country})`);
      console.log('─'.repeat(70));
    }

    const dt = parseDate(m.e_date, m.m_hour);
    const live = m.isLive ? ' 🔴 LIVE' : '';
    console.log(`\n  ${m.desc}${live}`);
    console.log(`  📅 ${dt}`);

    const odds = calcOdds(m.outcomes);
    if (odds) {
      console.log(
        `  1  ${odds.home.name.padEnd(20)} יחס: ${String(odds.home.odds).padStart(5)}   אחוז: ${odds.home.pct}%`
      );
      console.log(
        `  X  ${'תיקו'.padEnd(20)} יחס: ${String(odds.draw.odds).padStart(5)}   אחוז: ${odds.draw.pct}%`
      );
      console.log(
        `  2  ${odds.away.name.padEnd(20)} יחס: ${String(odds.away.odds).padStart(5)}   אחוז: ${odds.away.pct}%`
      );
      console.log(`  📈 שולי הימור: ${odds.margin}%`);
    } else {
      console.log('  (לא נמצאו יחסי 1X2)');
    }
  }

  console.log(`\n\nסה"כ ${matches.length} משחקים.`);
}

main().catch(err => {
  console.error('שגיאה:', err.message);
  process.exit(1);
});
