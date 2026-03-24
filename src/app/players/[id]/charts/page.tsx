import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { PlayerChartsView } from '@/components/Charts';

export default async function PlayerChartsPage({ params }: { params: { id: string } }) {
  const player = await prisma.player.findUnique({
    where: { id: params.id },
    include: {
      playerStats: {
        orderBy: [{ season: { year: 'asc' } }],
        include: { season: true },
      },
    },
  });

  if (!player) {
    notFound();
  }

  const goalsAssists = player.playerStats.map((stat) => ({
    עונה: stat.season?.name || stat.seasonLabelHe || stat.seasonLabelEn || 'עונה',
    שערים: stat.goals,
    בישולים: stat.assists,
  }));

  const minutesPlayed = player.playerStats.map((stat) => ({
    עונה: stat.season?.name || stat.seasonLabelHe || stat.seasonLabelEn || 'עונה',
    דקות: stat.minutesPlayed,
  }));

  const cards = player.playerStats.map((stat) => ({
    עונה: stat.season?.name || stat.seasonLabelHe || stat.seasonLabelEn || 'עונה',
    צהובים: stat.yellowCards,
    אדומים: stat.redCards,
  }));

  return (
    <div className="min-h-screen bg-stone-100 px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-black text-stone-900">סטטיסטיקות שחקן: {player.nameHe}</h1>
          <p className="mt-2 text-stone-600">גרפים עונתיים של שערים, בישולים, דקות וכרטיסים.</p>
        </section>
        <PlayerChartsView goalsAssists={goalsAssists} minutesPlayed={minutesPlayed} cards={cards} />
      </div>
    </div>
  );
}
