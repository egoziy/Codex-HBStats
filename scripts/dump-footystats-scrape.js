#!/usr/bin/env node
/**
 * dump-footystats-scrape.js — bulk HTML scrape of FootyStats match pages.
 *
 * Reads target match URLs from `footystats_raw_match` (which has match_url + matchId)
 * and stores the scraped payload in `footystats_scraped_match`. Designed to replace
 * the FootyStats API after account termination.
 *
 * Usage:
 *   node scripts/dump-footystats-scrape.js                       # all unscraped
 *   node scripts/dump-footystats-scrape.js --limit 10            # cap iterations
 *   node scripts/dump-footystats-scrape.js --refresh             # re-scrape existing
 *   node scripts/dump-footystats-scrape.js --headful             # show browser
 *   node scripts/dump-footystats-scrape.js --season 2025/26      # filter by season name
 *   node scripts/dump-footystats-scrape.js --match 8515940       # single match by id
 *   node scripts/dump-footystats-scrape.js --delay 3000          # ms between matches (default 2500)
 */

'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { launchBrowser, scrapeMatchUrl } = require('./lib/footystats-scraper');

const args = process.argv.slice(2);
const HEADFUL = args.includes('--headful');
const REFRESH = args.includes('--refresh');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : null;
const seasonIdx = args.indexOf('--season');
const SEASON = seasonIdx >= 0 ? args[seasonIdx + 1] : null;
const matchIdx = args.indexOf('--match');
const SINGLE_MATCH = matchIdx >= 0 ? parseInt(args[matchIdx + 1], 10) : null;
const delayIdx = args.indexOf('--delay');
const DELAY_MS = delayIdx >= 0 ? parseInt(args[delayIdx + 1], 10) : 2500;
const leagueIdx = args.indexOf('--league');
// Default to Ligat HaAl only — FootyStats only renders xG on the website for top-tier leagues.
const LEAGUE = leagueIdx >= 0 ? args[leagueIdx + 1] : 'ipl';
// Default to completed matches only — FootyStats shows *predicted* xG for upcoming games,
// which we don't want to mistake for actual stats.
const INCLUDE_FUTURE = args.includes('--include-future');

function fullUrl(matchUrl) {
  if (!matchUrl) return null;
  if (matchUrl.startsWith('http')) return matchUrl;
  return `https://footystats.org${matchUrl}`;
}

async function main() {
  const where = {};
  if (SINGLE_MATCH) where.matchId = SINGLE_MATCH;
  else if (LEAGUE && LEAGUE !== 'all') where.leagueKey = LEAGUE;

  const candidates = await prisma.footyStatsRawMatch.findMany({
    where,
    select: { matchId: true, payload: true, year: true, leagueKey: true },
    orderBy: { matchId: 'desc' },
  });

  // Filter to ones with match_url and (optionally) season match
  const nowUnix = Math.floor(Date.now() / 1000);
  const tasks = [];
  let skippedFuture = 0;
  for (const c of candidates) {
    const url = fullUrl(c.payload?.data?.match_url);
    if (!url) continue;
    if (SEASON) {
      // Compare against year only (FootyStats year ≈ start year of season)
      const seasonStart = parseInt(String(SEASON).slice(0, 4), 10);
      if (c.year !== seasonStart) continue;
    }
    if (!INCLUDE_FUTURE && !SINGLE_MATCH) {
      const dateUnix = parseInt(c.payload?.data?.date_unix, 10);
      // FootyStats shows predicted xG for upcoming matches — skip those.
      // Add a 3-hour grace so a match that's just kicked off is still in the queue.
      if (Number.isFinite(dateUnix) && dateUnix > nowUnix - 3 * 3600) { skippedFuture++; continue; }
    }
    tasks.push({ matchId: c.matchId, url, leagueKey: c.leagueKey });
  }
  if (skippedFuture > 0) console.log(`  skipped ${skippedFuture} unplayed/future matches (use --include-future to override)`);

  // Skip already scraped unless --refresh
  if (!REFRESH) {
    const already = await prisma.footyStatsScrapedMatch.findMany({
      where: { matchId: { in: tasks.map((t) => t.matchId) } },
      select: { matchId: true },
    });
    const done = new Set(already.map((a) => a.matchId));
    const before = tasks.length;
    for (let i = tasks.length - 1; i >= 0; i--) if (done.has(tasks[i].matchId)) tasks.splice(i, 1);
    console.log(`  ${before - tasks.length} already scraped, ${tasks.length} to do`);
  }

  const finalTasks = LIMIT ? tasks.slice(0, LIMIT) : tasks;
  console.log(`→ Scraping ${finalTasks.length} match pages${HEADFUL ? ' (HEADFUL)' : ''} delay=${DELAY_MS}ms\n`);
  if (finalTasks.length === 0) { await prisma.$disconnect(); return; }

  const { browser, page } = await launchBrowser({ headful: HEADFUL });
  await page.setViewport({ width: 1440, height: 900 });

  let okCount = 0, errCount = 0;
  for (let i = 0; i < finalTasks.length; i++) {
    const t = finalTasks[i];
    const tag = `[${i + 1}/${finalTasks.length}] match=${t.matchId}`;
    try {
      const data = await scrapeMatchUrl(page, t.url);
      await prisma.footyStatsScrapedMatch.upsert({
        where: { matchId: t.matchId },
        update: { url: t.url, payload: { data, league: t.leagueKey } },
        create: { matchId: t.matchId, url: t.url, payload: { data, league: t.leagueKey } },
      });
      const xg = data.team_a_xg != null ? `xG=${data.team_a_xg}/${data.team_b_xg}` : 'no xG';
      console.log(`  ✓ ${tag} ${data.home_name || '?'} vs ${data.away_name || '?'} ${xg}`);
      okCount++;
    } catch (e) {
      console.error(`  ✗ ${tag}: ${e.message}`);
      errCount++;
      // After 3 consecutive errors, abort — likely Cloudflare blanket block
      if (errCount >= 3 && okCount === 0) { console.error('  → 3 errors with no successes, aborting'); break; }
    }
    if (i < finalTasks.length - 1) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  await browser.close();
  console.log(`\n${okCount} succeeded, ${errCount} failed`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
