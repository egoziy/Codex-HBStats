import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { derivePlayerDeepStats, deriveTeamDeepStats } from '@/lib/deep-stats';
import { getDisplayMode } from '@/lib/display-mode';
import { formatPlayerName } from '@/lib/player-display';
import prisma from '@/lib/prisma';
import { sortStandings } from '@/lib/standings';
import TeamInjuryManager from '@/components/TeamInjuryManager';

type TeamPremierTab = 'overview' | 'matches' | 'squad' | 'stats' | 'referees';

function formatDate(date: Date, withTime = false) {
  return new Intl.DateTimeFormat('he-IL', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
  }).format(date);
}

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { view?: string; tab?: string };
}) {
  const displayMode = await getDisplayMode(searchParams?.view);
  const selectedTab = normalizeTeamPremierTab(searchParams?.tab);
  const team = await prisma.team.findUnique({
    where: { id: params.id },
    include: {
      players: {
        orderBy: [{ jerseyNumber: 'asc' }, { nameHe: 'asc' }, { nameEn: 'asc' }],
        take: 40,
        include: {
          uploads: {
            orderBy: [{ createdAt: 'asc' }],
          },
          playerStats: {
            where: { seasonId: { not: null } },
          },
        },
      },
      standings: true,
      teamStats: true,
      coachAssignments: {
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      },
      uploads: {
        orderBy: [{ createdAt: 'asc' }],
      },
      venue: true,
      season: true,
    },
  });

  if (!team) {
    notFound();
  }

  const currentUser = await getCurrentUser();
  const now = new Date();

  const [seasonStandings, teamGames] = await Promise.all([
    prisma.standing.findMany({
      where: { seasonId: team.seasonId },
      include: { team: true },
      orderBy: [{ position: 'asc' }, { points: 'desc' }],
    }),
    prisma.game.findMany({
      where: {
        seasonId: team.seasonId,
        OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }],
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        competition: true,
        referee: {
          select: {
            id: true,
            nameEn: true,
            nameHe: true,
          },
        },
        prediction: true,
        events: {
          select: {
            minute: true,
            extraMinute: true,
            type: true,
            playerId: true,
            relatedPlayerId: true,
            teamId: true,
          },
        },
        lineupEntries: {
          select: {
            playerId: true,
            role: true,
            teamId: true,
          },
        },
        gameStats: {
          select: {
            homeTeamPossession: true,
            awayTeamPossession: true,
            homeShotsOnTarget: true,
            awayShotsOnTarget: true,
            homeShotsTotal: true,
            awayShotsTotal: true,
            homeCorners: true,
            awayCorners: true,
            homeFouls: true,
            awayFouls: true,
            homeOffsides: true,
            awayOffsides: true,
            homeYellowCards: true,
            awayYellowCards: true,
            homeRedCards: true,
            awayRedCards: true,
          },
        },
      },
      orderBy: { dateTime: 'desc' },
    }),
  ]);

  // Fetch currently sidelined/injured players
  const playerIds = team.players.map((p) => p.id);
  const apiFootballPlayerIds = team.players.map((p) => p.apiFootballId).filter((v): v is number => typeof v === 'number');
  const sidelinedEntries = playerIds.length > 0
    ? await prisma.playerSidelinedEntry.findMany({
        where: {
          AND: [
            {
              OR: [
                ...(playerIds.length > 0 ? [{ playerId: { in: playerIds } }] : []),
                ...(apiFootballPlayerIds.length > 0 ? [{ apiFootballPlayerId: { in: apiFootballPlayerIds } }] : []),
              ],
            },
            {
              OR: [{ endDate: null }, { endDate: { gt: now } }],
            },
          ],
        },
        orderBy: { startDate: 'desc' },
      })
    : [];

  // Build lookup: playerId → sidelined entry
  const sidelinedByPlayerId = new Map<string, typeof sidelinedEntries[0]>();
  const sidelinedByApiId = new Map<number, typeof sidelinedEntries[0]>();
  for (const entry of sidelinedEntries) {
    if (entry.playerId) sidelinedByPlayerId.set(entry.playerId, entry);
    if (entry.apiFootballPlayerId) sidelinedByApiId.set(entry.apiFootballPlayerId, entry);
  }

  function getPlayerSidelined(player: { id: string; apiFootballId: number | null }) {
    return sidelinedByPlayerId.get(player.id) || (player.apiFootballId ? sidelinedByApiId.get(player.apiFootballId) : undefined) || null;
  }

  const unavailablePlayers = team.players
    .map((player) => {
      const entry = getPlayerSidelined(player);
      if (!entry) return null;
      return {
        id: player.id,
        canonicalPlayerId: player.canonicalPlayerId,
        name: formatPlayerName(player),
        photo: player.photoUrl || player.uploads[0]?.filePath || null,
        position: player.position,
        injuryType: entry.typeHe || entry.typeEn,
        startDate: entry.startDate,
        endDate: entry.endDate,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const sortedStandings = sortStandings(seasonStandings);
  const standing = sortedStandings.find((row) => row.teamId === team.id) || null;
  const standingIndex = sortedStandings.findIndex((row) => row.teamId === team.id);
  const nearbyStandings =
    standingIndex >= 0
      ? sortedStandings.slice(Math.max(0, standingIndex - 2), Math.min(sortedStandings.length, standingIndex + 3))
      : sortedStandings.slice(0, 5);

  const derived = deriveTeamDeepStats(team.id, teamGames);
  const seasonTeamStat = team.teamStats.find((stat) => stat.seasonId === team.seasonId) || team.teamStats[0] || null;

  const completedGames = teamGames.filter((game) => game.status === 'COMPLETED');
  const upcomingGames = teamGames
    .filter((game) => game.status === 'SCHEDULED' && game.dateTime >= now)
    .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());

  const nextGame = upcomingGames[0] || null;
  const lastGame = completedGames[0] || null;
  const recentGames = completedGames.slice(0, 5);

  const topScorers = team.players
    .map((player) => {
      const totals = derivePlayerDeepStats(player.id, teamGames);

      return {
        id: player.id,
        canonicalPlayerId: player.canonicalPlayerId,
        name: formatPlayerName(player),
        goals: totals.goals,
        assists: totals.assists,
        minutes: totals.minutesPlayed,
        photo: player.photoUrl || player.uploads[0]?.filePath || null,
      };
    })
    .sort((left, right) => right.goals - left.goals || right.assists - left.assists)
    .slice(0, 6);
  const refereeSummaries = buildRefereeSummaries(teamGames, team.id);
  const topRedCardReferee = [...refereeSummaries].sort(
    (left, right) =>
      right.teamRedCards - left.teamRedCards ||
      right.redCards - left.redCards ||
      right.games - left.games ||
      right.latestGameAt.getTime() - left.latestGameAt.getTime()
  )[0] || null;
  const topGoalsReferee = [...refereeSummaries].sort(
    (left, right) =>
      right.totalGoals - left.totalGoals ||
      right.games - left.games ||
      right.latestGameAt.getTime() - left.latestGameAt.getTime()
  )[0] || null;
  const topPenaltyReferee = [...refereeSummaries].sort(
    (left, right) =>
      right.teamPenalties - left.teamPenalties ||
      right.penalties - left.penalties ||
      right.games - left.games ||
      right.latestGameAt.getTime() - left.latestGameAt.getTime()
  )[0] || null;

  const adminPlayerOptions = team.players.map((p) => ({ id: p.id, name: formatPlayerName(p) }));
  const adminSidelinedEntries = sidelinedEntries.map((entry) => ({
    id: entry.id,
    playerName: entry.playerNameHe || entry.playerNameEn || '?',
    playerId: entry.playerId,
    typeHe: entry.typeHe,
    typeEn: entry.typeEn,
    startDate: entry.startDate?.toISOString() || null,
    endDate: entry.endDate?.toISOString() || null,
  }));

  return (
    <div dir="rtl" className={`min-h-screen px-4 py-8 ${displayMode === 'premier' ? 'bg-[linear-gradient(180deg,#f7fbff_0%,#eef3ff_100%)]' : ''}`}>
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
          <div className="hero-featured-match p-6 text-white">
            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="flex items-start gap-4">
                {team.logoUrl ? (
                  <div className="rounded-2xl border border-white/20 bg-white/10 p-3 backdrop-blur-sm">
                    <img
                      src={team.logoUrl}
                      alt={team.nameEn}
                      className="h-16 w-16 object-contain"
                    />
                  </div>
                ) : null}
                <div className="min-w-0">
                  <p className="text-[11px] font-bold tracking-[0.3em] text-white/60">מרכז קבוצה</p>
                  <h1 className="mt-2 text-3xl font-black leading-tight">{team.nameHe || team.nameEn}</h1>
                  <p className="mt-1 text-sm text-white/75">{team.nameEn}</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-white/10 px-3 py-1.5">עונה: {team.season.name}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1.5">מאמן: {team.coachHe || team.coach || 'לא הוזן'}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1.5">אצטדיון: {team.venue?.nameHe || team.stadiumHe || team.venue?.nameEn || 'לא הוזן'}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1.5">עיר: {team.venue?.cityHe || team.cityHe || team.venue?.cityEn || 'לא הוזנה'}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1.5">מיקום: {standing?.displayPosition ?? '-'}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1.5">נקודות: {standing?.adjustedPoints ?? seasonTeamStat?.points ?? 0}</span>
                    {unavailablePlayers.length > 0 ? (
                      <span className="rounded-full bg-red-500/30 px-3 py-1.5 text-red-100">{unavailablePlayers.length} פצועים</span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <HeroMetric label="מאזן" value={`${derived.wins}-${derived.draws}-${derived.losses}`} />
                <HeroMetric label="שערים" value={`${derived.goalsFor}-${derived.goalsAgainst}`} />
                <HeroMetric label="משחקים" value={String(derived.matchesPlayed)} />
                <HeroMetric label="אחזקת כדור" value={`${derived.averagePossession.toFixed(1)}%`} />
              </div>
            </div>
          </div>
          {displayMode === 'premier' ? (
            <div className="border-t border-stone-200 bg-white px-6 py-4">
              <div className="flex flex-wrap items-center gap-3">
                {[
                  { id: 'overview', label: 'סקירה' },
                  { id: 'matches', label: 'משחקים' },
                  { id: 'squad', label: 'סגל' },
                  { id: 'stats', label: 'סטטיסטיקה' },
                  { id: 'referees', label: 'שופטים' },
                ].map((tab) => (
                  <Link
                    key={tab.id}
                    href={`/teams/${team.id}?view=premier&tab=${tab.id}`}
                    className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                      selectedTab === tab.id ? 'bg-[var(--accent)] text-white shadow-sm' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    {tab.label}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {displayMode !== 'premier' || selectedTab === 'overview' ? (
        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr_0.95fr]">
          <Panel title="המשחק הקרוב">
            {nextGame ? (
              <GameSpotlight
                game={nextGame}
                teamId={team.id}
                predictionLabel={nextGame.prediction?.winnerTeamNameHe || nextGame.prediction?.winnerTeamNameEn || null}
              />
            ) : (
              <EmptyState text="אין כרגע משחק קרוב לקבוצה זו." />
            )}
          </Panel>

          <Panel title="המשחק האחרון">
            {lastGame ? <GameSpotlight game={lastGame} teamId={team.id} /> : <EmptyState text="אין משחק אחרון להצגה." />}
          </Panel>

          <Panel title="טבלה מצומצמת">
            <div className="overflow-hidden rounded-[20px] border border-stone-200">
              <table className="min-w-full text-right">
                <thead className="bg-stone-100 text-xs text-stone-500">
                  <tr>
                    <th className="px-4 py-2.5">מיקום</th>
                    <th className="px-4 py-2.5">קבוצה</th>
                    <th className="px-4 py-2.5">נקודות</th>
                  </tr>
                </thead>
                <tbody>
                  {nearbyStandings.map((row) => (
                    <tr
                      key={row.id}
                      className={`border-t border-stone-100 text-sm ${row.teamId === team.id ? 'bg-[var(--accent-glow)]' : 'bg-white'}`}
                    >
                      <td className="px-4 py-2.5 font-black text-stone-900">{row.displayPosition}</td>
                      <td className="px-4 py-2.5 font-semibold text-stone-900">{row.team.nameHe || row.team.nameEn}</td>
                      <td className="px-4 py-2.5 font-black text-stone-900">{row.adjustedPoints}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>
        ) : null}

        {displayMode !== 'premier' || selectedTab === 'overview' || selectedTab === 'matches' ? (
        <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <Panel title="מומנטום אחרון">
            <div className="flex flex-wrap gap-3">
              {recentGames.map((game) => {
                const result = getTeamResult(game, team.id);
                return (
                  <Link
                    key={game.id}
                    href={`/games/${game.id}`}
                    className="min-w-[108px] rounded-[20px] border border-stone-200 bg-stone-50 p-3 text-center transition hover:border-red-300"
                  >
                    <div
                      className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm font-black ${
                        result === 'נ'
                          ? 'bg-emerald-100 text-emerald-800'
                          : result === 'ה'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {result}
                    </div>
                    <div className="mt-2 text-xs font-semibold text-stone-500">{formatDate(game.dateTime)}</div>
                    <div className="mt-1 text-sm font-black text-stone-900">{`${game.homeScore ?? 0}-${game.awayScore ?? 0}`}</div>
                    <div className="mt-1 text-[11px] text-stone-500">
                      {getOpponentName(game, team.id)}
                    </div>
                  </Link>
                );
              })}
              {recentGames.length === 0 ? <EmptyState text="אין משחקים אחרונים להצגה." /> : null}
            </div>
          </Panel>

          <Panel title="המשחקים הבאים">
            <div className="grid gap-3">
              {upcomingGames.slice(0, 5).map((game) => (
                <Link
                  key={game.id}
                  href={`/games/${game.id}`}
                  className="rounded-[20px] border border-stone-200 bg-stone-50 p-4 transition hover:border-red-300"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-stone-500">
                        {game.competition?.nameHe || game.competition?.nameEn || 'ללא מסגרת'}
                      </div>
                      <div className="mt-1 text-base font-black text-stone-900">
                        {game.homeTeam.nameHe || game.homeTeam.nameEn} - {game.awayTeam.nameHe || game.awayTeam.nameEn}
                      </div>
                    </div>
                    <div className="text-xs font-bold text-stone-500">{formatDate(game.dateTime, true)}</div>
                  </div>
                </Link>
              ))}
              {upcomingGames.length === 0 ? <EmptyState text="אין משחקים עתידיים זמינים." /> : null}
            </div>
          </Panel>
        </section>
        ) : null}

        {displayMode !== 'premier' || selectedTab === 'matches' ? (
        <section>
          <Panel title="כל משחקי העונה">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-xs text-stone-500">
                    <th className="px-2 py-2 text-right font-semibold">תאריך</th>
                    <th className="px-2 py-2 text-right font-semibold">מסגרת</th>
                    <th className="px-2 py-2 text-right font-semibold">בית</th>
                    <th className="px-2 py-2 text-center font-semibold">תוצאה</th>
                    <th className="px-2 py-2 text-right font-semibold">חוץ</th>
                    <th className="px-2 py-2 text-center font-semibold">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {teamGames
                    .sort((a, b) => b.dateTime.getTime() - a.dateTime.getTime())
                    .map((game) => {
                      const isHome = game.homeTeamId === team.id;
                      const result = game.status === 'COMPLETED' ? getTeamResult(game, team.id) : null;
                      const resultColor = result === 'נ' ? 'bg-emerald-100 text-emerald-700' : result === 'ה' ? 'bg-red-100 text-red-700' : result === 'ת' ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-500';
                      return (
                        <tr key={game.id} className="border-b border-stone-100 transition hover:bg-stone-50">
                          <td className="px-2 py-2.5 text-xs text-stone-500 whitespace-nowrap">{formatDate(game.dateTime)}</td>
                          <td className="px-2 py-2.5 text-xs text-stone-500">{game.competition?.nameHe || game.competition?.nameEn || '—'}</td>
                          <td className="px-2 py-2.5">
                            <span className={`font-semibold ${isHome ? 'text-stone-900' : 'text-stone-500'}`}>
                              {game.homeTeam.nameHe || game.homeTeam.nameEn}
                            </span>
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            {game.status === 'COMPLETED' ? (
                              <Link href={`/games/${game.id}`} className="inline-block rounded-lg bg-stone-100 px-3 py-1 font-black text-stone-900 transition hover:bg-[var(--accent-glow)] hover:text-[var(--accent)]">
                                {game.homeScore ?? 0} - {game.awayScore ?? 0}
                              </Link>
                            ) : (
                              <span className="text-xs text-stone-400">טרם שוחק</span>
                            )}
                          </td>
                          <td className="px-2 py-2.5">
                            <span className={`font-semibold ${!isHome ? 'text-stone-900' : 'text-stone-500'}`}>
                              {game.awayTeam.nameHe || game.awayTeam.nameEn}
                            </span>
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            {result ? (
                              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${resultColor}`}>{result}</span>
                            ) : (
                              <span className="text-xs text-stone-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              {teamGames.length === 0 ? <EmptyState text="אין משחקים להצגה." /> : null}
            </div>
          </Panel>
        </section>
        ) : null}

        {displayMode !== 'premier' || selectedTab === 'overview' || selectedTab === 'stats' ? (
        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Panel title="סיכום עונה">
            <div className="space-y-3 text-sm">
              <StatRow label="ניצחונות" value={String(derived.wins)} />
              <StatRow label="תיקו" value={String(derived.draws)} />
              <StatRow label="הפסדים" value={String(derived.losses)} />
              <StatRow label="שערי זכות" value={String(derived.goalsFor)} />
              <StatRow label="שערי חובה" value={String(derived.goalsAgainst)} />
              <StatRow label="קלין שיט" value={String(derived.cleanSheets)} />
              <StatRow label="קרנות" value={String(derived.corners)} />
              <StatRow label="נבדלים" value={String(derived.offsides)} />
            </div>
          </Panel>

          <Panel title="התפלגות לפי דקות">
            <div className="grid gap-3 md:grid-cols-2">
              {derived.bucketSummaries.map((bucket) => (
                <div key={bucket.key} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <div className="text-base font-black text-stone-900">דקות {bucket.label}</div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <StatMini label="שערים" value={String(bucket.goals)} />
                    <StatMini label="צהובים" value={String(bucket.yellowCards)} />
                    <StatMini label="אדומים" value={String(bucket.redCards)} />
                    <StatMini label="בישולים" value={String(bucket.assists)} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </section>
        ) : null}

        {displayMode !== 'premier' || selectedTab === 'overview' || selectedTab === 'squad' ? (
        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <Panel title="המובילים של הקבוצה">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {topScorers.map((player) => (
                <Link
                  key={player.id}
                  href={`/players/${player.canonicalPlayerId || player.id}`}
                  className="rounded-2xl border border-stone-200 bg-stone-50 p-4 transition hover:border-red-300"
                >
                  <div className="flex items-center gap-3">
                    {player.photo ? (
                      <img src={player.photo} alt={player.name} className="h-12 w-12 rounded-full object-cover" />
                    ) : null}
                    <div className="font-bold text-stone-900">{player.name}</div>
                  </div>
                  <div className="mt-3 text-sm text-stone-600">
                    <div>שערים: {player.goals}</div>
                    <div>בישולים: {player.assists}</div>
                    <div>דקות: {player.minutes}</div>
                  </div>
                </Link>
              ))}
            </div>
          </Panel>

          <Panel title="שחקני הסגל">
            {unavailablePlayers.length > 0 ? (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4">
                <div className="mb-2 text-sm font-black text-red-800">שחקנים לא זמינים ({unavailablePlayers.length})</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {unavailablePlayers.map((player) => (
                    <Link
                      key={player.id}
                      href={`/players/${player.canonicalPlayerId || player.id}`}
                      className="flex items-center gap-3 rounded-xl bg-white/80 px-3 py-2 transition hover:bg-white"
                    >
                      {player.photo ? (
                        <img src={player.photo} alt={player.name} className="h-9 w-9 rounded-full object-cover opacity-60" />
                      ) : null}
                      <div>
                        <div className="text-sm font-bold text-stone-700">{player.name}</div>
                        <div className="text-xs text-red-600">{player.injuryType}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              {team.players.map((player) => {
                const sidelined = getPlayerSidelined(player);
                return (
                  <Link
                    key={player.id}
                    href={`/players/${player.id}`}
                    className={`rounded-2xl border p-4 transition hover:border-red-300 ${sidelined ? 'border-red-200 bg-red-50/40' : 'border-stone-200 bg-stone-50'}`}
                  >
                    <div className="flex items-center gap-3">
                      {player.photoUrl || player.uploads[0]?.filePath ? (
                        <img
                          src={player.photoUrl || player.uploads[0]?.filePath || ''}
                          alt={formatPlayerName(player)}
                          className={`h-14 w-14 rounded-full bg-white object-cover ${sidelined ? 'opacity-50' : ''}`}
                        />
                      ) : null}
                      <div>
                        <div className="font-bold text-stone-900">{formatPlayerName(player)}</div>
                        <div className="mt-1 text-sm text-stone-500">{player.position || 'ללא עמדה'}</div>
                        {sidelined ? (
                          <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                            {sidelined.typeHe || sidelined.typeEn}
                          </div>
                        ) : (
                          <div className="mt-2 text-xs text-stone-400">#{player.jerseyNumber ?? '-'}</div>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Panel>
        </section>
        ) : null}

        {currentUser?.role === 'ADMIN' && (displayMode !== 'premier' || selectedTab === 'squad') ? (
          <TeamInjuryManager players={adminPlayerOptions} sidelinedEntries={adminSidelinedEntries} />
        ) : null}

        {displayMode !== 'premier' || selectedTab === 'overview' || selectedTab === 'referees' || selectedTab === 'stats' ? (
        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <Panel title="שופטים מול הקבוצה">
            <div className="grid gap-3 sm:grid-cols-2">
              <StatHighlight
                label="הכי הרבה אדומים לקבוצה"
                value={topRedCardReferee ? topRedCardReferee.name : 'אין מספיק נתונים'}
                subvalue={
                  topRedCardReferee
                    ? `${topRedCardReferee.teamRedCards} אדומים לקבוצה · ${topRedCardReferee.redCards} אדומים במשחקים`
                    : 'נדרשים משחקים היסטוריים עם אירועים שמורים'
                }
              />
              <StatHighlight
                label="הכי הרבה שערים במשחקים"
                value={topGoalsReferee ? topGoalsReferee.name : 'אין מספיק נתונים'}
                subvalue={
                  topGoalsReferee
                    ? `${topGoalsReferee.totalGoals} שערים · ${topGoalsReferee.games} משחקים`
                    : 'נדרשים משחקים היסטוריים עם תוצאה שמורה'
                }
              />
              <StatHighlight
                label="הכי הרבה פנדלים לקבוצה"
                value={topPenaltyReferee ? topPenaltyReferee.name : 'אין מספיק נתונים'}
                subvalue={
                  topPenaltyReferee
                    ? `${topPenaltyReferee.teamPenalties} פנדלים לקבוצה · ${topPenaltyReferee.penalties} פנדלים במשחקים`
                    : 'נדרשים משחקים היסטוריים עם אירועי פנדל'
                }
              />
            </div>

            <div className="mt-4 overflow-hidden rounded-[20px] border border-stone-200">
              <table className="min-w-full text-right">
                <thead className="bg-stone-100 text-xs text-stone-500">
                  <tr>
                    <th className="px-4 py-2.5">שופט</th>
                    <th className="px-4 py-2.5">משחקים</th>
                    <th className="px-4 py-2.5">שערים</th>
                    <th className="px-4 py-2.5">צהובים</th>
                    <th className="px-4 py-2.5">אדומים</th>
                    <th className="px-4 py-2.5">אדומים לקבוצה</th>
                    <th className="px-4 py-2.5">פנדלים לקבוצה</th>
                    <th className="px-4 py-2.5">בית</th>
                    <th className="px-4 py-2.5">חוץ</th>
                  </tr>
                </thead>
                <tbody>
                  {refereeSummaries.map((referee) => (
                    <tr key={referee.key} className="border-t border-stone-100 bg-white text-sm">
                      <td className="px-4 py-3">
                        <div className="font-black text-stone-900">{referee.name}</div>
                        <div className="mt-1 text-xs text-stone-500">
                          {referee.wins}-{referee.draws}-{referee.losses} · {referee.pointsPerGame.toFixed(2)} נק׳ למשחק
                        </div>
                      </td>
                      <td className="px-4 py-3 font-bold text-stone-900">{referee.games}</td>
                      <td className="px-4 py-3 font-bold text-stone-900">{referee.totalGoals}</td>
                      <td className="px-4 py-3 font-bold text-stone-900">{referee.yellowCards}</td>
                      <td className="px-4 py-3 font-bold text-stone-900">{referee.redCards}</td>
                      <td className="px-4 py-3 font-bold text-stone-900">{referee.teamRedCards}</td>
                      <td className="px-4 py-3 font-bold text-stone-900">{referee.teamPenalties}</td>
                      <td className="px-4 py-3 font-bold text-stone-900">{referee.homeGames}</td>
                      <td className="px-4 py-3 font-bold text-stone-900">{referee.awayGames}</td>
                    </tr>
                  ))}
                  {refereeSummaries.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-sm text-stone-500">
                        אין כרגע משחקים סגורים עם שופט שמור לחיתוך הזה.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="הקשר שיפוט">
            <div className="space-y-3 text-sm leading-7 text-stone-700">
              <p>
                כאן אפשר לראות את הקבוצה דרך השופט: כמה משחקים הוא ניהל, כמה שערים נכבשו באותם משחקים, וכמה כרטיסים
                אדומים/צהובים נרשמו.
              </p>
              <p>
                בהמשך אפשר להרחיב את זה גם למאזן נקודות לפי שופט, הפרדה בין בית לחוץ, ושופטים שמייצרים הרבה פנדלים
                במשחקים של הקבוצה.
              </p>
            </div>
          </Panel>
        </section>
        ) : null}
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="modern-card rounded-xl border border-stone-200/80 bg-white p-5 shadow-sm">
      <h2 className="border-r-[3px] border-[var(--accent)] pr-3 text-lg font-black text-stone-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-white/15 bg-white/10 px-4 py-4 backdrop-blur-sm">
      <div className="text-xs font-semibold text-white/70">{label}</div>
      <div className="mt-2 text-2xl font-black text-white">{value}</div>
    </div>
  );
}

function StatHighlight({ label, value, subvalue }: { label: string; value: string; subvalue: string }) {
  return (
    <div className="rounded-[20px] border border-stone-200 bg-stone-50 p-4">
      <div className="text-xs font-semibold tracking-[0.18em] text-stone-500">{label}</div>
      <div className="mt-2 text-lg font-black text-stone-900">{value}</div>
      <div className="mt-1 text-sm text-stone-600">{subvalue}</div>
    </div>
  );
}

function GameSpotlight({
  game,
  teamId,
  predictionLabel,
}: {
  game: {
    id: string;
    dateTime: Date;
    status: string;
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number | null;
    awayScore: number | null;
    homeTeam: { nameHe: string | null; nameEn: string };
    awayTeam: { nameHe: string | null; nameEn: string };
    competition: { nameHe: string | null; nameEn: string } | null;
  };
  teamId: string;
  predictionLabel?: string | null;
}) {
  const teamIsHome = game.homeTeamId === teamId;
  const opponent = teamIsHome ? game.awayTeam : game.homeTeam;
  const isCompleted = game.status === 'COMPLETED';

  return (
    <Link
      href={`/games/${game.id}`}
      className="block rounded-[22px] border border-red-200 bg-[linear-gradient(180deg,#fff8f6_0%,#fff_100%)] p-4 transition hover:border-red-400"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-stone-500">
            {game.competition?.nameHe || game.competition?.nameEn || 'ללא מסגרת'}
          </div>
          <div className="mt-1 text-lg font-black text-stone-900">
            {game.homeTeam.nameHe || game.homeTeam.nameEn} - {game.awayTeam.nameHe || game.awayTeam.nameEn}
          </div>
          <div className="mt-1 text-xs text-stone-500">{formatDate(game.dateTime, true)}</div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${isCompleted ? 'bg-stone-900 text-white' : 'bg-red-100 text-red-900'}`}>
          {isCompleted ? 'הסתיים' : 'בקרוב'}
        </span>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        <InfoChip label={isCompleted ? 'תוצאה' : 'יריבה'} value={isCompleted ? `${game.homeScore ?? 0} - ${game.awayScore ?? 0}` : opponent.nameHe || opponent.nameEn} />
        <InfoChip label="תחזית" value={predictionLabel || 'לא זמינה'} />
      </div>
    </Link>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">{label}</div>
      <div className="mt-1 text-sm font-black text-stone-900">{value}</div>
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white px-3 py-3">
      <div className="text-xs font-semibold text-stone-500">{label}</div>
      <div className="mt-2 text-lg font-black text-stone-900">{value}</div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-stone-50 px-4 py-3">
      <span className="font-semibold text-stone-600">{label}</span>
      <span className="font-black text-stone-900">{value}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-sm text-stone-500">{text}</div>;
}

function getTeamResult(
  game: { homeTeamId: string; awayTeamId: string; homeScore: number | null; awayScore: number | null },
  teamId: string
) {
  const teamGoals = game.homeTeamId === teamId ? game.homeScore ?? 0 : game.awayScore ?? 0;
  const opponentGoals = game.homeTeamId === teamId ? game.awayScore ?? 0 : game.homeScore ?? 0;
  if (teamGoals > opponentGoals) return 'נ';
  if (teamGoals < opponentGoals) return 'ה';
  return 'ת';
}

function getOpponentName(
  game: { homeTeamId: string; awayTeamId: string; homeTeam: { nameHe: string | null; nameEn: string }; awayTeam: { nameHe: string | null; nameEn: string } },
  teamId: string
) {
  const opponent = game.homeTeamId === teamId ? game.awayTeam : game.homeTeam;
  return opponent.nameHe || opponent.nameEn;
}

function buildRefereeSummaries(
  games: Array<{
    id: string;
    status: string;
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number | null;
    awayScore: number | null;
    dateTime: Date;
    referee: { id: string; nameEn: string; nameHe: string | null } | null;
    events: Array<{
      teamId: string | null;
      type: 'GOAL' | 'ASSIST' | 'YELLOW_CARD' | 'RED_CARD' | 'SUBSTITUTION_IN' | 'SUBSTITUTION_OUT' | 'OWN_GOAL' | 'PENALTY_GOAL' | 'PENALTY_MISSED';
    }>;
  }>,
  teamId: string
) {
  const summaries = new Map<
    string,
    {
      key: string;
      name: string;
      games: number;
      wins: number;
      draws: number;
      losses: number;
      totalGoals: number;
      yellowCards: number;
      redCards: number;
      teamYellowCards: number;
      teamRedCards: number;
      penalties: number;
      teamPenalties: number;
      homeGames: number;
      awayGames: number;
      points: number;
      latestGameAt: Date;
    }
  >();

  for (const game of games.filter((entry) => entry.status === 'COMPLETED')) {
    const refereeName = game.referee?.nameHe || game.referee?.nameEn || 'שופט לא זמין';
    const refereeKey = game.referee?.id || game.referee?.nameEn || 'unknown-referee';
    const teamIsHome = game.homeTeamId === teamId;
    const teamGoals = teamIsHome ? game.homeScore ?? 0 : game.awayScore ?? 0;
    const opponentGoals = teamIsHome ? game.awayScore ?? 0 : game.homeScore ?? 0;
    const resultPoints = teamGoals > opponentGoals ? 3 : teamGoals === opponentGoals ? 1 : 0;
    const yellowCards = game.events.filter((event) => event.type === 'YELLOW_CARD').length;
    const redCards = game.events.filter((event) => event.type === 'RED_CARD').length;
    const teamYellowCards = game.events.filter((event) => event.type === 'YELLOW_CARD' && event.teamId === teamId).length;
    const teamRedCards = game.events.filter((event) => event.type === 'RED_CARD' && event.teamId === teamId).length;
    const penalties = game.events.filter((event) => event.type === 'PENALTY_GOAL' || event.type === 'PENALTY_MISSED').length;
    const teamPenalties = game.events.filter(
      (event) =>
        event.teamId === teamId && (event.type === 'PENALTY_GOAL' || event.type === 'PENALTY_MISSED')
    ).length;

    const current = summaries.get(refereeKey) || {
      key: refereeKey,
      name: refereeName,
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      totalGoals: 0,
      yellowCards: 0,
      redCards: 0,
      teamYellowCards: 0,
      teamRedCards: 0,
      penalties: 0,
      teamPenalties: 0,
      homeGames: 0,
      awayGames: 0,
      points: 0,
      latestGameAt: game.dateTime,
    };

    current.games += 1;
    current.wins += resultPoints === 3 ? 1 : 0;
    current.draws += resultPoints === 1 ? 1 : 0;
    current.losses += resultPoints === 0 ? 1 : 0;
    current.totalGoals += teamGoals + opponentGoals;
    current.yellowCards += yellowCards;
    current.redCards += redCards;
    current.teamYellowCards += teamYellowCards;
    current.teamRedCards += teamRedCards;
    current.penalties += penalties;
    current.teamPenalties += teamPenalties;
    current.homeGames += teamIsHome ? 1 : 0;
    current.awayGames += teamIsHome ? 0 : 1;
    current.points += resultPoints;
    if (game.dateTime.getTime() > current.latestGameAt.getTime()) {
      current.latestGameAt = game.dateTime;
    }

    summaries.set(refereeKey, current);
  }

  return [...summaries.values()]
    .sort(
      (left, right) =>
        right.games - left.games ||
        right.teamRedCards - left.teamRedCards ||
        right.totalGoals - left.totalGoals ||
        right.points - left.points ||
        right.latestGameAt.getTime() - left.latestGameAt.getTime()
    )
    .map((summary) => ({
      ...summary,
      pointsPerGame: summary.games ? summary.points / summary.games : 0,
    }))
    .slice(0, 8);
}

function normalizeTeamPremierTab(value: string | null | undefined): TeamPremierTab {
  switch (value) {
    case 'matches':
    case 'squad':
    case 'stats':
    case 'referees':
      return value;
    default:
      return 'overview';
  }
}
