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

  const [mergeOps, scrapedStats] = await Promise.all([
    prisma.mergeOperation.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { user: { select: { name: true } } },
    }),
    Promise.all([
      prisma.scrapedPlayerSeason.count({ where: { source: 'sport5' } }),
      prisma.scrapedStanding.count({ where: { source: 'footballOrgIl' } }),
    ]),
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
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-[20px] border border-stone-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-stone-500">נתונים לסריקת שחקנים</div>
            <div className="mt-2 text-3xl font-black text-stone-900">{scrapedStats[0]}</div>
            <div className="mt-1 text-xs text-stone-400">רשומות עונתיות מ-Sport5</div>
          </div>
          <div className="rounded-[20px] border border-stone-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-stone-500">טבלאות IFA</div>
            <div className="mt-2 text-3xl font-black text-stone-900">{scrapedStats[1]}</div>
            <div className="mt-1 text-xs text-stone-400">שורות טבלה מ-football.org.il</div>
          </div>
          <div className="rounded-[20px] border border-stone-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-stone-500">פעולות מיזוג</div>
            <div className="mt-2 text-3xl font-black text-stone-900">{mergeOps.length}</div>
            <div className="mt-1 text-xs text-stone-400">{mergeOps.filter((m) => m.status === 'executed').length} בוצעו</div>
          </div>
        </section>

        {/* Merge controls */}
        <AdminMergeClient />

        {/* Merge history */}
        {mergeOps.length > 0 ? (
          <section className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-stone-900">היסטוריית מיזוגים</h2>
            <div className="mt-3 space-y-3">
              {mergeOps.map((op) => (
                <article key={op.id} className="rounded-xl border border-stone-100 bg-stone-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${statusColors[op.status] || 'bg-stone-100 text-stone-600'}`}>
                          {statusLabels[op.status] || op.status}
                        </span>
                        <span className="text-sm font-bold text-stone-800">{op.source}</span>
                        <span className="text-xs text-stone-400">{op.mergeType}</span>
                      </div>
                      <div className="mt-1 text-sm text-stone-600">{op.description}</div>
                      <div className="mt-1 text-xs text-stone-400">
                        {new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium', timeStyle: 'short' }).format(op.createdAt)}
                        {op.user?.name ? ` · ${op.user.name}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="rounded-full bg-white px-2 py-1 font-semibold text-stone-700">
                        {op.recordsUpdated} עודכנו
                      </span>
                      <span className="rounded-full bg-white px-2 py-1 font-semibold text-stone-500">
                        {op.recordsSkipped} דולגו
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
