import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import AdminScrapeClient from '@/components/AdminScrapeClient';

export const dynamic = 'force-dynamic';

export default async function AdminScrapePage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-stone-100 px-4 py-16">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-stone-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-3xl font-black text-stone-900">גישה לאזור אדמין</h1>
          <Link href="/login" className="mt-4 inline-block rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white">להתחברות</Link>
        </div>
      </div>
    );
  }

  const [
    sport5Teams,
    sport5Players,
    sport5Seasons,
    ifaStandings,
    sport5SeasonBreakdown,
    ifaSeasonBreakdown,
    recentJobs,
  ] = await Promise.all([
    prisma.scrapedTeam.count({ where: { source: 'sport5' } }),
    prisma.scrapedPlayer.count({ where: { source: 'sport5' } }),
    prisma.scrapedPlayerSeason.count({ where: { source: 'sport5' } }),
    prisma.scrapedStanding.count({ where: { source: 'footballOrgIl' } }),
    prisma.scrapedPlayerSeason.groupBy({ by: ['season'], where: { source: 'sport5' }, _count: true, orderBy: { season: 'desc' } }),
    prisma.scrapedStanding.groupBy({ by: ['season'], where: { source: 'footballOrgIl' }, _count: true, orderBy: { season: 'desc' } }),
    prisma.scrapeJob.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
  ]);

  // Sample players for preview
  const samplePlayers = await prisma.scrapedPlayer.findMany({
    where: { source: 'sport5' },
    include: {
      team: { select: { nameHe: true } },
      seasonStats: { orderBy: { season: 'desc' } },
    },
    take: 20,
    orderBy: { nameHe: 'asc' },
  });

  // IFA standings sample
  const ifaSample = await prisma.scrapedStanding.findMany({
    where: { source: 'footballOrgIl' },
    orderBy: [{ season: 'desc' }, { position: 'asc' }],
    take: 28,
  });

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,#1e3a5f,#2d5a87)] px-6 py-5 text-white shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black">סריקת נתונים חיצוניים</h1>
              <p className="mt-1 text-sm text-white/70">נתונים מ-sport5.co.il ו-football.org.il — נשמרים בנפרד לפני מיזוג</p>
            </div>
            <Link href="/admin" className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold transition hover:bg-white/25">חזרה לאדמין</Link>
          </div>
        </section>

        {/* Summary cards */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="קבוצות Sport5" value={String(sport5Teams)} />
          <SummaryCard label="שחקנים Sport5" value={String(sport5Players)} />
          <SummaryCard label="רשומות עונתיות" value={String(sport5Seasons)} />
          <SummaryCard label="טבלאות IFA" value={String(ifaStandings)} />
        </section>

        {/* Season breakdown */}
        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-stone-900">Sport5 — סטטיסטיקות לפי עונה</h2>
            <div className="mt-3 space-y-2">
              {sport5SeasonBreakdown.map((s) => (
                <div key={s.season} className="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-2">
                  <span className="font-bold text-stone-800">{s.season}</span>
                  <span className="rounded-full bg-blue-100 px-3 py-0.5 text-sm font-bold text-blue-800">{s._count} שחקנים</span>
                </div>
              ))}
              {sport5SeasonBreakdown.length === 0 ? <div className="text-sm text-stone-500">אין נתונים. הרץ סריקה.</div> : null}
            </div>
          </div>

          <div className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-stone-900">IFA — טבלאות לפי עונה</h2>
            <div className="mt-3 space-y-2">
              {ifaSeasonBreakdown.map((s) => (
                <div key={s.season} className="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-2">
                  <span className="font-bold text-stone-800">{s.season}</span>
                  <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-sm font-bold text-emerald-800">{s._count} קבוצות</span>
                </div>
              ))}
              {ifaSeasonBreakdown.length === 0 ? <div className="text-sm text-stone-500">אין נתונים. הרץ סריקת IFA.</div> : null}
            </div>
          </div>
        </section>

        {/* Scrape controls */}
        <AdminScrapeClient />

        {/* Sample data preview */}
        {samplePlayers.length > 0 ? (
          <section className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-stone-900">דוגמת שחקנים (Sport5)</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-stone-100 text-stone-500">
                    <th className="px-3 py-2">שחקן</th>
                    <th className="px-3 py-2">קבוצה</th>
                    <th className="px-3 py-2">עונות</th>
                    <th className="px-3 py-2">הופעות</th>
                    <th className="px-3 py-2">שערים</th>
                    <th className="px-3 py-2">צהובים</th>
                  </tr>
                </thead>
                <tbody>
                  {samplePlayers.map((p) => (
                    <tr key={p.id} className="border-b border-stone-50">
                      <td className="px-3 py-2 font-bold text-stone-800">{p.nameHe}</td>
                      <td className="px-3 py-2 text-stone-600">{p.team.nameHe}</td>
                      <td className="px-3 py-2">{p.seasonStats.length}</td>
                      <td className="px-3 py-2 font-semibold">{p.seasonStats.reduce((s, r) => s + r.appearances, 0)}</td>
                      <td className="px-3 py-2 font-bold text-purple-700">{p.seasonStats.reduce((s, r) => s + r.goals, 0)}</td>
                      <td className="px-3 py-2">{p.seasonStats.reduce((s, r) => s + r.yellowCards, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {/* IFA standings preview */}
        {ifaSample.length > 0 ? (
          <section className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-stone-900">דוגמת טבלאות IFA</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-stone-100 text-stone-500">
                    <th className="px-3 py-2">עונה</th>
                    <th className="px-3 py-2">מיקום</th>
                    <th className="px-3 py-2">קבוצה</th>
                    <th className="px-3 py-2">מש׳</th>
                    <th className="px-3 py-2">נצ׳</th>
                    <th className="px-3 py-2">ת׳</th>
                    <th className="px-3 py-2">הפ׳</th>
                    <th className="px-3 py-2">שערים</th>
                    <th className="px-3 py-2">נק׳</th>
                  </tr>
                </thead>
                <tbody>
                  {ifaSample.map((s) => (
                    <tr key={s.id} className="border-b border-stone-50">
                      <td className="px-3 py-2 text-xs text-stone-500">{s.season}</td>
                      <td className="px-3 py-2 font-black">{s.position}</td>
                      <td className="px-3 py-2 font-bold text-stone-800">{s.teamNameHe}</td>
                      <td className="px-3 py-2">{s.played}</td>
                      <td className="px-3 py-2">{s.wins}</td>
                      <td className="px-3 py-2">{s.draws}</td>
                      <td className="px-3 py-2">{s.losses}</td>
                      <td className="px-3 py-2">{s.goalsFor}:{s.goalsAgainst}</td>
                      <td className="px-3 py-2 font-black">{s.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {/* Recent jobs */}
        {recentJobs.length > 0 ? (
          <section className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-stone-900">עבודות סריקה אחרונות</h2>
            <div className="mt-3 space-y-2">
              {recentJobs.map((j) => (
                <div key={j.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-stone-50 px-4 py-2.5 text-sm">
                  <div>
                    <span className="font-bold text-stone-800">{j.source}</span>
                    <span className="mr-2 text-stone-500">({j.targetType})</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-stone-500">{j.teamsScraped} קבוצות · {j.playersScraped} שחקנים</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${j.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : j.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                      {j.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-stone-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold tracking-[0.18em] text-stone-500">{label}</div>
      <div className="mt-2 text-3xl font-black text-stone-900">{value}</div>
    </div>
  );
}
