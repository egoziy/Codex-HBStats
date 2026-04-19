'use strict';
/**
 * RSSSF Historical Data Merge
 * Merges ScrapedStanding / ScrapedLeaderboard (source='rsssf') into the main DB.
 *
 * Creates: Seasons, Teams, Standings, CompetitionLeaderboardEntries, cup Game records.
 * Does NOT overwrite existing records from other sources.
 *
 * Modes:
 *   standings   — League tables (1949/50–1999/00) → Season + Team + Standing
 *   topscorers  — Top scorers → CompetitionLeaderboardEntry
 *   cups        — Cup finals → Game records
 *   all         — All of the above (default)
 *
 * Usage:
 *   node scripts/merge-rsssf.js --mode all
 *   node scripts/merge-rsssf.js --mode standings
 *   node scripts/merge-rsssf.js --mode standings --season "1998/1999"
 *   node scripts/merge-rsssf.js --mode all --dry-run
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const args = process.argv.slice(2);
const getArg = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };
const MODE       = getArg('mode')     || 'all';
const SEASON_ARG = getArg('season')   || null;
const MAX_YEAR   = parseInt(getArg('max-year') || '2000', 10);
const DRY_RUN    = args.includes('--dry-run');

function seasonStartYear(seasonStr) {
  const m = String(seasonStr).match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : 9999;
}

// ── English → Hebrew team name mapping ───────────────────────────────────────
// RSSSF stores names in English; our DB uses Hebrew. This maps them.
const EN_TO_HE = {
  // Maccabi
  'Maccabi Tel-Aviv':            'מכבי תל אביב',
  'Maccabi Haifa':               'מכבי חיפה',
  'Maccabi Petah-Tikva':         'מכבי פתח תקווה',
  'Maccabi Nethanya':            'מכבי נתניה',
  'Maccabi Netanya':             'מכבי נתניה',
  'Maccabi Ironi Ashdod':        'מכבי אשדוד',
  'Maccabi Herzliya':            'מכבי הרצליה',
  'Maccabi Jaffa':               'מכבי יפו',
  'Maccabi Ironi Jaffa':         'מכבי יפו',
  'Maccabi Rishon-Lezion':       'מכבי ראשון לציון',
  'Maccabi Nes-Ziona':           'מכבי נס ציונה',
  'Maccabi Rehovot':             'מכבי רחובות',
  'Maccabi Yavne':               'מכבי יבנה',
  'Maccabi Petah-Tiqwa':         'מכבי פתח תקווה',
  'Maccabi Shearaim':            'מכבי שערים',
  "Maccabi Sha'arayim":          'מכבי שערים',
  'Maccabi Ironi Rishon-Lezion': 'מכבי אירוני ראשון לציון',
  'Maccabi Ironi Kiryat-Shmona': 'מכבי אירוני קרית שמונה',
  'Maccabi Kiryat-Gat':          'מכבי קריית גת',
  'Maccabi Natanya':             'מכבי נתניה',
  'Maccabi Acre':                'מכבי עכו',
  'Maccabi Umm el-Fahm':         'מכבי אום אל פאחם',

  // Hapoel
  'Hapoel Tel-Aviv':             'הפועל תל אביב',
  'Hapoel Haifa':                'הפועל חיפה',
  'Hapoel Jerusalem':            'הפועל ירושלים',
  'Hapoel Petah-Tikva':          'הפועל פתח תקווה',
  'Hapoel Beer-Sheva':           'הפועל באר שבע',
  'Hapoel Kfar-Saba':            'הפועל כפר סבא',
  'Hapoel Ramat-Gan':            'הפועל רמת גן',
  'Hapoel Rishon-Lezion':        'הפועל ראשון לציון',
  'Hapoel Ironi Rishon-Lezion':  'הפועל אירוני ראשון לציון',
  'Hapoel Tsafririm Holon':      'הפועל צפרירים חולון',
  'Hapoel Beit-Shean':           'הפועל בית שאן',
  'Hapoel Balfuria':             'הפועל בלפוריה',
  'Hapoel Hadera':               'הפועל חדרה',
  'Hapoel Lod':                  'הפועל לוד',
  'Hapoel Nazareth-Illit':       'הפועל נצרת עילית',
  'Hapoel Acre':                 'הפועל עכו',
  'Hapoel Bnei-Lod':             'הפועל בני לוד',
  "Hapoel Be'er-Sheva":          'הפועל באר שבע',
  "Hapoel Be'ersheva":           'הפועל באר שבע',
  'Hapoel Petah-Tiqwa':          'הפועל פתח תקווה',
  'Hapoel Tzafririm Holon':      'הפועל צפרירים חולון',

  // Beitar
  'Beitar Jerusalem':            'בית"ר ירושלים',
  'Beitar Tel-Aviv':             'בית"ר תל אביב',
  'Beitar Nethanya':             'בית"ר נתניה',
  'Beitar Netanya':              'בית"ר נתניה',
  'Beitar Shaaraim':             'בית"ר שערים',

  // Bnei
  'Bnei-Yehuda Tel-Aviv':        'בני יהודה תל אביב',
  'Bnei Yehuda Tel-Aviv':        'בני יהודה תל אביב',
  'Bnei-Lod':                    'בני לוד',
  'Bnei Yehuda':                 'בני יהודה תל אביב',

  // Other clubs
  'Shimshon Tel-Aviv':           'שמשון תל אביב',
  'Ironi Tel-Aviv':              'אירוני תל אביב',
  'Hakoah Tel-Aviv':             'הכח תל אביב',
  'Hakoah Ramat-Gan':            'הכח רמת גן',
  'Hakoah Afula':                'הכח עפולה',
  'Hakoah Maccabi Afula':        'הכח מכבי עפולה',
  'Maccabi Ironi Tel-Aviv':      'מכבי אירוני תל אביב',
  'Elitsur Ashkelon':            'אליצור אשקלון',
  'Elitzur Ashkelon':            'אליצור אשקלון',
  'Tzeira Ramat-Gan':            'צעירא רמת גן',
  'Sektzia Nes-Ziona':           'סקציה נס ציונה',
  'Hapoel Rishon LeZion':        'הפועל ראשון לציון',
  'Tzafririm Holon':             'צפרירים חולון',
};

function toHebrew(enName) {
  // Exact match
  if (EN_TO_HE[enName]) return EN_TO_HE[enName];
  // Try without trailing punctuation/whitespace
  const cleaned = enName.trim().replace(/\s+/g, ' ');
  if (EN_TO_HE[cleaned]) return EN_TO_HE[cleaned];
  // Fallback: return English name (will be stored as nameHe for historical teams)
  return enName.trim();
}

// ── Caches ────────────────────────────────────────────────────────────────────
const seasonCache     = new Map(); // seasonStr → Season
const teamCache       = new Map(); // `${seasonId}|${nameHe}` → Team
const competitionCache = new Map();

async function getOrCreateSeason(seasonStr) {
  if (seasonCache.has(seasonStr)) return seasonCache.get(seasonStr);

  const m = seasonStr.match(/^(\d{4})\/(\d{4})$/);
  if (!m) return null;
  const year = parseInt(m[1]);
  const name = `${m[1]}-${m[2]}`;

  let s = await prisma.season.findFirst({ where: { name } });
  if (!s) {
    if (!DRY_RUN) {
      s = await prisma.season.create({
        data: {
          year,
          name,
          startDate: new Date(`${year}-08-01`),
          endDate:   new Date(`${year + 1}-06-30`),
        },
      });
      console.log(`    + Season ${name}`);
    } else {
      s = { id: `dry-${name}`, year, name };
    }
  }

  seasonCache.set(seasonStr, s);
  return s;
}

async function getOrCreateTeam(seasonId, nameHe, nameEn) {
  const key = `${seasonId}|${nameHe}`;
  if (teamCache.has(key)) return teamCache.get(key);

  let t = await prisma.team.findFirst({
    where: { seasonId, OR: [{ nameHe }, { nameEn }] },
  });
  if (!t) {
    // Inherit logo from any existing team record with same Hebrew name
    const logoSource = !DRY_RUN
      ? await prisma.team.findFirst({ where: { nameHe, logoUrl: { not: null } }, select: { logoUrl: true } })
      : null;
    if (!DRY_RUN) {
      t = await prisma.team.create({ data: { nameHe, nameEn, seasonId, logoUrl: logoSource?.logoUrl || null } });
    } else {
      t = { id: `dry-${seasonId}-${nameHe}`, nameHe, nameEn };
    }
  }

  teamCache.set(key, t);
  return t;
}

async function getCompetition(nameHe, apiId = null) {
  if (competitionCache.has(nameHe)) return competitionCache.get(nameHe);

  let c = null;
  if (apiId) c = await prisma.competition.findFirst({ where: { apiFootballId: apiId } });
  if (!c) c = await prisma.competition.findFirst({ where: { nameHe } });
  if (!c && !DRY_RUN) {
    c = await prisma.competition.create({
      data: { nameHe, nameEn: nameHe, type: nameHe === 'גביע המדינה' ? 'CUP' : 'LEAGUE' },
    });
    console.log(`    + Competition ${nameHe}`);
  }
  if (!c) c = { id: `dry-${nameHe}`, nameHe };

  competitionCache.set(nameHe, c);
  return c;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGO BACKFILL — copy logoUrl from modern teams to historical teams with same nameHe
// ═══════════════════════════════════════════════════════════════════════════════
async function backfillTeamLogos() {
  if (DRY_RUN) return;
  console.log('\n🏷️  Backfilling logos for historical teams …');

  const logoMap = new Map();
  const sources = await prisma.team.findMany({
    where: { logoUrl: { not: null } },
    select: { nameHe: true, logoUrl: true },
  });
  for (const t of sources) {
    if (t.nameHe && !logoMap.has(t.nameHe)) logoMap.set(t.nameHe, t.logoUrl);
  }

  // Find pre-2001 season teams that have no logo but exist in the map
  const historicalSeasons = await prisma.season.findMany({
    where: { year: { lt: 2001 } },
    select: { id: true },
  });
  const seasonIds = historicalSeasons.map((s) => s.id);

  const teamsWithoutLogo = await prisma.team.findMany({
    where: { seasonId: { in: seasonIds }, logoUrl: null },
    select: { id: true, nameHe: true },
  });

  // Aliases: historical nameHe → modern nameHe (same club, different name over the years)
  const NAME_ALIASES = {
    'בני יהודה תל אביב': 'בני יהודה',
    'הפועל פתח תקווה': 'הפועל פ"ת',
    'מכבי פתח תקווה': 'מכבי פ"ת',
    'הפועל כפר סבא': 'הפועל כ"ס',
    'אירוני קרית שמונה': 'מכבי אירוני קרית שמונה',
  };

  let updated = 0;
  for (const team of teamsWithoutLogo) {
    const lookupName = team.nameHe ? (NAME_ALIASES[team.nameHe] || team.nameHe) : null;
    const logo = lookupName ? logoMap.get(lookupName) : null;
    if (logo) {
      await prisma.team.update({ where: { id: team.id }, data: { logoUrl: logo } });
      updated++;
    }
  }
  console.log(`  ✅ Updated ${updated} teams with logos`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// STANDINGS MERGE
// ═══════════════════════════════════════════════════════════════════════════════
async function mergeStandings() {
  console.log('\n📊 Merging standings …');

  const where = { source: 'rsssf', leagueNameHe: 'ליגת העל' };
  if (SEASON_ARG) where.season = SEASON_ARG;

  const scraped = await prisma.scrapedStanding.findMany({
    where,
    orderBy: [{ season: 'asc' }, { position: 'asc' }],
  });

  const groups = new Map();
  for (const row of scraped) {
    const key = row.season;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  console.log(`  Processing ${scraped.length} rows across ${groups.size} seasons`);

  const competition = await getCompetition('ליגת העל', 383);
  let created = 0, skipped = 0;

  for (const [seasonStr, rows] of groups) {
    if (seasonStartYear(seasonStr) > MAX_YEAR) { skipped += rows.length; continue; }
    const season = await getOrCreateSeason(seasonStr);
    if (!season) { skipped += rows.length; continue; }

    // Ensure CompetitionSeason link
    if (!DRY_RUN) {
      await prisma.competitionSeason.upsert({
        where:  { competitionId_seasonId: { competitionId: competition.id, seasonId: season.id } },
        update: {},
        create: { competitionId: competition.id, seasonId: season.id },
      }).catch(() => null);
    }

    for (const row of rows) {
      const nameEn = row.teamNameHe; // stored English name in teamNameHe field
      const nameHe = toHebrew(nameEn);

      const team = await getOrCreateTeam(season.id, nameHe, nameEn);
      if (!team) { skipped++; continue; }

      if (DRY_RUN) { created++; continue; }

      const existing = await prisma.standing.findFirst({
        where: { seasonId: season.id, teamId: team.id },
      });

      if (existing) {
        if (existing.played === 0 && row.played > 0) {
          await prisma.standing.update({
            where: { id: existing.id },
            data: {
              position:     row.position,
              played:       row.played,
              wins:         row.wins,
              draws:        row.draws,
              losses:       row.losses,
              goalsFor:     row.goalsFor,
              goalsAgainst: row.goalsAgainst,
              goalsDiff:    row.goalDifference,
              points:       row.points,
              competitionId: competition.id,
            },
          });
          created++;
        } else { skipped++; }
      } else {
        await prisma.standing.create({
          data: {
            seasonId:     season.id,
            teamId:       team.id,
            competitionId: competition.id,
            position:     row.position,
            played:       row.played,
            wins:         row.wins,
            draws:        row.draws,
            losses:       row.losses,
            goalsFor:     row.goalsFor,
            goalsAgainst: row.goalsAgainst,
            goalsDiff:    row.goalDifference,
            points:       row.points,
          },
        }).catch(() => skipped++);
        created++;
      }
    }
  }

  console.log(`  ✅ ${created} created/updated, ${skipped} skipped`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOP SCORERS MERGE
// ═══════════════════════════════════════════════════════════════════════════════
async function mergeTopScorers() {
  console.log('\n⚽ Merging top scorers …');

  const where = { source: 'rsssf', category: 'goals' };
  if (SEASON_ARG) where.season = SEASON_ARG;

  const scraped = await prisma.scrapedLeaderboard.findMany({ where, orderBy: [{ season: 'asc' }, { rank: 'asc' }] });
  console.log(`  Processing ${scraped.length} entries`);

  const competition = await getCompetition('ליגת העל', 383);
  let created = 0, skipped = 0;

  for (const row of scraped) {
    if (seasonStartYear(row.season) > MAX_YEAR) { skipped++; continue; }
    const season = await getOrCreateSeason(row.season);
    if (!season) { skipped++; continue; }

    if (DRY_RUN) { created++; continue; }

    await prisma.competitionLeaderboardEntry.upsert({
      where: {
        seasonId_competitionId_category_rank: {
          seasonId:      season.id,
          competitionId: competition.id,
          category:      'TOP_SCORERS',
          rank:          row.rank,
        },
      },
      create: {
        seasonId:      season.id,
        competitionId: competition.id,
        category:      'TOP_SCORERS',
        rank:          row.rank,
        value:         Math.round(row.value),
        playerNameEn:  row.playerName,
        playerNameHe:  row.playerName,
        teamNameEn:    row.teamName,
        teamNameHe:    toHebrew(row.teamName),
      },
      update: {},  // Never overwrite existing entries
    }).then(() => created++).catch(() => skipped++);
  }

  console.log(`  ✅ ${created} upserted, ${skipped} skipped`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CUP FINALS MERGE
// ═══════════════════════════════════════════════════════════════════════════════
async function mergeCups() {
  console.log('\n🏅 Merging cup finals …');

  const where = { source: 'rsssf', framework: 'state_cup', round: 'Final' };
  if (SEASON_ARG) where.season = SEASON_ARG;

  const scraped = await prisma.scrapedMatch.findMany({ where, orderBy: { season: 'asc' } });
  console.log(`  Processing ${scraped.length} cup finals`);

  const competition = await getCompetition('גביע המדינה');
  let created = 0, skipped = 0;

  for (const row of scraped) {
    if (seasonStartYear(row.season) > MAX_YEAR) { skipped++; continue; }
    const season = await getOrCreateSeason(row.season);
    if (!season) { skipped++; continue; }

    if (!DRY_RUN) {
      await prisma.competitionSeason.upsert({
        where:  { competitionId_seasonId: { competitionId: competition.id, seasonId: season.id } },
        update: {},
        create: { competitionId: competition.id, seasonId: season.id },
      }).catch(() => null);
    }

    const homeNameHe = toHebrew(row.homeTeamName);
    const awayNameHe = toHebrew(row.awayTeamName);

    const homeTeam = await getOrCreateTeam(season.id, homeNameHe, row.homeTeamName);
    const awayTeam = await getOrCreateTeam(season.id, awayNameHe, row.awayTeamName);

    if (DRY_RUN) { created++; continue; }

    // Check if a cup final game already exists for this season
    const existing = await prisma.game.findFirst({
      where: { seasonId: season.id, competitionId: competition.id },
    });

    if (existing) { skipped++; continue; }

    const m = row.season.match(/^(\d{4})\/(\d{4})$/);
    const year = m ? parseInt(m[1]) : 2000;

    await prisma.game.create({
      data: {
        seasonId:         season.id,
        competitionId:    competition.id,
        homeTeamId:       homeTeam.id,
        awayTeamId:       awayTeam.id,
        homeScore:        row.homeScore,
        awayScore:        row.awayScore,
        homeScoreRegular: row.homeScoreRegular,
        awayScoreRegular: row.awayScoreRegular,
        homePenalty:      row.homePenalty,
        awayPenalty:      row.awayPenalty,
        roundNameEn:      'Final',
        roundNameHe:      'גמר',
        status:           'COMPLETED',
        dateTime:         new Date(`${year + 1}-05-01T20:00:00Z`), // approximate
      },
    }).then(() => created++).catch(() => skipped++);
  }

  console.log(`  ✅ ${created} created, ${skipped} skipped`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log(' RSSSF Historical Data Merge → Main DB            ');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Mode: ${MODE} | Season: ${SEASON_ARG || 'all'} | Max-year: ${MAX_YEAR} | Dry-run: ${DRY_RUN}`);

  try {
    if (MODE === 'standings'  || MODE === 'all') await mergeStandings();
    if (MODE === 'standings'  || MODE === 'all') await backfillTeamLogos();
    if (MODE === 'topscorers' || MODE === 'all') await mergeTopScorers();
    if (MODE === 'cups'       || MODE === 'all') await mergeCups();

    if (!DRY_RUN) {
      const [seasons, standings, entries, games] = await Promise.all([
        prisma.season.count(),
        prisma.standing.count(),
        prisma.competitionLeaderboardEntry.count({ where: { category: 'TOP_SCORERS' } }),
        prisma.game.count(),
      ]);
      console.log('\n────────────────────────────────────────────');
      console.log(` DB totals after merge:`);
      console.log(`   Seasons:       ${seasons}`);
      console.log(`   Standings:     ${standings}`);
      console.log(`   Top-scorer entries: ${entries}`);
      console.log(`   Games:         ${games}`);
      console.log('────────────────────────────────────────────');
    }
    console.log('✅ Done!');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
