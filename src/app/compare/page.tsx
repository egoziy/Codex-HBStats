import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function ComparePage() {
  const [teams, seasons] = await Promise.all([
    prisma.team.findMany({
      orderBy: { nameHe: 'asc' },
      take: 100,
    }),
    prisma.season.findMany({
      orderBy: { year: 'desc' },
      take: 20,
    }),
  ]);

  return (
    <div className="min-h-screen bg-stone-100 px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Compare</p>
          <h1 className="mt-2 text-3xl font-black text-stone-900">השוואת עונות</h1>
          <p className="mt-3 max-w-3xl text-stone-600">
            בחרו קבוצה ושתי עונות כדי להשוות נקודות, שערים, ספיגות, שערים נקיים, מלך שערים ומלך
            בישולים.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <select className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3">
              <option>בחר קבוצה</option>
              {teams.map((team) => (
                <option key={team.id}>{team.nameHe || team.nameEn}</option>
              ))}
            </select>
            <select className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3">
              <option>עונה ראשונה</option>
              {seasons.map((season) => (
                <option key={season.id}>{season.name}</option>
              ))}
            </select>
            <select className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3">
              <option>עונה שנייה</option>
              {seasons.map((season) => (
                <option key={season.id}>{season.name}</option>
              ))}
            </select>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <ComparisonCard title="עונה א׳" />
          <ComparisonCard title="עונה ב׳" />
        </section>
      </div>
    </div>
  );
}

function ComparisonCard({ title }: { title: string }) {
  const rows = ['נקודות', 'שערי זכות', 'שערי חובה', 'שערים נקיים', 'מלך שערים', 'מלך בישולים'];

  return (
    <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-black text-stone-900">{title}</h2>
      <div className="mt-4 space-y-4">
        {rows.map((row) => (
          <div key={row}>
            <div className="mb-2 flex items-center justify-between text-sm font-semibold text-stone-700">
              <span>{row}</span>
              <span>--</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-stone-100">
              <div className="h-full w-0 rounded-full bg-red-700" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
