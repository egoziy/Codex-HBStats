import Link from 'next/link';
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { sortStandings } from '@/lib/standings';

export default async function TeamPage({ params }: { params: { id: string } }) {
  const team = await prisma.team.findUnique({
    where: { id: params.id },
    include: {
      players: {
        orderBy: [{ jerseyNumber: 'asc' }, { nameHe: 'asc' }, { nameEn: 'asc' }],
        take: 20,
      },
      standings: true,
      teamStats: true,
      season: true,
    },
  });

  if (!team) {
    notFound();
  }

  const seasonStandings = await prisma.standing.findMany({
    where: { seasonId: team.seasonId },
    include: { team: true },
    orderBy: [{ position: 'asc' }, { points: 'desc' }],
  });

  const standing = sortStandings(seasonStandings).find((row) => row.teamId === team.id) || null;

  return (
    <div className="min-h-screen bg-stone-100 px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              {team.logoUrl ? (
                <img
                  src={team.logoUrl}
                  alt={team.nameEn}
                  className="h-20 w-20 rounded-full border border-stone-200 bg-white object-contain p-2"
                />
              ) : null}
              <div>
                <h1 className="text-3xl font-black text-stone-900">{team.nameHe || team.nameEn}</h1>
                <p className="mt-1 text-stone-500">{team.nameEn}</p>
                <p className="mt-2 text-sm text-stone-600">עונה: {team.season.name}</p>
                <p className="mt-1 text-sm text-stone-600">מאמן: {team.coachHe || team.coach || 'לא הוזן'}</p>
              </div>
            </div>
            <Link href={`/teams/${team.id}/charts`} className="rounded-full bg-stone-900 px-5 py-3 font-bold text-white">
              📊 סטטיסטיקות
            </Link>
          </div>
        </section>

        {standing?.pointsAdjustment !== 0 || standing?.pointsAdjustmentNoteHe ? (
          <section className="rounded-[24px] border border-red-200 bg-red-50 p-5 shadow-sm">
            <h2 className="text-lg font-black text-red-950">עדכון נקודות לעונה</h2>
            <p className="mt-2 text-sm text-red-900">
              שינוי נקודות: {standing?.pointsAdjustment && standing.pointsAdjustment > 0 ? '+' : ''}
              {standing?.pointsAdjustment ?? 0}
            </p>
            {standing?.pointsAdjustmentNoteHe ? (
              <p className="mt-2 text-sm text-red-800">{standing.pointsAdjustmentNoteHe}</p>
            ) : null}
          </section>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-stone-900">סיכום עונה</h2>
            {standing ? (
              <div className="mt-4 space-y-3 text-sm">
                <StatRow label="מיקום" value={String(standing.displayPosition)} />
                <StatRow label="נקודות בסיס" value={String(standing.points)} />
                <StatRow label="תיקון נקודות" value={String(standing.pointsAdjustment)} />
                <StatRow label="נקודות מוצגות" value={String(standing.adjustedPoints)} />
                <StatRow label="שערי זכות" value={String(standing.goalsFor)} />
                <StatRow label="שערי חובה" value={String(standing.goalsAgainst)} />
              </div>
            ) : (
              <p className="mt-4 text-stone-500">אין עדיין נתוני טבלה לקבוצה זו.</p>
            )}
          </div>

          <div className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-stone-900">שחקני הסגל</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {team.players.map((player) => (
                <Link
                  key={player.id}
                  href={`/players/${player.id}`}
                  className="rounded-2xl border border-stone-200 bg-stone-50 p-4 transition hover:border-red-300"
                >
                  <div className="font-bold text-stone-900">{player.nameHe || player.nameEn}</div>
                  <div className="mt-1 text-sm text-stone-500">{player.position || 'ללא עמדה'}</div>
                  <div className="mt-2 text-xs text-stone-400">#{player.jerseyNumber ?? '-'}</div>
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
