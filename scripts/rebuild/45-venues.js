#!/usr/bin/env node
/**
 * 45-venues.js — Populate venues table from API-Football raw fixtures + link games.
 *
 * Each API-Football fixture has fixture.venue: { id, name, city }. We create one
 * Venue per (apiFootballId or name+city) and set games.venueId on every game whose
 * fixture references it.
 *
 * Usage:
 *   node scripts/rebuild/45-venues.js              # dry-run
 *   node scripts/rebuild/45-venues.js --apply
 */

'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

// Hebrew translations for common Israeli stadiums
const VENUE_HE = {
  'Sammy Ofer Stadium': 'אצטדיון סמי עופר',
  'Bloomfield Stadium': 'אצטדיון בלומפילד',
  'Teddy Stadium': 'אצטדיון טדי',
  'Toto Turner Stadium': 'אצטדיון טוטו טרנר',
  'Doha Stadium': 'אצטדיון דוחה',
  'Levita Stadium': 'אצטדיון לביטה',
  'Ha Moshava Stadium': 'אצטדיון המושבה',
  'HaMoshava Stadium': 'אצטדיון המושבה',
  'Netanya Municipal Stadium': 'אצטדיון נתניה',
  'Netanya Stadium': 'אצטדיון נתניה',
  'Doha': 'אצטדיון דוחה',
  'Yud-Alef Stadium': 'אצטדיון י"א',
  'Yud Alef Stadium': 'אצטדיון י"א',
  'Doha Stadium (Sakhnin)': 'אצטדיון דוחה',
  'Hapoel Beer Sheva Municipal Stadium': 'אצטדיון טרנר',
  'Lod City Stadium': 'אצטדיון לוד',
  'Goldstar Arena': 'גולדסטאר ארנה',
  'Gavriel Strock Stadium': 'אצטדיון שטרוק',
  'HaMoshava (Petach Tikva)': 'אצטדיון המושבה',
  'Green Stadium': 'אצטדיון ירוק',
};

function venueHebrew(nameEn, cityEn) {
  if (VENUE_HE[nameEn]) return VENUE_HE[nameEn];
  // Fallback: "אצטדיון <city>" if city known
  if (cityEn && /^[A-Za-z]/.test(cityEn)) return `אצטדיון ${cityEn}`;
  return nameEn;
}

async function main() {
  console.log(`${APPLY ? '✓ Applying' : '[DRY RUN]'} venues build`);

  // Collect unique venues from API-Football fixtures + their fixture IDs
  const fixtureRows = await prisma.apiFootballRawFixtures.findMany({ select: { payload: true } });
  // Map: apiVenueId or nameEn → { nameEn, cityEn, apiVenueId, fixtureIds: [] }
  const venueMap = new Map();
  for (const row of fixtureRows) {
    const fixtures = row.payload?.response || [];
    for (const f of fixtures) {
      const v = f?.fixture?.venue;
      if (!v?.name) continue;
      const key = v.id != null ? `id:${v.id}` : `name:${v.name}|${v.city || ''}`;
      if (!venueMap.has(key)) {
        venueMap.set(key, { apiVenueId: v.id ?? null, nameEn: v.name, cityEn: v.city || null, fixtureIds: [] });
      }
      const fxId = f?.fixture?.id;
      if (fxId) venueMap.get(key).fixtureIds.push(fxId);
    }
  }
  console.log(`  unique venues collected: ${venueMap.size}`);

  let created = 0, updated = 0, gamesLinked = 0;
  for (const [, v] of venueMap) {
    const nameHe = venueHebrew(v.nameEn, v.cityEn);
    if (!APPLY) continue;

    // Upsert venue (by apiFootballId if known, else by nameEn unique)
    let venueRow;
    if (v.apiVenueId != null) {
      venueRow = await prisma.venue.upsert({
        where: { apiFootballId: v.apiVenueId },
        update: { nameEn: v.nameEn, nameHe, cityEn: v.cityEn },
        create: { apiFootballId: v.apiVenueId, nameEn: v.nameEn, nameHe, cityEn: v.cityEn },
      });
    } else {
      venueRow = await prisma.venue.findFirst({ where: { nameEn: v.nameEn } });
      if (!venueRow) venueRow = await prisma.venue.create({ data: { nameEn: v.nameEn, nameHe, cityEn: v.cityEn } });
    }
    created++;

    // Link games via apiFootballId
    if (v.fixtureIds.length) {
      const result = await prisma.game.updateMany({
        where: { apiFootballId: { in: v.fixtureIds } },
        data: { venueId: venueRow.id },
      });
      gamesLinked += result.count;
    }
  }

  console.log(`\n${APPLY ? '✓ Applied' : '[DRY RUN]'}: ${created} venues upserted, ${gamesLinked} games linked`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
