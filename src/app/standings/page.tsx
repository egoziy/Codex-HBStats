import prisma from '@/lib/prisma';

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

  const standings = selectedSeason
    ? await prisma.standing.findMany({
        where: { seasonId: selectedSeason.id },
        include: { team: true },
        orderBy: [{ position: 'asc' }, { points: 'desc' }],
      })
    : [];

  return (
    <div className="min-h-screen bg-stone-100 px-4 py-8">
      <div className="mx-auto max-w-7xl rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Standings</p>
            <h1 className="text-3xl font-black text-stone-900">טבלת הליגה</h1>
            <p className="mt-2 text-sm text-stone-600">בחרו עונה כדי לצפות בטבלה של עונה אחת בלבד.</p>
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
          <table className="min-w-[760px] w-full text-right">
            <thead>
              <tr className="border-b border-stone-200 text-sm text-stone-500">
                <th className="sticky right-0 bg-white px-3 py-3">מיקום</th>
                <th className="sticky right-[70px] bg-white px-3 py-3">קבוצה</th>
                <th className="px-3 py-3">משחקים</th>
                <th className="px-3 py-3">ניצחונות</th>
                <th className="px-3 py-3">תיקו</th>
                <th className="px-3 py-3">הפסדים</th>
                <th className="px-3 py-3">שערים</th>
                <th className="sticky left-0 bg-white px-3 py-3">נקודות</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row) => (
                <tr key={row.id} className="border-b border-stone-100 text-sm">
                  <td className="sticky right-0 bg-white px-3 py-3 font-bold">{row.position}</td>
                  <td className="sticky right-[70px] bg-white px-3 py-3 font-semibold">
                    {row.team.nameHe || row.team.nameEn}
                  </td>
                  <td className="px-3 py-3">{row.played}</td>
                  <td className="px-3 py-3">{row.wins}</td>
                  <td className="px-3 py-3">{row.draws}</td>
                  <td className="px-3 py-3">{row.losses}</td>
                  <td className="px-3 py-3">
                    {row.goalsFor}-{row.goalsAgainst}
                  </td>
                  <td className="sticky left-0 bg-white px-3 py-3 font-black">{row.points}</td>
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
