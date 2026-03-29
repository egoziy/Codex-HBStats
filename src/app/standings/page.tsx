import Link from 'next/link';
import prisma from '@/lib/prisma';
import { sortStandings } from '@/lib/standings';

export const dynamic = 'force-dynamic';

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

  const rawStandings = selectedSeason
    ? await prisma.standing.findMany({
        where: { seasonId: selectedSeason.id },
        include: { team: true },
        orderBy: [{ position: 'asc' }, { points: 'desc' }],
      })
    : [];

  const standings = sortStandings(rawStandings);

  return (
    <div className="min-h-screen bg-stone-100 px-4 py-8">
      <div className="mx-auto max-w-7xl rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Standings</p>
            <h1 className="text-3xl font-black text-stone-900">טבלת הליגה</h1>
            <p className="mt-2 text-sm text-stone-600">בחרו עונה כדי לראות טבלה מסודרת בלי ערבוב של כמה עונות יחד.</p>
          </div>

          <form className="flex flex-wrap items-center gap-3" action="/standings">
            <select
              name="season"
              defaultValue={selectedSeason?.id || ''}
              className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm font-semibold"
            >
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
            <button className="rounded-full bg-stone-900 px-4 py-3 text-sm font-bold text-white">הצג עונה</button>
          </form>
        </div>

        {selectedSeason ? (
          <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            עונה נבחרת: {selectedSeason.name}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-[920px] w-full text-right">
            <thead>
              <tr className="border-b border-stone-200 text-sm text-stone-500">
                <th className="sticky right-0 bg-white px-3 py-3">מיקום</th>
                <th className="sticky right-[70px] bg-white px-3 py-3">קבוצה</th>
                <th className="px-3 py-3">משחקים</th>
                <th className="px-3 py-3">ניצחונות</th>
                <th className="px-3 py-3">תיקו</th>
                <th className="px-3 py-3">הפסדים</th>
                <th className="px-3 py-3">שערים</th>
                <th className="px-3 py-3">תיקון</th>
                <th className="sticky left-0 bg-white px-3 py-3">נקודות</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row) => (
                <tr key={row.id} className="border-b border-stone-100 text-sm">
                  <td className="sticky right-0 bg-white px-3 py-3 font-bold">{row.displayPosition}</td>
                  <td className="sticky right-[70px] bg-white px-3 py-3 font-semibold">
                    <Link href={`/teams/${row.teamId}`} className="hover:text-red-800">
                      {row.team.nameHe || row.team.nameEn}
                    </Link>
                    {row.pointsAdjustmentNoteHe ? (
                      <div className="mt-1 text-xs font-medium text-red-700">{row.pointsAdjustmentNoteHe}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">{row.played}</td>
                  <td className="px-3 py-3">{row.wins}</td>
                  <td className="px-3 py-3">{row.draws}</td>
                  <td className="px-3 py-3">{row.losses}</td>
                  <td className="px-3 py-3">
                    {row.goalsFor}-{row.goalsAgainst}
                  </td>
                  <td className={`px-3 py-3 font-bold ${row.pointsAdjustment < 0 ? 'text-red-700' : row.pointsAdjustment > 0 ? 'text-emerald-700' : 'text-stone-400'}`}>
                    {row.pointsAdjustment > 0 ? `+${row.pointsAdjustment}` : row.pointsAdjustment}
                  </td>
                  <td className="sticky left-0 bg-white px-3 py-3 font-black">{row.adjustedPoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {standings.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-500">
            אין כרגע נתוני טבלה לעונה שנבחרה.
          </div>
        ) : null}
      </div>
    </div>
  );
}
