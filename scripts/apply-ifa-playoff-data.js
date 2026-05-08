/**
 * Apply IFA playoff group + point adjustment data from scraped_standings to main standings.
 *
 * What it does:
 *   - For each IFA-scraped standing row, find the matching DB standing (same season + same team).
 *   - Copy: position, groupNameHe, groupNameEn, pointsAdjustment, pointsAdjustmentNoteHe.
 *   - If no DB standing exists yet, creates one (with full row data).
 *
 * Usage:
 *   node scripts/apply-ifa-playoff-data.js            -- dry run
 *   node scripts/apply-ifa-playoff-data.js --apply    -- write to DB
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const SOURCE = 'footballOrgIl';

// IFA team abbreviation expansion — same map used in merge-engine.ts
// Hard mappings for IFA team names that have changed prefix (e.g., Hapoel→Ironi rename) or extra
// noise words. These are checked BEFORE generic normalization.
const IFA_TEAM_OVERRIDES = {
  'הפועל ק"ש': 'עירוני קריית שמונה',
  'הפועל קריית שמונה': 'עירוני קריית שמונה',
  'הפועל י-ם': 'הפועל קטמון ירושלים',
  'הפועל ירושלים': 'הפועל קטמון ירושלים',
  'עירוני דורות טבריה': 'עירוני טבריה',
  'הפ\' חדרה ש. שוורץ': 'הפועל חדרה',
  'הפ\' חדרה': 'הפועל חדרה',
  'הפ\' נוף הגליל': 'הפועל נוף הגליל',
  'הפועל ע. עפולה': 'הפועל עפולה',
  'בני יהודה ת"א': 'בני יהודה תל אביב',
};

function normTeam(s) {
  if (!s) return '';
  if (IFA_TEAM_OVERRIDES[s]) s = IFA_TEAM_OVERRIDES[s];
  return s
    .replace(/ת["'״׳]א|תל-אביב/g, 'תל אביב')
    .replace(/ב["'״׳]ש|באר-שבע/g, 'באר שבע')
    .replace(/פ["'״׳]ת/g, 'פתח תקווה')
    .replace(/ר["'״׳]ג/g, 'רמת גן')
    .replace(/ק["'״׳]ש/g, 'קריית שמונה')
    .replace(/כפ["'״׳]ס/g, 'כפר סבא')
    .replace(/י-ם|ירושלם/g, 'ירושלים')
    .replace(/ראשל["'״׳]צ/g, 'ראשון לציון')
    .replace(/בית["'״׳]ר/g, 'ביתר')
    .replace(/הפ['׳]/g, 'הפועל')
    .replace(/['"`׳״]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function namesMatch(a, b) {
  const na = normTeam(a);
  const nb = normTeam(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

const HE_TO_EN_GROUP = {
  'פלייאוף עליון': 'Championship',
  'פלייאוף תחתון': 'Relegation',
};

async function main() {
  const scrapedRows = await prisma.scrapedStanding.findMany({
    where: { source: SOURCE },
    orderBy: [{ season: 'desc' }, { position: 'asc' }],
  });

  const seasons = await prisma.season.findMany({ select: { id: true, name: true, year: true } });
  const seasonByName = new Map(seasons.map((s) => [s.name, s]));

  let applied = 0, created = 0, missingSeason = 0, missingTeam = 0, noChange = 0, errors = 0;

  for (const ss of scrapedRows) {
    // Normalize season name. Scraped uses "2025/2026"; DB uses either "2025/26" or "2012/2013".
    const m = ss.season.match(/^(\d{4})\/(\d{4})$/);
    if (!m) { missingSeason++; continue; }
    const shortForm = `${m[1]}/${m[2].slice(2)}`;
    const longForm = ss.season;
    const season = seasonByName.get(shortForm) || seasonByName.get(longForm);
    if (!season) { missingSeason++; continue; }

    // Find a team in this season whose name fuzzy-matches the scraped name
    const teamsInSeason = await prisma.team.findMany({
      where: { seasonId: season.id },
      select: { id: true, nameHe: true, nameEn: true },
    });
    // Prefer senior teams over youth/women variants when there are multiple matches.
    const isYouthOrWomen = (name) => /נוער|U-?19|Under\s*19|נשים|Women/.test(name || '');
    const candidates = teamsInSeason.filter((t) => namesMatch(ss.teamNameHe, t.nameHe) || namesMatch(ss.teamNameHe, t.nameEn));
    const team = candidates.find((t) => !isYouthOrWomen(t.nameHe) && !isYouthOrWomen(t.nameEn)) || candidates[0];
    if (!team) {
      missingTeam++;
      if (missingTeam <= 8) console.log(`  miss [${ss.season}]: "${ss.teamNameHe}" (norm: "${normTeam(ss.teamNameHe)}")`);
      continue;
    }

    // Determine competition by league name from the scraped row
    const leagueName = ss.leagueNameHe || '';
    let competitionId = null;
    if (leagueName.includes('לאומית')) {
      competitionId = (await prisma.competition.findFirst({ where: { apiFootballId: 382 } }))?.id || null;
      // Fallback: by name
      if (!competitionId) competitionId = (await prisma.competition.findFirst({ where: { nameHe: 'ליגה לאומית' } }))?.id || null;
    } else {
      competitionId = (await prisma.competition.findFirst({ where: { apiFootballId: 383 } }))?.id || null;
    }

    const groupNameEn = HE_TO_EN_GROUP[ss.groupNameHe] || null;

    // Look up by team+season ONLY — schema enforces a single standing per (seasonId, teamId).
    // If found under a different competition, we'll fix that during update.
    const existing = await prisma.standing.findFirst({
      where: { seasonId: season.id, teamId: team.id },
    });

    const newData = {
      position: ss.position,
      played: ss.played, wins: ss.wins, draws: ss.draws, losses: ss.losses,
      goalsFor: ss.goalsFor, goalsAgainst: ss.goalsAgainst, points: ss.points,
      groupNameHe: ss.groupNameHe,
      groupNameEn,
      pointsAdjustment: ss.pointsAdjustment,
      pointsAdjustmentNoteHe: ss.pointsAdjustmentNoteHe,
    };

    if (existing) {
      const update = {};
      // Re-link to the correct competition (e.g., FootyStats may have placed this team
      // under a Cup competition, but IFA tells us this is the league standing).
      if (competitionId && existing.competitionId !== competitionId) update.competitionId = competitionId;
      if (existing.groupNameHe !== ss.groupNameHe) update.groupNameHe = ss.groupNameHe;
      if (existing.groupNameEn !== groupNameEn) update.groupNameEn = groupNameEn;
      if (existing.pointsAdjustment !== ss.pointsAdjustment) update.pointsAdjustment = ss.pointsAdjustment;
      if (existing.pointsAdjustmentNoteHe !== ss.pointsAdjustmentNoteHe) update.pointsAdjustmentNoteHe = ss.pointsAdjustmentNoteHe;
      if (existing.position !== ss.position) update.position = ss.position;
      // Fill in stats only if they're zero — IFA is the source of truth here since FootyStats often left them empty
      if (existing.played === 0 && ss.played > 0) update.played = ss.played;
      if (existing.wins === 0 && ss.wins > 0) update.wins = ss.wins;
      if (existing.draws === 0 && ss.draws > 0) update.draws = ss.draws;
      if (existing.losses === 0 && ss.losses > 0) update.losses = ss.losses;
      if (existing.goalsFor === 0 && ss.goalsFor > 0) update.goalsFor = ss.goalsFor;
      if (existing.goalsAgainst === 0 && ss.goalsAgainst > 0) update.goalsAgainst = ss.goalsAgainst;
      if (existing.points === 0 && ss.points > 0) update.points = ss.points;

      if (Object.keys(update).length === 0) { noChange++; continue; }

      if (APPLY) {
        try {
          await prisma.standing.update({ where: { id: existing.id }, data: update });
          applied++;
        } catch (e) {
          errors++; console.error('update fail:', e.message);
        }
      } else {
        applied++;
      }
    } else {
      // Create new standing
      if (APPLY) {
        try {
          await prisma.standing.create({
            data: { seasonId: season.id, teamId: team.id, competitionId, ...newData },
          });
          created++;
        } catch (e) {
          errors++; console.error('create fail:', e.message);
        }
      } else {
        created++;
      }
    }
  }

  console.log(`\n${APPLY ? '✓ Applied' : '[DRY RUN]'}`);
  console.log(`  scraped rows:     ${scrapedRows.length}`);
  console.log(`  ${APPLY ? 'updated' : 'would update'}:  ${applied}`);
  console.log(`  ${APPLY ? 'created' : 'would create'}:  ${created}`);
  console.log(`  no-change:        ${noChange}`);
  console.log(`  missing season:   ${missingSeason}`);
  console.log(`  missing team:     ${missingTeam}`);
  console.log(`  errors:           ${errors}`);

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
