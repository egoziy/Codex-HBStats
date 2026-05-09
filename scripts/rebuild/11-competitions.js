#!/usr/bin/env node
/**
 * 11-competitions.js — Create the 9 canonical competitions with stable IDs.
 *
 * IDs are stable strings (not auto cuids) so other code can reference them safely.
 *
 * Usage:
 *   node scripts/rebuild/11-competitions.js              # dry-run
 *   node scripts/rebuild/11-competitions.js --apply
 */

'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

// Canonical competitions. apiFootballId from API-Football's leagues list.
const COMPETITIONS = [
  { id: 'comp_liga_haal',         apiFootballId: 383, footyStatsKey: 'ipl',           nameHe: 'ליגת העל',                nameEn: 'Israeli Premier League' },
  { id: 'comp_liga_leumit',       apiFootballId: 382, footyStatsKey: 'leumit',        nameHe: 'הליגה הלאומית',           nameEn: 'Liga Leumit' },
  { id: 'comp_state_cup',         apiFootballId: 384, footyStatsKey: 'stateCup',      nameHe: 'גביע המדינה',             nameEn: 'State Cup' },
  { id: 'comp_toto_cup_al',       apiFootballId: 385, footyStatsKey: 'totoCupAl',     nameHe: 'גביע הטוטו ליגת העל',    nameEn: 'Toto Cup Ligat Al' },
  { id: 'comp_toto_cup_leumit',   apiFootballId: null, footyStatsKey: 'totoCupLeumit', nameHe: 'גביע הטוטו ליגה לאומית', nameEn: 'Toto Cup Ligat Leumit' },
  { id: 'comp_super_cup',         apiFootballId: 659, footyStatsKey: 'superCup',      nameHe: 'גביע העל',                nameEn: 'Super Cup' },
  { id: 'comp_u19_cup',           apiFootballId: null, footyStatsKey: 'u19Cup',        nameHe: 'גביע נוער U19',           nameEn: 'U19 Cup' },
  { id: 'comp_u19_elite',         apiFootballId: null, footyStatsKey: 'u19Elite',      nameHe: 'ליגת עילית נוער U19',    nameEn: 'U19 Elite Division' },
  { id: 'comp_playoffs_2nd',      apiFootballId: null, footyStatsKey: 'playOffs2nd',   nameHe: 'פלייאוף ליגה לאומית',    nameEn: 'Play Offs 2nd Division' },
  { id: 'comp_playoffs_3rd',      apiFootballId: null, footyStatsKey: 'playOffs3rd',   nameHe: "פלייאוף ליגה א'",         nameEn: 'Play Offs 3rd Division' },
  { id: 'comp_state_cup_women',   apiFootballId: null, footyStatsKey: 'stateCupWomen', nameHe: 'גביע המדינה נשים',         nameEn: 'State Cup Women' },
  { id: 'comp_ligat_al_women',    apiFootballId: null, footyStatsKey: 'ligatAlWomen',  nameHe: 'ליגת העל נשים',           nameEn: 'Ligat Al Women' },
];

async function main() {
  console.log(`${APPLY ? '✓ Applying' : '[DRY RUN]'} ${COMPETITIONS.length} canonical competitions`);

  for (const c of COMPETITIONS) {
    if (!APPLY) { console.log(`  ${c.id.padEnd(28)} ${c.nameHe}`); continue; }
    await prisma.competition.upsert({
      where: { id: c.id },
      update: { nameHe: c.nameHe, nameEn: c.nameEn, apiFootballId: c.apiFootballId },
      create: { id: c.id, nameHe: c.nameHe, nameEn: c.nameEn, apiFootballId: c.apiFootballId },
    });
  }

  if (APPLY) console.log(`\n  ✓ ${COMPETITIONS.length} competitions ready`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
