import Link from 'next/link';

import StatisticsLeaderboardsClient from '@/components/StatisticsLeaderboardsClient';
import { getCompetitionDisplayName, getRoundDisplayName } from '@/lib/competition-display';
import { getDisplayMode } from '@/lib/display-mode';
import { getDisplayZeroStatPlayersSetting } from '@/lib/player-zero-stat-settings';
import { formatPlayerName, formatPlayerPosition } from '@/lib/player-display';
import prisma from '@/lib/prisma';
import { sortStandings } from '@/lib/standings';

export const dynamic = 'force-dynamic';

function getCompetitionLabel(competition: { nameHe: string | null; nameEn: string } | null | undefined) {
  if (!competition) return '-';
  return getCompetitionDisplayName(competition);
}

function getDefaultCompetition(
  competitions: Array<{ id: string; apiFootballId: number | null; nameHe: string; nameEn: string; type: string }>
) {
  return (
    competitions.find(
      (competition) =>
        competition.type === 'LEAGUE' &&
        `${competition.nameHe} ${competition.nameEn}`.toLowerCase().includes("ligat ha'al")
    ) ||
    competitions.find((competition) => competition.type === 'LEAGUE') ||
    competitions[0] ||
    null
  );
}

function getPlayerTotalPasses(
  player: any,
  selectedCompetition: { id: string; apiFootballId: number | null; nameHe: string; nameEn: string } | null
) {
  const statistics = Array.isArray(player?.additionalInfo?.statistics) ? player.additionalInfo.statistics : [];
  let total = 0;

  for (const stat of statistics) {
    if (selectedCompetition) {
      const statLeagueId = stat?.league?.id;
      const statLeagueName = `${stat?.league?.name || ''}`.toLowerCase();
      const matchesSelectedCompetition =
        (typeof statLeagueId === 'number' && statLeagueId === selectedCompetition.apiFootballId) ||
        statLeagueName === selectedCompetition.nameEn.toLowerCase() ||
        statLeagueName === selectedCompetition.nameHe.toLowerCase();

      if (!matchesSelectedCompetition) {
        continue;
      }
    }

    const passes = stat?.passes?.total;
    if (typeof passes === 'number') {
      total += passes;
    }
  }

  if (total > 0) return total;

  const totals = Array.isArray(player?.playerStats) ? player.playerStats : [];
  return totals.reduce((sum: number, row: any) => sum + (row.keyPasses || 0), 0);
}

function isGoalkeeper(position: string | null | undefined) {
  const normalized = (position || '').toLowerCase();
  return normalized.includes('goalkeeper') || normalized === 'gk' || normalized === 'g';
}

export default async function StatisticsPage({
  searchParams,
}: {
  searchParams?: { season?: string; teamId?: string; competitionId?: string; view?: string };
}) {
  const displayMode = await getDisplayMode(searchParams?.view);
  const seasons = await prisma.season.findMany({
    orderBy: { year: 'desc' },
  });

  const selectedSeasonId = searchParams?.season || seasons[0]?.id || null;
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) || seasons[0] || null;
  const displayZeroStatPlayers = await getDisplayZeroStatPlayersSetting();

  const teams = selectedSeason
    ? await prisma.team.findMany({
        where: { seasonId: selectedSeason.id },
        orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
      })
    : [];

  const competitions = selectedSeason
    ? await prisma.competition.findMany({
        where: {
          OR: [
            { standings: { some: { seasonId: selectedSeason.id } } },
            { games: { some: { seasonId: selectedSeason.id } } },
            { playerStats: { some: { seasonId: selectedSeason.id } } },
          ],
        },
        select: {
          id: true,
          apiFootballId: true,
          nameHe: true,
          nameEn: true,
          type: true,
        },
        orderBy: [{ type: 'asc' }, { nameHe: 'asc' }, { nameEn: 'asc' }],
      })
    : [];

  const selectedTeamId = searchParams?.teamId || 'all';
  const selectedTeam = teams.find((team) => team.id === selectedTeamId) || null;
  const defaultCompetition = getDefaultCompetition(competitions);
  const selectedCompetitionId = searchParams?.competitionId || defaultCompetition?.id || 'all';
  const selectedCompetition = competitions.find((competition) => competition.id === selectedCompetitionId) || defaultCompetition || null;

  const [rawStandings, games, players, leaderPlayers, leaderGames] = await Promise.all([
    selectedSeason
      ? prisma.standing.findMany({
          where: {
            seasonId: selectedSeason.id,
            ...(selectedCompetition ? { competitionId: selectedCompetition.id } : {}),
            ...(selectedTeam ? { teamId: selectedTeam.id } : {}),
          },
          include: { team: true },
          orderBy: [{ position: 'asc' }, { points: 'desc' }],
        })
      : [],
    selectedSeason
      ? prisma.game.findMany({
          where: {
            seasonId: selectedSeason.id,
            ...(selectedCompetition ? { competitionId: selectedCompetition.id } : {}),
            ...(selectedTeam
              ? {
                  OR: [{ homeTeamId: selectedTeam.id }, { awayTeamId: selectedTeam.id }],
                }
              : {}),
          },
          include: { homeTeam: true, awayTeam: true },
        })
      : [],
    selectedTeam
      ? prisma.player.findMany({
          where: { teamId: selectedTeam.id },
          include: {
            playerStats: {
              where: selectedSeason
                ? {
                    seasonId: selectedSeason.id,
                    ...(selectedCompetition ? { competitionId: selectedCompetition.id } : {}),
                  }
                : undefined,
            },
          },
          orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
        })
      : [],
    selectedSeason
      ? prisma.player.findMany({
          where: {
            team: {
              seasonId: selectedSeason.id,
              ...(selectedTeam ? { id: selectedTeam.id } : {}),
            },
          },
          include: {
            team: true,
            playerStats: {
              where: {
                seasonId: selectedSeason.id,
                ...(selectedCompetition ? { competitionId: selectedCompetition.id } : {}),
              },
            },
          },
          orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
        })
      : [],
    selectedSeason
      ? prisma.game.findMany({
          where: {
            seasonId: selectedSeason.id,
            status: 'COMPLETED',
            ...(selectedCompetition ? { competitionId: selectedCompetition.id } : {}),
            ...(selectedTeam
              ? {
                  OR: [{ homeTeamId: selectedTeam.id }, { awayTeamId: selectedTeam.id }],
                }
              : {}),
          },
          include: {
            homeTeam: true,
            awayTeam: true,
            competition: true,
            events: {
              select: {
                id: true,
                minute: true,
                extraMinute: true,
                type: true,
                playerId: true,
                relatedPlayerId: true,
                assistPlayerId: true,
              },
            },
            lineupEntries: {
              select: {
                playerId: true,
                role: true,
                teamId: true,
                positionName: true,
              },
            },
          },
          orderBy: { dateTime: 'asc' },
        })
      : [],
  ]);

  const standings = sortStandings(rawStandings);

  let totalGoals = 0;
  for (const game of games) {
    totalGoals += (game.homeScore ?? 0) + (game.awayScore ?? 0);
  }
  const completedGames = games.length;
  const averageGoals = completedGames ? (totalGoals / completedGames).toFixed(2) : '0.00';
  const pointsLeader = standings[0];

  const playerRows = players
    .map((player) => {
      const totals = player.playerStats.reduce(
        (acc, stat) => ({
          gamesPlayed: acc.gamesPlayed + stat.gamesPlayed,
          goals: acc.goals + stat.goals,
          assists: acc.assists + stat.assists,
          yellowCards: acc.yellowCards + stat.yellowCards,
          redCards: acc.redCards + stat.redCards,
        }),
        { gamesPlayed: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 }
      );

      return {
        player,
        totals,
        isZeroStatPlayer:
          totals.gamesPlayed === 0 &&
          totals.goals === 0 &&
          totals.assists === 0 &&
          totals.yellowCards === 0 &&
          totals.redCards === 0,
      };
    })
    .filter((row) => (displayZeroStatPlayers ? true : !row.isZeroStatPlayer))
    .sort((left, right) => {
      if (left.isZeroStatPlayer !== right.isZeroStatPlayer) {
        return left.isZeroStatPlayer ? 1 : -1;
      }

      return formatPlayerName(left.player).localeCompare(formatPlayerName(right.player), 'he');
    });

  const totalPlayers = playerRows.length;
  const leaderRows = leaderPlayers
    .map((player) => {
      const totals = player.playerStats.reduce(
        (acc, stat) => ({
          gamesPlayed: acc.gamesPlayed + stat.gamesPlayed,
          goals: acc.goals + stat.goals,
          assists: acc.assists + stat.assists,
          keyPasses: acc.keyPasses + stat.keyPasses,
        }),
        { gamesPlayed: 0, goals: 0, assists: 0, keyPasses: 0 }
      );

      return {
        player,
        totals,
        totalPasses: getPlayerTotalPasses(player, selectedCompetition),
      };
    })
    .filter((row) => row.totals.gamesPlayed > 0 || row.totalPasses > 0);

  const cleanSheetMap = new Map<string, number>();
  for (const game of leaderGames) {
    for (const entry of game.lineupEntries) {
      if (!entry.playerId || entry.role !== 'STARTER') continue;
      const player = leaderPlayers.find((candidate) => candidate.id === entry.playerId);
      if (!player || !isGoalkeeper(player.position || entry.positionName)) continue;

      const conceded =
        entry.teamId === game.homeTeamId ? (game.awayScore ?? 0) : entry.teamId === game.awayTeamId ? (game.homeScore ?? 0) : null;
      if (conceded !== 0) continue;

      cleanSheetMap.set(entry.playerId, (cleanSheetMap.get(entry.playerId) || 0) + 1);
    }
  }

  const goalsLeaders = [...leaderRows]
    .sort((a, b) => {
      const effectiveGoalsA = Math.max(a.totals.goals, countScoringEventsForPlayer(leaderGames, a.player.id));
      const effectiveGoalsB = Math.max(b.totals.goals, countScoringEventsForPlayer(leaderGames, b.player.id));
      return effectiveGoalsB - effectiveGoalsA || b.totals.assists - a.totals.assists;
    })
    .slice(0, 10);
  const assistsLeaders = [...leaderRows]
    .sort((a, b) => {
      const effectiveAssistsA = Math.max(a.totals.assists, countAssistEventsForPlayer(leaderGames, a.player.id));
      const effectiveAssistsB = Math.max(b.totals.assists, countAssistEventsForPlayer(leaderGames, b.player.id));
      return effectiveAssistsB - effectiveAssistsA || b.totals.goals - a.totals.goals;
    })
    .slice(0, 10);
  const passesLeaders = [...leaderRows].sort((a, b) => b.totalPasses - a.totalPasses).slice(0, 10);
  const cleanSheetLeaders = [...leaderRows]
    .filter((row) => cleanSheetMap.has(row.player.id))
    .sort((a, b) => (cleanSheetMap.get(b.player.id) || 0) - (cleanSheetMap.get(a.player.id) || 0))
    .slice(0, 10);
  let leaderboardCards = buildLeaderboardCards({
    goalsLeaders,
    assistsLeaders,
    passesLeaders,
    cleanSheetLeaders,
    cleanSheetMap,
    leaderGames,
  });

  // Fallback: if no player data (old seasons), use CompetitionLeaderboardEntry
  const hasPlayerData = goalsLeaders.length > 0 || assistsLeaders.length > 0;
  if (!hasPlayerData && selectedSeason) {
    const dbLeaderboards = await prisma.competitionLeaderboardEntry.findMany({
      where: {
        seasonId: selectedSeason.id,
        ...(selectedCompetition ? { competitionId: selectedCompetition.id } : {}),
      },
      orderBy: [{ category: 'asc' }, { rank: 'asc' }],
      take: 200,
    });

    const categoryMap: Record<string, { title: string; valueLabel: string }> = {
      TOP_SCORERS: { title: 'מלך השערים', valueLabel: 'שערים' },
      TOP_ASSISTS: { title: 'מלך הבישולים', valueLabel: 'בישולים' },
      TOP_YELLOW_CARDS: { title: 'כרטיסים צהובים', valueLabel: 'צהובים' },
      TOP_RED_CARDS: { title: 'כרטיסים אדומים', valueLabel: 'אדומים' },
      TOP_SUBSTITUTED_IN: { title: 'נכנס כמחליף', valueLabel: 'כניסות' },
      TOP_SUBSTITUTED_OUT: { title: 'הוחלף', valueLabel: 'החלפות' },
    };

    const grouped = new Map<string, typeof dbLeaderboards>();
    for (const entry of dbLeaderboards) {
      const list = grouped.get(entry.category) || [];
      list.push(entry);
      grouped.set(entry.category, list);
    }

    leaderboardCards = Array.from(grouped.entries()).map(([category, entries]) => {
      const meta = categoryMap[category] || { title: category, valueLabel: 'ערך' };
      return {
        title: meta.title,
        valueLabel: meta.valueLabel,
        rows: entries.slice(0, 20).map((e) => ({
          playerId: e.playerId || e.id,
          playerName: e.playerNameHe || e.playerNameEn || '?',
          teamName: e.teamNameHe || e.teamNameEn || '-',
          value: e.value,
          details: [],
          emptyMessage: '',
        })),
      };
    });
  }

  if (displayMode === 'premier') {
    return (
      <PremierStatisticsView
        seasons={seasons}
        selectedSeason={selectedSeason}
        selectedSeasonId={selectedSeasonId}
        teams={teams}
        selectedTeam={selectedTeam}
        selectedTeamId={selectedTeamId}
        competitions={competitions}
        selectedCompetition={selectedCompetition}
        selectedCompetitionId={selectedCompetitionId}
        completedGames={completedGames}
        totalGoals={totalGoals}
        averageGoals={averageGoals}
        pointsLeader={pointsLeader}
        playerRows={playerRows}
        standings={standings}
        totalPlayers={totalPlayers}
        goalsLeaders={goalsLeaders}
        assistsLeaders={assistsLeaders}
        passesLeaders={passesLeaders}
        cleanSheetLeaders={cleanSheetLeaders}
        cleanSheetMap={Object.fromEntries(cleanSheetMap)}
        leaderboardCards={leaderboardCards}
      />
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold tracking-[0.25em] text-amber-700">סטטיסטיקה</p>
          <h1 className="mt-2 text-3xl font-black text-stone-900">מרכז סטטיסטיקות</h1>
          <p className="mt-3 max-w-3xl text-stone-600">
            בחרו עונה, ואם תרצו גם קבוצה ספציפית, כדי לראות תמונת מצב סטטיסטית מלאה.
          </p>

          <form className="mt-6 grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto]" action="/statistics">
            <select
              name="season"
              defaultValue={selectedSeason?.id || ''}
              className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 font-semibold"
            >
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>

            <select
              name="competitionId"
              defaultValue={selectedCompetitionId}
              className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 font-semibold"
            >
              {competitions.map((competition) => (
                <option key={competition.id} value={competition.id}>
                  {getCompetitionLabel(competition)}
                </option>
              ))}
            </select>

            <select
              name="teamId"
              defaultValue={selectedTeamId}
              className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 font-semibold"
            >
              <option value="all">כל הקבוצות</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.nameHe || team.nameEn}
                </option>
              ))}
            </select>

            <button className="rounded-full bg-stone-900 px-5 py-3 font-bold text-white">הצג נתונים</button>
          </form>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatsCard title="עונה נבחרת" value={selectedSeason?.name || '-'} subtitle="סינון הנתונים הנוכחי" />
          <StatsCard title="משחקים" value={String(completedGames)} subtitle="במסגרת הסינון הנוכחי" />
          <StatsCard title={'סה"כ שערים'} value={String(totalGoals)} subtitle={`ממוצע למשחק: ${averageGoals}`} />
          <StatsCard
            title="מובילה בנקודות"
            value={pointsLeader ? pointsLeader.team.nameHe || pointsLeader.team.nameEn : '-'}
            subtitle={pointsLeader ? `${pointsLeader.adjustedPoints} נקודות` : 'אין נתונים'}
          />
        </section>

        {selectedTeam ? (
          <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-2xl font-black text-stone-900">סטטיסטיקה לקבוצה: {selectedTeam.nameHe || selectedTeam.nameEn}</h2>
              <p className="mt-2 text-sm text-stone-600">סגל הקבוצה בעונה הנבחרת ומאפייני הביצועים שלה.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <StatsCard title="שחקנים בסגל" value={String(totalPlayers)} subtitle="לפי הנתונים שמוצגים כרגע" />
              <StatsCard title="ניצחונות" value={String(standings[0]?.wins ?? 0)} subtitle="בטבלת העונה הנבחרת" />
              <StatsCard title="שערי זכות" value={String(standings[0]?.goalsFor ?? 0)} subtitle="במסגרת הסינון" />
              <StatsCard
                title="נקודות אחרי תיקון"
                value={String(standings[0]?.adjustedPoints ?? 0)}
                subtitle={
                  standings[0]?.pointsAdjustmentNoteHe ||
                  (standings[0]?.pointsAdjustment
                    ? `תיקון: ${standings[0].pointsAdjustment > 0 ? `+${standings[0].pointsAdjustment}` : standings[0].pointsAdjustment}`
                    : 'ללא תיקון נקודות')
                }
              />
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-right">
                <thead>
                  <tr className="border-b border-stone-200 text-sm text-stone-500">
                    <th className="px-3 py-3">שחקן</th>
                    <th className="px-3 py-3">מספר</th>
                    <th className="px-3 py-3">עמדה</th>
                    <th className="px-3 py-3">הופעות</th>
                    <th className="px-3 py-3">שערים</th>
                    <th className="px-3 py-3">בישולים</th>
                    <th className="px-3 py-3">צהובים</th>
                    <th className="px-3 py-3">אדומים</th>
                  </tr>
                </thead>
                <tbody>
                  {playerRows.map(({ player, totals, isZeroStatPlayer }) => (
                    <tr key={player.id} className={`border-b border-stone-100 text-sm ${isZeroStatPlayer ? 'bg-stone-50 text-stone-500' : ''}`}>
                      <td className="px-3 py-3 font-semibold">
                        <Link
                          href={`/players/${player.canonicalPlayerId || player.id}?season=${selectedSeasonId}`}
                          className={`font-semibold transition hover:text-amber-700 ${isZeroStatPlayer ? 'text-stone-600' : 'text-stone-900'}`}
                        >
                          {formatPlayerName(player)}
                        </Link>
                        {isZeroStatPlayer ? <div className="mt-1 text-xs font-bold text-stone-400">0 סטטיסטיקות</div> : null}
                      </td>
                      <td className="px-3 py-3">{player.jerseyNumber ?? '-'}</td>
                      <td className="px-3 py-3">{formatPlayerPosition(player.position)}</td>
                      <td className="px-3 py-3">{totals.gamesPlayed}</td>
                      <td className="px-3 py-3">{totals.goals}</td>
                      <td className="px-3 py-3">{totals.assists}</td>
                      <td className="px-3 py-3">{totals.yellowCards}</td>
                      <td className="px-3 py-3">{totals.redCards}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-stone-900">תמונת מצב לכל הקבוצות</h2>
            <p className="mt-2 text-sm text-stone-600">כאן מוצגים נתוני הטבלה עבור כל הקבוצות בעונה שבחרת.</p>

            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-right">
                <thead>
                  <tr className="border-b border-stone-200 text-sm text-stone-500">
                    <th className="px-3 py-3">קבוצה</th>
                    <th className="px-3 py-3">מיקום</th>
                    <th className="px-3 py-3">נקודות</th>
                    <th className="px-3 py-3">תיקון</th>
                    <th className="px-3 py-3">ניצחונות</th>
                    <th className="px-3 py-3">הפרש שערים</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((row) => (
                    <tr key={row.id} className="border-b border-stone-100 text-sm">
                      <td className="px-3 py-3 font-semibold">{row.team.nameHe || row.team.nameEn}</td>
                      <td className="px-3 py-3">{row.displayPosition}</td>
                      <td className="px-3 py-3">{row.adjustedPoints}</td>
                      <td className="px-3 py-3">
                        {row.pointsAdjustment !== 0 ? (
                          <span className={row.pointsAdjustment < 0 ? 'font-bold text-red-700' : 'font-bold text-emerald-700'}>
                            {row.pointsAdjustment > 0 ? `+${row.pointsAdjustment}` : row.pointsAdjustment}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-3 py-3">{row.wins}</td>
                      <td className="px-3 py-3">{row.goalDifference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function PremierStatisticsView({
  seasons,
  selectedSeason,
  selectedSeasonId,
  teams,
  selectedTeam,
  selectedTeamId,
  competitions,
  selectedCompetition,
  selectedCompetitionId,
  completedGames,
  totalGoals,
  averageGoals,
  pointsLeader,
  playerRows,
  standings,
  totalPlayers,
  goalsLeaders,
  assistsLeaders,
  passesLeaders,
  cleanSheetLeaders,
  cleanSheetMap,
  leaderboardCards,
}: {
  seasons: Array<{ id: string; name: string }>;
  selectedSeason: { id: string; name: string } | null;
  selectedSeasonId: string;
  teams: Array<{ id: string; nameHe: string | null; nameEn: string }>;
  selectedTeam: { id: string; nameHe: string | null; nameEn: string } | null;
  selectedTeamId: string;
  competitions: Array<{ id: string; nameHe: string; nameEn: string; type: string }>;
  selectedCompetition: { id: string; nameHe: string; nameEn: string } | null;
  selectedCompetitionId: string;
  completedGames: number;
  totalGoals: number;
  averageGoals: string;
  pointsLeader: any;
  playerRows: Array<{
    player: any;
    totals: { gamesPlayed: number; goals: number; assists: number; yellowCards: number; redCards: number };
    isZeroStatPlayer: boolean;
  }>;
  standings: any[];
  totalPlayers: number;
  goalsLeaders: Array<any>;
  assistsLeaders: Array<any>;
  passesLeaders: Array<any>;
  cleanSheetLeaders: Array<any>;
  cleanSheetMap: Record<string, number>;
  leaderboardCards: Array<any>;
}) {
  const topScorers = [...playerRows].sort((a, b) => b.totals.goals - a.totals.goals || b.totals.assists - a.totals.assists).slice(0, 8);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f6f8ff_0%,#eef2ff_100%)] px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[32px] bg-[linear-gradient(140deg,#12002f,#4a006f_48%,#05a3d6)] p-6 text-white shadow-[0_30px_80px_rgba(18,0,47,0.28)] md:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-1 text-xs font-bold uppercase tracking-[0.34em] text-cyan-100">
                מרכז נתונים
              </div>
              <h1 className="text-4xl font-black tracking-tight md:text-5xl">מרכז הסטטיסטיקות</h1>
              <p className="text-sm leading-6 text-white/78 md:text-base">
                גרסת תצוגה חדשה שמסדרת את הנתונים כמו מרכז סטטיסטיקות רשמי: פילטרים מהירים, נתוני עונה בולטים, וטבלאות דירוג ברורות יותר לשחקנים ולקבוצות.
              </p>
            </div>

            <form className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]" action="/statistics">
              <input type="hidden" name="view" value="premier" />
              <select
                name="season"
                defaultValue={selectedSeason?.id || ''}
                className="rounded-2xl border border-white/40 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none"
              >
                {seasons.map((season) => (
                  <option key={season.id} value={season.id} className="text-slate-950">
                    {season.name}
                  </option>
                  ))}
                </select>
                <select
                  name="competitionId"
                  defaultValue={selectedCompetitionId}
                  className="rounded-2xl border border-white/40 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none"
                >
                  {competitions.map((competition) => (
                    <option key={competition.id} value={competition.id} className="text-slate-950">
                      {getCompetitionLabel(competition)}
                    </option>
                  ))}
                </select>
                <select
                  name="teamId"
                  defaultValue={selectedTeamId}
                  className="rounded-2xl border border-white/40 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none"
                >
                <option value="all" className="text-slate-950">כל הקבוצות</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id} className="text-slate-950">
                    {team.nameHe || team.nameEn}
                  </option>
                ))}
              </select>
              <button className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-[#320061]">הצג נתונים</button>
            </form>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <PremierStatsCard title="עונה" value={selectedSeason?.name || '-'} subtitle="הסינון הפעיל" />
            <PremierStatsCard title="משחקים" value={String(completedGames)} subtitle="במסגרת הסינון" />
            <PremierStatsCard title="שערים" value={String(totalGoals)} subtitle={`ממוצע למשחק: ${averageGoals}`} />
            <PremierStatsCard
              title="מובילה בנקודות"
              value={pointsLeader ? pointsLeader.team.nameHe || pointsLeader.team.nameEn : '-'}
              subtitle={pointsLeader ? `${pointsLeader.adjustedPoints} נקודות` : 'אין נתונים'}
            />
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
          <>
            <StatisticsLeaderboardsClient cards={leaderboardCards} />
            <div className="hidden xl:col-span-2 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <LeaderboardCard title="מלך השערים" rows={goalsLeaders} valueForRow={(row) => row.totals.goals} />
            <LeaderboardCard title="מלך הבישולים" rows={assistsLeaders} valueForRow={(row) => row.totals.assists} />
            <LeaderboardCard title="מסירות מדויקות" rows={passesLeaders} valueForRow={(row) => row.totalPasses} />
            <LeaderboardCard title="רשת נקייה" rows={cleanSheetLeaders} valueForRow={(row) => cleanSheetMap[row.player.id] || 0} />
            </div>
          </>

          <div className="overflow-hidden rounded-[30px] border border-slate-200/70 bg-white shadow-[0_22px_60px_rgba(15,23,42,0.08)]">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="text-2xl font-black text-slate-950">
                {selectedTeam ? `שחקני ${selectedTeam.nameHe || selectedTeam.nameEn}` : 'דירוג שחקנים'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {selectedTeam ? 'טבלת ביצועים עונתית של הסגל הנבחר.' : 'השחקנים המובילים על פי הנתונים הזמינים במסנן הנוכחי.'}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-right">
                <thead>
                  <tr className="border-b border-slate-100 bg-[#f7f8ff] text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                    <th className="px-4 py-4">שחקן</th>
                    <th className="px-4 py-4">עמדה</th>
                    <th className="px-4 py-4 text-center">הופעות</th>
                    <th className="px-4 py-4 text-center">שערים</th>
                    <th className="px-4 py-4 text-center">בישולים</th>
                    <th className="px-4 py-4 text-center">YC</th>
                    <th className="px-4 py-4 text-center">RC</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedTeam ? playerRows : topScorers).map(({ player, totals, isZeroStatPlayer }, index) => (
                    <tr key={player.id} className={`border-b border-slate-100 text-sm ${isZeroStatPlayer ? 'bg-slate-50 text-slate-400' : 'text-slate-700'} ${index < 3 && !isZeroStatPlayer ? 'bg-[#fbf8ff]' : ''}`}>
                      <td className="px-4 py-4">
                        <Link
                          href={`/players/${player.canonicalPlayerId || player.id}?season=${selectedSeasonId}&view=premier`}
                          className={`font-black transition hover:text-[#7000bd] ${isZeroStatPlayer ? 'text-slate-500' : 'text-slate-950'}`}
                        >
                          {formatPlayerName(player)}
                        </Link>
                        {!selectedTeam ? (
                          <div className="mt-1 text-xs text-slate-500">{player.team?.nameHe || player.team?.nameEn}</div>
                        ) : null}
                        {isZeroStatPlayer ? <div className="mt-1 text-[11px] font-bold tracking-[0.2em]">0 סטטיסטיקות</div> : null}
                      </td>
                      <td className="px-4 py-4 font-semibold">{formatPlayerPosition(player.position)}</td>
                      <td className="px-4 py-4 text-center font-bold">{totals.gamesPlayed}</td>
                      <td className="px-4 py-4 text-center font-black text-[#7200bf]">{totals.goals}</td>
                      <td className="px-4 py-4 text-center font-black text-cyan-700">{totals.assists}</td>
                      <td className="px-4 py-4 text-center font-bold">{totals.yellowCards}</td>
                      <td className="px-4 py-4 text-center font-bold">{totals.redCards}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-6">
            <section className="rounded-[30px] border border-slate-200/70 bg-white p-6 shadow-[0_22px_60px_rgba(15,23,42,0.08)]">
              <h3 className="text-xl font-black text-slate-950">תמונת מצב</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <QuickMetric label="שחקנים מוצגים" value={String(totalPlayers)} accent="text-[#6d00b7]" />
                <QuickMetric label="מובילת העונה" value={pointsLeader ? pointsLeader.team.nameHe || pointsLeader.team.nameEn : '-'} accent="text-cyan-700" />
                <QuickMetric label="ניצחונות למובילה" value={String(pointsLeader?.wins ?? 0)} accent="text-emerald-700" />
                <QuickMetric label="הפרש שערים" value={String(pointsLeader?.goalDifference ?? 0)} accent="text-rose-700" />
              </div>
            </section>

            <section className="overflow-hidden rounded-[30px] border border-slate-200/70 bg-white shadow-[0_22px_60px_rgba(15,23,42,0.08)]">
              <div className="border-b border-slate-100 px-6 py-5">
                <h3 className="text-xl font-black text-slate-950">דירוג קבוצות</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {standings.slice(0, 8).map((row, index) => (
                  <div key={row.id} className="flex items-center justify-between gap-4 px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-black ${index === 0 ? 'bg-[#f4e8ff] text-[#6700b2]' : 'bg-slate-100 text-slate-700'}`}>
                        {row.displayPosition}
                      </div>
                      <div>
                        <div className="font-black text-slate-950">{row.team.nameHe || row.team.nameEn}</div>
                        <div className="text-xs text-slate-500">{row.wins} ניצחונות | {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference} GD</div>
                      </div>
                    </div>
                    <div className="text-lg font-black text-slate-950">{row.adjustedPoints}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </div>
  );
}

function PremierStatsCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <article className="rounded-[24px] border border-white/15 bg-white/10 p-5 backdrop-blur">
      <div className="text-xs font-bold tracking-[0.26em] text-white/55">{title}</div>
      <div className="mt-3 text-3xl font-black">{value}</div>
      <div className="mt-2 text-sm text-white/72">{subtitle}</div>
    </article>
  );
}

function QuickMetric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-[22px] bg-[#f6f8ff] px-4 py-4">
      <div className="text-xs font-bold tracking-[0.24em] text-slate-400">{label}</div>
      <div className={`mt-3 text-2xl font-black ${accent}`}>{value}</div>
    </div>
  );
}

function LeaderboardCard({
  title,
  rows,
  valueForRow,
}: {
  title: string;
  rows: Array<any>;
  valueForRow: (row: any) => number;
}) {
  return (
    <section className="overflow-hidden rounded-[30px] border border-slate-200/70 bg-white shadow-[0_22px_60px_rgba(15,23,42,0.08)]">
      <div className="border-b border-slate-100 px-6 py-5">
        <h3 className="text-xl font-black text-slate-950">{title}</h3>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.slice(0, 10).map((row: any, index: number) => (
          <div key={row.player.id} className="flex items-center justify-between gap-4 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-5 text-sm font-black text-slate-500">{index + 1}</div>
              <div>
                <div className="font-black text-slate-950">{formatPlayerName(row.player)}</div>
                <div className="text-xs text-slate-500">{row.player.team?.nameHe || row.player.team?.nameEn || '-'}</div>
              </div>
            </div>
            <div className="text-3xl font-black text-[#5e00ad]">{valueForRow(row)}</div>
          </div>
        ))}
        {rows.length === 0 ? <div className="px-6 py-6 text-sm text-slate-400">אין נתונים זמינים כרגע.</div> : null}
      </div>
    </section>
  );
}

function eventMinuteLabel(event: { minute: number; extraMinute: number | null }) {
  return `${event.minute}${event.extraMinute ? `+${event.extraMinute}` : ''}'`;
}

function roundLabel(game: { roundNameHe: string | null; roundNameEn: string | null }) {
  return getRoundDisplayName(game.roundNameHe, game.roundNameEn);
}

function matchLabel(game: { homeTeam: { nameHe: string | null; nameEn: string }; awayTeam: { nameHe: string | null; nameEn: string } }) {
  return `${game.homeTeam.nameHe || game.homeTeam.nameEn} - ${game.awayTeam.nameHe || game.awayTeam.nameEn}`;
}

function scoreLabel(game: { homeScore: number | null; awayScore: number | null }) {
  return `${game.homeScore ?? 0}-${game.awayScore ?? 0}`;
}

function isScoringEventForPlayer(event: any, playerId: string) {
  if (event.type !== 'GOAL' && event.type !== 'PENALTY_GOAL') {
    return false;
  }

  return event.playerId === playerId || (!event.playerId && event.relatedPlayerId === playerId);
}

function isAssistEventForPlayer(event: any, playerId: string) {
  if (event.type !== 'GOAL' && event.type !== 'PENALTY_GOAL') {
    return false;
  }

  return event.assistPlayerId === playerId || event.relatedPlayerId === playerId;
}

function didPlayerAppearInGame(game: any, playerId: string) {
  return game.lineupEntries.some((entry: any) => entry.playerId === playerId);
}

function countScoringEventsForPlayer(games: Array<any>, playerId: string) {
  return games.reduce(
    (sum, game) => sum + game.events.filter((event: any) => isScoringEventForPlayer(event, playerId)).length,
    0
  );
}

function countAssistEventsForPlayer(games: Array<any>, playerId: string) {
  return games.reduce(
    (sum, game) => sum + game.events.filter((event: any) => isAssistEventForPlayer(event, playerId)).length,
    0
  );
}

function buildLeaderboardCards({
  goalsLeaders,
  assistsLeaders,
  passesLeaders,
  cleanSheetLeaders,
  cleanSheetMap,
  leaderGames,
}: {
  goalsLeaders: Array<any>;
  assistsLeaders: Array<any>;
  passesLeaders: Array<any>;
  cleanSheetLeaders: Array<any>;
  cleanSheetMap: Map<string, number>;
  leaderGames: Array<any>;
}) {
  const goalsCard = {
    title: 'מלך השערים',
    valueLabel: 'שערים',
    rows: goalsLeaders.map((row) => {
      const details = leaderGames.flatMap((game) =>
        game.events
          .filter((event: any) => isScoringEventForPlayer(event, row.player.id))
          .map((event: any) => ({
            id: event.id,
            roundLabel: roundLabel(game),
            matchLabel: matchLabel(game),
            valueLabel: event.type === 'PENALTY_GOAL' ? 'שער בפנדל' : 'שער',
            minuteLabel: eventMinuteLabel(event),
            scoreLabel: scoreLabel(game),
            note: getCompetitionLabel(game.competition),
          }))
      );

      return {
        playerId: row.player.id,
        playerName: formatPlayerName(row.player),
        teamName: row.player.team?.nameHe || row.player.team?.nameEn || '-',
        value: Math.max(row.totals.goals, details.length),
        details,
        emptyMessage: 'אין פירוט שערים מקומי זמין עבור השחקן הזה.',
      };
    }),
  };

  const assistsCard = {
    title: 'מלך הבישולים',
    valueLabel: 'בישולים',
    rows: assistsLeaders.map((row) => {
      const details = leaderGames.flatMap((game) =>
        game.events
          .filter((event: any) => isAssistEventForPlayer(event, row.player.id))
          .map((event: any) => ({
            id: event.id,
            roundLabel: roundLabel(game),
            matchLabel: matchLabel(game),
            valueLabel: 'בישול',
            minuteLabel: eventMinuteLabel(event),
            scoreLabel: scoreLabel(game),
            note: getCompetitionLabel(game.competition),
          }))
      );

      return {
        playerId: row.player.id,
        playerName: formatPlayerName(row.player),
        teamName: row.player.team?.nameHe || row.player.team?.nameEn || '-',
        value: Math.max(row.totals.assists, details.length),
        details,
        emptyMessage: 'אין פירוט בישולים מקומי זמין עבור השחקן הזה.',
      };
    }),
  };

  const passesCard = {
    title: 'מסירות מדויקות',
    valueLabel: 'מסירות',
    rows: passesLeaders.map((row) => {
      const statistics = Array.isArray(row.player?.additionalInfo?.statistics) ? row.player.additionalInfo.statistics : [];
      const details = statistics
        .map((entry: any, index: number) => ({
          id: `${row.player.id}-passes-${index}`,
          roundLabel: entry?.league?.name || entry?.team?.name || 'עונה',
          matchLabel: entry?.team?.name || row.player.team?.nameHe || row.player.team?.nameEn || '-',
          valueLabel: `${entry?.passes?.total ?? 0} מסירות`,
          minuteLabel: null,
          scoreLabel: null,
          note:
            typeof entry?.games?.appearences === 'number'
              ? `${entry.games.appearences} הופעות`
              : 'פירוט עונתי מקומי',
        }))
        .filter((detail: any) => detail.valueLabel !== '0 מסירות');

      return {
        playerId: row.player.id,
        playerName: formatPlayerName(row.player),
        teamName: row.player.team?.nameHe || row.player.team?.nameEn || '-',
        value: row.totalPasses,
        details,
        emptyMessage: 'למסירות מדויקות שמור אצלנו כרגע פירוט עונתי בלבד, לא פירוט פר משחק.',
      };
    }),
  };

  passesCard.rows = passesLeaders.map((row) => ({
    playerId: row.player.id,
    playerName: formatPlayerName(row.player),
    teamName: row.player.team?.nameHe || row.player.team?.nameEn || '-',
    value: row.totalPasses,
    details: leaderGames
      .filter((game) => didPlayerAppearInGame(game, row.player.id))
      .map((game) => ({
        id: `${game.id}-${row.player.id}-appearance`,
        roundLabel: roundLabel(game),
        matchLabel: matchLabel(game),
        valueLabel: 'הופיע במשחק',
        minuteLabel: null,
        scoreLabel: scoreLabel(game),
        note: 'פירוט מסירות מדויקות פר משחק לא זמין כרגע, ולכן מוצגת רשימת המשחקים שבהם השתתף.',
      })),
    emptyMessage: 'אין אצלנו כרגע משחקים מקושרים לשחקן הזה במסגרת שנבחרה.',
  }));

  const cleanSheetsCard = {
    title: 'רשת נקייה',
    valueLabel: 'רשתות נקיות',
    rows: cleanSheetLeaders.map((row) => ({
      playerId: row.player.id,
      playerName: formatPlayerName(row.player),
      teamName: row.player.team?.nameHe || row.player.team?.nameEn || '-',
      value: cleanSheetMap.get(row.player.id) || 0,
      details: leaderGames
        .filter((game) => {
          const starterEntry = game.lineupEntries.find((entry: any) => entry.playerId === row.player.id && entry.role === 'STARTER');
          if (!starterEntry) return false;
          const conceded =
            starterEntry.teamId === game.homeTeamId ? (game.awayScore ?? 0) : starterEntry.teamId === game.awayTeamId ? (game.homeScore ?? 0) : null;
          return conceded === 0;
        })
        .map((game) => ({
          id: `${game.id}-${row.player.id}-clean-sheet`,
          roundLabel: roundLabel(game),
          matchLabel: matchLabel(game),
          valueLabel: 'רשת נקייה',
          minuteLabel: null,
          scoreLabel: scoreLabel(game),
          note: getCompetitionLabel(game.competition),
        })),
      emptyMessage: 'אין פירוט רשתות נקיות מקומי זמין עבור השחקן הזה.',
    })),
  };

  return [goalsCard, assistsCard, passesCard, cleanSheetsCard];
}

function StatsCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <article className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-semibold text-stone-500">{title}</div>
      <div className="mt-3 text-3xl font-black text-stone-900">{value}</div>
      <div className="mt-2 text-sm text-stone-600">{subtitle}</div>
    </article>
  );
}
