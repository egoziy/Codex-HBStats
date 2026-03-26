import Link from 'next/link';
import { derivePlayerDeepStats } from '@/lib/deep-stats';
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
          {players.map((player) => {
            const stat = derivePlayerDeepStats(
              player.id,
              seasonGames.filter((game) => game.homeTeamId === player.teamId || game.awayTeamId === player.teamId)
            );
            const displayPhoto = player.photoUrl || player.uploads[0]?.filePath || null;

            return (
              <Link
                key={player.id}
                href={`/players/${player.id}`}
                className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm transition hover:border-red-300"
              >
                <div className="flex items-center gap-4">
                  {displayPhoto ? (
                    <img
                      src={displayPhoto}
                      alt={player.nameHe || player.nameEn}
                      className="h-20 w-20 rounded-full border border-stone-200 bg-stone-50 object-cover"
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-stone-300 bg-stone-50 text-xs text-stone-400">
                      ללא תמונה
                    </div>
                  )}
                  <div>
                    <h2 className="text-xl font-black text-stone-900">{player.nameHe || player.nameEn}</h2>
                    <div className="mt-1 text-sm text-stone-500">{player.team.nameHe || player.team.nameEn}</div>
                    <div className="mt-1 text-sm text-stone-500">
                      {player.position || 'ללא עמדה'} | #{player.jerseyNumber ?? '-'}
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                  <PlayerMetric label="שערים" value={String(stat?.goals ?? 0)} />
                  <PlayerMetric label="בישולים" value={String(stat?.assists ?? 0)} />
                  <PlayerMetric label="דקות" value={String(stat.minutesPlayed)} />
                  <PlayerMetric label="פתיחות" value={String(stat.starts)} />
                  <PlayerMetric label="מחליף" value={String(stat.substituteAppearances)} />
                  <PlayerMetric label="צהובים" value={String(stat.yellowCards)} />
                </div>
              </Link>
            );
          })}
        </section>
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
