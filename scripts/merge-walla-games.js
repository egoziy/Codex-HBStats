/**
 * Merge Walla scraped games into main Game table.
 * Creates games with home/away team links, scores, and half-time scores.
 *
 * Run: node scripts/merge-walla-games.js [--season "2002/2003"]
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const LIGA_HAAL_API_ID = 383;

const NAME_MAP = {
  'עירוני קרית שמונה': 'עירוני קריית שמונה',
  'עירוני קרית-שמונה': 'עירוני קריית שמונה',
  'מכבי פתח תקוה': 'מכבי פתח תקווה',
  'הפועל פתח תקוה': 'הפועל פתח תקווה',
  'בני יהודה תל-אביב': 'בני יהודה',
  'מכבי קרית-גת': 'מכבי קריית גת',
  'הפועל אום אל-פחם': 'הפועל אום אל פאחם',
};

function resolveTeamName(name) {
  return NAME_MAP[name] || name;
}

function norm(n) {
  return n.replace(/['"״׳\-\.`']/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function findTeam(teams, wallaName) {
  const resolved = resolveTeamName(wallaName);
  return teams.find((t) => {
    const tn = norm(t.nameHe);
    const wn = norm(resolved);
    return tn === wn || tn.includes(wn) || wn.includes(tn);
  });
}

async function main() {
  const targetSeason = process.argv.find((a, i) => process.argv[i - 1] === '--season');
  const where = { source: 'walla' };
  if (targetSeason) where.season = targetSeason;

  const scrapedGames = await prisma.scrapedMatch.findMany({ where, orderBy: [{ season: 'asc' }] });
  console.log('Scraped games to merge:', scrapedGames.length);

  const competition = await prisma.competition.findFirst({ where: { apiFootballId: LIGA_HAAL_API_ID } });
  if (!competition) { console.log('Competition not found!'); return; }

  let created = 0, skipped = 0, errors = 0;
  let currentSeasonName = '';
  let seasonId = '';
  let teams = [];

  for (const sg of scrapedGames) {
    const m = sg.season.match(/(\d{4})\/(\d{4})/);
    if (!m) { skipped++; continue; }
    const dbSeasonName = `${m[1]}-${m[2]}`;

    // Cache season + teams
    if (dbSeasonName !== currentSeasonName) {
      currentSeasonName = dbSeasonName;
      const season = await prisma.season.findFirst({ where: { name: dbSeasonName } });
      if (!season) {
        console.log('  Season ' + dbSeasonName + ' not found — skipping');
        seasonId = '';
        continue;
      }
      seasonId = season.id;
      teams = await prisma.team.findMany({ where: { seasonId }, select: { id: true, nameHe: true } });

      // Ensure CompetitionSeason
      await prisma.competitionSeason.upsert({
        where: { competitionId_seasonId: { competitionId: competition.id, seasonId } },
        update: {},
        create: { competitionId: competition.id, seasonId },
      }).catch(() => null);
    }

    if (!seasonId) { skipped++; continue; }

    const homeTeam = findTeam(teams, sg.homeTeamName);
    const awayTeam = findTeam(teams, sg.awayTeamName);

    if (!homeTeam || !awayTeam) {
      // Create missing teams
      let homeId = homeTeam?.id;
      let awayId = awayTeam?.id;

      if (!homeId) {
        const resolved = resolveTeamName(sg.homeTeamName);
        const newTeam = await prisma.team.create({ data: { nameHe: resolved, nameEn: resolved, seasonId } });
        homeId = newTeam.id;
        teams.push({ id: newTeam.id, nameHe: resolved });
      }
      if (!awayId) {
        const resolved = resolveTeamName(sg.awayTeamName);
        const newTeam = await prisma.team.create({ data: { nameHe: resolved, nameEn: resolved, seasonId } });
        awayId = newTeam.id;
        teams.push({ id: newTeam.id, nameHe: resolved });
      }

      // Check for existing game
      const existing = await prisma.game.findFirst({
        where: { seasonId, homeTeamId: homeId, awayTeamId: awayId, homeScore: sg.homeScore, awayScore: sg.awayScore },
      });
      if (existing) { skipped++; continue; }

      try {
        await prisma.game.create({
          data: {
            seasonId,
            competitionId: competition.id,
            homeTeamId: homeId,
            awayTeamId: awayId,
            homeScore: sg.homeScore,
            awayScore: sg.awayScore,
            status: 'COMPLETED',
            dateTime: new Date(`${m[1]}-09-01`), // approximate date
            additionalInfo: sg.rawJson || undefined,
          },
        });
        created++;
      } catch (e) { errors++; }
      continue;
    }

    // Both teams found — check for duplicate
    const existing = await prisma.game.findFirst({
      where: { seasonId, homeTeamId: homeTeam.id, awayTeamId: awayTeam.id, homeScore: sg.homeScore, awayScore: sg.awayScore },
    });
    if (existing) { skipped++; continue; }

    try {
      await prisma.game.create({
        data: {
          seasonId,
          competitionId: competition.id,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
          homeScore: sg.homeScore,
          awayScore: sg.awayScore,
          status: 'COMPLETED',
          dateTime: new Date(`${m[1]}-09-01`), // approximate
          additionalInfo: sg.rawJson || undefined,
        },
      });
      created++;
    } catch (e) { errors++; }

    if ((created + skipped + errors) % 200 === 0) {
      console.log('  Progress: ' + created + ' created, ' + skipped + ' skipped, ' + errors + ' errors');
    }
  }

  console.log('\nDone: created=' + created + ', skipped=' + skipped + ', errors=' + errors);

  const totalGames = await prisma.game.count();
  console.log('DB total games: ' + totalGames);

  await prisma.$disconnect();
}

main().catch(console.error);
