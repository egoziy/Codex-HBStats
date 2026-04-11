import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import AdminSetupClient from '@/components/AdminSetupClient';

export const dynamic = 'force-dynamic';

export default async function AdminSetupPage() {
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
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,#0f172a,#1e3a5f)] px-6 py-5 text-white shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black">ייבוא נתונים מלא</h1>
              <p className="mt-1 text-sm text-white/70">
                סריקה, מיזוג ונורמליזציה של כל הנתונים ההיסטוריים — 26 שנות כדורגל ישראלי.
              </p>
            </div>
            <Link href="/admin" className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold transition hover:bg-white/25">
              חזרה לאדמין
            </Link>
          </div>
        </section>

        <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-stone-900">מצבי ייבוא</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-sm font-black text-emerald-800">מלא (Full)</div>
              <div className="mt-1 text-xs text-emerald-700">~90 דקות</div>
              <ul className="mt-2 space-y-1 text-xs text-emerald-600">
                <li>• סריקת Walla (טבלאות + משחקים + שחקנים)</li>
                <li>• סריקת IFA (ליגת העל + ליגה לאומית)</li>
                <li>• סריקת Sport5 (סגלים + סטטיסטיקות)</li>
                <li>• מיזוג כל הנתונים</li>
                <li>• תעתיק + איחוד שחקנים</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="text-sm font-black text-blue-800">מהיר (Quick)</div>
              <div className="mt-1 text-xs text-blue-700">~15 דקות</div>
              <ul className="mt-2 space-y-1 text-xs text-blue-600">
                <li>• סריקת Walla (טבלאות + שחקנים)</li>
                <li>• מיזוג טבלאות</li>
                <li>• בניית סגלים</li>
                <li>• תעתיק</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-sm font-black text-amber-800">מיזוג בלבד (Merge Only)</div>
              <div className="mt-1 text-xs text-amber-700">~10 דקות</div>
              <ul className="mt-2 space-y-1 text-xs text-amber-600">
                <li>• מיזוג נתונים שכבר נסרקו</li>
                <li>• בניית סגלים</li>
                <li>• תעתיק</li>
                <li className="italic">דורש סריקה קודמת</li>
              </ul>
            </div>
          </div>
        </section>

        <AdminSetupClient />

        <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-stone-900">הערות חשובות</h2>
          <ul className="mt-3 space-y-2 text-sm text-stone-600">
            <li>• <strong>API-Football</strong> — צריך למשוך בנפרד דרך דף &quot;נתונים ומשיכה&quot; באדמין (לעונות 2016+).</li>
            <li>• <strong>Puppeteer</strong> — מצבים full ו-merge-only דורשים Google Chrome מותקן על השרת.</li>
            <li>• <strong>זמנים</strong> — תלויים במהירות האינטרנט ועומס השרתים החיצוניים.</li>
            <li>• <strong>בטיחות</strong> — הייבוא לא מוחק נתונים קיימים. רק ממלא חסרים.</li>
            <li>• <strong>הפסקה</strong> — אם התהליך נעצר באמצע, אפשר להריץ שוב. שלבים שהסתיימו ידלגו.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
