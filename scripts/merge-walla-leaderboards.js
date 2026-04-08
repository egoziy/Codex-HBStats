/**
 * Merge Walla full player stats into CompetitionLeaderboardEntry.
 * Maps: goals_full → TOP_SCORERS, assists_full → TOP_ASSISTS, etc.
 *
 * Run: node scripts/merge-walla-leaderboards.js [--season "2002/2003"]
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const LIGA_HAAL_API_ID = 383;

const CATEGORY_MAP = {
  goals_full: 'TOP_SCORERS',
  assists_full: 'TOP_ASSISTS',
  yellowCards_full: 'TOP_YELLOW_CARDS',
  redCards_full: 'TOP_RED_CARDS',
  substitutedIn_full: 'TOP_SUBSTITUTED_IN',
  substitutedOut_full: 'TOP_SUBSTITUTED_OUT',
};

function norm(n) {
  return n.replace(/['"״׳\-\.`']/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

const NAME_MAP = {
  'עירוני קרית שמונה': 'עירוני קריית שמונה',
  'מכבי פתח תקוה': 'מכבי פתח תקווה',
  'הפועל פתח תקוה': 'הפועל פתח תקווה',
  'בני יהודה תל-אביב': 'בני יהודה',
};

function resolveTeamName(name) { return NAME_MAP[name] || name; }

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

  const competition = await prisma.competition.findFirst({ where: { apiFootballId: LIGA_HAAL_API_ID } });
  if (!competition) { console.log('Competition not found!'); return; }

  const where = { source: 'walla', category: { endsWith: '_full' } };
  if (targetSeason) where.season = targetSeason;

  const scraped = await prisma.scrapedLeaderboard.findMany({ where, orderBy: [{ season: 'asc' }, { category: 'asc' }, { rank: 'asc' }] });
  console.log('Records to merge:', scraped.length);

  let created = 0, skipped = 0, errors = 0;
  let currentSeasonName = '';
  let seasonId = '';
  let teams = [];

  for (const entry of scraped) {
    const dbCategory = CATEGORY_MAP[entry.category];
    if (!dbCategory) { skipped++; continue; }

    const m = entry.season.match(/(\d{4})\/(\d{4})/);
    if (!m) { skipped++; continue; }
    const dbSeasonName = `${m[1]}-${m[2]}`;

    if (dbSeasonName !== currentSeasonName) {
      currentSeasonName = dbSeasonName;
      const season = await prisma.season.findFirst({ where: { name: dbSeasonName } });
      if (!season) { seasonId = ''; continue; }
      seasonId = season.id;
      teams = await prisma.team.findMany({ where: { seasonId }, select: { id: true, nameHe: true } });
    }
    if (!seasonId) { skipped++; continue; }

    // Find team
    const team = findTeam(teams, entry.teamName);

    // Check if already exists
    const existing = await prisma.competitionLeaderboardEntry.findFirst({
      where: { seasonId, competitionId: competition.id, category: dbCategory, rank: entry.rank },
    });
    if (existing) { skipped++; continue; }

    try {
      await prisma.competitionLeaderboardEntry.create({
        data: {
          seasonId,
          competitionId: competition.id,
          category: dbCategory,
          rank: entry.rank,
          playerNameEn: entry.playerName,
          playerNameHe: entry.playerName,
          teamNameEn: entry.teamName,
          teamNameHe: entry.teamName,
          value: Math.round(entry.value),
          teamId: team?.id || null,
        },
      });
      created++;
    } catch (e) {
      errors++;
    }

    if ((created + skipped + errors) % 2000 === 0) {
      console.log('  Progress: ' + created + ' created, ' + skipped + ' skipped, ' + errors + ' errors');
    }
  }

  console.log('\nDone: created=' + created + ', skipped=' + skipped + ', errors=' + errors);
  const total = await prisma.competitionLeaderboardEntry.count();
  console.log('DB total leaderboard entries: ' + total);
  await prisma.$disconnect();
}

main().catch(console.error);
