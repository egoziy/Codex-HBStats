import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { TeamChartsView } from '@/components/Charts';

export default async function TeamChartsPage({ params }: { params: { id: string } }) {
  const team = await prisma.team.findUnique({
    where: { id: params.id },
    include: {
      standings: true,
      homeGames: true,
      awayGames: true,
      players: {
        include: {
          playerStats: true,
        },
      },
    },
  });

  if (!team) {
    notFound();
  }

  const games = [...team.homeGames, ...team.awayGames]
    .sort((left, right) => +left.dateTime - +right.dateTime)
    .slice(0, 12);

  let points = 0;
  const goalsByMatchday = games.map((game, index) => {
    const isHome = game.homeTeamId === team.id;
    const goalsFor = isHome ? game.homeScore ?? 0 : game.awayScore ?? 0;
    const goalsAgainst = isHome ? game.awayScore ?? 0 : game.homeScore ?? 0;

    if (goalsFor > goalsAgainst) points += 3;
    if (goalsFor === goalsAgainst) points += 1;

    return {
      מחזור: String(index + 1),
      זכות: goalsFor,
      חובה: goalsAgainst,
    };
  });

  const pointsProgress = games.map((game, index) => {
    const isHome = game.homeTeamId === team.id;
    const goalsFor = isHome ? game.homeScore ?? 0 : game.awayScore ?? 0;
    const goalsAgainst = isHome ? game.awayScore ?? 0 : game.homeScore ?? 0;
    const nextPoints = index === 0 ? 0 : 0;
    return {
      מחזור: String(index + 1),
      נקודות:
        nextPoints +
        goalsByMatchday
          .slice(0, index + 1)
          .reduce((total, row) => total + (row.זכות > row.חובה ? 3 : row.זכות === row.חובה ? 1 : 0), 0),
    };
  });

  const standing = team.standings[0];
  const resultBreakdown = [
    { name: 'ניצחונות', value: standing?.wins ?? 0 },
    { name: 'תיקו', value: standing?.draws ?? 0 },
    { name: 'הפסדים', value: standing?.losses ?? 0 },
  ];

  const topScorers = team.players
    .map((player) => ({
      שחקן: player.nameHe,
      שערים: player.playerStats.reduce((sum, item) => sum + item.goals, 0),
      בישולים: player.playerStats.reduce((sum, item) => sum + item.assists, 0),
    }))
    .sort((left, right) => right.שערים - left.שערים)
    .slice(0, 5);

  const topAssisters = [...topScorers]
    .sort((left, right) => right.בישולים - left.בישולים)
    .map(({ שחקן, בישולים }) => ({ שחקן, בישולים }))
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-stone-100 px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-black text-stone-900">סטטיסטיקות קבוצה: {team.nameHe}</h1>
          <p className="mt-2 text-stone-600">גרפים מרכזיים לעונה הנוכחית של הקבוצה.</p>
        </section>
        <TeamChartsView
          goalsByMatchday={goalsByMatchday}
          pointsProgress={pointsProgress}
          resultBreakdown={resultBreakdown}
          topScorers={topScorers}
          topAssisters={topAssisters}
        />
      </div>
    </div>
  );
}
