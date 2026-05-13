import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import AdminFlashscoreClient from '@/components/AdminFlashscoreClient';

export const dynamic = 'force-dynamic';

export default async function AdminFlashscorePage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-16">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-stone-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-3xl font-black text-stone-900">גישה לאזור אדמין</h1>
          <p className="mt-4 text-sm leading-7 text-stone-600">צריך משתמש מנהל.</p>
          <div className="mt-6">
            <Link href="/login" className="rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white">להתחברות</Link>
          </div>
        </div>
      </div>
    );
  }

  // Quick stats so the user sees what's already in the archive.
  const matches = await prisma.flashscoreScrapedMatch.findMany({ select: { leagueSlug: true, season: true, payload: true } });
  const buckets: Record<string, { total: number; withStats: number }> = {};
  for (const m of matches) {
    const k = `${m.leagueSlug} / ${m.season}`;
    if (!buckets[k]) buckets[k] = { total: 0, withStats: 0 };
    buckets[k].total += 1;
    const hasStats = Array.isArray((m.payload as { stats?: unknown[] } | null)?.stats) && ((m.payload as { stats: unknown[] }).stats.length > 0);
    if (hasStats) buckets[k].withStats += 1;
  }
  const summary = Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => ({ key: k, total: v.total, withStats: v.withStats }));

  const teamCount = await prisma.flashscoreScrapedTeam.count();
  const playerCount = await prisma.flashscoreScrapedPlayer.count();
  const transferCount = await prisma.flashscoreScrapedTransfer.count();

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-10" dir="rtl">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-black text-stone-900">ייבוא Flashscore</h1>
          <Link href="/admin" className="text-sm font-bold text-stone-600 underline">חזרה לאדמין</Link>
        </div>

        <div className="mb-6 rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-stone-900">ארכיון נוכחי</h2>
          <div className="mt-3 grid gap-2 text-sm text-stone-700 sm:grid-cols-3">
            <div className="rounded-xl bg-stone-50 p-3">
              <div className="text-stone-500">סך קבוצות סרוקות</div>
              <div className="text-2xl font-black text-stone-900">{teamCount}</div>
            </div>
            <div className="rounded-xl bg-stone-50 p-3">
              <div className="text-stone-500">סך שחקנים</div>
              <div className="text-2xl font-black text-stone-900">{playerCount}</div>
            </div>
            <div className="rounded-xl bg-stone-50 p-3">
              <div className="text-stone-500">סך העברות</div>
              <div className="text-2xl font-black text-stone-900">{transferCount}</div>
            </div>
          </div>
          {summary.length > 0 ? (
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">משחקים לפי ליגה/עונה</div>
              <table className="mt-2 w-full text-right text-sm">
                <thead className="bg-stone-100">
                  <tr>
                    <th className="px-3 py-2">ליגה / עונה</th>
                    <th className="px-3 py-2">סה"כ משחקים</th>
                    <th className="px-3 py-2">עם xG/אירועים</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((s) => (
                    <tr key={s.key} className="border-t border-stone-100">
                      <td className="px-3 py-2 font-bold">{s.key}</td>
                      <td className="px-3 py-2">{s.total}</td>
                      <td className="px-3 py-2">{s.withStats}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <AdminFlashscoreClient />
      </div>
    </div>
  );
}
