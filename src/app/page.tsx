import Link from 'next/link';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const latestSeason = await prisma.season.findFirst({
    orderBy: { year: 'desc' },
  });

  const [games, standings, activities] = await Promise.all([
    prisma.game.findMany({
      where: latestSeason ? { seasonId: latestSeason.id } : undefined,
      include: {
        homeTeam: true,
        awayTeam: true,
      },
      orderBy: { dateTime: 'desc' },
      take: 6,
    }),
    prisma.standing.findMany({
      where: latestSeason ? { seasonId: latestSeason.id } : undefined,
      include: {
        team: true,
      },
      orderBy: [{ position: 'asc' }, { points: 'desc' }],
      take: 8,
    }),
    prisma.activityLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 10,
    }),
  ]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)]">
      <section className="border-b border-red-950/10 bg-[radial-gradient(circle_at_top_right,rgba(153,27,27,0.24),transparent_34%),radial-gradient(circle_at_top_left,rgba(234,179,8,0.14),transparent_24%),linear-gradient(135deg,#7f1d1d,#991b1b_42%,#111827)] text-white">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <div className="overflow-hidden rounded-[32px] border border-white/10 bg-white/5 shadow-[0_30px_80px_rgba(0,0,0,0.24)] backdrop-blur">
            <div className="grid gap-8 px-6 py-8 lg:grid-cols-[1.15fr_0.85fr] lg:px-10 lg:py-10">
              <div>
                <div className="mb-4 inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-amber-200">
                  ⚽ הדופק של טרנר, במספרים.
                </div>
                <h1 className="max-w-3xl text-4xl font-black leading-tight md:text-6xl">
                  כל הסטטיסטיקות של הפועל באר שבע במקום אחד
                </h1>
                <p className="mt-5 max-w-2xl text-lg leading-8 text-white/85">
                  אתר דו-לשוני לניתוח קבוצות, שחקנים, משחקים, טבלאות וגרפים. כולל אזור אדמין למשיכת
                  נתונים מ-API-Football ושמירה מלאה באנגלית ובעברית.
                </p>
                {latestSeason ? (
                  <div className="mt-4 inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white">
                    מוצג כרגע לפי עונה: {latestSeason.name}
                  </div>
                ) : null}
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link href="/standings" className="rounded-full bg-white px-5 py-3 font-bold text-stone-900">
                    טבלת ליגה
                  </Link>
                  <Link href="/statistics" className="rounded-full border border-white/20 bg-white/10 px-5 py-3 font-bold">
                    סטטיסטיקות
                  </Link>
                  <Link href="/compare" className="rounded-full border border-white/20 bg-white/10 px-5 py-3 font-bold">
                    השוואת עונות
                  </Link>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-1">
                <HighlightCard title="משחקים" value={String(games.length)} subtitle="מוצגים בדף הבית כרגע" />
                <HighlightCard title="קבוצות בטבלה" value={String(standings.length)} subtitle="מבט מהיר על עונה אחת" />
                <HighlightCard title="פעולות אחרונות" value={String(activities.length)} subtitle="שינויים, משיכות ועדכונים" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-6">
          <section className="rounded-[24px] border border-stone-200 bg-white/90 p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Standings</p>
                <h2 className="text-2xl font-black text-stone-900">טבלת ליגה</h2>
              </div>
              <Link href="/standings" className="text-sm font-bold text-red-800">
                לצפייה מלאה
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-right">
                <thead>
                  <tr className="border-b border-stone-200 text-sm text-stone-500">
                    <th className="px-3 py-3">מיקום</th>
                    <th className="px-3 py-3">קבוצה</th>
                    <th className="px-3 py-3">משחקים</th>
                    <th className="px-3 py-3">הפרש</th>
                    <th className="px-3 py-3">נקודות</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((row) => (
                    <tr key={row.id} className="border-b border-stone-100 text-sm">
                      <td className="px-3 py-3 font-bold">{row.position}</td>
                      <td className="px-3 py-3">
                        <Link href={`/teams/${row.teamId}`} className="font-semibold text-stone-900 hover:text-red-800">
                          {row.team.nameHe || row.team.nameEn}
                        </Link>
                      </td>
                      <td className="px-3 py-3">{row.played}</td>
                      <td className="px-3 py-3">{row.goalsFor - row.goalsAgainst}</td>
                      <td className="px-3 py-3 font-black">{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {standings.length === 0 ? <EmptyState text="אין כרגע נתוני טבלה לעונה הפעילה." /> : null}
          </section>

          <section className="rounded-[24px] border border-stone-200 bg-white/90 p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Matches</p>
                <h2 className="text-2xl font-black text-stone-900">משחקים אחרונים</h2>
              </div>
            </div>
            <div className="grid gap-4">
              {games.map((game) => (
                <Link
                  key={game.id}
                  href={`/games/${game.id}`}
                  className="grid gap-4 rounded-[22px] border border-stone-200 bg-stone-50 p-4 transition hover:border-red-300 md:grid-cols-[1fr_auto_1fr]"
                >
                  <div className="text-center md:text-left">
                    <div className="font-bold text-stone-900">{game.homeTeam.nameHe || game.homeTeam.nameEn}</div>
                    <div className="text-sm text-stone-500">{game.homeTeam.nameEn}</div>
                  </div>
                  <div className="flex min-w-[100px] flex-col items-center justify-center">
                    <div className="rounded-full bg-stone-900 px-4 py-2 text-lg font-black text-white">
                      {game.homeScore ?? 0} - {game.awayScore ?? 0}
                    </div>
                    <div className="mt-2 text-xs text-stone-500">
                      {new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium' }).format(game.dateTime)}
                    </div>
                  </div>
                  <div className="text-center md:text-right">
                    <div className="font-bold text-stone-900">{game.awayTeam.nameHe || game.awayTeam.nameEn}</div>
                    <div className="text-sm text-stone-500">{game.awayTeam.nameEn}</div>
                  </div>
                </Link>
              ))}
              {games.length === 0 ? <EmptyState text="אין כרגע משחקים להצגה בעונה הפעילה." /> : null}
            </div>
          </section>
        </div>

        <aside className="rounded-[24px] border border-stone-200 bg-white/90 p-6 shadow-sm">
          <div className="mb-5">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Feed</p>
            <h2 className="text-2xl font-black text-stone-900">פעילות אחרונה</h2>
          </div>
          <div className="space-y-3">
            {activities.map((activity) => (
              <article key={activity.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <div className="font-semibold text-stone-900">{activity.actionHe}</div>
                <div className="mt-2 text-xs text-stone-500">
                  {new Intl.DateTimeFormat('he-IL', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(activity.timestamp)}
                </div>
              </article>
            ))}
            {activities.length === 0 ? <EmptyState text="עדיין אין פעולות רשומות." compact /> : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

function HighlightCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <article className="rounded-[24px] border border-white/15 bg-white/10 p-5">
      <div className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-200">{title}</div>
      <div className="mt-3 text-4xl font-black">{value}</div>
      <div className="mt-2 text-sm text-white/75">{subtitle}</div>
    </article>
  );
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <div
      className={`rounded-2xl border border-dashed border-stone-300 bg-stone-50 text-stone-500 ${
        compact ? 'p-4 text-sm' : 'p-8 text-center'
      }`}
    >
      {text}
    </div>
  );
}
