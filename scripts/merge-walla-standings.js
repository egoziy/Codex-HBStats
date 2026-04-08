/**
 * Direct merge of Walla standings into main DB.
 * Creates seasons, teams, competitions, and standings.
 * Run: node scripts/merge-walla-standings.js [--season "2017/2018"]
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const LIGA_HAAL_API_ID = 383;
const LIGA_LEUMIT_API_ID = 382;

// Name normalization for matching
function norm(name) {
  return name.replace(/&#\d+;/g, '').replace(/&\w+;/g, '').replace(/['"״׳\-\.`']/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

const NAME_MAP = {
  'עירוני קרית שמונה': 'עירוני קריית שמונה',
  'עירוני קרית-שמונה': 'עירוני קריית שמונה',
  'מכבי פתח תקוה': 'מכבי פתח תקווה',
  'הפועל פתח תקוה': 'הפועל פתח תקווה',
  'בני יהודה תל-אביב': 'בני יהודה',
  'מכבי קרית-גת': 'מכבי קריית גת',
  'הפועל אום אל-פחם': 'הפועל אום אל פאחם',
};

function resolveTeamName(wallaName) {
  return NAME_MAP[wallaName] || wallaName;
}

async function main() {
  const targetSeason = process.argv.find((a, i) => process.argv[i - 1] === '--season');
  const where = { source: 'walla' };
  if (targetSeason) where.season = targetSeason;

  const scrapedStandings = await prisma.scrapedStanding.findMany({
    where,
    orderBy: [{ season: 'desc' }, { position: 'asc' }],
  });

  console.log('Scraped standings to process:', scrapedStandings.length);

  // Group by season+league
  const groups = new Map();
  for (const s of scrapedStandings) {
    const key = `${s.season}|${s.leagueNameHe}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }

  let created = 0, skipped = 0, errors = 0;

  for (const [key, rows] of groups) {
    const [seasonStr, leagueName] = key.split('|');
    const m = seasonStr.match(/(\d{4})\/(\d{4})/);
    if (!m) { skipped += rows.length; continue; }

    const dbSeasonName = `${m[1]}-${m[2]}`;
    const year = parseInt(m[1], 10);

    // Find or create season
    let season = await prisma.season.findFirst({ where: { name: dbSeasonName } });
    if (!season) {
      season = await prisma.season.create({
        data: { year, name: dbSeasonName, startDate: new Date(`${year}-08-01`), endDate: new Date(`${year + 1}-06-30`) },
      });
      console.log('  Created season:', dbSeasonName);
    }

    // Determine competition
    const isLeumit = leagueName.includes('לאומית');
    const compApiId = isLeumit ? LIGA_LEUMIT_API_ID : LIGA_HAAL_API_ID;
    const competition = await prisma.competition.findFirst({ where: { apiFootballId: compApiId } });
    if (!competition) {
      console.log('  Competition not found for apiId:', compApiId);
      skipped += rows.length;
      continue;
    }

    // Ensure CompetitionSeason
    await prisma.competitionSeason.upsert({
      where: { competitionId_seasonId: { competitionId: competition.id, seasonId: season.id } },
      update: {},
      create: { competitionId: competition.id, seasonId: season.id },
    }).catch(() => null);

    for (const row of rows) {
      try {
        const teamNameHe = resolveTeamName(row.teamNameHe);

        // Find or create team
        let team = await prisma.team.findFirst({
          where: { seasonId: season.id, OR: [{ nameHe: teamNameHe }, { nameHe: row.teamNameHe }] },
        });
        if (!team) {
          team = await prisma.team.create({
            data: { nameHe: teamNameHe, nameEn: teamNameHe, seasonId: season.id },
          });
        }

        // Check existing standing
        const existing = await prisma.standing.findFirst({
          where: { seasonId: season.id, teamId: team.id, competitionId: competition.id },
        });

        if (existing) {
          // Only update if empty
          if (existing.played === 0 && row.played > 0) {
            await prisma.standing.update({
              where: { id: existing.id },
              data: { position: row.position, played: row.played, wins: row.wins, draws: row.draws, losses: row.losses, goalsFor: row.goalsFor, goalsAgainst: row.goalsAgainst, points: row.points },
            });
            created++;
          } else {
            skipped++;
          }
        } else {
          await prisma.standing.create({
            data: {
              seasonId: season.id, teamId: team.id, competitionId: competition.id,
              position: row.position, played: row.played, wins: row.wins, draws: row.draws,
              losses: row.losses, goalsFor: row.goalsFor, goalsAgainst: row.goalsAgainst,
              points: row.points,
            },
          });
          created++;
        }
      } catch (e) {
        errors++;
      }
    }

    console.log('  ' + dbSeasonName + ' ' + leagueName + ': ' + rows.length + ' rows');
  }

  console.log('\nDone: created/updated=' + created + ', skipped=' + skipped + ', errors=' + errors);

  // Final count
  const total = await prisma.standing.count();
  const seasonCount = await prisma.season.count();
  console.log('DB totals: ' + total + ' standings, ' + seasonCount + ' seasons');

  await prisma.$disconnect();
}

main().catch(console.error);
