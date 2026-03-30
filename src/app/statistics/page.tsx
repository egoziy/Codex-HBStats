import Link from 'next/link';

import { formatPlayerName, formatPlayerPosition } from '@/lib/player-display';
import prisma from '@/lib/prisma';
import { sortStandings } from '@/lib/standings';

export const dynamic = 'force-dynamic';

export default async function StatisticsPage({
  searchParams,
}: {
  searchParams?: { season?: string; teamId?: string };
}) {
  const seasons = await prisma.season.findMany({
    orderBy: { year: 'desc' },
    take: 10,
  });

  const selectedSeasonId = searchParams?.season || seasons[0]?.id || null;
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) || seasons[0] || null;

  const teams = selectedSeason
    ? await prisma.team.findMany({
        where: { seasonId: selectedSeason.id },
        orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
      })
    : [];

  const selectedTeamId = searchParams?.teamId || 'all';
  const selectedTeam = teams.find((team) => team.id === selectedTeamId) || null;

  const [rawStandings, games, players] = await Promise.all([
    selectedSeason
      ? prisma.standing.findMany({
          where: {
            seasonId: selectedSeason.id,
            ...(selectedTeam ? { teamId: selectedTeam.id } : {}),
          },
          include: { team: true },
          orderBy: [{ position: 'asc' }, { points: 'desc' }],
        })
      : [],
    selectedSeason
      ? prisma.game.findMany({
          where: {
            seasonId: selectedSeason.id,
            ...(selectedTeam
              ? {
                  OR: [{ homeTeamId: selectedTeam.id }, { awayTeamId: selectedTeam.id }],
                }
              : {}),
          },
          include: { homeTeam: true, awayTeam: true },
        })
      : [],
    selectedTeam
      ? prisma.player.findMany({
          where: { teamId: selectedTeam.id },
          include: { playerStats: true },
          orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
        })
      : [],
  ]);

  const standings = sortStandings(rawStandings);

  let totalGoals = 0;
  for (const game of games) {
    totalGoals += (game.homeScore ?? 0) + (game.awayScore ?? 0);
  }
  const completedGames = games.length;
  const averageGoals = completedGames ? (totalGoals / completedGames).toFixed(2) : '0.00';
  const pointsLeader = standings[0];
  const totalPlayers = players.length;

  return (
    <div className="min-h-screen bg-stone-100 px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Statistics</p>
          <h1 className="mt-2 text-3xl font-black text-stone-900">מרכז סטטיסטיקות</h1>
          <p className="mt-3 max-w-3xl text-stone-600">
            בחרו עונה, ואם תרצו גם קבוצה ספציפית, כדי לראות תמונת מצב סטטיסטית מלאה.
          </p>

          <form className="mt-6 grid gap-4 md:grid-cols-[1fr_1fr_auto]" action="/statistics">
            <select
              name="season"
              defaultValue={selectedSeason?.id || ''}
              className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 font-semibold"
            >
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>

            <select
              name="teamId"
              defaultValue={selectedTeamId}
              className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 font-semibold"
            >
              <option value="all">כל הקבוצות</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.nameHe || team.nameEn}
                </option>
              ))}
            </select>

            <button className="rounded-full bg-stone-900 px-5 py-3 font-bold text-white">הצג נתונים</button>
          </form>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatsCard title="עונה נבחרת" value={selectedSeason?.name || '-'} subtitle="סינון הנתונים הנוכחי" />
          <StatsCard title="משחקים" value={String(completedGames)} subtitle="במסגרת הסינון הנוכחי" />
          <StatsCard title='סה"כ שערים' value={String(totalGoals)} subtitle={`ממוצע למשחק: ${averageGoals}`} />
          <StatsCard
            title="מובילה בנקודות"
            value={pointsLeader ? pointsLeader.team.nameHe || pointsLeader.team.nameEn : '-'}
            subtitle={pointsLeader ? `${pointsLeader.adjustedPoints} נקודות` : 'אין נתונים'}
          />
        </section>

        {selectedTeam ? (
          <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-2xl font-black text-stone-900">סטטיסטיקה לקבוצה: {selectedTeam.nameHe || selectedTeam.nameEn}</h2>
              <p className="mt-2 text-sm text-stone-600">סגל הקבוצה בעונה הנבחרת ומאפייני הביצועים שלה.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <StatsCard title="שחקנים בסגל" value={String(totalPlayers)} subtitle="לפי הנתונים שנשמרו" />
              <StatsCard title="ניצחונות" value={String(standings[0]?.wins ?? 0)} subtitle="בטבלת העונה הנבחרת" />
              <StatsCard title="שערי זכות" value={String(standings[0]?.goalsFor ?? 0)} subtitle="במסגרת הסינון" />
              <StatsCard
                title="נקודות אחרי תיקון"
                value={String(standings[0]?.adjustedPoints ?? 0)}
                subtitle={
                  standings[0]?.pointsAdjustmentNoteHe ||
                  (standings[0]?.pointsAdjustment
                    ? `תיקון: ${standings[0].pointsAdjustment > 0 ? `+${standings[0].pointsAdjustment}` : standings[0].pointsAdjustment}`
                    : 'ללא תיקון נקודות')
                }
              />
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-right">
                <thead>
                  <tr className="border-b border-stone-200 text-sm text-stone-500">
                    <th className="px-3 py-3">שחקן</th>
                    <th className="px-3 py-3">מספר</th>
                    <th className="px-3 py-3">עמדה</th>
                    <th className="px-3 py-3">הופעות</th>
                    <th className="px-3 py-3">שערים</th>
                    <th className="px-3 py-3">בישולים</th>
                    <th className="px-3 py-3">צהובים</th>
                    <th className="px-3 py-3">אדומים</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((player) => {
                    const totals = player.playerStats.reduce(
                      (acc, stat) => ({
                        gamesPlayed: acc.gamesPlayed + stat.gamesPlayed,
                        goals: acc.goals + stat.goals,
                        assists: acc.assists + stat.assists,
                        yellowCards: acc.yellowCards + stat.yellowCards,
                        redCards: acc.redCards + stat.redCards,
                      }),
                      { gamesPlayed: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 }
                    );

                    return (
                      <tr key={player.id} className="border-b border-stone-100 text-sm">
                        <td className="px-3 py-3 font-semibold">
                          <Link
                            href={`/players/${player.canonicalPlayerId || player.id}`}
                            className="font-semibold text-stone-900 transition hover:text-amber-700"
                          >
                            {formatPlayerName(player)}
                          </Link>
                        </td>
                        <td className="px-3 py-3">{player.jerseyNumber ?? '-'}</td>
                        <td className="px-3 py-3">{formatPlayerPosition(player.position)}</td>
                        <td className="px-3 py-3">{totals.gamesPlayed}</td>
                        <td className="px-3 py-3">{totals.goals}</td>
                        <td className="px-3 py-3">{totals.assists}</td>
                        <td className="px-3 py-3">{totals.yellowCards}</td>
                        <td className="px-3 py-3">{totals.redCards}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-stone-900">תמונת מצב לכל הקבוצות</h2>
            <p className="mt-2 text-sm text-stone-600">כאן מוצגים נתוני הטבלה עבור כל הקבוצות בעונה שבחרת.</p>

            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-right">
                <thead>
                  <tr className="border-b border-stone-200 text-sm text-stone-500">
                    <th className="px-3 py-3">קבוצה</th>
                    <th className="px-3 py-3">מיקום</th>
                    <th className="px-3 py-3">נקודות</th>
                    <th className="px-3 py-3">תיקון</th>
                    <th className="px-3 py-3">ניצחונות</th>
                    <th className="px-3 py-3">הפרש שערים</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((row) => (
                    <tr key={row.id} className="border-b border-stone-100 text-sm">
                      <td className="px-3 py-3 font-semibold">{row.team.nameHe || row.team.nameEn}</td>
                      <td className="px-3 py-3">{row.displayPosition}</td>
                      <td className="px-3 py-3">{row.adjustedPoints}</td>
                      <td className="px-3 py-3">
                        {row.pointsAdjustment !== 0 ? (
                          <span className={row.pointsAdjustment < 0 ? 'font-bold text-red-700' : 'font-bold text-emerald-700'}>
                            {row.pointsAdjustment > 0 ? `+${row.pointsAdjustment}` : row.pointsAdjustment}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-3 py-3">{row.wins}</td>
                      <td className="px-3 py-3">{row.goalDifference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function StatsCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <article className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-semibold text-stone-500">{title}</div>
      <div className="mt-3 text-3xl font-black text-stone-900">{value}</div>
      <div className="mt-2 text-sm text-stone-600">{subtitle}</div>
    </article>
  );
}
