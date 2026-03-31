import Link from 'next/link';
import { derivePlayerDeepStats } from '@/lib/deep-stats';
import { getDisplayZeroStatPlayersSetting } from '@/lib/player-zero-stat-settings';
import { formatPlayerName } from '@/lib/player-display';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function PlayersPage({
  searchParams,
}: {
  searchParams?: { season?: string; teamId?: string };
}) {
  const seasons = await prisma.season.findMany({
    orderBy: { year: 'desc' },
    take: 10,
  });

  const selectedSeasonId = searchParams?.season || seasons.find((season) => season.year <= 2025)?.id || seasons[0]?.id;
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) || seasons[0] || null;
  const displayZeroStatPlayers = await getDisplayZeroStatPlayersSetting();

  const teams = selectedSeason
    ? await prisma.team.findMany({
        where: { seasonId: selectedSeason.id },
        orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
      })
    : [];

  const selectedTeamId = searchParams?.teamId || 'all';

  const players = selectedSeason
    ? await prisma.player.findMany({
        where: {
          team: {
            seasonId: selectedSeason.id,
          },
          ...(selectedTeamId !== 'all' ? { teamId: selectedTeamId } : {}),
        },
        include: {
          team: true,
          playerStats: {
            where: { seasonId: selectedSeason.id },
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
        where: { seasonId: selectedSeason.id },
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
      const stat = derivePlayerDeepStats(
        player.id,
        seasonGames.filter((game) => game.homeTeamId === player.teamId || game.awayTeamId === player.teamId)
      );
      const hasSeasonStats =
        player.playerStats.some((row) => row.gamesPlayed > 0 || row.minutesPlayed > 0) ||
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

  return (
    <div className="min-h-screen bg-stone-100 px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Players</p>
          <h1 className="mt-2 text-3xl font-black text-stone-900">מרכז השחקנים</h1>
          <p className="mt-3 max-w-3xl text-stone-600">
            כאן אפשר לראות תמונות שחקנים, נתוני עונה מרכזיים, ולפתוח פרופיל מלא לכל שחקן.
          </p>

          <form className="mt-6 grid gap-4 md:grid-cols-[1fr_1fr_auto]" action="/players">
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

            <button className="rounded-full bg-stone-900 px-5 py-3 font-bold text-white">הצג שחקנים</button>
          </form>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {mainPlayers.map((player) => {
            const displayPhoto = player.photoUrl || player.uploads[0]?.filePath || null;
            const playerDisplayName = formatPlayerName(player);

            return (
              <Link
                key={player.id}
                href={`/players/${player.canonicalPlayerId || player.id}?season=${selectedSeasonId}`}
                className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm transition hover:border-red-300"
              >
                <div className="flex items-center gap-4">
                  {displayPhoto ? (
                    <img
                      src={displayPhoto}
                      alt={playerDisplayName}
                      className="h-20 w-20 rounded-full border border-stone-200 bg-stone-50 object-cover"
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-stone-300 bg-stone-50 text-xs text-stone-400">
                      ללא תמונה
                    </div>
                  )}
                  <div>
                    <h2 className="text-xl font-black text-stone-900">{playerDisplayName}</h2>
                    <div className="mt-1 text-sm text-stone-500">{player.team.nameHe || player.team.nameEn}</div>
                    <div className="mt-1 text-sm text-stone-500">
                      {player.position || 'ללא עמדה'} | #{player.jerseyNumber ?? '-'}
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-4 gap-3 text-center">
                  <PlayerMetric label="שערים" value={String(player.stat.goals)} />
                  <PlayerMetric label="בישולים" value={String(player.stat.assists)} />
                  <PlayerMetric label="דקות" value={String(player.stat.minutesPlayed)} />
                  <PlayerMetric label="פתיחות" value={String(player.stat.starts)} />
                  <PlayerMetric label="נרשם כמחליף" value={String(player.stat.benchAppearances)} />
                  <PlayerMetric label="מחליף" value={String(player.stat.substituteAppearances)} />
                  <PlayerMetric label="צהובים" value={String(player.stat.yellowCards)} />
                  <PlayerMetric label="אדומים" value={String(player.stat.redCards)} />
                </div>
              </Link>
            );
          })}
        </section>

        {displayZeroStatPlayers && zeroStatPlayers.length > 0 ? (
          <section className="space-y-4">
            <div className="rounded-[24px] border border-stone-200 bg-stone-50 p-5">
              <h2 className="text-xl font-black text-stone-700">שחקנים ללא סטטיסטיקות עונתיות</h2>
              <p className="mt-2 text-sm text-stone-500">
                שחקנים שהגיעו מה־API לעונה הזו, אך אין להם הופעות, דקות או נתוני עונה ממשיים.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {zeroStatPlayers.map((player) => {
                const displayPhoto = player.photoUrl || player.uploads[0]?.filePath || null;
                const playerDisplayName = formatPlayerName(player);

                return (
                  <Link
                    key={player.id}
                    href={`/players/${player.canonicalPlayerId || player.id}?season=${selectedSeasonId}`}
                    className="rounded-[24px] border border-stone-200 bg-stone-50 p-5 shadow-sm transition hover:border-stone-300"
                  >
                    <div className="flex items-center gap-4">
                      {displayPhoto ? (
                        <img
                          src={displayPhoto}
                          alt={playerDisplayName}
                          className="h-20 w-20 rounded-full border border-stone-200 bg-white object-cover grayscale"
                        />
                      ) : (
                        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-stone-300 bg-white text-xs text-stone-400">
                          ללא תמונה
                        </div>
                      )}
                      <div>
                        <div className="mb-1 inline-flex rounded-full bg-stone-200 px-3 py-1 text-xs font-bold text-stone-600">
                          0 סטטיסטיקות
                        </div>
                        <h2 className="text-xl font-black text-stone-700">{playerDisplayName}</h2>
                        <div className="mt-1 text-sm text-stone-500">{player.team.nameHe || player.team.nameEn}</div>
                        <div className="mt-1 text-sm text-stone-500">
                          {player.position || 'ללא עמדה'} | #{player.jerseyNumber ?? '-'}
                        </div>
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

function PlayerMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-stone-50 px-3 py-3">
      <div className="text-xs font-semibold text-stone-500">{label}</div>
      <div className="mt-2 text-lg font-black text-stone-900">{value}</div>
    </div>
  );
}
