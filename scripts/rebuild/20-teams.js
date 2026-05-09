#!/usr/bin/env node
/**
 * 20-teams.js — Build canonical teams (one row per team per season).
 *
 * Strategy:
 *   1. Iterate apifootball_raw_teams (per league + season) → create Team rows
 *      with nameEn, apiFootballId, logoUrl, stadium, founded.
 *   2. For each team, find Hebrew name from IFA scraped_teams (same start year, fuzzy match).
 *   3. Fill footyStatsId from footystats_raw_teams when matched by name.
 *   4. For seasons API-Football doesn't cover (pre-2016, U19, women's, etc.),
 *      fall back to FootyStats raw teams + IFA enrichment.
 *
 * Usage:
 *   node scripts/rebuild/20-teams.js              # dry-run
 *   node scripts/rebuild/20-teams.js --apply
 */

'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

// Hebrew name overrides for well-known clubs. Used when IFA match fails / ambiguous.
const HEBREW_NAME_OVERRIDES = {
  // English (or IFA abbreviated form) → canonical Hebrew
  'Hapoel Beer Sheva': 'הפועל באר שבע',
  'Hapoel Be\'er Sheva FC': 'הפועל באר שבע',
  'Maccabi Tel Aviv': 'מכבי תל אביב',
  'Maccabi Tel Aviv FC': 'מכבי תל אביב',
  'Maccabi Haifa': 'מכבי חיפה',
  'Maccabi Haifa FC': 'מכבי חיפה',
  'Beitar Jerusalem': 'בית"ר ירושלים',
  'Beitar Jerusalem FC': 'בית"ר ירושלים',
  'Hapoel Tel Aviv': 'הפועל תל אביב',
  'Hapoel Tel Aviv FC': 'הפועל תל אביב',
  'Hapoel Haifa': 'הפועל חיפה',
  'Hapoel Haifa FC': 'הפועל חיפה',
  'Hapoel Jerusalem FC': 'הפועל ירושלים',
  'Hapoel Katamon Jerusalem': 'הפועל קטמון ירושלים',
  'Hapoel Katamon Jerusalem FC': 'הפועל קטמון ירושלים',
  'Hapoel Katamon': 'הפועל קטמון ירושלים',
  'Maccabi Netanya': 'מכבי נתניה',
  'Maccabi Netanya FC': 'מכבי נתניה',
  'Bnei Sakhnin': 'בני סכנין',
  'Ihoud Bnei Sakhnin FC': 'בני סכנין',
  'MS Ashdod': 'מ.ס. אשדוד',
  'FC Ashdod': 'מ.ס. אשדוד',
  'Hapoel Petach Tikva': 'הפועל פתח תקווה',
  'Hapoel Petah Tikva': 'הפועל פתח תקווה',
  'Maccabi Petah Tikva': 'מכבי פתח תקווה',
  'Maccabi Petach Tikva': 'מכבי פתח תקווה',
  'Hapoel Kfar Saba': 'הפועל כפר סבא',
  'Hapoel Raanana': 'הפועל רעננה',
  'Hapoel Acre': 'הפועל עכו',
  'Ironi Kiryat Shmona': 'עירוני קריית שמונה',
  'Ironi Kiryat Shmona FC': 'עירוני קריית שמונה',
  'Hapoel Ironi Kiryat Shmona': 'עירוני קריית שמונה',
  'Hapoel Hadera': 'הפועל חדרה',
  'Hapoel Hadera FC': 'הפועל חדרה',
  'Hapoel Nof HaGalil': 'הפועל נוף הגליל',
  'Hapoel Nazareth Illit': 'הפועל נוף הגליל',
  'Hapoel Rishon LeZion': 'הפועל ראשון לציון',
  'Sektzia Nes Tziona': 'סקציה נס ציונה',
  'Maccabi Bnei Raina': 'מכבי בני ריינה',
  'Maccabi Bnei Reine': 'מכבי בני ריינה',
  'Bnei Yehuda Tel Aviv': 'בני יהודה',
  'Bnei Yehuda': 'בני יהודה',
  'Ironi Tiberias': 'עירוני טבריה',
  'Hapoel Ramat Gan': 'הפועל רמת גן',
  'Hapoel Ashkelon': 'הפועל אשקלון',
  'Hapoel Bnei Lod': 'הפועל בני לוד',
  'Hapoel Afula': 'הפועל עפולה',
  'Maccabi Umm al-Fahm': 'מכבי אום אל פאחם',
  'Hapoel Ironi Or Yehuda': 'הפועל עירוני אור יהודה',
  'Hapoel Marmorek Rehovot': 'הפועל מרמורק רחובות',
  'Maccabi Yavne': 'מכבי יבנה',
  'Hapoel Ramat Yisrael': 'הפועל רמת ישראל',
  'Hapoel Bikat HaYarden': 'הפועל בקעת הירדן',
  'Hapoel Nir Ramat HaSharon': 'הפועל ניר רמת השרון',
};

function normalize(s) { return (s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

function teamMatches(a, b) {
  if (!a || !b) return false;
  const na = normalize(a), nb = normalize(b);
  if (na === nb) return true;
  // last word match (handles "Beitar Jerusalem FC" vs "Beitar Jerusalem")
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

function hebrewFromOverride(nameEn) {
  return HEBREW_NAME_OVERRIDES[nameEn] || HEBREW_NAME_OVERRIDES[nameEn.replace(/ FC$/, '').trim()] || null;
}

async function main() {
  console.log(`${APPLY ? '✓ Applying' : '[DRY RUN]'} canonical teams build`);

  // Pre-load IFA scraped teams indexed by start year
  const ifaTeams = await prisma.scrapedTeam.findMany({
    where: { source: 'footballOrgIl' },
    select: { sourceId: true, nameHe: true, season: true },
  });
  // season "2025/2026" → start year 2025
  const ifaByYear = new Map();
  for (const t of ifaTeams) {
    const startYear = parseInt(t.season.split('/')[0], 10);
    if (!startYear) continue;
    if (!ifaByYear.has(startYear)) ifaByYear.set(startYear, []);
    ifaByYear.get(startYear).push(t);
  }

  // Pre-load all seasons keyed by year
  const seasons = await prisma.season.findMany({ select: { id: true, year: true } });
  const seasonByYear = new Map(seasons.map((s) => [s.year, s.id]));

  // Walk API-Football teams
  const afTeams = await prisma.apiFootballRawTeams.findMany({
    select: { leagueId: true, season: true, payload: true },
  });

  let total = 0, created = 0, updated = 0, skipped = 0;
  for (const row of afTeams) {
    const seasonId = seasonByYear.get(row.season);
    if (!seasonId) { console.log(`  ⚠ No season row for year ${row.season}`); continue; }

    const teams = row.payload?.response || [];
    for (const item of teams) {
      const team = item?.team;
      if (!team) continue;

      const nameEn = team.name;
      // Hebrew: override → IFA scraped match → fall back to nameEn (will translate later)
      let nameHe = hebrewFromOverride(nameEn);
      if (!nameHe) {
        const ifaCandidates = ifaByYear.get(row.season) || [];
        const ifaMatch = ifaCandidates.find((c) => teamMatches(c.nameHe, nameEn) || hebrewFromOverride(c.nameHe) === nameEn);
        if (ifaMatch) nameHe = hebrewFromOverride(ifaMatch.nameHe) || ifaMatch.nameHe;
      }
      if (!nameHe) nameHe = nameEn; // fallback — script 70 will flag for translation

      total++;

      if (!APPLY) {
        if (total <= 6 || total % 50 === 0) console.log(`  ${row.season} ${nameEn.padEnd(35)} → ${nameHe}`);
        continue;
      }

      try {
        await prisma.team.upsert({
          where: { apiFootballId_seasonId: { apiFootballId: team.id, seasonId } },
          update: {
            nameEn,
            nameHe,
            logoUrl: team.logo || undefined,
            countryEn: team.country || undefined,
            stadiumEn: item?.venue?.name || undefined,
            cityEn: item?.venue?.city || undefined,
            founded: team.founded || undefined,
            code: team.code || undefined,
          },
          create: {
            seasonId,
            apiFootballId: team.id,
            nameEn,
            nameHe,
            logoUrl: team.logo || null,
            countryEn: team.country || null,
            stadiumEn: item?.venue?.name || null,
            cityEn: item?.venue?.city || null,
            founded: team.founded || null,
            code: team.code || null,
          },
        });
        created++;
      } catch (e) {
        skipped++;
        if (skipped <= 5) console.log(`  ✗ ${nameEn} (${row.season}): ${e.message.slice(0, 100)}`);
      }
    }
  }

  console.log(`\n${APPLY ? '✓ Applied' : '[DRY RUN]'}: ${total} team-rows seen, ${APPLY ? `created/updated: ${created}, errors: ${skipped}` : ''}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
