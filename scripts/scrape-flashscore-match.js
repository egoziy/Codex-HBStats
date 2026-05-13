/**
 * scrape-flashscore-match.js — fetch summary + stats + events + lineups
 * for one or more matches and store as the `payload` of FlashscoreScrapedMatch.
 *
 * Usage:
 *   node scripts/scrape-flashscore-match.js --match bHtlf14F
 *   node scripts/scrape-flashscore-match.js --all-missing
 *   node scripts/scrape-flashscore-match.js --since 2026-05-01
 *   Add --headful to watch.
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const {
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

async function extractFromSummary(page) {
  return page.evaluate(() => {
    function txt(el, n) {
      if (!el) return null;
      const s = (el.innerText || '').trim().replace(/\s+/g, ' ');
      return n ? s.slice(0, n) : s;
    }

    // Score block — "matchInfo" gives "X - Y FINISHED" or "X - Y AET" etc.
    const scoreInfo = txt(document.querySelector('[class*="detailParticipantsInfo"], [class*="matchInfo"]'));
    // Date/time string near the top
    const datetime = txt(document.querySelector('[class*="duelParticipant__startTime"], [class*="startTime"]'));

    // Stats — Flashscore uses class names like "wcl-row_2oCpS" (hash varies between builds).
    // Each row has 3 lines of text: home value, label, away value.
    const stats = [];
    const statRows = document.querySelectorAll('[class^="wcl-row_"], [class*=" wcl-row_"]');
    const seen = new Set();
    for (const row of statRows) {
      const lines = (row.innerText || '').split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length !== 3) continue;
      const [home, label, away] = lines;
      if (!/^[\d.,%]+$/.test(home) && !/^[\d.,%]+$/.test(away)) continue;
      if (seen.has(label)) continue;
      seen.add(label);
      stats.push({ label, home, away });
    }

    // Events — smv__incident class hierarchy
    const events = [];
    const eventEls = document.querySelectorAll('[class*="smv__incident"], [class*="incident__"]');
    for (const ev of eventEls) {
      const t = (ev.innerText || '').trim();
      if (!t) continue;
      // Filter out duplicate wrapper nodes — keep ones with a minute marker
      if (!/^\d+\'/.test(t) && !/^\(?\d+'\)?/.test(t)) continue;
      const minuteMatch = t.match(/(\d+)'/);
      const side = ev.className && /home/i.test(ev.className) ? 'home' : (ev.className && /away/i.test(ev.className) ? 'away' : null);
      events.push({
        minute: minuteMatch ? parseInt(minuteMatch[1], 10) : null,
        side,
        text: t.replace(/\s+/g, ' ').slice(0, 240),
      });
    }

    // Match info chips at bottom: REFEREE / VENUE / ATTENDANCE
    const infoChips = {};
    const chipEls = document.querySelectorAll('[class*="mi__item"], [class*="matchInfoItem"]');
    for (const c of chipEls) {
      const t = (c.innerText || '').trim();
      const m = t.match(/^([A-Z][A-Za-z ]+):\s*(.+)$/m);
      if (m) infoChips[m[1].toLowerCase().replace(/\s+/g, '_')] = m[2].trim();
    }

    return {
      title: document.title,
      scoreInfo,
      datetime,
      stats,
      events,
      info: infoChips,
    };
  });
}

async function extractLineups(page) {
  return page.evaluate(() => {
    const out = { home: { formation: null, starters: [], subs: [], coach: null },
                  away: { formation: null, starters: [], subs: [], coach: null } };
    // Formation header: "3 - 4 - 1 - 2 FORMATION 4 - 3 - 3"
    const formationRow = Array.from(document.querySelectorAll('div'))
      .find((d) => /FORMATION/.test((d.innerText || '')));
    if (formationRow) {
      const m = formationRow.innerText.match(/([\d -]+)\s*FORMATION\s*([\d -]+)/);
      if (m) {
        out.home.formation = m[1].replace(/\s/g, '');
        out.away.formation = m[2].replace(/\s/g, '');
      }
    }
    // Side detection — Flashscore tags the pitch container with one of:
    //   .lf__formation--extended    → HOME
    //   .lf__formationAway          → AWAY
    // Substitute rows use [class*="wcl-substitute_"] and sit in a SUBSTITUTES
    // section that has separate columns per team (still detect side via header
    // adjacency, but for now we can use rect.x centre against an aggregated
    // median because the table has clear left/right columns).
    function readPlayer(el) {
      const lines = (el.innerText || '').split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length < 1) return null;
      const jersey = /^\d+$/.test(lines[0]) ? parseInt(lines[0], 10) : null;
      const name = jersey != null ? lines[1] : lines[0];
      if (!name) return null;
      const ratingLine = lines.find((l) => /^\d+\.\d+$/.test(l));
      const rating = ratingLine ? parseFloat(ratingLine) : null;
      const a = el.querySelector('a[href*="/player/"]');
      const playerHref = a ? a.getAttribute('href') : null;
      return { jersey, name, rating, playerHref };
    }

    // Starters: split deterministically by formation ancestor.
    const seen = new Set();
    for (const el of document.querySelectorAll('.lf__formation .lf__player')) {
      const formAncestor = el.closest('.lf__formation');
      const isAway = formAncestor && /lf__formationAway/.test(formAncestor.className || '');
      const p = readPlayer(el);
      if (!p) continue;
      const key = `start|${isAway ? 'a' : 'h'}|${p.playerHref || p.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      (isAway ? out.away.starters : out.home.starters).push(p);
    }

    // Substitutes: collect rows tagged wcl-substitute_*, split by horizontal
    // position. Subs sit in a side-by-side block (home column left, away right).
    const subEls = Array.from(document.querySelectorAll('[class*="wcl-substitute_"]'));
    const subPositions = subEls
      .map((el) => ({ el, p: readPlayer(el), x: el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2 }))
      .filter((r) => r.p);
    const xs = subPositions.map((r) => r.x).sort((a, b) => a - b);
    const median = xs.length ? xs[Math.floor(xs.length / 2)] : 683;
    for (const r of subPositions) {
      const side = r.x < median ? 'home' : 'away';
      const key = `sub|${side}|${r.p.playerHref || r.p.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out[side].subs.push(r.p);
    }
    return out;
  });
}

async function scrapeMatch(page, matchKey, url) {
  console.log(`  → ${matchKey}: ${url}`);
  // 1. Summary page (with stats + events embedded) — scroll to hydrate full table.
  await gotoAndSettle(page, url, { settleMs: 4500 });
  await page.evaluate(async () => {
    for (let y = 0; y < 4000; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 250));
    }
    window.scrollTo(0, 0);
  });
  await sleep(1500);
  const summary = await extractFromSummary(page);

  // 2. Stats page — full stats panel (the summary tab only shows headline stats).
  const statsUrl = url.replace(/\/\?mid=/, '/summary/stats/?mid=');
  try {
    await gotoAndSettle(page, statsUrl, { settleMs: 4000 });
    await page.evaluate(async () => {
      for (let y = 0; y < 4000; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 200));
      }
    });
    await sleep(1200);
    const statsPage = await extractFromSummary(page);
    if (statsPage.stats && statsPage.stats.length > summary.stats.length) {
      summary.stats = statsPage.stats;
    }
  } catch (e) {
    // Some matches don't have a stats tab — fall back to summary stats.
  }

  // 3. Lineups page — scroll to bottom so substitute rows hydrate.
  const lineupsUrl = url.replace(/\/\?mid=/, '/summary/lineups/?mid=');
  await gotoAndSettle(page, lineupsUrl, { settleMs: 4000 });
  await page.evaluate(async () => {
    for (let y = 0; y < 4000; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 250));
    }
    window.scrollTo(0, 0);
  });
  await sleep(1500);
  const lineups = await extractLineups(page);

  return {
    title: summary.title,
    scoreInfo: summary.scoreInfo,
    datetime: summary.datetime,
    info: summary.info,
    stats: summary.stats,
    events: summary.events,
    lineups,
    scrapedAt: new Date().toISOString(),
  };
}

async function loadMatches() {
  const matchArg = arg('match', null);
  const since = arg('since', null);
  const allMissing = process.argv.includes('--all-missing');

  if (matchArg) {
    return prisma.flashscoreScrapedMatch.findMany({ where: { matchKey: matchArg } });
  }
  const where = { kickoffAt: { lt: new Date() } };
  if (since) where.kickoffAt = { gte: new Date(since), lt: new Date() };
  const rows = await prisma.flashscoreScrapedMatch.findMany({
    where,
    orderBy: { kickoffAt: 'desc' },
    take: parseInt(arg('limit', '500'), 10),
  });
  // Filter out matches that already have a stats payload (JSON path filtering at
  // the DB level is finicky — easier to filter in JS for Phase 1).
  if (allMissing) return rows.filter((r) => !(r.payload && Array.isArray(r.payload.stats) && r.payload.stats.length > 0));
  return rows;
}

(async () => {
  const matches = await loadMatches();
  console.log(`Match scraper: ${matches.length} matches queued.`);
  if (matches.length === 0) { await prisma.$disconnect(); return; }

  let browser = await launchBrowser({ headful: process.argv.includes('--headful') });
  let page = await newPage(browser, { blockAssets: false });

  async function reopenPage() {
    try { await page.close(); } catch {}
    try { await browser.close(); } catch {}
    browser = await launchBrowser({ headful: process.argv.includes('--headful') });
    page = await newPage(browser, { blockAssets: false });
  }

  try {
    let i = 0;
    let consecFailures = 0;
    for (const m of matches) {
      i++;
      try {
        const detail = await scrapeMatch(page, m.matchKey, m.url);
        const merged = { ...(m.payload || {}), ...detail };
        await prisma.flashscoreScrapedMatch.update({
          where: { matchKey: m.matchKey },
          data: {
            payload: merged,
            status: detail.scoreInfo && /finished/i.test(detail.scoreInfo) ? 'FT'
                    : detail.scoreInfo && /aet/i.test(detail.scoreInfo) ? 'AET'
                    : detail.scoreInfo && /cancel|postp/i.test(detail.scoreInfo) ? 'CANC'
                    : m.status,
            scrapedAt: new Date(),
          },
        });
        console.log(`     ✓ stats=${detail.stats.length} events=${detail.events.length} startersH=${detail.lineups.home.starters.length} startersA=${detail.lineups.away.starters.length}`);
        consecFailures = 0;
      } catch (e) {
        console.log(`     ✗ ${m.matchKey}: ${e.message.slice(0, 100)}`);
        consecFailures++;
        // Recover from detached-frame / browser crashes by recycling the page.
        if (/detached frame|target closed|net::|protocol error/i.test(e.message) || consecFailures >= 2) {
          console.log('     ↻ recycling browser');
          await reopenPage();
          consecFailures = 0;
        }
      }
      // Polite pacing
      await sleep(1200);
      // Preventive recycle every 30 matches — Chrome accumulates state.
      if (i % 30 === 0) {
        console.log(`    [${i}/${matches.length}] (preventive recycle)`);
        await reopenPage();
      } else if (i % 20 === 0) {
        console.log(`    [${i}/${matches.length}]`);
      }
    }
  } finally {
    try { await browser.close(); } catch {}
    await prisma.$disconnect();
  }
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
