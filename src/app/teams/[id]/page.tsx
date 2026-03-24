import Link from 'next/link';
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';

export default async function TeamPage({ params }: { params: { id: string } }) {
  const team = await prisma.team.findUnique({
    where: { id: params.id },
    include: {
      players: {
        orderBy: [{ jerseyNumber: 'asc' }],
        take: 12,
      },
      standings: true,
      teamStats: true,
    },
  });

  if (!team) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-stone-100 px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              {team.logoUrl ? <img src={team.logoUrl} alt={team.nameEn} className="h-20 w-20 rounded-full border border-stone-200 bg-white object-contain p-2" /> : null}
              <div>
                <h1 className="text-3xl font-black text-stone-900">{team.nameHe}</h1>
                <p className="mt-1 text-stone-500">{team.nameEn}</p>
                <p className="mt-2 text-sm text-stone-600">מאמן: {team.coach || 'לא הוזן'}</p>
              </div>
            </div>
            <Link href={`/teams/${team.id}/charts`} className="rounded-full bg-stone-900 px-5 py-3 font-bold text-white">
              📊 סטטיסטיקות
            </Link>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-stone-900">סיכום עונה</h2>
            {team.standings[0] ? (
              <div className="mt-4 space-y-3 text-sm">
                <StatRow label="מיקום" value={String(team.standings[0].position)} />
                <StatRow label="נקודות" value={String(team.standings[0].points)} />
                <StatRow label="שערי זכות" value={String(team.standings[0].goalsFor)} />
                <StatRow label="שערי חובה" value={String(team.standings[0].goalsAgainst)} />
              </div>
            ) : (
              <p className="mt-4 text-stone-500">אין עדיין נתוני טבלה לקבוצה זו.</p>
            )}
          </div>

          <div className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-stone-900">שחקני הסגל</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {team.players.map((player) => (
                <Link key={player.id} href={`/players/${player.id}`} className="rounded-2xl border border-stone-200 bg-stone-50 p-4 transition hover:border-red-300">
                  <div className="font-bold text-stone-900">{player.nameHe}</div>
                  <div className="mt-1 text-sm text-stone-500">{player.position || 'ללא עמדה'}</div>
                  <div className="mt-2 text-xs text-stone-400">#{player.jerseyNumber}</div>
                </Link>
              ))}
            </div>
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
