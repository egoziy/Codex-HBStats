import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getDisplayMode } from '@/lib/display-mode';
import prisma from '@/lib/prisma';
import { getCompetitionDisplayName, getGameScoreDisplay, getRoundDisplayName } from '@/lib/competition-display';
import { formatPlayerName } from '@/lib/player-display';

export const dynamic = 'force-dynamic';

const eventLabels: Record<string, string> = {
  GOAL: 'שער',
  ASSIST: 'בישול',
  YELLOW_CARD: 'כרטיס צהוב',
  RED_CARD: 'כרטיס אדום',
  SUBSTITUTION_IN: 'חילוף נכנס',
  SUBSTITUTION_OUT: 'חילוף יוצא',
  OWN_GOAL: 'שער עצמי',
  PENALTY_GOAL: 'פנדל',
  PENALTY_MISSED: 'פנדל מוחמץ',
};

export default async function GamesPage({
  searchParams,
}: {
  searchParams?: {
    season?: string;
    competitionId?: string;
    round?: string;
    teamId?: string;
    view?: string;
  };
}) {
  const displayMode = await getDisplayMode(searchParams?.view);
  const currentUser = await getCurrentUser();
  const seasons = await prisma.season.findMany({
    orderBy: { year: 'desc' },
    take: 10,
  });

  const selectedSeasonId = searchParams?.season || seasons[0]?.id || null;
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) || seasons[0] || null;

  const competitions = selectedSeason
    ? await prisma.competition.findMany({
        where: {
          games: {
            some: {
              seasonId: selectedSeason.id,
            },
          },
        },
        orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
      })
    : [];

  const teams = selectedSeason
    ? await prisma.team.findMany({
        where: { seasonId: selectedSeason.id },
        orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
      })
    : [];

  const selectedCompetitionId = searchParams?.competitionId || 'all';
  const selectedTeamId = searchParams?.teamId || 'all';

  const roundSourceGames = selectedSeason
    ? await prisma.game.findMany({
        where: {
          seasonId: selectedSeason.id,
          ...(selectedCompetitionId !== 'all' ? { competitionId: selectedCompetitionId } : {}),
          ...(selectedTeamId !== 'all'
            ? {
                OR: [{ homeTeamId: selectedTeamId }, { awayTeamId: selectedTeamId }],
              }
            : {}),
        },
        select: {
          roundNameHe: true,
          roundNameEn: true,
        },
        orderBy: { dateTime: 'desc' },
      })
    : [];

  const rounds = Array.from(
    new Set(
      roundSourceGames
        .map((game) => game.roundNameHe || game.roundNameEn)
        .filter((value): value is string => Boolean(value))
    )
  );

  const selectedRound = searchParams?.round || 'all';

  const games = selectedSeason
    ? await prisma.game.findMany({
        where: {
          seasonId: selectedSeason.id,
          ...(selectedCompetitionId !== 'all' ? { competitionId: selectedCompetitionId } : {}),
          ...(selectedTeamId !== 'all'
            ? {
                OR: [{ homeTeamId: selectedTeamId }, { awayTeamId: selectedTeamId }],
              }
            : {}),
          ...(selectedRound !== 'all'
            ? {
                OR: [{ roundNameHe: selectedRound }, { roundNameEn: selectedRound }],
              }
            : {}),
        },
        include: {
          homeTeam: true,
          awayTeam: true,
          competition: true,
          events: {
            include: {
              player: true,
              relatedPlayer: true,
            },
            orderBy: [{ minute: 'asc' }, { sortOrder: 'asc' }],
            take: 8,
          },
        },
        orderBy: [{ dateTime: 'desc' }],
      })
    : [];

  return (
    <div className={`min-h-screen px-4 py-8 ${displayMode === 'premier' ? 'bg-[linear-gradient(180deg,#f7fbff_0%,#edf2ff_100%)]' : 'bg-stone-100'}`}>
      <div className="mx-auto max-w-7xl space-y-6">
        <section className={`rounded-[28px] border p-6 shadow-sm ${displayMode === 'premier' ? 'border-white/70 bg-[linear-gradient(140deg,#12002f,#4a006f_48%,#05a3d6)] text-white' : 'border-stone-200 bg-white'}`}>
          <p className={`text-sm font-semibold tracking-[0.25em] ${displayMode === 'premier' ? 'text-cyan-100' : 'text-amber-700'}`}>משחקים</p>
          <h1 className="mt-2 text-3xl font-black text-stone-900">מרכז המשחקים</h1>
          <p className="mt-3 max-w-3xl text-stone-600">
            בחרו עונה, ליגה או גביע, מחזור וקבוצה כדי לראות את רשימת המשחקים ואת האירועים המרכזיים בכל משחק.
          </p>

          <form className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]" action="/games">
            <input type="hidden" name="view" value={displayMode} />
            <select
              name="season"
              defaultValue={selectedSeason?.id || ''}
              className={`rounded-2xl px-4 py-3 font-semibold ${displayMode === 'premier' ? 'border border-white/40 bg-white text-slate-950' : 'border border-stone-300 bg-stone-50'}`}
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
              className={`rounded-2xl px-4 py-3 font-semibold ${displayMode === 'premier' ? 'border border-white/40 bg-white text-slate-950' : 'border border-stone-300 bg-stone-50'}`}
            >
              <option value="all">כל המסגרות</option>
              {competitions.map((competition) => (
                <option key={competition.id} value={competition.id}>
                  {getCompetitionDisplayName(competition)}
                </option>
              ))}
            </select>

            <select
              name="round"
              defaultValue={selectedRound}
              className={`rounded-2xl px-4 py-3 font-semibold ${displayMode === 'premier' ? 'border border-white/40 bg-white text-slate-950' : 'border border-stone-300 bg-stone-50'}`}
            >
              <option value="all">כל המחזורים</option>
              {rounds.map((round) => (
                <option key={round} value={round}>
                  {getRoundDisplayName(round, round)}
                </option>
              ))}
            </select>

            <select
              name="teamId"
              defaultValue={selectedTeamId}
              className={`rounded-2xl px-4 py-3 font-semibold ${displayMode === 'premier' ? 'border border-white/40 bg-white text-slate-950' : 'border border-stone-300 bg-stone-50'}`}
            >
              <option value="all">כל הקבוצות</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.nameHe || team.nameEn}
                </option>
              ))}
            </select>

            <button className="rounded-full bg-stone-900 px-5 py-3 font-bold text-white">סנן משחקים</button>
          </form>
        </section>

        <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-stone-900">רשימת משחקים</h2>
              <p className="mt-2 text-sm text-stone-600">נמצאו {games.length} משחקים לפי הסינון הנוכחי.</p>
            </div>
          </div>

          <div className="space-y-4">
            {games.map((game) => (
              <article key={game.id} className="overflow-hidden rounded-[24px] border border-stone-200 bg-stone-50">
                <div className="grid gap-4 p-5 md:grid-cols-[1fr_auto_1fr] md:items-center">
                  <div className="text-center md:text-left">
                    <div className="text-lg font-black text-stone-900">{game.homeTeam.nameHe || game.homeTeam.nameEn}</div>
                    <div className="text-sm text-stone-500">{game.homeTeam.nameEn}</div>
                  </div>
                  <div className="text-center">
                    <div className="inline-flex rounded-full bg-stone-900 px-5 py-3 text-xl font-black text-white">
                      {getGameScoreDisplay(game)}
                    </div>
                    <div className="mt-3 text-sm font-semibold text-stone-700">
                      {getCompetitionDisplayName(game.competition)}
                    </div>
                    <div className="mt-1 text-xs text-stone-500">{getRoundDisplayName(game.roundNameHe, game.roundNameEn)}</div>
                    <div className="mt-1 text-xs text-stone-500">
                      {new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium', timeStyle: 'short' }).format(game.dateTime)}
                    </div>
                  </div>
                  <div className="text-center md:text-right">
                    <div className="text-lg font-black text-stone-900">{game.awayTeam.nameHe || game.awayTeam.nameEn}</div>
                    <div className="text-sm text-stone-500">{game.awayTeam.nameEn}</div>
                  </div>
                </div>

                <div className="border-t border-stone-200 bg-white px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link href={`/games/${game.id}?view=${displayMode}`} className="rounded-full bg-red-800 px-4 py-2 text-sm font-bold text-white">
                      לעמוד המשחק המלא
                    </Link>
                    {currentUser?.role === 'ADMIN' ? (
                      <Link
                        href={`/games/${game.id}?view=${displayMode}${displayMode === 'premier' ? '&tab=events' : ''}#admin-editor`}
                        className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-900"
                      >
                        עריכת אדמין
                      </Link>
                    ) : null}
                    <details className="group w-full md:w-auto">
                      <summary className="cursor-pointer list-none rounded-full border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700 transition hover:border-red-300 hover:text-red-800">
                        פתח אירועים מרכזיים
                      </summary>
                      <div className="mt-4 grid gap-3 md:min-w-[460px]">
                        {game.events.length > 0 ? (
                          game.events.map((event) => (
                            <div key={event.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="font-bold text-stone-900">{eventLabels[event.type] || event.type}</div>
                                <div className="text-sm font-semibold text-stone-600">
                                  {event.minute}
                                  {event.extraMinute ? `+${event.extraMinute}` : ''}
                                  &apos;
                                </div>
                              </div>
                              <div className="mt-2 text-sm text-stone-600">
                                {event.player ? formatPlayerName(event.player) : 'שחקן לא משויך'}
                                {event.relatedPlayer
                                  ? ` | ${formatPlayerName(event.relatedPlayer)}`
                                  : ''}
                              </div>
                              {event.notesHe ? <div className="mt-1 text-xs text-stone-500">{event.notesHe}</div> : null}
                            </div>
                          ))
                        ) : (
                          <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 text-sm text-stone-500">
                            אין אירועים שמורים למשחק הזה.
                          </div>
                        )}
                      </div>
                    </details>
                  </div>
                </div>
              </article>
            ))}

            {games.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-500">
                לא נמצאו משחקים לפי הסינון שבחרת.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
