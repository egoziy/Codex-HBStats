/**
 * scrape-flashscore-team.js — fetch a team's overview, squad, and transfers.
 *
 * Usage:
 *   node scripts/scrape-flashscore-team.js --team h-beer-sheva-EXAD1YZP
 *   node scripts/scrape-flashscore-team.js --all-in-league
 *     (loads every unique homeKey/awayKey in FlashscoreScrapedMatch)
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const {
  FLASHSCORE_ORIGIN,
  launchBrowser,
  newPage,
  gotoAndSettle,
  parseTeamUrl,
  sleep,
} = require('./lib/flashscore-scraper');

const prisma = new PrismaClient();

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}

function teamUrl(teamKey, sub = '') {
  // teamKey is "slug-shortKey". The actual URL uses /team/{slug}/{shortKey}/.
  // We split on the last "-" to find the boundary (slugs may have hyphens too).
  const m = teamKey.match(/^([a-z0-9-]+)-([A-Za-z0-9]{6,})$/);
  if (!m) return null;
  const [, slug, key] = m;
  return `${FLASHSCORE_ORIGIN}/team/${slug}/${key}/${sub ? sub + '/' : ''}`;
}

async function extractOverview(page) {
  return page.evaluate(() => {
    // Page title is like "H. Beer Sheva live scores, results, fixtures, Beit…"
    const titleName = (document.title || '').split(/ (?:live|squad|fixtures|results)/i)[0].trim();
    const heading = document.querySelector('[class*="heading"]');
    const stadiumLine = (heading?.innerText || '').split('\n').find((l) => /stadium/i.test(l)) || null;
    const capacityLine = (heading?.innerText || '').split('\n').find((l) => /capacity/i.test(l)) || null;
    return { heading: heading ? (heading.innerText || '').trim() : null, titleName, stadiumLine, capacityLine };
  });
}

async function extractSquad(page) {
  return page.evaluate(() => {
    const rows = [];
    // Squad table rows — Flashscore uses class with "wcl-cell" and contains an /player/ anchor.
    const playerLinks = document.querySelectorAll('a[href*="/player/"]');
    const seen = new Set();
    for (const a of playerLinks) {
      const href = a.getAttribute('href');
      if (seen.has(href)) continue;
      seen.add(href);
      // Walk up to a row container for jersey + position
      let row = a.parentElement;
      for (let i = 0; i < 6 && row; i++) {
        if (row.tagName === 'TR' || /row/i.test((row.className || '').toString())) break;
        row = row.parentElement;
      }
      const rowText = row ? (row.innerText || '').replace(/\s+/g, ' ').trim() : '';
      rows.push({
        href: href.startsWith('http') ? href : `https://www.flashscore.com${href}`,
        name: (a.innerText || '').trim(),
        rowText: rowText.slice(0, 200),
      });
    }
    return rows;
  });
}

async function loadAllTransferRows(page) {
  for (let i = 0; i < 20; i++) {
    const clicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('a, button, div, span'))
        .find((el) => /show more/i.test((el.innerText || '').trim()) && el.offsetWidth > 0);
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!clicked) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function extractTransfers(page) {
  // The default ALL tab shows every transfer. Each row's partner-team cell is
  // tagged transferTab__team--to (player went TO partner = OUT/departure) or
  // transferTab__team--from (player came FROM partner = IN/arrival).
  await loadAllTransferRows(page);
  return page.evaluate(() => {
    const out = { in: [], out: [] };
    const rows = document.querySelectorAll('.transferTab__row.transferTab__row--team');
    for (const row of rows) {
      if (row.classList.contains('transferTab__row--main')) continue;
      const playerAnchor = row.querySelector('.transferTab__player .transferTab__teamHref');
      const partnerAnchor = row.querySelector('.transferTab__team .transferTab__teamHref');
      // Direction is in the SVG icon's class: --in (arrival) or --out (departure).
      const isOut = !!row.querySelector('.transferTab__typeIcon--out');
      const cells = (row.innerText || '').split('\n').map((l) => l.trim()).filter(Boolean);
      const abs = (a) => {
        if (!a) return null;
        const h = a.getAttribute('href') || '';
        return h.startsWith('http') ? h : `https://www.flashscore.com${h}`;
      };
      const entry = {
        playerHref: abs(playerAnchor),
        playerName: playerAnchor ? (playerAnchor.innerText || '').trim() : (cells[1] || null),
        partnerHref: abs(partnerAnchor),
        partnerName: partnerAnchor ? (partnerAnchor.innerText || '').trim() : (cells[2] || null),
        date: cells[0] || null,
        fee: cells[3] || null,
        type: cells[4] || null,
      };
      (isOut ? out.out : out.in).push(entry);
    }
    return out;
  });
}

async function scrapeTeam(page, teamKey, season) {
  const overviewUrl = teamUrl(teamKey);
  if (!overviewUrl) throw new Error(`bad teamKey: ${teamKey}`);

  // 1. Overview
  await gotoAndSettle(page, overviewUrl, { settleMs: 3500 });
  const overview = await extractOverview(page);
  const nameEn = overview.titleName || null;

  // 2. Squad
  await gotoAndSettle(page, teamUrl(teamKey, 'squad'), { settleMs: 3500 });
  await page.evaluate(async () => {
    for (let y = 0; y < 5000; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 200));
    }
  });
  await sleep(1000);
  const squad = await extractSquad(page);

  // 3. Transfers
  await gotoAndSettle(page, teamUrl(teamKey, 'transfers'), { settleMs: 3500 });
  await page.evaluate(async () => {
    for (let y = 0; y < 5000; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 200));
    }
  });
  await sleep(1000);
  const transfers = await extractTransfers(page);

  // Persist
  await prisma.flashscoreScrapedTeam.upsert({
    where: { teamKey },
    update: {
      url: overviewUrl,
      nameEn,
      leagueSlug: 'ligat-ha-al',
      season,
      payload: { overview, squad, transfers, scrapedAt: new Date().toISOString() },
      scrapedAt: new Date(),
    },
    create: {
      teamKey,
      url: overviewUrl,
      nameEn,
      leagueSlug: 'ligat-ha-al',
      season,
      payload: { overview, squad, transfers, scrapedAt: new Date().toISOString() },
    },
  });

  // Persist individual transfer rows
  const parseDmy = (s) => {
    if (!s) return new Date('1970-01-01');
    const m = String(s).match(/(\d{2})\.(\d{2})\.(\d{4})/);
    return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00Z`) : new Date('1970-01-01');
  };
  const insertTransfer = async (direction, t) => {
    const playerKey = (t.playerHref || '').match(/\/player\/[^/]+\/([A-Za-z0-9]{6,})/)?.[1] || null;
    const transferDate = parseDmy(t.date);
    const fromTeam = direction === 'in' ? t.partnerName : null;
    const toTeam = direction === 'out' ? t.partnerName : null;
    await prisma.flashscoreScrapedTransfer.upsert({
      where: {
        transfer_natural_key: { teamKey, season, direction, playerName: t.playerName, transferDate },
      },
      update: { payload: t, scrapedAt: new Date(), playerKey, fromTeam, toTeam, fee: t.fee || null },
      create: {
        teamKey, season, direction, playerName: t.playerName, playerKey, transferDate,
        fromTeam, toTeam, fee: t.fee || null, payload: t,
      },
    });
  };
  for (const t of (transfers.in || [])) await insertTransfer('in', t);
  for (const t of (transfers.out || [])) await insertTransfer('out', t);

  return { squad: squad.length, transfersIn: (transfers.in || []).length, transfersOut: (transfers.out || []).length };
}

async function loadTeamKeys() {
  const oneTeam = arg('team', null);
  if (oneTeam) return [oneTeam];
  if (process.argv.includes('--all-in-league')) {
    const matches = await prisma.flashscoreScrapedMatch.findMany({
      where: { leagueSlug: 'ligat-ha-al' },
      select: { homeKey: true, awayKey: true },
    });
    const set = new Set();
    for (const m of matches) {
      if (m.homeKey) set.add(m.homeKey);
      if (m.awayKey) set.add(m.awayKey);
    }
    return Array.from(set);
  }
  return [];
}

(async () => {
  const season = arg('season', '2025-2026');
  const keys = await loadTeamKeys();
  console.log(`Team scraper: ${keys.length} teams queued.`);
  if (keys.length === 0) { await prisma.$disconnect(); return; }

  const browser = await launchBrowser({ headful: process.argv.includes('--headful') });
  const page = await newPage(browser, { blockAssets: false });
  try {
    let i = 0;
    for (const k of keys) {
      i++;
      try {
        const r = await scrapeTeam(page, k, season);
        console.log(`  [${i}/${keys.length}] ${k}: squad=${r.squad} in=${r.transfersIn} out=${r.transfersOut}`);
      } catch (e) {
        console.log(`  [${i}/${keys.length}] ${k} FAIL: ${e.message.slice(0, 100)}`);
      }
      await sleep(1500);
    }
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
