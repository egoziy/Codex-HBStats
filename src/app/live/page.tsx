import Link from 'next/link';
import { getHomepageLiveSnapshots } from '@/lib/home-live';
import HomeLivePanel from '@/components/HomeLivePanel';

export const dynamic = 'force-dynamic';

export default async function LiveGamesPage() {
  const items = await getHomepageLiveSnapshots(null, { limit: 100 });

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7efe3_0%,#efe3d3_100%)] px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[28px] border border-stone-200 bg-white/90 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-amber-700">Live</p>
              <h1 className="mt-1 text-2xl font-black text-stone-900">משחקים בלייב</h1>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                כל המשחקים החיים ממוינים לפי מדינה ואז לפי ליגה, עם תצוגה צפופה שמכניסה יותר נתונים למסך.
              </p>
            </div>
            <Link href="/" className="rounded-full border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700">
              חזרה לראשי
            </Link>
          </div>
        </section>

        <section className="rounded-[28px] border border-stone-200 bg-white/90 p-5 shadow-sm">
          <HomeLivePanel initialItems={items} selectedTeamId={null} limit={100} />
        </section>
      </div>
    </div>
  );
}
