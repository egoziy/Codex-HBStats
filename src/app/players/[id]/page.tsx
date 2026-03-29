import Link from 'next/link';
import { notFound } from 'next/navigation';
import { derivePlayerDeepStats } from '@/lib/deep-stats';
import { formatPlayerName } from '@/lib/player-display';
import prisma from '@/lib/prisma';

type AggregatedStatRow = {
  key: string;
  seasonName: string;
  competitionName: string;
  goals: number;
  assists: number;
  minutesPlayed: number;
  starts: number;
  substituteAppearances: number;
  timesSubbedOff: number;
  yellowCards: number;
  redCards: number;
  gamesPlayed: number;
};

type PlayerGameFilter = 'all' | 'starts' | 'bench' | 'sub-in' | 'sub-off';

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
  searchParams?: { view?: string; season?: string };
}) {
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

  const derivedTotals = seasonPlayers.reduce(
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

  const aggregatedStats = Array.from(
    seasonPlayers
      .flatMap((player) => player.playerStats)
      .reduce((map, stat) => {
        const key = `${stat.seasonId || 'all'}-${stat.competitionId || 'all'}`;
        const existing = map.get(key);

        if (!existing) {
          map.set(key, {
            key,
            seasonName: stat.season?.name || stat.seasonLabelHe || stat.seasonLabelEn || '-',
            competitionName: stat.competition?.nameHe || stat.competition?.nameEn || 'כולל',
            goals: stat.goals,
            assists: stat.assists,
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

        existing.goals += stat.goals;
        existing.assists += stat.assists;
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
  const activeGameFilter = normalizeGameFilter(searchParams?.view);
  const playerGameRows = seasonPlayers
    .flatMap((player) =>
      allGames
        .filter((game) => game.homeTeamId === player.teamId || game.awayTeamId === player.teamId)
        .map((game) => buildPlayerGameRow(player, game))
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
    )
    .sort((left, right) => +new Date(right.dateTime) - +new Date(left.dateTime));
  const filteredPlayerGameRows = playerGameRows.filter((row) => matchesGameFilter(row, activeGameFilter));

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
                <input type="hidden" name="view" value={activeGameFilter === 'all' ? '' : activeGameFilter} />
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
          <StatCard label="פתיחות" value={String(derivedTotals.starts)} href={`/players/${canonicalPlayerId}?season=${selectedSeasonId}&view=starts#games`} />
          <StatCard label="נרשם כמחליף" value={String(derivedTotals.benchAppearances)} href={`/players/${canonicalPlayerId}?season=${selectedSeasonId}&view=bench#games`} />
          <StatCard label="כניסות כמחליף" value={String(derivedTotals.substituteAppearances)} href={`/players/${canonicalPlayerId}?season=${selectedSeasonId}&view=sub-in#games`} />
          <StatCard label="הוחלף החוצה" value={String(derivedTotals.timesSubbedOff)} href={`/players/${canonicalPlayerId}?season=${selectedSeasonId}&view=sub-off#games`} />
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
            <FilterChip href={`/players/${canonicalPlayerId}?season=${selectedSeasonId}&view=starts#games`} active={activeGameFilter === 'starts'} label={`פתח (${playerGameRows.filter((row) => row.isStarter).length})`} />
            <FilterChip href={`/players/${canonicalPlayerId}?season=${selectedSeasonId}&view=bench#games`} active={activeGameFilter === 'bench'} label={`בספסל (${playerGameRows.filter((row) => row.onBench).length})`} />
            <FilterChip href={`/players/${canonicalPlayerId}?season=${selectedSeasonId}&view=sub-in#games`} active={activeGameFilter === 'sub-in'} label={`נכנס (${playerGameRows.filter((row) => row.wasSubbedIn).length})`} />
            <FilterChip href={`/players/${canonicalPlayerId}?season=${selectedSeasonId}&view=sub-off#games`} active={activeGameFilter === 'sub-off'} label={`הוחלף (${playerGameRows.filter((row) => row.wasSubbedOff).length})`} />
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
