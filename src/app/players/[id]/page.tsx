import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LeaderboardCategory } from '@prisma/client';
import { derivePlayerDeepStats } from '@/lib/deep-stats';
import { getDisplayMode } from '@/lib/display-mode';
import { formatPlayerName, formatPlayerPosition } from '@/lib/player-display';
import prisma from '@/lib/prisma';

type AggregatedStatRow = {
  key: string;
  seasonName: string;
  competitionName: string;
  teamName: string;
  goals: number;
  assists: number;
  shots: number;
  keyPasses: number;
  minutesPlayed: number;
  starts: number;
  substituteAppearances: number;
  timesSubbedOff: number;
  yellowCards: number;
  redCards: number;
  gamesPlayed: number;
};

type PlayerGameFilter = 'all' | 'starts' | 'bench' | 'sub-in' | 'sub-off';
type PlayerPremierTab = 'overview' | 'stats' | 'games' | 'career' | 'achievements';
type LeaderboardFallbackMap = Map<string, { goals: number; assists: number }>;

type PlayerSeasonEntry = {
  id: string;
  team: {
    season: {
      name: string;
    };
  };
};

type PlayerGameDetail = {
  id: string;
  dateTime: Date;
  homeScore: number | null;
  awayScore: number | null;
  competition: {
    nameHe: string | null;
    nameEn: string;
  } | null;
  homeTeam: {
    nameHe: string | null;
    nameEn: string;
  };
  awayTeam: {
    nameHe: string | null;
    nameEn: string;
  };
  events: Array<{
    minute: number;
    extraMinute: number | null;
    type: string;
    playerId: string | null;
    relatedPlayerId: string | null;
  }>;
  lineupEntries: Array<{
    playerId: string | null;
    role: 'STARTER' | 'SUBSTITUTE' | 'COACH';
  }>;
};

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { view?: string; season?: string; filter?: string; tab?: string };
}) {
  const displayMode = searchParams?.view === 'premier' ? 'premier' : await getDisplayMode();
  const matchedPlayer = await prisma.player.findFirst({
    where: {
      OR: [{ id: params.id }, { canonicalPlayerId: params.id }],
    },
    include: {
      canonicalPlayer: true,
      team: {
        include: {
          season: true,
        },
      },
    },
  });

  if (!matchedPlayer) {
    notFound();
  }

  const canonicalPlayerId = matchedPlayer.canonicalPlayerId || matchedPlayer.id;
  const linkedPlayers = await prisma.player.findMany({
    where: {
      OR: [{ id: canonicalPlayerId }, { canonicalPlayerId }],
    },
    include: {
      team: {
        include: {
          season: true,
        },
      },
      uploads: {
        orderBy: [{ createdAt: 'asc' }],
      },
      playerStats: {
        where: { seasonId: { not: null } },
        include: {
          season: true,
          competition: true,
        },
        orderBy: [{ season: { year: 'desc' } }, { competition: { nameHe: 'asc' } }],
      },
    },
    orderBy: [{ team: { season: { year: 'desc' } } }, { updatedAt: 'desc' }],
  });
  const linkedPlayerIds = linkedPlayers.map((player) => player.id);
  const linkedSeasonIds = Array.from(new Set(linkedPlayers.map((player) => player.team.season.id)));
  const linkedApiFootballIds = Array.from(
    new Set(linkedPlayers.map((player) => player.apiFootballId).filter((value): value is number => typeof value === 'number'))
  );
  const leaderboardEntries =
    linkedSeasonIds.length > 0 && (linkedPlayerIds.length > 0 || linkedApiFootballIds.length > 0)
      ? await prisma.competitionLeaderboardEntry.findMany({
          where: {
            seasonId: { in: linkedSeasonIds },
            OR: [
              ...(linkedPlayerIds.length > 0 ? [{ playerId: { in: linkedPlayerIds } }] : []),
              ...(linkedApiFootballIds.length > 0 ? [{ apiFootballPlayerId: { in: linkedApiFootballIds } }] : []),
            ],
            category: { in: [LeaderboardCategory.TOP_SCORERS, LeaderboardCategory.TOP_ASSISTS] },
          },
        })
      : [];

  const playerOrCondition = [
    ...(linkedPlayerIds.length > 0 ? [{ playerId: { in: linkedPlayerIds } }] : []),
    ...(linkedApiFootballIds.length > 0 ? [{ apiFootballPlayerId: { in: linkedApiFootballIds } }] : []),
  ];

  const [transfers, trophies, sidelinedEntries] = playerOrCondition.length > 0
    ? await Promise.all([
        prisma.playerTransfer.findMany({
          where: { OR: playerOrCondition },
          orderBy: { transferDate: 'desc' },
        }),
        prisma.playerTrophy.findMany({
          where: { OR: playerOrCondition },
          orderBy: [{ seasonLabel: 'desc' }, { leagueNameEn: 'asc' }],
        }),
        prisma.playerSidelinedEntry.findMany({
          where: { OR: playerOrCondition },
          orderBy: { startDate: 'desc' },
        }),
      ])
    : [[], [], []];

  const now = new Date();
  const currentSidelined = sidelinedEntries.find(
    (entry) => !entry.endDate || entry.endDate > now
  );

  const canonicalPlayer = linkedPlayers.find((player) => player.id === canonicalPlayerId) || linkedPlayers[0];
  const latestSeasonEntry = [...linkedPlayers].sort(
    (left, right) => right.team.season.year - left.team.season.year || +new Date(right.updatedAt) - +new Date(left.updatedAt)
  )[0];
  const availableSeasons = Array.from(
    linkedPlayers
      .map((player) => ({
        id: player.team.season.id,
        name: player.team.season.name,
        year: player.team.season.year,
      }))
      .reduce((map, season) => map.set(season.id, season), new Map<string, { id: string; name: string; year: number }>())
      .values()
  ).sort((left, right) => right.year - left.year);
  const selectedSeasonId =
    searchParams?.season && availableSeasons.some((season) => season.id === searchParams.season)
      ? searchParams.season
      : latestSeasonEntry.team.season.id;
  const selectedSeason = availableSeasons.find((season) => season.id === selectedSeasonId) || availableSeasons[0];
  const seasonPlayers = linkedPlayers.filter((player) => player.team.season.id === selectedSeasonId);
  const displayPlayerEntry =
    seasonPlayers.find((player) => player.id === matchedPlayer.id) ||
    seasonPlayers.find((player) => player.id === canonicalPlayerId) ||
    seasonPlayers[0] ||
    latestSeasonEntry;
  const teamIds = Array.from(new Set(seasonPlayers.map((player) => player.teamId)));
  const allGames = await prisma.game.findMany({
    where: {
      seasonId: selectedSeasonId,
      OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }],
    },
    include: {
      competition: true,
      homeTeam: true,
      awayTeam: true,
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
  });

  const derivedTotalsBase = seasonPlayers.reduce(
    (acc, player) => {
      const playerGames = allGames.filter((game) => game.homeTeamId === player.teamId || game.awayTeamId === player.teamId);
      const derived = derivePlayerDeepStats(player.id, playerGames);

      return {
        goals: acc.goals + derived.goals,
        assists: acc.assists + derived.assists,
        yellowCards: acc.yellowCards + derived.yellowCards,
        redCards: acc.redCards + derived.redCards,
        starts: acc.starts + derived.starts,
        gamesPlayed: acc.gamesPlayed + derived.gamesPlayed,
        minutesPlayed: acc.minutesPlayed + derived.minutesPlayed,
        benchAppearances: acc.benchAppearances + derived.benchAppearances,
        substituteAppearances: acc.substituteAppearances + derived.substituteAppearances,
        timesSubbedOff: acc.timesSubbedOff + derived.timesSubbedOff,
      };
    },
    {
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
      starts: 0,
      gamesPlayed: 0,
      minutesPlayed: 0,
      benchAppearances: 0,
      substituteAppearances: 0,
      timesSubbedOff: 0,
    }
  );

  const leaderboardFallbacks = buildLeaderboardFallbackMap(leaderboardEntries);

  function buildAggregatedStats(players: typeof linkedPlayers): AggregatedStatRow[] {
    return Array.from(
      players
        .flatMap((player) =>
          player.playerStats.map((stat) => ({
            ...stat,
            _teamName: player.team.nameHe || player.team.nameEn,
            _teamId: player.team.id,
          }))
        )
        .reduce((map, stat) => {
          // Key includes teamId so seasons with different teams produce separate rows
          const key = `${stat.seasonId || 'all'}-${stat._teamId}-${stat.competitionId || 'all'}`;
          const existing = map.get(key);
          const fallback = leaderboardFallbacks.get(`${stat.seasonId || 'all'}-${stat.competitionId || 'all'}`);
          const goals = Math.max(stat.goals, fallback?.goals || 0);
          const assists = Math.max(stat.assists, fallback?.assists || 0);

          if (!existing) {
            map.set(key, {
              key,
              seasonName: stat.season?.name || stat.seasonLabelHe || stat.seasonLabelEn || '-',
              competitionName: stat.competition?.nameHe || stat.competition?.nameEn || 'כולל',
              teamName: stat._teamName,
              goals,
              assists,
              shots: stat.shots,
              keyPasses: stat.keyPasses,
              minutesPlayed: stat.minutesPlayed,
              starts: stat.starts,
              substituteAppearances: stat.substituteAppearances,
              timesSubbedOff: stat.timesSubbedOff,
              yellowCards: stat.yellowCards,
              redCards: stat.redCards,
              gamesPlayed: stat.gamesPlayed,
            } satisfies AggregatedStatRow);
            return map;
          }

          existing.goals += goals;
          existing.assists += assists;
          existing.shots += stat.shots;
          existing.keyPasses += stat.keyPasses;
          existing.minutesPlayed += stat.minutesPlayed;
          existing.starts += stat.starts;
          existing.substituteAppearances += stat.substituteAppearances;
          existing.timesSubbedOff += stat.timesSubbedOff;
          existing.yellowCards += stat.yellowCards;
          existing.redCards += stat.redCards;
          existing.gamesPlayed += stat.gamesPlayed;

          return map;
        }, new Map<string, AggregatedStatRow>())
        .values()
    ).sort((left, right) => right.seasonName.localeCompare(left.seasonName) || left.competitionName.localeCompare(right.competitionName));
  }

  const aggregatedStats = buildAggregatedStats(seasonPlayers);
  // Career: all seasons across all linked player entries
  const careerStats = buildAggregatedStats(linkedPlayers);
  const selectedSeasonStats = aggregatedStats.filter((stat) => stat.key.startsWith(`${selectedSeasonId}-`));
  const dbSeasonTotals = selectedSeasonStats.reduce(
    (acc, stat) => ({
      goals: acc.goals + stat.goals,
      assists: acc.assists + stat.assists,
      yellowCards: acc.yellowCards + stat.yellowCards,
      redCards: acc.redCards + stat.redCards,
      gamesPlayed: acc.gamesPlayed + stat.gamesPlayed,
      minutesPlayed: acc.minutesPlayed + stat.minutesPlayed,
      starts: acc.starts + stat.starts,
      substituteAppearances: acc.substituteAppearances + stat.substituteAppearances,
      timesSubbedOff: acc.timesSubbedOff + stat.timesSubbedOff,
    }),
    { goals: 0, assists: 0, yellowCards: 0, redCards: 0, gamesPlayed: 0, minutesPlayed: 0, starts: 0, substituteAppearances: 0, timesSubbedOff: 0 }
  );
  // Prefer DB stats when available (authoritative source from IFA/API).
  // Fall back to derived (event-based) stats only when DB has no data for a field.
  const hasDbStats = dbSeasonTotals.gamesPlayed > 0 || dbSeasonTotals.goals > 0;
  const pick = (derived: number, db: number) => hasDbStats && db > 0 ? db : Math.max(derived, db);
  const derivedTotals = {
    ...derivedTotalsBase,
    goals: pick(derivedTotalsBase.goals, dbSeasonTotals.goals),
    assists: pick(derivedTotalsBase.assists, dbSeasonTotals.assists),
    yellowCards: pick(derivedTotalsBase.yellowCards, dbSeasonTotals.yellowCards),
    redCards: pick(derivedTotalsBase.redCards, dbSeasonTotals.redCards),
    gamesPlayed: pick(derivedTotalsBase.gamesPlayed, dbSeasonTotals.gamesPlayed),
    minutesPlayed: pick(derivedTotalsBase.minutesPlayed, dbSeasonTotals.minutesPlayed),
    starts: pick(derivedTotalsBase.starts, dbSeasonTotals.starts),
    substituteAppearances: pick(derivedTotalsBase.substituteAppearances, dbSeasonTotals.substituteAppearances),
    timesSubbedOff: pick(derivedTotalsBase.timesSubbedOff, dbSeasonTotals.timesSubbedOff),
  };

  const uploads = linkedPlayers
    .flatMap((player) => player.uploads)
    .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary) || +new Date(left.createdAt) - +new Date(right.createdAt));
  const displayPhoto =
    displayPlayerEntry.photoUrl ||
    uploads.find((upload) => upload.isPrimary)?.filePath ||
    uploads[0]?.filePath ||
    null;
  const playerDisplayName = formatPlayerName(canonicalPlayer);
  const primarySeasonStats = aggregatedStats[0] || null;
  const activeGameFilter = normalizeGameFilter(searchParams?.filter || (searchParams?.view !== 'premier' ? searchParams?.view : undefined));
  const activeTab = normalizePremierTab(searchParams?.tab);
  const playerGameRows = seasonPlayers
    .flatMap((player) =>
      allGames
        .filter((game) => game.homeTeamId === player.teamId || game.awayTeamId === player.teamId)
        .map((game) => buildPlayerGameRow(player, game))
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
    )
    .sort((left, right) => +new Date(right.dateTime) - +new Date(left.dateTime));
  const filteredPlayerGameRows = playerGameRows.filter((row) => matchesGameFilter(row, activeGameFilter));

  if (displayMode === 'premier') {
    return (
      <PremierPlayerView
        canonicalPlayer={canonicalPlayer}
        canonicalPlayerId={canonicalPlayerId}
        displayPhoto={displayPhoto}
        playerDisplayName={playerDisplayName}
        displayPlayerEntry={displayPlayerEntry}
        selectedSeason={selectedSeason}
        selectedSeasonId={selectedSeasonId}
        availableSeasons={availableSeasons}
        derivedTotals={derivedTotals}
        aggregatedStats={aggregatedStats}
        careerStats={careerStats}
        seasonPlayers={seasonPlayers}
        uploadsCount={uploads.length}
        activeTab={activeTab}
        activeGameFilter={activeGameFilter}
        playerGameRows={playerGameRows}
        filteredPlayerGameRows={filteredPlayerGameRows}
        transfers={transfers}
        trophies={trophies}
        sidelinedEntries={sidelinedEntries}
        currentSidelined={currentSidelined || null}
      />
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-5">
              {displayPhoto ? (
                <img src={displayPhoto} alt={playerDisplayName} className="h-28 w-28 rounded-full border border-stone-200 bg-white object-cover" />
              ) : null}
              <div>
                <h1 className="text-3xl font-black text-stone-900">{playerDisplayName}</h1>
                {playerDisplayName !== canonicalPlayer.nameEn ? <p className="mt-1 text-stone-500">{canonicalPlayer.nameEn}</p> : null}
                <p className="mt-2 text-sm text-stone-600">
                  {displayPlayerEntry.team.nameHe || displayPlayerEntry.team.nameEn} | עונה {selectedSeason?.name}
                </p>
                <p className="mt-1 text-sm text-stone-600">
                  {displayPlayerEntry.position || 'ללא עמדה'} | מספר {displayPlayerEntry.jerseyNumber ?? '-'}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:items-end">
              <form action={`/players/${canonicalPlayerId}`} className="flex flex-wrap items-center gap-3">
                <select
                  name="season"
                  defaultValue={selectedSeasonId}
                  className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 font-semibold"
                >
                  {availableSeasons.map((season) => (
                    <option key={season.id} value={season.id}>
                      {season.name}
                    </option>
                  ))}
                </select>
                <button className="rounded-full bg-stone-900 px-5 py-3 font-bold text-white">הצג עונה</button>
              </form>
              <Link href={`/players/${canonicalPlayerId}/charts`} className="rounded-full border border-stone-300 bg-white px-5 py-3 font-bold text-stone-900">
                גרפים עונתיים
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="שערים" value={String(derivedTotals.goals)} />
          <StatCard label="בישולים" value={String(derivedTotals.assists)} />
          <StatCard label="דקות" value={String(derivedTotals.minutesPlayed)} />
          <StatCard label="משחקים" value={String(derivedTotals.gamesPlayed)} />
          <StatCard label="פתיחות" value={String(derivedTotals.starts)} href={`/players/${canonicalPlayerId}?season=${selectedSeasonId}&filter=starts#games`} />
          <StatCard label="נרשם כמחליף" value={String(derivedTotals.benchAppearances)} href={`/players/${canonicalPlayerId}?season=${selectedSeasonId}&filter=bench#games`} />
          <StatCard label="כניסות כמחליף" value={String(derivedTotals.substituteAppearances)} href={`/players/${canonicalPlayerId}?season=${selectedSeasonId}&filter=sub-in#games`} />
          <StatCard label="הוחלף החוצה" value={String(derivedTotals.timesSubbedOff)} href={`/players/${canonicalPlayerId}?season=${selectedSeasonId}&filter=sub-off#games`} />
          <StatCard label="צהובים" value={String(derivedTotals.yellowCards)} />
          <StatCard label="אדומים" value={String(derivedTotals.redCards)} />
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-stone-900">פרטי שחקן</h2>
            <div className="mt-4 space-y-3 text-sm">
              <StatRow label="עמדה נוכחית" value={displayPlayerEntry.position || 'לא צוין'} />
              <StatRow label="לאום" value={canonicalPlayer.nationalityHe || canonicalPlayer.nationalityEn || 'לא צוין'} />
              <StatRow label="קבוצות בקריירה" value={String(new Set(linkedPlayers.map((player) => player.teamId)).size)} />
              <StatRow label="עונות במערכת" value={String(new Set(linkedPlayers.map((player) => player.team.seasonId)).size)} />
              <StatRow label="תמונות נוספות" value={String(uploads.length)} />
            </div>
          </div>

          <div className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-stone-900">רשומות עונה וקבוצה</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500">
                    <th className="px-3 py-3">עונה</th>
                    <th className="px-3 py-3">קבוצה</th>
                    <th className="px-3 py-3">מספר</th>
                    <th className="px-3 py-3">עמדה</th>
                    <th className="px-3 py-3">תמונה עונתית</th>
                  </tr>
                </thead>
                <tbody>
                  {seasonPlayers.map((player) => (
                    <tr key={player.id} className="border-b border-stone-100">
                      <td className="px-3 py-3">{player.team.season.name}</td>
                      <td className="px-3 py-3">{player.team.nameHe || player.team.nameEn}</td>
                      <td className="px-3 py-3">{player.jerseyNumber ?? '-'}</td>
                      <td className="px-3 py-3">{player.position || '-'}</td>
                      <td className="px-3 py-3">{player.photoUrl ? 'יש' : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-black text-stone-900">סטטיסטיקות שמורות לפי עונה ומסגרת</h2>
          {aggregatedStats.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-right">
                <thead>
                  <tr className="border-b border-stone-200 text-sm text-stone-500">
                    <th className="px-3 py-3">עונה</th>
                    <th className="px-3 py-3">מסגרת</th>
                    <th className="px-3 py-3">משחקים</th>
                    <th className="px-3 py-3">שערים</th>
                    <th className="px-3 py-3">בישולים</th>
                    <th className="px-3 py-3">דקות</th>
                    <th className="px-3 py-3">פתיחות</th>
                    <th className="px-3 py-3">מחליף</th>
                    <th className="px-3 py-3">הוחלף</th>
                    <th className="px-3 py-3">צהובים</th>
                    <th className="px-3 py-3">אדומים</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregatedStats.map((stat) => (
                    <tr key={stat.key} className="border-b border-stone-100 text-sm">
                      <td className="px-3 py-3">{stat.seasonName}</td>
                      <td className="px-3 py-3">{stat.competitionName}</td>
                      <td className="px-3 py-3">{stat.gamesPlayed}</td>
                      <td className="px-3 py-3">{stat.goals}</td>
                      <td className="px-3 py-3">{stat.assists}</td>
                      <td className="px-3 py-3">{stat.minutesPlayed}</td>
                      <td className="px-3 py-3">{stat.starts}</td>
                      <td className="px-3 py-3">{stat.substituteAppearances}</td>
                      <td className="px-3 py-3">{stat.timesSubbedOff}</td>
                      <td className="px-3 py-3">{stat.yellowCards}</td>
                      <td className="px-3 py-3">{stat.redCards}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-stone-500">אין עדיין סטטיסטיקות שמורות לשחקן הזה בעונה שנבחרה.</p>
          )}
          {primarySeasonStats ? (
            <p className="mt-4 text-sm text-stone-500">
              סיכום העונה שנבחרה: {primarySeasonStats.gamesPlayed} משחקים, {primarySeasonStats.minutesPlayed} דקות, {primarySeasonStats.starts} פתיחות.
            </p>
          ) : null}
        </section>

        <section id="games" className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-black text-stone-900">טבלת משחקים</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <FilterChip href={`/players/${canonicalPlayerId}?season=${selectedSeasonId}#games`} active={activeGameFilter === 'all'} label={`הכל (${playerGameRows.length})`} />
            <FilterChip href={`/players/${canonicalPlayerId}?season=${selectedSeasonId}&filter=starts#games`} active={activeGameFilter === 'starts'} label={`פתח (${playerGameRows.filter((row) => row.isStarter).length})`} />
            <FilterChip href={`/players/${canonicalPlayerId}?season=${selectedSeasonId}&filter=bench#games`} active={activeGameFilter === 'bench'} label={`בספסל (${playerGameRows.filter((row) => row.onBench).length})`} />
            <FilterChip href={`/players/${canonicalPlayerId}?season=${selectedSeasonId}&filter=sub-in#games`} active={activeGameFilter === 'sub-in'} label={`נכנס (${playerGameRows.filter((row) => row.wasSubbedIn).length})`} />
            <FilterChip href={`/players/${canonicalPlayerId}?season=${selectedSeasonId}&filter=sub-off#games`} active={activeGameFilter === 'sub-off'} label={`הוחלף (${playerGameRows.filter((row) => row.wasSubbedOff).length})`} />
          </div>
          {filteredPlayerGameRows.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500">
                    <th className="px-3 py-3">תאריך</th>
                    <th className="px-3 py-3">עונה</th>
                    <th className="px-3 py-3">מסגרת</th>
                    <th className="px-3 py-3">משחק</th>
                    <th className="px-3 py-3">תוצאה</th>
                    <th className="px-3 py-3">תפקיד בסגל</th>
                    <th className="px-3 py-3">נכנס בדקה</th>
                    <th className="px-3 py-3">יצא בדקה</th>
                    <th className="px-3 py-3">דקות</th>
                    <th className="px-3 py-3">שערים</th>
                    <th className="px-3 py-3">בישולים</th>
                    <th className="px-3 py-3">צהובים</th>
                    <th className="px-3 py-3">אדומים</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlayerGameRows.map((row) => (
                    <tr key={`${row.playerId}-${row.gameId}`} className="border-b border-stone-100">
                      <td className="px-3 py-3 whitespace-nowrap">{row.displayDate}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{row.seasonName}</td>
                      <td className="px-3 py-3">{row.competitionName}</td>
                      <td className="px-3 py-3">
                        <Link href={`/games/${row.gameId}`} className="font-semibold text-red-700 hover:text-red-800 hover:underline">
                          {row.matchLabel}
                        </Link>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">{row.scoreLabel}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{row.squadRoleLabel}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{row.enteredMinuteLabel}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{row.exitedMinuteLabel}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{row.minutesLabel}</td>
                      <td className="px-3 py-3">{row.goals}</td>
                      <td className="px-3 py-3">{row.assists}</td>
                      <td className="px-3 py-3">{row.yellowCards}</td>
                      <td className="px-3 py-3">{row.redCards}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-stone-500">
              {activeGameFilter === 'all' ? 'אין עדיין פירוט משחקים לשחקן הזה.' : 'לא נמצאו משחקים תחת החתך שבחרת.'}
            </p>
          )}
        </section>

        {uploads.length > 0 ? (
          <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-stone-900">גלריית שחקן</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {uploads.map((upload) => (
                <div key={upload.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-50">
                  <img src={upload.filePath} alt={upload.title || playerDisplayName} className="h-56 w-full object-cover" />
                  <div className="p-4 text-sm text-stone-600">
                    <div className="font-semibold text-stone-900">{upload.title || 'ללא כותרת'}</div>
                    {upload.isPrimary ? <div className="mt-2 font-bold text-red-700">תמונה ראשית</div> : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function StatCard({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = (
    <article className={`rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm transition ${href ? 'hover:border-red-200 hover:shadow-md' : ''}`}>
      <div className="text-sm font-semibold text-stone-500">{label}</div>
      <div className="mt-3 text-3xl font-black text-stone-900">{value}</div>
    </article>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}

function PremierPlayerView({
  canonicalPlayer,
  canonicalPlayerId,
  displayPhoto,
  playerDisplayName,
  displayPlayerEntry,
  selectedSeason,
  selectedSeasonId,
  availableSeasons,
  derivedTotals,
  aggregatedStats,
  careerStats,
  seasonPlayers,
  uploadsCount,
  activeTab,
  activeGameFilter,
  playerGameRows,
  filteredPlayerGameRows,
  transfers,
  trophies,
  sidelinedEntries,
  currentSidelined,
}: {
  canonicalPlayer: any;
  canonicalPlayerId: string;
  displayPhoto: string | null;
  playerDisplayName: string;
  displayPlayerEntry: any;
  selectedSeason: { id: string; name: string; year: number } | undefined;
  selectedSeasonId: string;
  availableSeasons: Array<{ id: string; name: string; year: number }>;
  derivedTotals: {
    goals: number;
    assists: number;
    yellowCards: number;
    redCards: number;
    starts: number;
    gamesPlayed: number;
    minutesPlayed: number;
    benchAppearances: number;
    substituteAppearances: number;
    timesSubbedOff: number;
  };
  aggregatedStats: AggregatedStatRow[];
  careerStats: AggregatedStatRow[];
  seasonPlayers: any[];
  uploadsCount: number;
  activeTab: PlayerPremierTab;
  activeGameFilter: PlayerGameFilter;
  playerGameRows: Array<ReturnType<typeof buildPlayerGameRow> extends infer T ? Exclude<T, null> : never>;
  filteredPlayerGameRows: Array<ReturnType<typeof buildPlayerGameRow> extends infer T ? Exclude<T, null> : never>;
  transfers: Array<{ id: string; transferDate: Date | null; transferTypeEn: string | null; transferTypeHe: string | null; sourceTeamNameEn: string | null; sourceTeamNameHe: string | null; sourceTeamLogoUrl: string | null; destinationTeamNameEn: string | null; destinationTeamNameHe: string | null; destinationTeamLogoUrl: string | null }>;
  trophies: Array<{ id: string; leagueNameEn: string; leagueNameHe: string | null; seasonLabel: string | null; placeEn: string | null; placeHe: string | null; countryEn: string | null; countryHe: string | null }>;
  sidelinedEntries: Array<{ id: string; typeEn: string; typeHe: string | null; startDate: Date | null; endDate: Date | null }>;
  currentSidelined: { typeEn: string; typeHe: string | null; startDate: Date | null } | null;
}) {
  // Resolve Hebrew name: prefer split fields, fall back to splitting nameHe
  const nameParts =
    canonicalPlayer.nameHe && !/[a-zA-Z]/.test(canonicalPlayer.nameHe)
      ? canonicalPlayer.nameHe.trim().split(/\s+/)
      : null;
  const displayFirstHe =
    canonicalPlayer.firstNameHe ||
    (nameParts && nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : null) ||
    canonicalPlayer.firstNameEn ||
    '';
  const displayLastHe =
    canonicalPlayer.lastNameHe ||
    (nameParts ? nameParts[nameParts.length - 1] : null) ||
    canonicalPlayer.lastNameEn ||
    playerDisplayName;
  const apiStats = aggregatePlayerApiStats(seasonPlayers);
  const overviewFacts = [
    { label: 'לאום', value: canonicalPlayer.nationalityHe || canonicalPlayer.nationalityEn || 'לא צוין' },
    { label: 'תאריך לידה', value: formatBirthDate(canonicalPlayer.birthDate) },
    { label: 'מקום לידה', value: canonicalPlayer.birthPlaceHe || canonicalPlayer.birthPlaceEn || canonicalPlayer.birthCountryHe || canonicalPlayer.birthCountryEn || 'לא צוין' },
    { label: 'גיל', value: canonicalPlayer.age ? String(canonicalPlayer.age) : 'לא צוין' },
    { label: 'גובה', value: canonicalPlayer.height || 'לא צוין' },
    { label: 'משקל', value: canonicalPlayer.weight || 'לא צוין' },
  ];

  const overviewCards = [
    { label: 'הופעות', value: String(derivedTotals.gamesPlayed), subvalue: derivedTotals.substituteAppearances ? `(${derivedTotals.substituteAppearances} כמחליף)` : null },
    { label: 'שערים', value: String(derivedTotals.goals), subvalue: null },
    { label: 'בישולים', value: String(derivedTotals.assists), subvalue: null },
  ];

  const attackRows = [
    { label: 'שערים', value: formatMetric(derivedTotals.goals) },
    { label: 'בישולים', value: formatMetric(derivedTotals.assists) },
    { label: 'בעיטות', value: formatMetric(sumAggregatedStat(aggregatedStats, 'shots')) },
    { label: 'מסירות מפתח', value: formatMetric(sumAggregatedStat(aggregatedStats, 'keyPasses')) },
    { label: 'דריבלים מוצלחים', value: formatFraction(apiStats.dribblesSuccess, apiStats.dribblesAttempts) },
    { label: 'דו־קרבים שנוצחו', value: formatFraction(apiStats.duelsWon, apiStats.duelsTotal) },
  ];

  const possessionRows = [
    { label: 'מסירות', value: formatFraction(apiStats.passesTotal, apiStats.passesAccuracy, '%') },
    { label: 'מסירות מפתח', value: formatMetric(sumAggregatedStat(aggregatedStats, 'keyPasses')) },
    { label: 'כדורים ארוכים', value: formatFraction(apiStats.longBallsTotal, apiStats.longBallsAccuracy, '%') },
    { label: 'יציאות קדימה', value: formatFraction(apiStats.dribblesSuccess, apiStats.dribblesAttempts) },
  ];

  const physicalRows = [
    { label: 'דקות משחק', value: formatMetric(derivedTotals.minutesPlayed) },
    { label: 'פתיחות', value: formatMetric(derivedTotals.starts) },
    { label: 'נכנס כמחליף', value: formatMetric(derivedTotals.substituteAppearances) },
    { label: 'הוחלף החוצה', value: formatMetric(derivedTotals.timesSubbedOff) },
  ];

  const defenceRows = [
    { label: 'תיקולים', value: formatMetric(apiStats.tacklesTotal) },
    { label: 'חטיפות', value: formatMetric(apiStats.tacklesInterceptions) },
    { label: 'חסימות', value: formatMetric(apiStats.tacklesBlocks) },
    { label: 'תיקולים שניצח', value: formatMetric(apiStats.tacklesWon) },
  ];

  const disciplineRows = [
    { label: 'צהובים', value: formatMetric(derivedTotals.yellowCards) },
    { label: 'אדומים', value: formatMetric(derivedTotals.redCards) },
    { label: 'עבירות שביצע', value: formatMetric(apiStats.foulsCommitted) },
    { label: 'עבירות שסחט', value: formatMetric(apiStats.foulsDrawn) },
    { label: 'נבדלים', value: formatMetric(apiStats.offsides) },
  ];

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fbff_0%,#eef3ff_100%)] px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.55fr]">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-[30px] bg-[linear-gradient(135deg,#8c001a,#c70039_42%,#ff4b55)] shadow-[0_20px_50px_rgba(199,0,57,0.28)]">
              <div className="relative p-6">
                <div className="absolute inset-y-0 left-0 w-40 bg-[linear-gradient(135deg,rgba(255,255,255,0.14),transparent)]" />
                <div className="relative flex items-end gap-5">
                  {displayPhoto ? (
                    <img src={displayPhoto} alt={playerDisplayName} className="h-36 w-28 object-cover drop-shadow-[0_14px_30px_rgba(15,23,42,0.18)]" />
                  ) : (
                    <div className="flex h-32 w-24 items-center justify-center rounded-[24px] bg-white/35 text-xs font-black text-slate-700">ללא תמונה</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-lg font-medium text-white/90">{displayFirstHe}</div>
                    <h1 className="text-5xl font-black leading-none text-white">{displayLastHe}</h1>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-white/85">
                      <span>{displayPlayerEntry.team.nameHe || displayPlayerEntry.team.nameEn}</span>
                      <span>•</span>
                      <span>#{displayPlayerEntry.jerseyNumber ?? '-'}</span>
                      <span>•</span>
                      <span>{formatPlayerPosition(displayPlayerEntry.position)}</span>
                    </div>
                    {currentSidelined ? (
                      <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-red-500/30 px-3 py-1 text-xs font-bold text-red-100">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-300" />
                        לא זמין — {currentSidelined.typeHe || currentSidelined.typeEn}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {activeTab === 'overview' ? (
              <section id="overview" className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {overviewFacts.map((fact) => (
                  <div key={fact.label}>
                    <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">{fact.label}</div>
                    <div className="mt-2 text-base font-black text-[#2d0052]">{fact.value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <MiniSummary label="הופעות קריירה" value={String(playerGameRows.length)} />
                <MiniSummary label="שערים במערכת" value={String(aggregatedStats.reduce((sum, row) => sum + row.goals, 0))} />
                <MiniSummary label="תמונות" value={String(uploadsCount)} />
              </div>

              {/* Transfers in overview */}
              {transfers.length > 0 ? (
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">העברות</div>
                  <div className="mt-2 space-y-2">
                    {transfers.slice(0, 5).map((t) => (
                      <div key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-xs text-slate-400">{t.transferDate ? new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium' }).format(t.transferDate) : '—'}</span>
                        <div className="flex items-center gap-1">
                          {t.sourceTeamLogoUrl ? <img src={t.sourceTeamLogoUrl} alt="" className="h-4 w-4 object-contain" /> : null}
                          <span className="font-semibold text-slate-700">{t.sourceTeamNameHe || t.sourceTeamNameEn || '?'}</span>
                        </div>
                        <span className="text-slate-300">←</span>
                        <div className="flex items-center gap-1">
                          {t.destinationTeamLogoUrl ? <img src={t.destinationTeamLogoUrl} alt="" className="h-4 w-4 object-contain" /> : null}
                          <span className="font-semibold text-slate-700">{t.destinationTeamNameHe || t.destinationTeamNameEn || '?'}</span>
                        </div>
                        {t.transferTypeHe || t.transferTypeEn ? (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-500">{t.transferTypeHe || t.transferTypeEn}</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Sidelined / Injury History in overview */}
              {sidelinedEntries.length > 0 ? (
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">פציעות והשעיות</div>
                  <div className="mt-2 space-y-1.5">
                    {sidelinedEntries.slice(0, 6).map((s) => {
                      const isActive = !s.endDate || s.endDate > new Date();
                      return (
                        <div key={s.id} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${isActive ? 'bg-red-50' : 'bg-slate-50'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-red-500' : 'bg-slate-300'}`} />
                          <span className="font-semibold text-slate-700">{s.typeHe || s.typeEn}</span>
                          <span className="text-xs text-slate-400">
                            {s.startDate ? new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium' }).format(s.startDate) : ''}
                            {s.endDate ? ` — ${new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium' }).format(s.endDate)}` : ' — טרם חזר'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              </section>
            ) : null}
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {false ? (
                <nav className="flex flex-wrap items-center gap-5 text-sm font-medium text-slate-500">
                <a href="#overview" className="transition hover:text-[#4f0086]">סקירה</a>
                <a href="#stats" className="border-b-4 border-[#3d0067] pb-2 font-black text-[#23003d]">סטטיסטיקה</a>
                <a href="#games" className="transition hover:text-[#4f0086]">משחקים</a>
                <a href="#career" className="transition hover:text-[#4f0086]">קריירה</a>
                </nav>
              ) : (
                <nav className="flex flex-wrap items-center gap-5 text-sm font-medium text-slate-500">
                  <Link href={buildPremierPlayerHref(canonicalPlayerId, selectedSeasonId, 'overview')} className={`border-b-4 pb-2 transition ${activeTab === 'overview' ? 'border-[#3d0067] font-black text-[#23003d]' : 'border-transparent hover:text-[#4f0086]'}`}>
                    סקירה
                  </Link>
                  <Link href={buildPremierPlayerHref(canonicalPlayerId, selectedSeasonId, 'stats')} className={`border-b-4 pb-2 transition ${activeTab === 'stats' ? 'border-[#3d0067] font-black text-[#23003d]' : 'border-transparent hover:text-[#4f0086]'}`}>
                    סטטיסטיקה
                  </Link>
                  <Link href={buildPremierPlayerHref(canonicalPlayerId, selectedSeasonId, 'games', activeGameFilter)} className={`border-b-4 pb-2 transition ${activeTab === 'games' ? 'border-[#3d0067] font-black text-[#23003d]' : 'border-transparent hover:text-[#4f0086]'}`}>
                    משחקים
                  </Link>
                  <Link href={buildPremierPlayerHref(canonicalPlayerId, selectedSeasonId, 'career')} className={`border-b-4 pb-2 transition ${activeTab === 'career' ? 'border-[#3d0067] font-black text-[#23003d]' : 'border-transparent hover:text-[#4f0086]'}`}>
                    קריירה
                  </Link>
                  <Link href={buildPremierPlayerHref(canonicalPlayerId, selectedSeasonId, 'achievements')} className={`border-b-4 pb-2 transition ${activeTab === 'achievements' ? 'border-[#3d0067] font-black text-[#23003d]' : 'border-transparent hover:text-[#4f0086]'}`}>
                    הישגים
                  </Link>
                </nav>
              )}

              <form action={`/players/${canonicalPlayerId}`} className="flex items-center gap-3">
                <input type="hidden" name="view" value="premier" />
                <input type="hidden" name="tab" value={activeTab} />
                {activeTab === 'games' && activeGameFilter !== 'all' ? <input type="hidden" name="filter" value={activeGameFilter} /> : null}
                <select
                  name="season"
                  defaultValue={selectedSeasonId}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-[#2d0052]"
                >
                  {availableSeasons.map((season) => (
                    <option key={season.id} value={season.id}>
                      {season.name}
                    </option>
                  ))}
                </select>
                <button className="rounded-2xl bg-[#3d0067] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#4f0086]">הצג עונה</button>
              </form>
            </div>

            {activeTab === 'stats' ? (
              <div className="grid gap-4 md:grid-cols-3">
              {overviewCards.map((card) => (
                <section key={card.label} className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                  <div className="text-sm font-bold text-[#3d0067]">{card.label}</div>
                  <div className="mt-3 text-5xl font-black leading-none text-[#2a003f]">{card.value}</div>
                  {card.subvalue ? <div className="mt-2 text-sm text-slate-500">{card.subvalue}</div> : null}
                </section>
              ))}
              </div>
            ) : null}

            {activeTab === 'stats' ? (
              <div id="stats" className="grid gap-4 md:grid-cols-2">
              <StatCategoryCard title="התקפה" rows={attackRows} />
              <StatCategoryCard title="החזקת כדור" rows={possessionRows} />
              <StatCategoryCard title="פיזיות" rows={physicalRows} />
              <StatCategoryCard title="הגנה" rows={defenceRows} />
              </div>
            ) : null}

            {activeTab === 'stats' ? <StatCategoryCard title="משמעת" rows={disciplineRows} /> : null}
          </div>
        </section>

        {activeTab === 'career' ? (
          <section id="career" className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-[#23003d]">רשומות עונה וקבוצה</h2>
              <p className="mt-1 text-sm text-slate-500">מעקב עונתי אחר הקבוצות, המסגרות והנתונים שנשמרו לשחקן.</p>
            </div>
            <Link href={`/players/${canonicalPlayerId}/charts`} className="rounded-full border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700">
              גרפים עונתיים
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-right text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500">
                  <th className="px-3 py-3">עונה</th>
                  <th className="px-3 py-3">קבוצה</th>
                  <th className="px-3 py-3">מסגרת</th>
                  <th className="px-3 py-3">הופעות</th>
                  <th className="px-3 py-3">שערים</th>
                  <th className="px-3 py-3">בישולים</th>
                  <th className="px-3 py-3">דקות</th>
                </tr>
              </thead>
              <tbody>
                {careerStats.map((stat) => (
                  <tr key={stat.key} className="border-b border-slate-100">
                    <td className="px-3 py-3 font-semibold text-slate-800">{stat.seasonName}</td>
                    <td className="px-3 py-3 text-slate-700">{stat.teamName}</td>
                    <td className="px-3 py-3 text-slate-700">{stat.competitionName}</td>
                    <td className="px-3 py-3 font-bold text-slate-900">{stat.gamesPlayed}</td>
                    <td className="px-3 py-3 font-bold text-[#5f00ad]">{stat.goals}</td>
                    <td className="px-3 py-3 font-bold text-cyan-700">{stat.assists}</td>
                    <td className="px-3 py-3 font-bold text-slate-900">{stat.minutesPlayed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          </section>
        ) : null}

        {activeTab === 'achievements' ? (
          <section id="achievements" className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <div className="mb-4">
              <h2 className="text-2xl font-black text-[#23003d]">גביעים והישגים</h2>
              <p className="mt-1 text-sm text-slate-500">תארים, גביעים והישגים שנשמרו לשחקן לאורך הקריירה.</p>
            </div>
            {(() => {
              const unique = Array.from(
                trophies.reduce((map, t) => {
                  const key = `${t.leagueNameEn}|${t.seasonLabel}|${t.placeEn}`;
                  if (!map.has(key)) map.set(key, t);
                  return map;
                }, new Map<string, typeof trophies[0]>()).values()
              );
              return unique.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {unique.map((t, i) => (
                    <div key={`${t.id}-${i}`} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 text-sm">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{t.placeEn === 'Winner' ? '🏆' : t.placeEn === 'Runner-up' || t.placeEn === '2nd Place' ? '🥈' : '🏅'}</span>
                        <div>
                          <div className="font-bold text-slate-800">{t.leagueNameHe || t.leagueNameEn}</div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {t.seasonLabel || ''} · {t.placeHe || t.placeEn || ''}
                          </div>
                          {t.countryHe || t.countryEn ? (
                            <div className="mt-0.5 text-[10px] text-slate-400">{t.countryHe || t.countryEn}</div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  אין הישגים שמורים לשחקן הזה.
                </div>
              );
            })()}
          </section>
        ) : null}

        {activeTab === 'games' ? (
          <section id="games" className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <div className="mb-4">
            <h2 className="text-2xl font-black text-[#23003d]">משחקים</h2>
            <p className="mt-1 text-sm text-slate-500">רשימת הופעות של השחקן בעונה שנבחרה, עם אפשרות סינון לפי תפקיד במשחק.</p>
          </div>
          {false ? (
            <div className="mb-4 flex flex-wrap gap-2">
            <FilterChip href={`/players/${canonicalPlayerId}?season=${selectedSeasonId}&view=premier#games`} active={activeGameFilter === 'all'} label={`הכל (${playerGameRows.length})`} />
            <FilterChip href={`/players/${canonicalPlayerId}?season=${selectedSeasonId}&view=premier&filter=starts#games`} active={activeGameFilter === 'starts'} label={`פתח (${playerGameRows.filter((row) => row.isStarter).length})`} />
            <FilterChip href={`/players/${canonicalPlayerId}?season=${selectedSeasonId}&view=premier&filter=bench#games`} active={activeGameFilter === 'bench'} label={`בספסל (${playerGameRows.filter((row) => row.onBench).length})`} />
            <FilterChip href={`/players/${canonicalPlayerId}?season=${selectedSeasonId}&view=premier&filter=sub-in#games`} active={activeGameFilter === 'sub-in'} label={`נכנס (${playerGameRows.filter((row) => row.wasSubbedIn).length})`} />
            <FilterChip href={`/players/${canonicalPlayerId}?season=${selectedSeasonId}&view=premier&filter=sub-off#games`} active={activeGameFilter === 'sub-off'} label={`הוחלף (${playerGameRows.filter((row) => row.wasSubbedOff).length})`} />
            </div>
          ) : (
            <div className="mb-4 flex flex-wrap gap-2">
              <FilterChip href={buildPremierPlayerHref(canonicalPlayerId, selectedSeasonId, 'games', 'all')} active={activeGameFilter === 'all'} label={`הכל (${playerGameRows.length})`} />
              <FilterChip href={buildPremierPlayerHref(canonicalPlayerId, selectedSeasonId, 'games', 'starts')} active={activeGameFilter === 'starts'} label={`פתח (${playerGameRows.filter((row) => row.isStarter).length})`} />
              <FilterChip href={buildPremierPlayerHref(canonicalPlayerId, selectedSeasonId, 'games', 'bench')} active={activeGameFilter === 'bench'} label={`בספסל (${playerGameRows.filter((row) => row.onBench).length})`} />
              <FilterChip href={buildPremierPlayerHref(canonicalPlayerId, selectedSeasonId, 'games', 'sub-in')} active={activeGameFilter === 'sub-in'} label={`נכנס (${playerGameRows.filter((row) => row.wasSubbedIn).length})`} />
              <FilterChip href={buildPremierPlayerHref(canonicalPlayerId, selectedSeasonId, 'games', 'sub-off')} active={activeGameFilter === 'sub-off'} label={`הוחלף (${playerGameRows.filter((row) => row.wasSubbedOff).length})`} />
            </div>
          )}
          {filteredPlayerGameRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500">
                    <th className="px-3 py-3">תאריך</th>
                    <th className="px-3 py-3">מסגרת</th>
                    <th className="px-3 py-3">משחק</th>
                    <th className="px-3 py-3">תוצאה</th>
                    <th className="px-3 py-3">תפקיד</th>
                    <th className="px-3 py-3">דקות</th>
                    <th className="px-3 py-3">שערים</th>
                    <th className="px-3 py-3">בישולים</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlayerGameRows.map((row) => (
                    <tr key={`${row.playerId}-${row.gameId}`} className="border-b border-slate-100">
                      <td className="px-3 py-3 whitespace-nowrap text-slate-700">{row.displayDate}</td>
                      <td className="px-3 py-3 text-slate-700">{row.competitionName}</td>
                      <td className="px-3 py-3">
                        <Link href={`/games/${row.gameId}`} className="font-bold text-[#5f00ad] hover:underline">
                          {row.matchLabel}
                        </Link>
                      </td>
                      <td className="px-3 py-3 font-bold text-slate-900">{row.scoreLabel}</td>
                      <td className="px-3 py-3 text-slate-700">{row.squadRoleLabel}</td>
                      <td className="px-3 py-3 text-slate-700">{row.minutesLabel}</td>
                      <td className="px-3 py-3 font-bold text-[#5f00ad]">{row.goals}</td>
                      <td className="px-3 py-3 font-bold text-cyan-700">{row.assists}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              לא נמצאו משחקים לחתך שנבחר.
            </div>
          )}
          </section>
        ) : null}
      </div>
    </div>
  );
}

function MiniSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] bg-[#f6f7fb] px-4 py-3">
      <div className="text-xs font-semibold tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-2 text-xl font-black text-[#260041]">{value}</div>
    </div>
  );
}

function StatCategoryCard({
  title,
  rows,
  className = '',
}: {
  title: string;
  rows: Array<{ label: string; value: string }>;
  className?: string;
}) {
  const visibleRows = rows.filter((row) => row.value !== '0' && row.value !== '0/0' && row.value !== '0 (0%)');

  return (
    <section className={`rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)] ${className}`}>
      <h3 className="text-2xl font-black text-[#2b0043]">{title}</h3>
      <div className="mt-4 space-y-4">
        {(visibleRows.length ? visibleRows : rows).map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4">
            <div className="text-lg text-[#3d0067]">{row.label}</div>
            <div className="text-lg font-black text-[#2b0043]">{row.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatBirthDate(value: Date | null | undefined) {
  if (!value) return 'לא צוין';
  return new Intl.DateTimeFormat('he-IL').format(value);
}

function formatMetric(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '0';
}

function formatFraction(value: number | null | undefined, secondary: number | null | undefined, secondarySuffix = '') {
  const primary = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const second = typeof secondary === 'number' && Number.isFinite(secondary) ? secondary : 0;
  if (!second) return String(primary);
  return `${primary} (${second}${secondarySuffix})`;
}

function sumAggregatedStat(rows: AggregatedStatRow[], field: 'shots' | 'keyPasses') {
  return rows.reduce((sum, row) => sum + (row[field] || 0), 0);
}

function aggregatePlayerApiStats(seasonPlayers: any[]) {
  const blocks = seasonPlayers.flatMap((player) =>
    Array.isArray(player.additionalInfo?.statistics) ? player.additionalInfo.statistics : []
  );

  const sum = (getter: (block: any) => number | null | undefined) =>
    blocks.reduce((total, block) => total + (Number(getter(block)) || 0), 0);

  return {
    passesTotal: sum((block) => block?.passes?.total),
    passesAccuracy: sum((block) => Number.parseInt(String(block?.passes?.accuracy || '0'), 10)),
    longBallsTotal: sum((block) => block?.passes?.key),
    longBallsAccuracy: 0,
    dribblesAttempts: sum((block) => block?.dribbles?.attempts),
    dribblesSuccess: sum((block) => block?.dribbles?.success),
    duelsTotal: sum((block) => block?.duels?.total),
    duelsWon: sum((block) => block?.duels?.won),
    tacklesTotal: sum((block) => block?.tackles?.total),
    tacklesBlocks: sum((block) => block?.tackles?.blocks),
    tacklesInterceptions: sum((block) => block?.tackles?.interceptions),
    tacklesWon: sum((block) => block?.tackles?.total),
    foulsCommitted: sum((block) => block?.fouls?.committed),
    foulsDrawn: sum((block) => block?.fouls?.drawn),
    offsides: sum((block) => block?.offsides),
  };
}

function eventMinute(event: { minute: number; extraMinute: number | null }) {
  return event.minute + Math.max(event.extraMinute || 0, 0);
}

function buildPlayerGameRow(
  player: PlayerSeasonEntry,
  game: PlayerGameDetail
) {
  const playerLineups = game.lineupEntries.filter((entry) => entry.playerId === player.id);
  const isStarter = playerLineups.some((entry) => entry.role === 'STARTER');
  const onBench = playerLineups.some((entry) => entry.role === 'SUBSTITUTE');
  const subInEvent = game.events
    .filter(
      (event) =>
        (event.type === 'SUBSTITUTION_IN' || event.type === 'SUBSTITUTION_OUT') &&
        event.relatedPlayerId === player.id
    )
    .sort((left, right) => eventMinute(left) - eventMinute(right))[0];
  const subOffEvent = game.events
    .filter(
      (event) =>
        (event.type === 'SUBSTITUTION_IN' || event.type === 'SUBSTITUTION_OUT') &&
        event.playerId === player.id
    )
    .sort((left, right) => eventMinute(left) - eventMinute(right))[0];
  const goals = game.events.filter(
    (event) => event.playerId === player.id && (event.type === 'GOAL' || event.type === 'PENALTY_GOAL')
  ).length;
  const assists = game.events.filter(
    (event) => event.relatedPlayerId === player.id && (event.type === 'GOAL' || event.type === 'PENALTY_GOAL')
  ).length;
  const yellowCards = game.events.filter((event) => event.playerId === player.id && event.type === 'YELLOW_CARD').length;
  const redCards = game.events.filter((event) => event.playerId === player.id && event.type === 'RED_CARD').length;

  if (!isStarter && !onBench && !subInEvent && !subOffEvent && !goals && !assists && !yellowCards && !redCards) {
    return null;
  }

  const homeName = game.homeTeam.nameHe || game.homeTeam.nameEn;
  const awayName = game.awayTeam.nameHe || game.awayTeam.nameEn;
  const scoreLabel =
    game.homeScore === null || game.awayScore === null ? '-' : `${game.homeScore}:${game.awayScore}`;
  const startMinute = isStarter ? 0 : subInEvent ? eventMinute(subInEvent) : null;
  const endMinute = subOffEvent ? eventMinute(subOffEvent) : isStarter || subInEvent ? 90 : null;

  const wasSubbedIn = Boolean(subInEvent);
  const wasSubbedOff = Boolean(subOffEvent);
  const squadRoleLabel = isStarter ? 'פתח' : onBench || wasSubbedIn ? 'נרשם כמחליף' : 'לא ידוע';
  const enteredMinuteLabel = wasSubbedIn ? String(eventMinute(subInEvent)) : isStarter ? '0' : '-';
  const exitedMinuteLabel = wasSubbedOff ? String(eventMinute(subOffEvent)) : '-';

  return {
    playerId: player.id,
    gameId: game.id,
    dateTime: game.dateTime,
    displayDate: new Date(game.dateTime).toLocaleDateString('he-IL'),
    seasonName: player.team.season.name,
    competitionName: game.competition?.nameHe || game.competition?.nameEn || '-',
    matchLabel: `${homeName} - ${awayName}`,
    scoreLabel,
    squadRoleLabel,
    enteredMinuteLabel,
    exitedMinuteLabel,
    minutesLabel: startMinute === null || endMinute === null ? '-' : `${startMinute}-${endMinute}`,
    isStarter,
    onBench,
    wasSubbedIn,
    wasSubbedOff,
    goals,
    assists,
    yellowCards,
    redCards,
  };
}

function normalizePremierTab(value: string | undefined): PlayerPremierTab {
  if (value === 'overview' || value === 'games' || value === 'career' || value === 'achievements') {
    return value;
  }

  return 'stats';
}

function buildPremierPlayerHref(
  canonicalPlayerId: string,
  selectedSeasonId: string,
  tab: PlayerPremierTab,
  filter?: PlayerGameFilter
) {
  const params = new URLSearchParams();
  params.set('view', 'premier');
  params.set('season', selectedSeasonId);
  params.set('tab', tab);
  if (filter && filter !== 'all') {
    params.set('filter', filter);
  }
  return `/players/${canonicalPlayerId}?${params.toString()}`;
}

function buildLeaderboardFallbackMap(entries: Array<{
  seasonId: string;
  competitionId: string;
  category: LeaderboardCategory;
  value: number;
}>): LeaderboardFallbackMap {
  return entries.reduce((map, entry) => {
    const key = `${entry.seasonId}-${entry.competitionId}`;
    const current = map.get(key) || { goals: 0, assists: 0 };
    if (entry.category === LeaderboardCategory.TOP_SCORERS) {
      current.goals = Math.max(current.goals, entry.value);
    }
    if (entry.category === LeaderboardCategory.TOP_ASSISTS) {
      current.assists = Math.max(current.assists, entry.value);
    }
    map.set(key, current);
    return map;
  }, new Map<string, { goals: number; assists: number }>());
}

function normalizeGameFilter(value: string | undefined): PlayerGameFilter {
  if (value === 'starts' || value === 'bench' || value === 'sub-in' || value === 'sub-off') {
    return value;
  }

  return 'all';
}

function matchesGameFilter(
  row: ReturnType<typeof buildPlayerGameRow> extends infer T ? Exclude<T, null> : never,
  filter: PlayerGameFilter
) {
  if (filter === 'starts') return row.isStarter;
  if (filter === 'bench') return row.onBench;
  if (filter === 'sub-in') return row.wasSubbedIn;
  if (filter === 'sub-off') return row.wasSubbedOff;
  return true;
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-4 py-2 text-sm font-bold transition ${
        active ? 'bg-stone-900 text-white' : 'border border-stone-200 bg-stone-50 text-stone-700 hover:border-stone-300'
      }`}
    >
      {label}
    </Link>
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
