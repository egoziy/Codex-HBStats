#!/usr/bin/env node
/**
 * 10-seasons.js — Ensure all required seasons exist with canonical naming "YYYY/YY".
 *
 * Reads:  apifootball_raw_teams (for season years), footystats_raw_season_summary
 * Writes: seasons (upsert)
 *
 * Usage:
 *   node scripts/rebuild/10-seasons.js              # dry-run
 *   node scripts/rebuild/10-seasons.js --apply
 */

'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

function seasonName(startYear) {
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

async function main() {
  // Collect all years we'll need (1948 → 2026)
  const years = new Set();

  // From API-Football
  const af = await prisma.apiFootballRawTeams.findMany({ select: { season: true } });
  for (const r of af) years.add(r.season);

  // From FootyStats
  const fs = await prisma.footyStatsRawSeasonSummary.findMany({ select: { year: true } });
  for (const r of fs) years.add(r.year);

  // RSSSF historical: 1948-2000
  for (let y = 1948; y <= 1999; y++) years.add(y);

  // Walla coverage: 2000-2019 (already covered above mostly)
  // Sport5: current era

  console.log(`Seasons needed: ${years.size} (${Math.min(...years)} → ${Math.max(...years)})`);

  let created = 0, updated = 0;
  for (const y of years) {
    const name = seasonName(y);
    if (!APPLY) { console.log(`  would upsert: year=${y}, name=${name}`); continue; }
    const existing = await prisma.season.findFirst({ where: { year: y } });
    if (existing) {
      if (existing.name !== name) {
        await prisma.season.update({ where: { id: existing.id }, data: { name } });
        updated++;
      }
    } else {
      await prisma.season.create({
        data: { year: y, name, startDate: new Date(`${y}-07-01`), endDate: new Date(`${y + 1}-06-30`) },
      });
      created++;
    }
  }

  console.log(`\n${APPLY ? '✓ Applied' : '[DRY RUN]'} — created: ${created}, renamed: ${updated}, total seasons: ${years.size}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
