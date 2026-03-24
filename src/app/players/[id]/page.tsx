import Link from 'next/link';
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';

export default async function PlayerPage({ params }: { params: { id: string } }) {
  const player = await prisma.player.findUnique({
    where: { id: params.id },
    include: {
      team: true,
      playerStats: {
        orderBy: { updatedAt: 'desc' },
      },
    },
  });

  if (!player) {
    notFound();
  }

  const latestStats = player.playerStats[0];

  return (
    <div className="min-h-screen bg-stone-100 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              {player.photoUrl ? <img src={player.photoUrl} alt={player.nameEn} className="h-24 w-24 rounded-full border border-stone-200 bg-white object-cover" /> : null}
              <div>
                <h1 className="text-3xl font-black text-stone-900">{player.nameHe}</h1>
                <p className="mt-1 text-stone-500">{player.nameEn}</p>
                <p className="mt-2 text-sm text-stone-600">
                  {player.team.nameHe} | מספר {player.jerseyNumber}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Link href={`/players/${player.id}/charts`} className="rounded-full bg-stone-900 px-5 py-3 font-bold text-white">
                📊 סטטיסטיקות
              </Link>
              <button className="rounded-full border border-stone-300 px-5 py-3 font-bold text-stone-700">
                ייצוא PDF
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-stone-900">נתונים כלליים</h2>
            <div className="mt-4 space-y-3 text-sm">
              <StatRow label="עמדה" value={player.position || 'לא צוין'} />
              <StatRow label="לאום" value={player.nationalityHe || player.nationalityEn || 'לא צוין'} />
              <StatRow label="קבוצה" value={player.team.nameHe} />
            </div>
          </div>
          <div className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-stone-900">סיכום קריירה</h2>
            {latestStats ? (
              <div className="mt-4 space-y-3 text-sm">
                <StatRow label="שערים" value={String(latestStats.goals)} />
                <StatRow label="בישולים" value={String(latestStats.assists)} />
                <StatRow label="דקות" value={String(latestStats.minutesPlayed)} />
                <StatRow label="כרטיסים צהובים" value={String(latestStats.yellowCards)} />
                <StatRow label="כרטיסים אדומים" value={String(latestStats.redCards)} />
              </div>
            ) : (
              <p className="mt-4 text-stone-500">אין עדיין נתוני עונה לשחקן זה.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-stone-50 px-4 py-3">
      <span className="font-semibold text-stone-600">{label}</span>
      <span className="font-black text-stone-900">{value}</span>
    </div>
  );
}
