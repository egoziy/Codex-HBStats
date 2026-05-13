/**
 * scrape-flashscore-player.js — fetch profile, career, market value, contract.
 *
 * Usage:
 *   node scripts/scrape-flashscore-player.js --player K8ECARcG
 *   node scripts/scrape-flashscore-player.js --from-team h-beer-sheva-EXAD1YZP
 *   node scripts/scrape-flashscore-player.js --all-in-league   # every squad player
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

function parseDateDMY(s) {
  if (!s) return null;
  const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return null;
  return new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00Z`);
}

async function extractPlayer(page) {
  return page.evaluate(() => {
    const txt = (el) => el ? (el.innerText || '').trim().replace(/\s+/g, ' ') : null;
    const header = document.querySelector('[class*="playerHeader"]');
    const headerText = txt(header) || '';

    // Header pattern: "Or Blorian Defender (H. Beer Sheva) Age: 26 (07.03.2000) Market value: €1.2m Contract expires: 30.06.2026"
    const nameMatch = headerText.match(/^([A-Za-zÀ-ÿ' .-]+?)\s+(?:Goalkeeper|Defender|Midfielder|Forward)/i);
    const positionMatch = headerText.match(/\b(Goalkeeper|Defender|Midfielder|Forward)\b/);
    const teamMatch = headerText.match(/\(([^)]+)\)/);
    const ageMatch = headerText.match(/Age:\s*(\d+)\s*\((\d{2}\.\d{2}\.\d{4})\)/);
    const marketMatch = headerText.match(/Market value:\s*([^\s]+)/i);
    const contractMatch = headerText.match(/Contract expires:\s*(\d{2}\.\d{2}\.\d{4})/);
    const nationalityMatch = headerText.match(/Nationality:\s*([A-Za-z ]+?)(?:\s+(?:Market|Contract|Age|Position)|$)/);
    const heightMatch = headerText.match(/Height:\s*(\d+)\s*cm/i);

    // Career table — Flashscore's active career tab holds the season list.
    // Format: SEASON \n TEAM \n COMPETITION \n RATING \n APPS \n GOALS \n ASSISTS \n YEL \n RED
    // TOTAL row appears last (no team/competition columns).
    const careerTab = document.querySelector('.careerTab--active');
    const careerRowsRaw = careerTab ? careerTab.innerText.split('\n').map((l) => l.trim()).filter(Boolean) : [];
    const career = [];
    // Drop the column-header rows (SEASON, TEAM, COMPETITION) then walk in groups of 9.
    const startIdx = careerRowsRaw.findIndex((l) => /^\d{4}\/\d{4}$/.test(l));
    let i = startIdx;
    while (i >= 0 && i < careerRowsRaw.length - 5) {
      const line = careerRowsRaw[i];
      if (line === 'TOTAL') break;
      if (!/^\d{4}\/\d{4}$/.test(line)) { i++; continue; }
      const season = line;
      const team = careerRowsRaw[i + 1] || null;
      const competition = careerRowsRaw[i + 2] || null;
      // Collect numeric stat tokens until we hit a season-shaped value or TOTAL.
      const nums = [];
      let j = i + 3;
      while (j < careerRowsRaw.length && !/^\d{4}\/\d{4}$/.test(careerRowsRaw[j]) && careerRowsRaw[j] !== 'TOTAL') {
        nums.push(careerRowsRaw[j]); j++;
      }
      // Heuristic: if 6 numbers → [rating, apps, goals, assists, yellow, red]
      //            if 5 numbers → [apps, goals, assists, yellow, red] (no rating)
      const hasRating = nums.length >= 6 && /^\d+\.\d+$/.test(nums[0]);
      const offset = hasRating ? 1 : 0;
      const safeNum = (v) => (v != null && /^\d+$/.test(v)) ? parseInt(v, 10) : null;
      career.push({
        season,
        team,
        competition,
        rating: hasRating ? parseFloat(nums[0]) : null,
        apps: safeNum(nums[offset]),
        goals: safeNum(nums[offset + 1]),
        assists: safeNum(nums[offset + 2]),
        yellow: safeNum(nums[offset + 3]),
        red: safeNum(nums[offset + 4]),
      });
      i = j;
    }
    const careerRows = careerRowsRaw;

    return {
      headerText,
      name: nameMatch ? nameMatch[1].trim() : null,
      position: positionMatch ? positionMatch[1] : null,
      currentTeamName: teamMatch ? teamMatch[1] : null,
      birthDateRaw: ageMatch ? ageMatch[2] : null,
      marketValue: marketMatch ? marketMatch[1] : null,
      contractUntilRaw: contractMatch ? contractMatch[1] : null,
      nationality: nationalityMatch ? nationalityMatch[1].trim() : null,
      heightCm: heightMatch ? parseInt(heightMatch[1], 10) : null,
      careerRowsRaw: careerRows,
      career,
    };
  });
}

async function findCanonicalUrl(playerKey) {
  // Squad payloads store the canonical /player/{slug}/{key}/ — look there first.
  const teams = await prisma.flashscoreScrapedTeam.findMany();
  for (const t of teams) {
    for (const s of (t.payload?.squad || [])) {
      if ((s.href || '').includes(`/${playerKey}/`)) return s.href;
    }
  }
  return null;
}

async function scrapePlayer(page, playerKey) {
  // Prefer a canonical URL from squad data (Flashscore 404s on `/player/-/<key>/`).
  const canon = await findCanonicalUrl(playerKey);
  const url = canon || `${FLASHSCORE_ORIGIN}/player/-/${playerKey}/`;
  await gotoAndSettle(page, url, { settleMs: 4000 });
  await page.evaluate(async () => {
    for (let y = 0; y < 4000; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 200));
    }
    window.scrollTo(0, 0);
  });
  await sleep(1500);
  // After redirect, we may be on the canonical URL
  const canonical = await page.url();
  const data = await extractPlayer(page);

  const currentTeamKey = await page.evaluate(() => {
    const a = document.querySelector('[class*="playerHeader"] a[href*="/team/"]');
    if (!a) return null;
    const href = a.getAttribute('href') || '';
    const m = href.match(/\/team\/([a-z0-9-]+)\/([A-Za-z0-9]{6,})/i);
    return m ? `${m[1]}-${m[2]}` : null;
  });

  await prisma.flashscoreScrapedPlayer.upsert({
    where: { playerKey },
    update: {
      url: canonical,
      nameEn: data.name,
      birthDate: parseDateDMY(data.birthDateRaw),
      position: data.position,
      nationality: data.nationality,
      marketValue: data.marketValue,
      contractUntil: parseDateDMY(data.contractUntilRaw),
      currentTeamKey,
      payload: data,
      scrapedAt: new Date(),
    },
    create: {
      playerKey,
      url: canonical,
      nameEn: data.name,
      birthDate: parseDateDMY(data.birthDateRaw),
      position: data.position,
      nationality: data.nationality,
      marketValue: data.marketValue,
      contractUntil: parseDateDMY(data.contractUntilRaw),
      currentTeamKey,
      payload: data,
    },
  });

  return { name: data.name, position: data.position, market: data.marketValue, contract: data.contractUntilRaw };
}

async function loadPlayerKeys() {
  const one = arg('player', null);
  if (one) return [one];
  const fromTeam = arg('from-team', null);
  if (fromTeam) {
    const team = await prisma.flashscoreScrapedTeam.findUnique({ where: { teamKey: fromTeam } });
    if (!team) return [];
    const squad = (team.payload?.squad || []);
    return Array.from(new Set(
      squad.map((s) => (s.href || '').match(/\/player\/[^/]+\/([A-Za-z0-9]{6,})/)?.[1]).filter(Boolean),
    ));
  }
  if (process.argv.includes('--all-in-league')) {
    const teams = await prisma.flashscoreScrapedTeam.findMany();
    const set = new Set();
    for (const t of teams) {
      for (const s of (t.payload?.squad || [])) {
        const m = (s.href || '').match(/\/player\/[^/]+\/([A-Za-z0-9]{6,})/);
        if (m) set.add(m[1]);
      }
    }
    // Skip already-scraped unless --refresh is set.
    if (!process.argv.includes('--refresh')) {
      const existing = new Set(
        (await prisma.flashscoreScrapedPlayer.findMany({ select: { playerKey: true } }))
          .map((r) => r.playerKey),
      );
      for (const k of existing) set.delete(k);
    }
    return Array.from(set);
  }
  return [];
}

(async () => {
  const keys = await loadPlayerKeys();
  console.log(`Player scraper: ${keys.length} players queued.`);
  if (keys.length === 0) { await prisma.$disconnect(); return; }

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
    for (const k of keys) {
      i++;
      try {
        const r = await scrapePlayer(page, k);
        console.log(`  [${i}/${keys.length}] ${k}: ${r.name} (${r.position}) market=${r.market} contract=${r.contract}`);
        consecFailures = 0;
      } catch (e) {
        console.log(`  [${i}/${keys.length}] ${k} FAIL: ${e.message.slice(0, 100)}`);
        consecFailures++;
        if (/detached frame|target closed|net::|protocol error/i.test(e.message) || consecFailures >= 2) {
          console.log('     ↻ recycling browser');
          await reopenPage();
          consecFailures = 0;
        }
      }
      await sleep(1500);
      if (i % 50 === 0) {
        console.log(`    [${i}/${keys.length}] (preventive recycle)`);
        await reopenPage();
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
