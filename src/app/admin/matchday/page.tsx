import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import AdminMatchdayClient from '@/components/AdminMatchdayClient';

export const dynamic = 'force-dynamic';

export default async function AdminMatchdayPage() {
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

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,#0f172a,#1e3a5f)] px-6 py-5 text-white shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black">עדכון יום משחקים</h1>
              <p className="mt-1 text-sm text-white/70">
                סנכרון נתונים למשחקים בתאריך מסוים: API-Football (אירועים, הרכבים, סטטיסטיקה) + FootyStats (xG) + מיזוג.
              </p>
            </div>
            <Link href="/admin" className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold transition hover:bg-white/25">
              חזרה לאדמין
            </Link>
          </div>
        </section>

        <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-stone-900">הפעלת עדכון</h2>
          <p className="mt-1 text-xs text-stone-600">
            ברירת מחדל: היום, ליגת העל. הסנכרון רץ ברקע ויציג פלט בזמן אמת.
          </p>
          <div className="mt-4">
            <AdminMatchdayClient />
          </div>
        </section>
      </div>
    </div>
  );
}
