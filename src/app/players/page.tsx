import Link from 'next/link';
import SmartFilterForm from '@/components/SmartFilterForm';
import { derivePlayerDeepStats } from '@/lib/deep-stats';
import { getDisplayMode } from '@/lib/display-mode';
import { getDisplayZeroStatPlayersSetting } from '@/lib/player-zero-stat-settings';
import { formatPlayerName } from '@/lib/player-display';
import prisma from '@/lib/prisma';
import { PlayerPhoto } from '@/components/MediaImage';

export const dynamic = 'force-dynamic';

function buildPlayersFilterFields({
  displayMode,
  seasons,
  allTeams,
  competitions,
}: {
  displayMode: string;
  seasons: Array<{ id: string; name: string }>;
  allTeams: Array<{ id: string; seasonId: string; nameHe: string | null; nameEn: string }>;
  competitions: Array<{ id: string; nameHe: string | null; nameEn: string }>;
}) {
  const selectClass =
    displayMode === 'premier'
      ? 'rounded-2xl border border-white/40 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none'
      : 'rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-semibold text-stone-900 focus:outline-none';
  return [
    {
      name: 'season',
      options: seasons.map((season) => ({ value: season.id, label: season.name })),
      className: selectClass,
    },
    {
      name: 'competitionId',
      includeAllOption: true,
      allLabel: 'כל המסגרות',
      options: competitions.map((comp) => ({
        value: comp.id,
        label: comp.nameHe || comp.nameEn,
      })),
      className: selectClass,
    },
    {
      name: 'teamId',
      includeAllOption: true,
      allLabel: 'כל הקבוצות',
      options: allTeams.map((team) => ({
        value: team.id,
        label: team.nameHe || team.nameEn,
        meta: { season: [team.seasonId] },
      })),
      className: selectClass,
    },
  ];
}

const DEFAULT_COMPETITION_ID = 'comp_liga_haal';

export default async function PlayersPage({
  searchParams,
}: {
  searchParams?: { season?: string; teamId?: string; view?: string; competitionId?: string };
}) {
  const displayMode = await getDisplayMode(searchParams?.view);
  const seasons = await prisma.season.findMany({
    orderBy: { year: 'desc' },
  });
  const seasonIds = seasons.map((season) => season.id);
  const allTeams = seasonIds.length
    ? await prisma.team.findMany({
        where: { seasonId: { in: seasonIds } },
        select: { id: true, seasonId: true, nameHe: true, nameEn: true },
        orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
      })
    : [];
  const competitions = await prisma.competition.findMany({
    select: { id: true, nameHe: true, nameEn: true },
    orderBy: { nameHe: 'asc' },
  });

  const selectedSeasonId = searchParams?.season || seasons.find((season) => season.year <= 2025)?.id || seasons[0]?.id;
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) || seasons[0] || null;
  const selectedCompetitionId = searchParams?.competitionId || DEFAULT_COMPETITION_ID;
  const filterByCompetition = selectedCompetitionId !== 'all';
  const displayZeroStatPlayers = await getDisplayZeroStatPlayersSetting();

  const teams = selectedSeason
    ? await prisma.team.findMany({
        where: { seasonId: selectedSeason.id },
        orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
      })
    : [];

  // Find team IDs that participate in the selected competition (have games/standings)
  const competitionTeamIds = filterByCompetition && selectedSeason
    ? new Set(
        (await prisma.game.findMany({
          where: { seasonId: selectedSeason.id, competitionId: selectedCompetitionId },
          select: { homeTeamId: true, awayTeamId: true },
        })).flatMap((g) => [g.homeTeamId, g.awayTeamId])
      )
    : null;

  const selectedTeamId = searchParams?.teamId || 'all';
  const playersFilterFields = buildPlayersFilterFields({
    displayMode,
    seasons,
    allTeams,
    competitions,
  });

  const teamFilter = selectedTeamId !== 'all'
    ? { teamId: selectedTeamId }
    : competitionTeamIds
      ? { teamId: { in: Array.from(competitionTeamIds) } }
      : {};

  const players = selectedSeason
    ? await prisma.player.findMany({
        where: {
          team: {
            seasonId: selectedSeason.id,
          },
          ...teamFilter,
        },
        include: {
          team: true,
          playerStats: {
            where: {
              seasonId: selectedSeason.id,
              ...(filterByCompetition ? { competitionId: selectedCompetitionId } : {}),
            },
          },
          uploads: {
            orderBy: [{ createdAt: 'asc' }],
          },
        },
        orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
      })
    : [];

  const playerIds = players.map((player) => player.id);

  const seasonalEvidencePlayerIds = selectedSeason && playerIds.length > 0
    ? new Set(
        [
          ...(await prisma.gameLineupEntry.findMany({
            where: {
              playerId: { in: playerIds },
              game: { seasonId: selectedSeason.id },
            },
            select: { playerId: true },
          })).map((entry) => entry.playerId),
          ...(await prisma.playerInjury.findMany({
            where: {
              playerId: { in: playerIds },
              seasonId: selectedSeason.id,
            },
            select: { playerId: true },
          })).flatMap((entry) => (entry.playerId ? [entry.playerId] : [])),
          ...(await prisma.playerSidelinedEntry.findMany({
            where: {
              playerId: { in: playerIds },
              seasonId: selectedSeason.id,
            },
            select: { playerId: true },
          })).flatMap((entry) => (entry.playerId ? [entry.playerId] : [])),
          ...(await prisma.playerTransfer.findMany({
            where: {
              playerId: { in: playerIds },
              seasonId: selectedSeason.id,
            },
            select: { playerId: true },
          })).flatMap((entry) => (entry.playerId ? [entry.playerId] : [])),
          ...(await prisma.playerTrophy.findMany({
            where: {
              playerId: { in: playerIds },
              seasonId: selectedSeason.id,
            },
            select: { playerId: true },
          })).flatMap((entry) => (entry.playerId ? [entry.playerId] : [])),
          ...(await prisma.gameEvent.findMany({
            where: {
              game: { seasonId: selectedSeason.id },
              OR: [{ playerId: { in: playerIds } }, { relatedPlayerId: { in: playerIds } }],
            },
            select: { playerId: true, relatedPlayerId: true },
          })).flatMap((entry) => [entry.playerId, entry.relatedPlayerId].filter(Boolean) as string[]),
        ].filter(Boolean)
      )
    : new Set<string>();

  const seasonGames = selectedSeason
    ? await prisma.game.findMany({
        where: {
          seasonId: selectedSeason.id,
          ...(filterByCompetition ? { competitionId: selectedCompetitionId } : {}),
        },
        include: {
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
      })
    : [];

  const visiblePlayers = players
    .map((player) => {
      const derivedStat = derivePlayerDeepStats(
        player.id,
        seasonGames.filter((game) => game.homeTeamId === player.teamId || game.awayTeamId === player.teamId)
      );
      // Prefer DB stats (authoritative from IFA/API) over derived (event-counted) when available
      const dbStat = player.playerStats[0] || null;
      const hasDbStat = dbStat && (dbStat.gamesPlayed > 0 || dbStat.goals > 0);
      const pickField = (derived: number, db: number | undefined) => hasDbStat && (db ?? 0) > 0 ? db! : Math.max(derived, db ?? 0);
      const stat = hasDbStat
        ? {
            ...derivedStat,
            gamesPlayed: pickField(derivedStat.gamesPlayed, dbStat.gamesPlayed),
            goals: pickField(derivedStat.goals, dbStat.goals),
            assists: pickField(derivedStat.assists, dbStat.assists),
            yellowCards: pickField(derivedStat.yellowCards, dbStat.yellowCards),
            redCards: pickField(derivedStat.redCards, dbStat.redCards),
            minutesPlayed: pickField(derivedStat.minutesPlayed, dbStat.minutesPlayed),
            starts: pickField(derivedStat.starts, dbStat.starts),
            substituteAppearances: pickField(derivedStat.substituteAppearances, dbStat.substituteAppearances),
          }
        : derivedStat;
      const hasSeasonStats =
        player.playerStats.some((row) =>
          row.gamesPlayed > 0 || row.minutesPlayed > 0 || row.goals > 0 || row.assists > 0 ||
          row.yellowCards > 0 || row.redCards > 0 || row.substituteAppearances > 0 || row.timesSubbedOff > 0
        ) ||
        stat.gamesPlayed > 0 ||
        stat.minutesPlayed > 0 ||
        stat.goals > 0 ||
        stat.assists > 0;

      return {
        ...player,
        stat,
        isZeroStatPlayer: !hasSeasonStats && !seasonalEvidencePlayerIds.has(player.id),
      };
    })
    .filter((player) => (displayZeroStatPlayers ? true : !player.isZeroStatPlayer))
    .sort((left, right) => {
      if (left.isZeroStatPlayer !== right.isZeroStatPlayer) {
        return left.isZeroStatPlayer ? 1 : -1;
      }

      return formatPlayerName(left).localeCompare(formatPlayerName(right), 'he');
    });

  const mainPlayers = visiblePlayers.filter((player) => !player.isZeroStatPlayer);
  const zeroStatPlayers = visiblePlayers.filter((player) => player.isZeroStatPlayer);

  if (displayMode === 'premier') {
    return (
      <PremierPlayersView
        seasons={seasons}
        selectedSeason={selectedSeason}
        selectedSeasonId={selectedSeasonId || ''}
        competitions={competitions}
        selectedCompetitionId={selectedCompetitionId}
        teams={teams}
        allTeams={allTeams}
        selectedTeamId={selectedTeamId}
        visiblePlayers={visiblePlayers}
        mainPlayers={mainPlayers}
        zeroStatPlayers={zeroStatPlayers}
      />
    );
  }

  return (
    <div dir="rtl" className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="modern-card rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm md:p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--accent)]">שחקנים</p>
          <h1 className="mt-2 text-3xl font-black text-stone-900 md:text-4xl">מרכז השחקנים</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
            כאן אפשר לראות תמונות שחקנים, נתוני עונה מרכזיים, ולפתוח פרופיל מלא לכל שחקן.
          </p>

          <SmartFilterForm
            action="/players"
            hiddenFields={{ view: displayMode }}
            fields={playersFilterFields}
            initialValues={{
              season: selectedSeason?.id || '',
              competitionId: selectedCompetitionId,
              teamId: selectedTeamId,
            }}
            formClassName="mt-6 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]"
            buttonClassName="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
            submitLabel="הצג"
          />
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {mainPlayers.map((player) => {
            const displayPhoto = player.photoUrl || player.uploads[0]?.filePath || null;
            const playerDisplayName = formatPlayerName(player);

            return (
              <Link
                key={player.id}
                href={`/players/${player.canonicalPlayerId || player.id}?season=${selectedSeasonId}`}
                className="modern-card rounded-xl border border-stone-200/80 bg-white p-5 shadow-sm transition hover:border-[var(--accent)]/30 hover:shadow-md"
              >
                <div className="flex items-center gap-4">
                  <PlayerPhoto
                    src={displayPhoto}
                    alt={playerDisplayName}
                    className="h-16 w-16 rounded-full border border-stone-200 bg-stone-50 object-cover"
                    fallbackClassName="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-glow)] text-sm font-black text-[var(--accent-text)]"
                  />
                  <div>
                    <h2 className="text-lg font-black text-stone-900">{playerDisplayName}</h2>
                    <div className="mt-0.5 text-sm text-stone-500">{player.team.nameHe || player.team.nameEn}</div>
                    <div className="mt-0.5 text-xs text-stone-400">
                      {player.position || 'ללא עמדה'} · #{player.jerseyNumber ?? '-'}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                  <PlayerMetric label="שערים" value={String(player.stat.goals)} />
                  <PlayerMetric label="בישולים" value={String(player.stat.assists)} />
                  <PlayerMetric label="דקות" value={String(player.stat.minutesPlayed)} />
                  <PlayerMetric label="פתיחות" value={String(player.stat.starts)} />
                </div>
              </Link>
            );
          })}
        </section>

        {displayZeroStatPlayers && zeroStatPlayers.length > 0 ? (
          <section className="space-y-4">
            <div className="rounded-xl border border-stone-200 bg-stone-50 px-5 py-4">
              <h2 className="text-base font-black text-stone-600">שחקנים ללא סטטיסטיקות עונתיות</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {zeroStatPlayers.map((player) => {
                const displayPhoto = player.photoUrl || player.uploads[0]?.filePath || null;
                const playerDisplayName = formatPlayerName(player);

                return (
                  <Link
                    key={player.id}
                    href={`/players/${player.canonicalPlayerId || player.id}?season=${selectedSeasonId}`}
                    className="rounded-xl border border-stone-200 bg-stone-50 p-4 transition hover:border-stone-300"
                  >
                    <div className="flex items-center gap-3">
                      <PlayerPhoto
                        src={displayPhoto}
                        alt={playerDisplayName}
                        className="h-12 w-12 rounded-full border border-stone-200 bg-white object-cover grayscale"
                        fallbackClassName="flex h-12 w-12 items-center justify-center rounded-full bg-stone-200 text-xs font-black text-stone-400"
                      />
                      <div>
                        <h2 className="font-bold text-stone-600">{playerDisplayName}</h2>
                        <div className="text-xs text-stone-400">{player.team.nameHe || player.team.nameEn}</div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function PremierPlayersView({
  seasons,
  selectedSeason,
  selectedSeasonId,
  competitions,
  selectedCompetitionId,
  teams,
  allTeams,
  selectedTeamId,
  visiblePlayers,
  mainPlayers,
  zeroStatPlayers,
}: {
  seasons: Array<{ id: string; name: string }>;
  selectedSeason: { id: string; name: string } | null;
  selectedSeasonId: string;
  competitions: Array<{ id: string; nameHe: string | null; nameEn: string }>;
  selectedCompetitionId: string;
  teams: Array<{ id: string; nameHe: string | null; nameEn: string }>;
  allTeams: Array<{ id: string; seasonId: string; nameHe: string | null; nameEn: string }>;
  selectedTeamId: string;
  visiblePlayers: any[];
  mainPlayers: any[];
  zeroStatPlayers: any[];
}) {
  const playersFilterFields = buildPlayersFilterFields({
    displayMode: 'premier',
    seasons,
    allTeams,
    competitions,
  });
  const activePlayers = visiblePlayers.filter((player) => player.stat.gamesPlayed > 0 || player.stat.minutesPlayed > 0);
  const topContributors = [...activePlayers]
    .sort((a, b) => b.stat.goals + b.stat.assists - (a.stat.goals + a.stat.assists))
    .slice(0, 3);

  return (
    <div dir="rtl" className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="modern-card rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--accent)]">שחקנים</p>
              <h1 className="text-3xl font-black text-stone-900 md:text-4xl">מרכז השחקנים</h1>
              <p className="text-sm leading-6 text-stone-600">
                תמונות שחקנים, נתוני עונה מרכזיים, וטבלת סגל לכל קבוצה.
              </p>
            </div>

            <SmartFilterForm
              action="/players"
              hiddenFields={{ view: 'premier' }}
              fields={playersFilterFields}
              initialValues={{
                season: selectedSeason?.id || '',
                competitionId: selectedCompetitionId,
                teamId: selectedTeamId,
              }}
              formClassName="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]"
              buttonClassName="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
              submitLabel="הצג"
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-full border border-[var(--accent)]/20 bg-[var(--accent-glow)] px-3 py-1.5 text-xs font-bold text-[var(--accent-text)]">{selectedSeason?.name || '-'}</span>
            <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-600">{visiblePlayers.length} שחקנים</span>
            <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-600">{activePlayers.length} פעילים</span>
          </div>
        </section>

        {topContributors.length > 0 ? (
          <section className="grid gap-4 lg:grid-cols-3">
            {topContributors.map((player, index) => {
              const displayPhoto = player.photoUrl || player.uploads[0]?.filePath || null;
              return (
                <Link
                  key={player.id}
                  href={`/players/${player.canonicalPlayerId || player.id}?season=${selectedSeasonId}&view=premier`}
                  className="modern-card overflow-hidden rounded-xl border border-stone-200/80 bg-white p-5 shadow-sm transition hover:border-[var(--accent)]/30 hover:shadow-md"
                >
                  <div className="mb-3 inline-flex rounded-full bg-[var(--accent-glow)] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[var(--accent-text)]">
                    #{index + 1} מוביל
                  </div>
                  <div className="flex items-center gap-4">
                    <PlayerPhoto
                      src={displayPhoto}
                      alt={formatPlayerName(player)}
                      className="h-16 w-16 rounded-full bg-stone-50 object-cover"
                      fallbackClassName="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-glow)] text-sm font-black text-[var(--accent-text)]"
                    />
                    <div>
                      <div className="text-lg font-black text-stone-900">{formatPlayerName(player)}</div>
                      <div className="mt-0.5 text-sm font-semibold text-stone-500">{player.team.nameHe || player.team.nameEn}</div>
                      <div className="mt-0.5 text-xs text-stone-400">
                        {player.position || 'ללא עמדה'} · #{player.jerseyNumber ?? '-'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-2">
                    <PlayerMetric label="שערים" value={String(player.stat.goals)} />
                    <PlayerMetric label="בישולים" value={String(player.stat.assists)} />
                    <PlayerMetric label="הופעות" value={String(player.stat.gamesPlayed)} />
                    <PlayerMetric label="דקות" value={String(player.stat.minutesPlayed)} />
                  </div>
                </Link>
              );
            })}
          </section>
        ) : null}

        <section className="modern-card overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-stone-100 px-6 py-5">
            <h2 className="border-r-[3px] border-[var(--accent)] pr-3 text-xl font-black text-stone-900">טבלת סגל</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1000px] w-full text-right">
              <thead>
                <tr className="bg-stone-50/80 text-[11px] font-black uppercase tracking-[0.15em] text-stone-400">
                  <th className="px-4 py-3">שחקן</th>
                  <th className="px-4 py-3">קבוצה</th>
                  <th className="px-4 py-3">עמדה</th>
                  <th className="px-4 py-3 text-center">מס׳</th>
                  <th className="px-4 py-3 text-center">הופעות</th>
                  <th className="px-4 py-3 text-center">שערים</th>
                  <th className="px-4 py-3 text-center">בישולים</th>
                  <th className="px-4 py-3 text-center">דקות</th>
                  <th className="px-4 py-3 text-center">פתיחות</th>
                  <th className="px-4 py-4 text-center">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {visiblePlayers.map((player) => {
                  const displayPhoto = player.photoUrl || player.uploads[0]?.filePath || null;
                  return (
                    <tr key={player.id} className={`border-b border-stone-100 text-sm transition ${player.isZeroStatPlayer ? 'text-stone-400' : 'hover:bg-stone-50/70'}`}>
                      <td className="px-4 py-3">
                        <Link
                          href={`/players/${player.canonicalPlayerId || player.id}?season=${selectedSeasonId}`}
                          className="flex items-center gap-3 transition hover:text-[var(--accent)]"
                        >
                          <PlayerPhoto
                            src={displayPhoto}
                            alt={formatPlayerName(player)}
                            className={`h-10 w-10 rounded-full object-cover ${player.isZeroStatPlayer ? 'grayscale' : ''}`}
                            fallbackClassName="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-glow)] text-[10px] font-black text-[var(--accent-text)]"
                          />
                          <div>
                            <div className={`font-bold ${player.isZeroStatPlayer ? 'text-stone-400' : 'text-stone-900'}`}>{formatPlayerName(player)}</div>
                            <div className="text-xs text-stone-400">
                              {player.nationalityHe || player.nationalityEn || player.birthCountryHe || player.birthCountryEn || 'ללא לאום'}
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-semibold text-stone-700">{player.team.nameHe || player.team.nameEn}</td>
                      <td className="px-4 py-3 text-stone-500">{player.position || '-'}</td>
                      <td className="px-4 py-3 text-center font-semibold">{player.jerseyNumber ?? '-'}</td>
                      <td className="px-4 py-3 text-center font-semibold">{player.stat.gamesPlayed}</td>
                      <td className="px-4 py-3 text-center font-black text-[var(--accent)]">{player.stat.goals || '-'}</td>
                      <td className="px-4 py-3 text-center font-black text-emerald-600">{player.stat.assists || '-'}</td>
                      <td className="px-4 py-3 text-center text-stone-500">{player.stat.minutesPlayed}</td>
                      <td className="px-4 py-3 text-center text-stone-500">{player.stat.starts}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ${
                          player.isZeroStatPlayer ? 'bg-stone-100 text-stone-400' : 'bg-[var(--accent-glow)] text-[var(--accent-text)]'
                        }`}>
                          {player.isZeroStatPlayer ? 'ללא נתונים' : 'פעיל'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {zeroStatPlayers.length > 0 ? (
          <section className="modern-card rounded-xl border border-stone-200/80 bg-white p-5 shadow-sm">
            <h2 className="text-base font-black text-stone-600">שחקנים ללא סטטיסטיקה ({zeroStatPlayers.length})</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {zeroStatPlayers.map((player) => (
                <Link
                  key={player.id}
                  href={`/players/${player.canonicalPlayerId || player.id}?season=${selectedSeasonId}&view=premier`}
                  className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300"
                >
                  {formatPlayerName(player)} | {player.team.nameHe || player.team.nameEn}
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="modern-card rounded-xl border border-stone-200/80 bg-white p-4 shadow-sm">
      <div className="text-xs font-bold uppercase tracking-wider text-stone-400">{label}</div>
      <div className="mt-2 text-2xl font-black text-stone-900">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-stone-50 px-2 py-2 text-center">
      <div className="text-[10px] font-semibold text-stone-400">{label}</div>
      <div className="mt-1 text-base font-black text-stone-900">{value}</div>
    </div>
  );
}

function PlayerMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-stone-50 px-2 py-2">
      <div className="text-[10px] font-semibold text-stone-400">{label}</div>
      <div className="mt-1 text-base font-black text-stone-900">{value}</div>
    </div>
  );
}
