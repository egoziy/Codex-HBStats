import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import AdminMergeClient from '@/components/AdminMergeClient';

export const dynamic = 'force-dynamic';

export default async function AdminMergePage() {
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

  const [mergeOps, scrapedStats, ifaSeasons, sport5Seasons, wallaSeasons] = await Promise.all([
    prisma.mergeOperation.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { user: { select: { name: true } } },
    }),
    Promise.all([
      prisma.scrapedPlayerSeason.count({ where: { source: 'sport5' } }),
      prisma.scrapedStanding.count({ where: { source: 'footballOrgIl' } }),
      prisma.scrapedStanding.count({ where: { source: 'walla' } }),
      prisma.scrapedLeaderboard.count({ where: { source: 'walla' } }),
    ]),
    prisma.scrapedStanding.groupBy({ by: ['season'], where: { source: 'footballOrgIl' }, orderBy: { season: 'desc' } }).then((rows) => rows.map((r) => r.season)),
    prisma.scrapedPlayerSeason.groupBy({ by: ['season'], where: { source: 'sport5' }, orderBy: { season: 'desc' } }).then((rows) => rows.map((r) => r.season)),
    prisma.scrapedStanding.groupBy({ by: ['season'], where: { source: 'walla' }, orderBy: { season: 'desc' } }).then((rows) => rows.map((r) => r.season)),
  ]);

  const statusColors: Record<string, string> = {
    preview: 'bg-blue-100 text-blue-700',
    approved: 'bg-amber-100 text-amber-700',
    executed: 'bg-emerald-100 text-emerald-700',
    rolled_back: 'bg-stone-100 text-stone-600',
    failed: 'bg-red-100 text-red-700',
  };

  const statusLabels: Record<string, string> = {
    preview: 'תצוגה מקדימה',
    approved: 'מאושר',
    executed: 'בוצע',
    rolled_back: 'בוטל (rollback)',
    failed: 'נכשל',
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,#4a1942,#8b1a4a)] px-6 py-5 text-white shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black">מיזוג נתונים</h1>
              <p className="mt-1 text-sm text-white/70">בדיקה, אישור ומיזוג נתונים שנסרקו לתוך המסד הראשי — עם אפשרות ביטול</p>
            </div>
            <div className="flex gap-2">
              <Link href="/admin/scrape" className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold transition hover:bg-white/25">סריקות</Link>
              <Link href="/admin" className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold transition hover:bg-white/25">אדמין</Link>
            </div>
          </div>
        </section>

        {/* Status summary */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryCard label="Sport5 שחקנים" value={String(scrapedStats[0])} sub="רשומות עונתיות" />
          <SummaryCard label="IFA טבלאות" value={String(scrapedStats[1])} sub="football.org.il" />
          <SummaryCard label="Walla טבלאות" value={String(scrapedStats[2])} sub="standings" />
          <SummaryCard label="Walla שחקנים" value={String(scrapedStats[3])} sub="leaderboards" />
          <SummaryCard label="מיזוגים" value={String(mergeOps.length)} sub={`${mergeOps.filter((m) => m.status === 'executed').length} בוצעו`} />
        </section>

        {/* Merge controls */}
        <AdminMergeClient
          availableSeasons={{ walla: wallaSeasons, footballOrgIl: ifaSeasons, sport5: sport5Seasons }}
          mergeHistory={mergeOps.map((op) => ({
            id: op.id,
            source: op.source,
            mergeType: op.mergeType,
            status: op.status,
            description: op.description,
            recordsUpdated: op.recordsUpdated,
            recordsCreated: op.recordsCreated,
            recordsSkipped: op.recordsSkipped,
            createdAt: op.createdAt.toISOString(),
            userName: op.user?.name || null,
          }))}
        />
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[20px] border border-stone-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold tracking-[0.18em] text-stone-500">{label}</div>
      <div className="mt-2 text-3xl font-black text-stone-900">{value}</div>
      {sub ? <div className="mt-1 text-xs text-stone-400">{sub}</div> : null}
    </div>
  );
}
