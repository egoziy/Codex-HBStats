import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import AdminRefereesClient from '@/components/AdminRefereesClient';

export const dynamic = 'force-dynamic';

export default async function AdminRefereesPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-16">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-stone-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-3xl font-black text-stone-900">גישה לאזור אדמין</h1>
          <p className="mt-4 text-sm leading-7 text-stone-600">
            צריך להיות מחובר עם משתמש מנהל כדי לנהל שופטים.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link href="/login" className="rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white">
              להתחברות
            </Link>
            <Link href="/admin" className="rounded-full border border-stone-300 px-5 py-3 text-sm font-bold text-stone-700">
              חזרה לאדמין
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const referees = await prisma.referee.findMany({
    include: {
      _count: { select: { games: true } },
      games: {
        select: { competitionId: true },
        where: { competitionId: { not: null } },
      },
    },
    orderBy: { nameEn: 'asc' },
  });

  // Load competitions for mapping
  const competitions = await prisma.competition.findMany({
    select: { id: true, nameHe: true, nameEn: true, countryHe: true, countryEn: true },
  });
  const compMap = new Map(competitions.map((c) => [c.id, c]));

  // For each referee, find their most frequent competition
  const enriched = referees.map((r) => {
    const compCounts = new Map<string, number>();
    for (const g of r.games) {
      if (g.competitionId) compCounts.set(g.competitionId, (compCounts.get(g.competitionId) || 0) + 1);
    }
    let mainCompId: string | null = null;
    let maxCount = 0;
    for (const [cid, count] of compCounts) {
      if (count > maxCount) { mainCompId = cid; maxCount = count; }
    }
    const mainComp = mainCompId ? compMap.get(mainCompId) : null;
    return {
      id: r.id,
      nameEn: r.nameEn,
      nameHe: r.nameHe,
      _count: r._count,
      mainCompetition: mainComp ? (mainComp.nameHe || mainComp.nameEn) : null,
      country: mainComp ? (mainComp.countryHe || mainComp.countryEn || null) : null,
    };
  });

  // Collect unique countries for filter
  const countries = [...new Set(enriched.map((r) => r.country).filter(Boolean))] as string[];
  countries.sort((a, b) => a.localeCompare(b, 'he'));

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <Link href="/admin" className="text-sm font-bold text-red-800">
            חזרה לאדמין
          </Link>
          <h1 className="mt-2 text-4xl font-black text-stone-900">ניהול שופטים</h1>
          <p className="mt-2 text-sm text-stone-600">
            עריכת שמות בעברית, מיזוג שופטים כפולים (API-Football + IFA/Walla), ומחיקת רשומות ללא משחקים.
          </p>
        </div>

        <AdminRefereesClient
          initialReferees={enriched}
          countries={countries}
        />
      </div>
    </div>
  );
}
