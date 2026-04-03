import Link from 'next/link';
import { getDisplayMode } from '@/lib/display-mode';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function VenuesPage({
  searchParams,
}: {
  searchParams?: { q?: string; city?: string; view?: string };
}) {
  const displayMode = await getDisplayMode(searchParams?.view);
  const query = searchParams?.q?.trim() || '';
  const selectedCity = searchParams?.city || 'all';

  const citiesRaw = await prisma.venue.findMany({
    where: {
      cityHe: { not: null },
    },
    select: {
      cityHe: true,
      cityEn: true,
    },
    orderBy: [{ cityHe: 'asc' }, { cityEn: 'asc' }],
  });

  const cityOptions = Array.from(
    new Map(
      citiesRaw
        .filter((item) => item.cityHe || item.cityEn)
        .map((item) => [`${item.cityHe || item.cityEn}`, { key: item.cityHe || item.cityEn || '', label: item.cityHe || item.cityEn || '' }])
    ).values()
  );

  const venues = await prisma.venue.findMany({
    where: {
      ...(query
        ? {
            OR: [
              { nameHe: { contains: query, mode: 'insensitive' } },
              { nameEn: { contains: query, mode: 'insensitive' } },
              { cityHe: { contains: query, mode: 'insensitive' } },
              { cityEn: { contains: query, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(selectedCity !== 'all'
        ? {
            OR: [{ cityHe: selectedCity }, { cityEn: selectedCity }],
          }
        : {}),
    },
    include: {
      teams: {
        select: {
          id: true,
          nameHe: true,
          nameEn: true,
          season: {
            select: {
              name: true,
              year: true,
            },
          },
        },
        orderBy: [{ season: { year: 'desc' } }, { nameHe: 'asc' }, { nameEn: 'asc' }],
      },
      games: {
        include: {
          homeTeam: true,
          awayTeam: true,
        },
        orderBy: [{ dateTime: 'desc' }],
      },
    },
    orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
    take: 60,
  });

  const now = new Date();

  const venueCards = venues.map((venue) => {
    const uniqueTeams = Array.from(
      new Map(
        venue.teams.map((team) => [team.id, { id: team.id, name: team.nameHe || team.nameEn, seasonName: team.season.name }])
      ).values()
    );
    const completedGames = venue.games.filter((game) => game.status === 'COMPLETED');
    const upcomingGames = venue.games.filter((game) => game.dateTime >= now && game.status !== 'COMPLETED');
    const nextGame = [...upcomingGames].sort((left, right) => left.dateTime.getTime() - right.dateTime.getTime())[0] || null;

    return {
      ...venue,
      uniqueTeams,
      completedGamesCount: completedGames.length,
      upcomingGamesCount: upcomingGames.length,
      nextGame,
    };
  });

  return (
    <div className={`min-h-screen px-4 py-8 ${displayMode === 'premier' ? 'bg-[linear-gradient(180deg,#f7fbff_0%,#edf2ff_100%)]' : 'bg-stone-100'}`}>
      <div className="mx-auto max-w-7xl space-y-6">
        <section className={`rounded-[30px] border p-6 shadow-sm ${displayMode === 'premier' ? 'border-white/70 bg-[linear-gradient(140deg,#6a0014,#9f1239_45%,#f97316)] text-white' : 'border-stone-200 bg-white'}`}>
          <p className={`text-sm font-semibold tracking-[0.25em] ${displayMode === 'premier' ? 'text-orange-100' : 'text-amber-700'}`}>אצטדיונים</p>
          <h1 className={`mt-2 text-3xl font-black ${displayMode === 'premier' ? 'text-white' : 'text-stone-900'}`}>מרכז האצטדיונים</h1>
          <p className={`mt-3 max-w-3xl ${displayMode === 'premier' ? 'text-white/85' : 'text-stone-600'}`}>
            כאן אפשר לראות אצטדיונים, קיבולת, עיר, משטח, קבוצות בית ומשחקים שנשמרו אצלנו לכל איצטדיון.
          </p>

          <form className="mt-6 grid gap-4 md:grid-cols-[1.2fr_1fr_auto]" action="/venues">
            <input type="hidden" name="view" value={displayMode} />
            <input
              type="text"
              name="q"
              defaultValue={query}
              placeholder="חיפוש איצטדיון או עיר"
              className={`rounded-2xl px-4 py-3 font-semibold ${displayMode === 'premier' ? 'border border-white/40 bg-white text-slate-950' : 'border border-stone-300 bg-stone-50 text-stone-900'}`}
            />
            <select
              name="city"
              defaultValue={selectedCity}
              className={`rounded-2xl px-4 py-3 font-semibold ${displayMode === 'premier' ? 'border border-white/40 bg-white text-slate-950' : 'border border-stone-300 bg-stone-50 text-stone-900'}`}
            >
              <option value="all">כל הערים</option>
              {cityOptions.map((city) => (
                <option key={city.key} value={city.key}>
                  {city.label}
                </option>
              ))}
            </select>
            <button className="rounded-full bg-stone-900 px-5 py-3 font-bold text-white">הצג</button>
          </form>
        </section>

        <section className={`grid gap-4 md:grid-cols-3`}>
          <SummaryBox label="אצטדיונים" value={String(venueCards.length)} />
          <SummaryBox label="קבוצות בית" value={String(venueCards.reduce((sum, venue) => sum + venue.uniqueTeams.length, 0))} />
          <SummaryBox label="משחקים שמורים" value={String(venueCards.reduce((sum, venue) => sum + venue.games.length, 0))} />
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          {venueCards.map((venue) => (
            <article key={venue.id} className="overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-sm">
              <div className={`${displayMode === 'premier' ? 'bg-[linear-gradient(135deg,#7f1d1d,#1f2937)] text-white' : 'bg-stone-50 text-stone-900'} p-6`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-black">{venue.nameHe || venue.nameEn}</h2>
                    <p className={`mt-1 text-sm ${displayMode === 'premier' ? 'text-white/75' : 'text-stone-500'}`}>{venue.nameEn}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                      <span className={`${displayMode === 'premier' ? 'bg-white/10' : 'bg-white'} rounded-full px-3 py-1.5`}>
                        עיר: {venue.cityHe || venue.cityEn || 'לא זמין'}
                      </span>
                      <span className={`${displayMode === 'premier' ? 'bg-white/10' : 'bg-white'} rounded-full px-3 py-1.5`}>
                        קיבולת: {venue.capacity?.toLocaleString('he-IL') || 'לא ידוע'}
                      </span>
                      <span className={`${displayMode === 'premier' ? 'bg-white/10' : 'bg-white'} rounded-full px-3 py-1.5`}>
                        משטח: {venue.surface || 'לא ידוע'}
                      </span>
                    </div>
                  </div>
                  {venue.imageUrl ? (
                    <img src={venue.imageUrl} alt={venue.nameHe || venue.nameEn} className="h-24 w-36 rounded-2xl object-cover" />
                  ) : null}
                </div>
              </div>

              <div className="grid gap-6 p-6 md:grid-cols-[0.95fr_1.05fr]">
                <div className="space-y-4">
                  <div className="rounded-[22px] border border-stone-200 bg-stone-50 p-4">
                    <div className="text-sm font-black text-stone-900">קבוצות בית</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {venue.uniqueTeams.length > 0 ? (
                        venue.uniqueTeams.slice(0, 6).map((team) => (
                          <Link key={team.id} href={`/teams/${team.id}?view=${displayMode}`} className="rounded-full bg-white px-3 py-2 text-sm font-semibold text-stone-700 shadow-sm">
                            {team.name}
                          </Link>
                        ))
                      ) : (
                        <div className="text-sm text-stone-500">אין קבוצות מקושרות כרגע.</div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <MiniStat label="משחקים שהושלמו" value={String(venue.completedGamesCount)} />
                    <MiniStat label="משחקים קרובים" value={String(venue.upcomingGamesCount)} />
                  </div>
                </div>

                <div className="rounded-[22px] border border-stone-200 bg-stone-50 p-4">
                  <div className="text-sm font-black text-stone-900">המשחק הבא</div>
                  {venue.nextGame ? (
                    <Link href={`/games/${venue.nextGame.id}?view=${displayMode}`} className="mt-3 block rounded-[20px] bg-white p-4 shadow-sm transition hover:bg-stone-100">
                      <div className="text-xs font-semibold text-stone-500">
                        {new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium', timeStyle: 'short' }).format(venue.nextGame.dateTime)}
                      </div>
                      <div className="mt-2 text-base font-black text-stone-900">
                        {venue.nextGame.homeTeam.nameHe || venue.nextGame.homeTeam.nameEn} - {venue.nextGame.awayTeam.nameHe || venue.nextGame.awayTeam.nameEn}
                      </div>
                    </Link>
                  ) : (
                    <div className="mt-3 rounded-[20px] border border-dashed border-stone-300 bg-white p-4 text-sm text-stone-500">
                      אין משחק עתידי שמקושר כרגע לאיצטדיון הזה.
                    </div>
                  )}

                  <div className="mt-4 text-sm text-stone-600">
                    כתובת: {venue.addressHe || venue.addressEn || 'לא זמינה'}
                  </div>
                </div>
              </div>
            </article>
          ))}

          {venueCards.length === 0 ? (
            <div className="col-span-full rounded-[28px] border border-dashed border-stone-300 bg-white p-8 text-center text-stone-500">
              לא נמצאו אצטדיונים לפי הסינון הנוכחי.
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold tracking-[0.18em] text-stone-500">{label}</div>
      <div className="mt-2 text-3xl font-black text-stone-900">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-stone-200 bg-white p-4">
      <div className="text-xs font-semibold text-stone-500">{label}</div>
      <div className="mt-2 text-2xl font-black text-stone-900">{value}</div>
    </div>
  );
}
