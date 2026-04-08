/**
 * Build player rosters from CompetitionLeaderboardEntry data.
 * Creates Player records for seasons that don't have them,
 * and creates PlayerStatistics with goals/assists/cards/subs.
 *
 * Run: node scripts/build-rosters-from-leaderboards.js [--season "2002-2003"]
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const NAME_MAP = {
  'עירוני קרית שמונה': 'עירוני קריית שמונה',
  'מכבי פתח תקוה': 'מכבי פתח תקווה',
  'הפועל פתח תקוה': 'הפועל פתח תקווה',
  'בני יהודה תל-אביב': 'בני יהודה',
};

function resolveTeamName(name) { return NAME_MAP[name] || name; }

function norm(n) { return n.replace(/['"״׳\-\.`']/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }

function findTeam(teams, name) {
  const resolved = resolveTeamName(name);
  return teams.find((t) => {
    const tn = norm(t.nameHe);
    const wn = norm(resolved);
    return tn === wn || tn.includes(wn) || wn.includes(tn);
  });
}

async function main() {
  const targetSeasonName = process.argv.find((a, i) => process.argv[i - 1] === '--season');

  const seasons = targetSeasonName
    ? await prisma.season.findMany({ where: { name: targetSeasonName }, select: { id: true, name: true } })
    : await prisma.season.findMany({ orderBy: { year: 'asc' }, select: { id: true, name: true } });

  console.log('Processing', seasons.length, 'seasons');
  let totalPlayers = 0;
  let totalStats = 0;

  for (const season of seasons) {
    // Check if season already has players
    const existingPlayers = await prisma.player.count({ where: { team: { seasonId: season.id } } });
    if (existingPlayers > 50) {
      console.log('  ' + season.name + ': already has ' + existingPlayers + ' players — skipping');
      continue;
    }

    // Get leaderboard entries for this season
    const entries = await prisma.competitionLeaderboardEntry.findMany({
      where: { seasonId: season.id },
      select: { playerNameHe: true, playerNameEn: true, teamNameHe: true, teamNameEn: true, category: true, value: true, teamId: true, competitionId: true },
    });

    if (entries.length === 0) {
      console.log('  ' + season.name + ': no leaderboard entries');
      continue;
    }

    // Get teams for this season
    const teams = await prisma.team.findMany({ where: { seasonId: season.id }, select: { id: true, nameHe: true, nameEn: true } });

    // Build unique players per team
    const playerMap = new Map();
    for (const e of entries) {
      const team = e.teamId ? teams.find((t) => t.id === e.teamId) : findTeam(teams, e.teamNameHe || e.teamNameEn || '');
      if (!team) continue;

      const key = team.id + '|' + (e.playerNameHe || e.playerNameEn);
      if (!playerMap.has(key)) {
        playerMap.set(key, {
          nameHe: e.playerNameHe || e.playerNameEn || '?',
          nameEn: e.playerNameEn || e.playerNameHe || '?',
          teamId: team.id,
          competitionId: e.competitionId,
          goals: 0, assists: 0, yellowCards: 0, redCards: 0, substituteAppearances: 0, timesSubbedOff: 0,
        });
      }

      const player = playerMap.get(key);
      if (e.category === 'TOP_SCORERS') player.goals = Math.max(player.goals, e.value);
      if (e.category === 'TOP_ASSISTS') player.assists = Math.max(player.assists, e.value);
      if (e.category === 'TOP_YELLOW_CARDS') player.yellowCards = Math.max(player.yellowCards, e.value);
      if (e.category === 'TOP_RED_CARDS') player.redCards = Math.max(player.redCards, e.value);
      if (e.category === 'TOP_SUBSTITUTED_IN') player.substituteAppearances = Math.max(player.substituteAppearances, e.value);
      if (e.category === 'TOP_SUBSTITUTED_OUT') player.timesSubbedOff = Math.max(player.timesSubbedOff, e.value);
    }

    // Create players and stats
    let seasonPlayers = 0;
    let seasonStats = 0;

    for (const [, data] of playerMap) {
      // Check if player already exists for this team
      let player = await prisma.player.findFirst({
        where: { teamId: data.teamId, nameHe: data.nameHe },
      });

      if (!player) {
        player = await prisma.player.create({
          data: {
            nameHe: data.nameHe,
            nameEn: data.nameEn,
            teamId: data.teamId,
          },
        });
        seasonPlayers++;
      }

      // Create or update PlayerStatistics
      const existingStat = await prisma.playerStatistics.findFirst({
        where: { playerId: player.id, seasonId: season.id },
      });

      if (!existingStat) {
        await prisma.playerStatistics.create({
          data: {
            playerId: player.id,
            seasonId: season.id,
            competitionId: data.competitionId,
            goals: data.goals,
            assists: data.assists,
            yellowCards: data.yellowCards,
            redCards: data.redCards,
            substituteAppearances: data.substituteAppearances,
            timesSubbedOff: data.timesSubbedOff,
          },
        });
        seasonStats++;
      } else {
        // Update only zero fields
        const updates = {};
        if (existingStat.goals === 0 && data.goals > 0) updates.goals = data.goals;
        if (existingStat.assists === 0 && data.assists > 0) updates.assists = data.assists;
        if (existingStat.yellowCards === 0 && data.yellowCards > 0) updates.yellowCards = data.yellowCards;
        if (existingStat.redCards === 0 && data.redCards > 0) updates.redCards = data.redCards;
        if (existingStat.substituteAppearances === 0 && data.substituteAppearances > 0) updates.substituteAppearances = data.substituteAppearances;
        if (existingStat.timesSubbedOff === 0 && data.timesSubbedOff > 0) updates.timesSubbedOff = data.timesSubbedOff;

        if (Object.keys(updates).length > 0) {
          await prisma.playerStatistics.update({ where: { id: existingStat.id }, data: updates });
          seasonStats++;
        }
      }
    }

    totalPlayers += seasonPlayers;
    totalStats += seasonStats;
    console.log('  ' + season.name + ': ' + seasonPlayers + ' players created, ' + seasonStats + ' stats created/updated (from ' + playerMap.size + ' unique)');
  }

  console.log('\nDone: ' + totalPlayers + ' players, ' + totalStats + ' stats');

  const dbPlayers = await prisma.player.count();
  const dbStats = await prisma.playerStatistics.count();
  console.log('DB totals: ' + dbPlayers + ' players, ' + dbStats + ' statistics');

  await prisma.$disconnect();
}

main().catch(console.error);
