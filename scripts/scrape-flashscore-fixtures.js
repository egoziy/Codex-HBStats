/**
 * scrape-flashscore-fixtures.js — discover every match in a Flashscore season.
 *
 * Walks both /results/ (completed) and /fixtures/ (upcoming) pages, clicks
 * "Show more matches" until exhausted, and upserts a minimal row per match
 * into FlashscoreScrapedMatch. Per-match details (events/stats/lineups) are
 * filled later by scrape-flashscore-match.js.
 *
 * Run:
 *   node scripts/scrape-flashscore-fixtures.js \
 *     [--league-slug ligat-ha-al] [--season 2025-2026] [--headful]
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const {
  FLASHSCORE_ORIGIN,
  launchBrowser,
  newPage,
  gotoAndSettle,
  sleep,
} = require('./lib/flashscore-scraper');

const prisma = new PrismaClient();

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}

const LEAGUE_SLUG = arg('league-slug', 'ligat-ha-al');
const SEASON = arg('season', '2025-2026');
const HEADFUL = process.argv.includes('--headful');

async function loadAllRows(page) {
  // Flashscore's "Show more matches" button paginates older results.
  for (let i = 0; i < 30; i++) {
    const clicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('a, button')).find((b) =>
        /show more matches|previous matches/i.test((b.innerText || '').trim()),
      );
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!clicked) break;
    await sleep(1500);
  }
}

async function extractRows(page) {
  return page.evaluate(() => {
    // Rows are anchored by id="g_1_<matchKey>" and contain time + home + away.
    const out = [];
    let currentDate = null;
    const root = document.querySelector('.event--results, .leagues--static, body') || document.body;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) {
      // Detect a date header (Flashscore uses "wclLeagueHeader" / similar)
      const cls = node.className && node.className.baseVal ? node.className.baseVal : node.className;
      const txt = (node.innerText || '').trim();
      if (typeof cls === 'string' && /header|wclLeague/i.test(cls) && /\d{2}\.\d{2}/.test(txt)) {
        const dm = txt.match(/(\d{2})\.(\d{2})\.\s*(\d{4})?/);
        if (dm) currentDate = { dd: dm[1], mm: dm[2], yyyy: dm[3] || null };
      }
      const id = node.id || '';
      if (!id.startsWith('g_')) continue;
      const matchKey = id.replace(/^g_\d+_/, '');
      if (matchKey.length < 6) continue;

      const linkEl = node.querySelector('a[href*="/match/"]') || node;
      const href = (linkEl.getAttribute && linkEl.getAttribute('href')) || null;
      const txtAll = (node.innerText || '').trim();
      const teamLinks = Array.from(node.querySelectorAll('a[href*="/team/"]')).map((a) => a.getAttribute('href'));
      // Time like "21:00" or status like "FT" / "Postponed"
      const timeMatch = txtAll.match(/^(\d{2}:\d{2})/m);
      const statusMatch = txtAll.match(/\b(FT|HT|Postp\.|Cancelled|Awarded|AET|Pen\.)\b/);
      // Scores — first two numbers on separate lines
      const scoreLines = txtAll.split('\n').map((l) => l.trim()).filter((l) => /^\d+$/.test(l));
      const home_score = scoreLines[0] ? parseInt(scoreLines[0], 10) : null;
      const away_score = scoreLines[1] ? parseInt(scoreLines[1], 10) : null;

      out.push({
        matchKey,
        href: href ? (href.startsWith('http') ? href : `https://www.flashscore.com${href}`) : null,
        date: currentDate,
        time: timeMatch ? timeMatch[1] : null,
        status: statusMatch ? statusMatch[1] : null,
        teamLinks,
        home_score,
        away_score,
        raw: txtAll.slice(0, 300),
      });
    }
    return out;
  });
}

async function scrapePage(browser, urlPath, label) {
  const page = await newPage(browser);
  const url = `${FLASHSCORE_ORIGIN}/football/israel/${LEAGUE_SLUG}/${urlPath}/`;
  console.log(`\n→ ${label}: ${url}`);
  await gotoAndSettle(page, url, { settleMs: 3500 });
  await loadAllRows(page);
  const rows = await extractRows(page);
  await page.close();
  return rows;
}

function buildKickoffAt(date, time, fallbackYear) {
  if (!date) return null;
  const yyyy = date.yyyy || fallbackYear;
  if (!yyyy) return null;
  const t = time || '00:00';
  return new Date(`${yyyy}-${date.mm}-${date.dd}T${t}:00Z`);
}

function yearForMonth(mm, season) {
  // SEASON is like "2025-2026". Aug-Dec → first year, Jan-Jul → second year.
  const [y1, y2] = season.split('-');
  return parseInt(mm, 10) >= 8 ? y1 : y2;
}

(async () => {
  const browser = await launchBrowser({ headful: HEADFUL });
  try {
    const fallbackYear = SEASON.split('-')[0]; // e.g. "2025"
    const results = await scrapePage(browser, 'results', 'RESULTS');
    const fixtures = await scrapePage(browser, 'fixtures', 'FIXTURES');
    const all = [...results, ...fixtures];
    console.log(`\n  collected ${results.length} results + ${fixtures.length} fixtures = ${all.length} rows`);

    let upserted = 0, skipped = 0;
    for (const row of all) {
      if (!row.matchKey) { skipped++; continue; }
      // Pull team slug-keys from the match URL path: /match/football/{home}/{away}/?mid=...
      const pathTeams = row.href ? row.href.match(/\/match\/football\/([a-z0-9-]+)\/([a-z0-9-]+)/i) : null;
      const homeKey = pathTeams ? pathTeams[1] : null;
      const awayKey = pathTeams ? pathTeams[2] : null;
      // Date sits as the first line of the row text on Flashscore's results page.
      // Two formats: "DD.MM.YYYY" (older) and "DD.MM." + "HH:MM" (current season — year omitted).
      const fullDate = (row.raw || '').match(/(\d{2})\.(\d{2})\.(\d{4})/);
      const partialDate = (row.raw || '').match(/(\d{2})\.(\d{2})\.\s+(\d{1,2}):(\d{2})/);
      let date = null, timeFromRaw = null;
      if (fullDate) {
        date = { dd: fullDate[1], mm: fullDate[2], yyyy: fullDate[3] };
      } else if (partialDate) {
        date = { dd: partialDate[1], mm: partialDate[2], yyyy: yearForMonth(partialDate[2], SEASON) };
        timeFromRaw = `${partialDate[3].padStart(2, '0')}:${partialDate[4]}`;
      } else {
        date = row.date;
      }
      const kickoffAt = buildKickoffAt(date, row.time || timeFromRaw, fallbackYear) || null;

      await prisma.flashscoreScrapedMatch.upsert({
        where: { matchKey: row.matchKey },
        update: {
          leagueSlug: LEAGUE_SLUG,
          season: SEASON,
          url: row.href,
          kickoffAt,
          homeKey,
          awayKey,
          status: row.status,
          payload: {
            ...(row.home_score != null && { home_score: row.home_score }),
            ...(row.away_score != null && { away_score: row.away_score }),
            summary_raw: row.raw,
          },
        },
        create: {
          matchKey: row.matchKey,
          leagueSlug: LEAGUE_SLUG,
          season: SEASON,
          url: row.href,
          kickoffAt,
          homeKey,
          awayKey,
          status: row.status,
          payload: {
            ...(row.home_score != null && { home_score: row.home_score }),
            ...(row.away_score != null && { away_score: row.away_score }),
            summary_raw: row.raw,
          },
        },
      });
      upserted++;
    }
    console.log(`\n  ✓ upserted ${upserted} matches, skipped ${skipped}\n`);
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
