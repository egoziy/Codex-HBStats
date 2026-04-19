import Link from 'next/link';
import { getDisplayMode } from '@/lib/display-mode';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function VenuesPage({
  searchParams,
}: {
  searchParams?: { q?: string; city?: string; season?: string; competition?: string; view?: string };
}) {
  const displayMode = await getDisplayMode(searchParams?.view);
  const query = searchParams?.q?.trim() || '';
  const selectedCity = searchParams?.city || 'all';
  const selectedSeasonId = searchParams?.season || 'all';
  const selectedCompetitionId = searchParams?.competition || 'all';

  // Fetch filter options
  const [citiesRaw, seasons, competitions] = await Promise.all([
    prisma.venue.findMany({
      where: { cityHe: { not: null } },
      select: { cityHe: true, cityEn: true },
      orderBy: [{ cityHe: 'asc' }, { cityEn: 'asc' }],
    }),
    prisma.season.findMany({
      select: { id: true, name: true, year: true },
      orderBy: { year: 'desc' },
    }),
    prisma.competition.findMany({
      select: { id: true, nameHe: true, nameEn: true },
      orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
    }),
  ]);

  const cityOptions = Array.from(
    new Map(
      citiesRaw
        .filter((item) => item.cityHe || item.cityEn)
        .map((item) => [`${item.cityHe || item.cityEn}`, { key: item.cityHe || item.cityEn || '', label: item.cityHe || item.cityEn || '' }])
    ).values()
  );

  // Build venue query filters
  const venueWhere: any = {};
  if (query) {
    venueWhere.OR = [
      { nameHe: { contains: query, mode: 'insensitive' } },
      { nameEn: { contains: query, mode: 'insensitive' } },
      { cityHe: { contains: query, mode: 'insensitive' } },
      { cityEn: { contains: query, mode: 'insensitive' } },
    ];
  }
  if (selectedCity !== 'all') {
    venueWhere.AND = [
      ...(venueWhere.AND || []),
      { OR: [{ cityHe: selectedCity }, { cityEn: selectedCity }] },
    ];
  }

  // If season or competition filter is active, restrict to venues used in matching games
  if (selectedSeasonId !== 'all' || selectedCompetitionId !== 'all') {
    const gameFilter: any = { venueId: { not: null } };
    if (selectedSeasonId !== 'all') gameFilter.seasonId = selectedSeasonId;
    if (selectedCompetitionId !== 'all') gameFilter.competitionId = selectedCompetitionId;
    const venueIds = (
      await prisma.game.findMany({
        where: gameFilter,
        select: { venueId: true },
        distinct: ['venueId'],
      })
    ).map((g) => g.venueId!);
    venueWhere.id = { in: venueIds };
  }

  const venues = await prisma.venue.findMany({
    where: venueWhere,
    include: {
      teams: {
        select: {
          id: true,
          nameHe: true,
          nameEn: true,
          season: { select: { name: true, year: true } },
        },
        orderBy: [{ season: { year: 'desc' } }, { nameHe: 'asc' }, { nameEn: 'asc' }],
      },
      games: {
        select: {
          id: true,
          dateTime: true,
          status: true,
          homeTeamId: true,
          homeTeam: { select: { nameHe: true, nameEn: true } },
          awayTeam: { select: { nameHe: true, nameEn: true } },
          competition: { select: { countryEn: true, countryHe: true } },
        },
        orderBy: [{ dateTime: 'desc' }],
      },
    },
    orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
    take: 60,
  });

  const now = new Date();

  // Determine Israeli venue IDs (venues used in Israeli competitions)
  const israeliVenueIdSet = new Set<string>();
  for (const venue of venues) {
    for (const game of venue.games) {
      if (game.competition?.countryEn === 'Israel' || game.competition?.countryHe === 'ישראל') {
        israeliVenueIdSet.add(venue.id);
        break;
      }
    }
  }

  const venueCards = venues.map((venue) => {
    // Deduplicate home teams: group seasons per team name
    const teamMap = new Map<string, { name: string; seasons: string[] }>();
    // From venue.teams (direct link)
    for (const team of venue.teams) {
      const name = team.nameHe || team.nameEn;
      const existing = teamMap.get(name);
      if (existing) {
        if (!existing.seasons.includes(team.season.name)) existing.seasons.push(team.season.name);
      } else {
        teamMap.set(name, { name, seasons: [team.season.name] });
      }
    }
    // From games (home team at this venue)
    for (const game of venue.games) {
      if (game.homeTeamId) {
        const name = game.homeTeam.nameHe || game.homeTeam.nameEn;
        if (!teamMap.has(name)) {
          teamMap.set(name, { name, seasons: [] });
        }
      }
    }

    const homeTeams = Array.from(teamMap.values());
    const completedGames = venue.games.filter((g) => g.status === 'COMPLETED');
    const upcomingGames = venue.games.filter((g) => g.dateTime >= now && g.status !== 'COMPLETED');
    const nextGame = [...upcomingGames].sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime())[0] || null;

    return {
      ...venue,
      homeTeams,
      isIsraeli: israeliVenueIdSet.has(venue.id),
      completedGamesCount: completedGames.length,
      upcomingGamesCount: upcomingGames.length,
      nextGame,
    };
  });

  // Sort: Israeli venues first, then alphabetically
  venueCards.sort((a, b) => {
    if (a.isIsraeli && !b.isIsraeli) return -1;
    if (!a.isIsraeli && b.isIsraeli) return 1;
    return (a.nameHe || a.nameEn).localeCompare(b.nameHe || b.nameEn, 'he');
  });

  return (
    <div dir="rtl" className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="modern-card rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm md:p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--accent)]">אצטדיונים</p>
          <h1 className="mt-2 text-3xl font-black text-stone-900 md:text-4xl">מרכז האצטדיונים</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
            כאן אפשר לראות אצטדיונים, קיבולת, עיר, משטח, קבוצות בית ומשחקים שנשמרו אצלנו לכל איצטדיון.
          </p>

          <form className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5" action="/venues">
            <input type="hidden" name="view" value={displayMode} />
            <input
              type="text"
              name="q"
              defaultValue={query}
              placeholder="חיפוש איצטדיון או עיר"
              className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-semibold text-stone-900 focus:outline-none"
            />
            <select
              name="city"
              defaultValue={selectedCity}
              className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-semibold text-stone-900 focus:outline-none"
            >
              <option value="all">כל הערים</option>
              {cityOptions.map((city) => (
                <option key={city.key} value={city.key}>
                  {city.label}
                </option>
              ))}
            </select>
            <select
              name="season"
              defaultValue={selectedSeasonId}
              className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-semibold text-stone-900 focus:outline-none"
            >
              <option value="all">כל העונות</option>
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
            <select
              name="competition"
              defaultValue={selectedCompetitionId}
              className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-semibold text-stone-900 focus:outline-none"
            >
              <option value="all">כל הליגות</option>
              {competitions.map((comp) => (
                <option key={comp.id} value={comp.id}>
                  {comp.nameHe || comp.nameEn}
                </option>
              ))}
            </select>
            <button className="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90">הצג</button>
          </form>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <SummaryBox label="אצטדיונים" value={String(venueCards.length)} />
          <SummaryBox label="קבוצות בית" value={String(venueCards.reduce((sum, v) => sum + v.homeTeams.length, 0))} />
          <SummaryBox label="משחקים שמורים" value={String(venueCards.reduce((sum, v) => sum + v.games.length, 0))} />
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          {venueCards.map((venue) => (
            <article key={venue.id} className="modern-card overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
              <div className="hero-featured-match p-5 text-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-black">{venue.nameHe || venue.nameEn}</h2>
                      {venue.isIsraeli ? (
                        <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold text-white">ישראל</span>
                      ) : null}
                    </div>
                    {venue.nameEn !== venue.nameHe ? (
                      <p className="mt-0.5 text-sm text-white/70">{venue.nameEn}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-1.5 text-xs font-semibold">
                      <span className="rounded-full bg-white/15 px-2.5 py-1">
                        {venue.cityHe || venue.cityEn || 'לא זמין'}
                      </span>
                      <span className="rounded-full bg-white/15 px-2.5 py-1">
                        {venue.capacity?.toLocaleString('he-IL') || '—'} מושבים
                      </span>
                      <span className="rounded-full bg-white/15 px-2.5 py-1">
                        {venue.surface || 'לא ידוע'}
                      </span>
                    </div>
                  </div>
                  {venue.imageUrl ? (
                    <img src={venue.imageUrl} alt={venue.nameHe || venue.nameEn} className="h-20 w-28 rounded-xl object-cover opacity-80" />
                  ) : null}
                </div>
              </div>

              <div className="grid gap-6 p-6 md:grid-cols-[0.95fr_1.05fr]">
                <div className="space-y-4">
                  <div className="rounded-[22px] border border-stone-200 bg-stone-50 p-4">
                    <div className="text-sm font-black text-stone-900">קבוצות בית</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {venue.homeTeams.length > 0 ? (
                        venue.homeTeams.slice(0, 8).map((team) => (
                          <div key={team.name} className="rounded-full bg-white px-3 py-2 text-sm font-semibold text-stone-700 shadow-sm">
                            <span>{team.name}</span>
                            {team.seasons.length > 0 ? (
                              <span className="mr-1 text-[10px] text-stone-400">({team.seasons.length} עונ׳)</span>
                            ) : null}
                          </div>
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
    <div className="modern-card rounded-xl border border-stone-200/80 bg-white p-5 shadow-sm">
      <div className="text-xs font-bold uppercase tracking-wider text-stone-400">{label}</div>
      <div className="mt-2 text-3xl font-black text-stone-900">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="text-xs font-semibold text-stone-400">{label}</div>
      <div className="mt-1.5 text-xl font-black text-stone-900">{value}</div>
    </div>
  );
}
