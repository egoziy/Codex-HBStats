import Link from 'next/link';

import prisma from '@/lib/prisma';
import { sortStandings } from '@/lib/standings';

export const dynamic = 'force-dynamic';

type TeamName = {
  id: string;
  nameHe: string;
  nameEn: string;
};

type DerivedStandingRow = {
  id: string;
  position: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  pointsAdjustment: number;
  pointsAdjustmentNoteHe: string | null;
  teamId: string;
  team: TeamName;
};

function hasHebrew(value: string | null | undefined) {
  return Boolean(value && /[\u0590-\u05FF]/.test(value));
}

function getDisplayTeamName(team: { nameHe?: string | null; nameEn?: string | null }) {
  if (hasHebrew(team.nameHe)) {
    return team.nameHe!;
  }

  return team.nameEn || team.nameHe || 'ללא שם';
}

function buildStandingsFromGames(
  teams: TeamName[],
  games: Array<{
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number | null;
    awayScore: number | null;
  }>,
) {
  const rows = new Map<string, DerivedStandingRow>();

  for (const team of teams) {
    rows.set(team.id, {
      id: `derived-${team.id}`,
      position: 999,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
      pointsAdjustment: 0,
      pointsAdjustmentNoteHe: null,
      teamId: team.id,
      team,
    });
  }

  for (const game of games) {
    if (game.homeScore === null || game.awayScore === null) {
      continue;
    }

    const home = rows.get(game.homeTeamId);
    const away = rows.get(game.awayTeamId);
    if (!home || !away) {
      continue;
    }

    home.played += 1;
    away.played += 1;

    home.goalsFor += game.homeScore;
    home.goalsAgainst += game.awayScore;
    away.goalsFor += game.awayScore;
    away.goalsAgainst += game.homeScore;

    if (game.homeScore > game.awayScore) {
      home.wins += 1;
      home.points += 3;
      away.losses += 1;
      continue;
    }

    if (game.homeScore < game.awayScore) {
      away.wins += 1;
      away.points += 3;
      home.losses += 1;
      continue;
    }

    home.draws += 1;
    away.draws += 1;
    home.points += 1;
    away.points += 1;
  }

  let fallbackPosition = 1;
  return sortStandings(
    [...rows.values()].map((row) => ({
      ...row,
      position: fallbackPosition++,
    })),
  );
}

export default async function StandingsPage({
  searchParams,
}: {
  searchParams?: { season?: string };
}) {
  const seasons = await prisma.season.findMany({
    orderBy: { year: 'desc' },
    take: 10,
  });

  const selectedSeasonId = searchParams?.season || seasons[0]?.id || null;
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) || seasons[0] || null;

  const [teams, rawStandings, completedLeagueGames] = selectedSeason
    ? await Promise.all([
        prisma.team.findMany({
          where: { seasonId: selectedSeason.id },
          select: { id: true, nameHe: true, nameEn: true },
          orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
        }),
        prisma.standing.findMany({
          where: { seasonId: selectedSeason.id },
          include: { team: true },
          orderBy: [{ position: 'asc' }, { points: 'desc' }],
        }),
        prisma.game.findMany({
          where: {
            seasonId: selectedSeason.id,
            status: 'COMPLETED',
            homeScore: { not: null },
            awayScore: { not: null },
            competition: { apiFootballId: 383 },
          },
          select: {
            homeTeamId: true,
            awayTeamId: true,
            homeScore: true,
            awayScore: true,
          },
        }),
      ])
    : [[], [], []];

  const hasStoredStandings = rawStandings.length > 0;
  const standings = hasStoredStandings ? sortStandings(rawStandings) : buildStandingsFromGames(teams, completedLeagueGames);
  const isFallbackTable = !hasStoredStandings && standings.length > 0;
  const canDeriveTable = Boolean(selectedSeason && teams.length > 0 && completedLeagueGames.length > 0);

  return (
    <div dir="rtl" className="min-h-screen bg-stone-100 px-4 py-8 text-stone-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[32px] border border-stone-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl space-y-2">
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Standings</p>
              <h1 className="text-3xl font-black text-stone-900 md:text-4xl">טבלת הליגה</h1>
              <p className="text-sm leading-6 text-stone-600 md:text-base">
                בחרו עונה כדי לראות טבלה מסודרת של הליגה, עם עדיפות לשמות הקבוצות בעברית ותצוגה נוחה יותר לקריאה.
              </p>
            </div>

            <form className="flex flex-col gap-3 sm:flex-row sm:items-center" action="/standings">
              <select
                name="season"
                defaultValue={selectedSeason?.id || ''}
                className="min-w-[180px] rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm font-semibold text-stone-900"
              >
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name}
                  </option>
                ))}
              </select>
              <button className="rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-stone-800">
                הצג עונה
              </button>
            </form>
          </div>

          {selectedSeason ? (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <div className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">
                עונה נבחרת: {selectedSeason.name}
              </div>
              <div className="rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-sm font-semibold text-stone-700">
                קבוצות בעונה: {teams.length}
              </div>
              <div className="rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-sm font-semibold text-stone-700">
                משחקי ליגה שהסתיימו: {completedLeagueGames.length}
              </div>
            </div>
          ) : null}
        </section>

        {isFallbackTable ? (
          <section className="rounded-[24px] border border-sky-200 bg-sky-50 px-5 py-4 text-sm font-semibold leading-6 text-sky-900">
            לא נמצאה טבלה שמורה לעונה הזו, לכן המערכת מציגה טבלה שחושבה מתוך {completedLeagueGames.length} משחקי ליגה שהסתיימו ונשמרו במערכת.
          </section>
        ) : null}

        <section className="rounded-[32px] border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-100 px-6 py-5">
            <h2 className="text-xl font-black text-stone-900">דירוג הקבוצות</h2>
            <p className="mt-1 text-sm text-stone-500">הטבלה ממוינת לפי נקודות, הפרש שערים וכמות שערי זכות.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[920px] w-full text-right">
              <thead>
                <tr className="bg-stone-50 text-sm font-bold text-stone-600">
                  <th className="sticky right-0 z-10 bg-stone-50 px-4 py-4">מיקום</th>
                  <th className="sticky right-[84px] z-10 min-w-[240px] bg-stone-50 px-4 py-4">קבוצה</th>
                  <th className="px-4 py-4 text-center">משחקים</th>
                  <th className="px-4 py-4 text-center">ניצחונות</th>
                  <th className="px-4 py-4 text-center">תיקו</th>
                  <th className="px-4 py-4 text-center">הפסדים</th>
                  <th className="px-4 py-4 text-center">שערים</th>
                  <th className="px-4 py-4 text-center">הפרש</th>
                  <th className="px-4 py-4 text-center">תיקון</th>
                  <th className="sticky left-0 z-10 bg-stone-50 px-4 py-4 text-center">נקודות</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row, index) => (
                  <tr key={row.id} className={index % 2 === 0 ? 'bg-white text-sm' : 'bg-stone-50/60 text-sm'}>
                    <td className="sticky right-0 bg-inherit px-4 py-4 font-black text-stone-900">{row.displayPosition}</td>
                    <td className="sticky right-[84px] bg-inherit px-4 py-4">
                      <Link href={`/teams/${row.teamId}`} className="block font-bold text-stone-900 transition hover:text-red-800">
                        {getDisplayTeamName(row.team)}
                      </Link>
                      {row.pointsAdjustmentNoteHe ? (
                        <div className="mt-1 text-xs font-medium text-red-700">{row.pointsAdjustmentNoteHe}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 text-center font-medium">{row.played}</td>
                    <td className="px-4 py-4 text-center font-medium">{row.wins}</td>
                    <td className="px-4 py-4 text-center font-medium">{row.draws}</td>
                    <td className="px-4 py-4 text-center font-medium">{row.losses}</td>
                    <td className="px-4 py-4 text-center font-medium">
                      {row.goalsFor}-{row.goalsAgainst}
                    </td>
                    <td className="px-4 py-4 text-center font-bold">{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                    <td
                      className={`px-4 py-4 text-center font-bold ${
                        row.pointsAdjustment < 0
                          ? 'text-red-700'
                          : row.pointsAdjustment > 0
                            ? 'text-emerald-700'
                            : 'text-stone-400'
                      }`}
                    >
                      {row.pointsAdjustment === 0 ? '-' : row.pointsAdjustment > 0 ? `+${row.pointsAdjustment}` : row.pointsAdjustment}
                    </td>
                    <td className="sticky left-0 bg-inherit px-4 py-4 text-center text-lg font-black text-stone-900">{row.adjustedPoints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!hasStoredStandings && !canDeriveTable ? (
            <div className="p-8 text-center text-sm text-stone-500">
              אין כרגע נתוני טבלה לעונה שנבחרה, וגם לא נמצאו מספיק משחקי ליגה שהסתיימו כדי לחשב אותה אוטומטית.
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
