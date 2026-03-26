import Link from 'next/link';
import { notFound } from 'next/navigation';
import { derivePlayerDeepStats, deriveTeamDeepStats } from '@/lib/deep-stats';
import prisma from '@/lib/prisma';
import { sortStandings } from '@/lib/standings';

export default async function TeamPage({ params }: { params: { id: string } }) {
  const team = await prisma.team.findUnique({
    where: { id: params.id },
    include: {
      players: {
        orderBy: [{ jerseyNumber: 'asc' }, { nameHe: 'asc' }, { nameEn: 'asc' }],
        take: 40,
        include: {
          uploads: {
            orderBy: [{ createdAt: 'asc' }],
          },
          playerStats: {
            where: { seasonId: { not: null } },
          },
        },
      },
      standings: true,
      teamStats: true,
      uploads: {
        orderBy: [{ createdAt: 'asc' }],
      },
      season: true,
    },
  });

  if (!team) {
    notFound();
  }

  const [seasonStandings, teamGames] = await Promise.all([
    prisma.standing.findMany({
      where: { seasonId: team.seasonId },
      include: { team: true },
      orderBy: [{ position: 'asc' }, { points: 'desc' }],
    }),
    prisma.game.findMany({
      where: {
        seasonId: team.seasonId,
        OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }],
      },
      include: {
        events: {
          select: {
            minute: true,
            extraMinute: true,
            type: true,
            playerId: true,
            relatedPlayerId: true,
            teamId: true,
          },
        },
        lineupEntries: {
          select: {
            playerId: true,
            role: true,
            teamId: true,
          },
        },
        gameStats: {
          select: {
            homeTeamPossession: true,
            awayTeamPossession: true,
            homeShotsOnTarget: true,
            awayShotsOnTarget: true,
            homeShotsTotal: true,
            awayShotsTotal: true,
            homeCorners: true,
            awayCorners: true,
            homeFouls: true,
            awayFouls: true,
            homeOffsides: true,
            awayOffsides: true,
            homeYellowCards: true,
            awayYellowCards: true,
            homeRedCards: true,
            awayRedCards: true,
          },
        },
      },
      orderBy: { dateTime: 'desc' },
    }),
  ]);

  const standing = sortStandings(seasonStandings).find((row) => row.teamId === team.id) || null;
  const derived = deriveTeamDeepStats(team.id, teamGames);
  const seasonTeamStat = team.teamStats.find((stat) => stat.seasonId === team.seasonId) || team.teamStats[0] || null;
  const topScorers = team.players
    .map((player) => {
      const totals = derivePlayerDeepStats(player.id, teamGames);

      return {
        id: player.id,
        name: player.nameHe || player.nameEn,
        goals: totals.goals,
        assists: totals.assists,
        minutes: totals.minutesPlayed,
        photo: player.photoUrl || player.uploads[0]?.filePath || null,
      };
    })
    .sort((left, right) => right.goals - left.goals || right.assists - left.assists)
    .slice(0, 5);

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
              גרפי קבוצה
            </Link>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="מיקום" value={String(standing?.displayPosition ?? '-')} />
          <StatCard label="נקודות" value={String(standing?.adjustedPoints ?? seasonTeamStat?.points ?? 0)} />
          <StatCard label="משחקים" value={String(derived.matchesPlayed)} />
          <StatCard label="שערים" value={`${derived.goalsFor} / ${derived.goalsAgainst}`} />
          <StatCard label="מאזן" value={`${derived.wins}-${derived.draws}-${derived.losses}`} />
          <StatCard label="כרטיסים" value={`${derived.yellowCards} / ${derived.redCards}`} />
          <StatCard label="איומים למסגרת" value={String(derived.shotsOnTarget)} />
          <StatCard label="החזקת כדור" value={`${derived.averagePossession.toFixed(1)}%`} />
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-stone-900">סיכום עונה</h2>
            <div className="mt-4 space-y-3 text-sm">
              <StatRow label="ניצחונות" value={String(derived.wins)} />
              <StatRow label="תיקו" value={String(derived.draws)} />
              <StatRow label="הפסדים" value={String(derived.losses)} />
              <StatRow label="שערי זכות" value={String(derived.goalsFor)} />
              <StatRow label="שערי חובה" value={String(derived.goalsAgainst)} />
              <StatRow label="קלין שיט" value={String(derived.cleanSheets)} />
              <StatRow label="קרנות" value={String(derived.corners)} />
              <StatRow label="נבדלים" value={String(derived.offsides)} />
            </div>
          </div>

          <div className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-stone-900">התפלגות לפי דקות</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {derived.bucketSummaries.map((bucket) => (
                <div key={bucket.key} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <div className="text-lg font-black text-stone-900">דקות {bucket.label}</div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <StatMini label="שערים" value={String(bucket.goals)} />
                    <StatMini label="צהובים" value={String(bucket.yellowCards)} />
                    <StatMini label="אדומים" value={String(bucket.redCards)} />
                    <StatMini label="בישולים" value={String(bucket.assists)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-black text-stone-900">המובילים של הקבוצה</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {topScorers.map((player) => (
              <Link
                key={player.id}
                href={`/players/${player.id}`}
                className="rounded-2xl border border-stone-200 bg-stone-50 p-4 transition hover:border-red-300"
              >
                <div className="flex items-center gap-3">
                  {player.photo ? (
                    <img src={player.photo} alt={player.name} className="h-12 w-12 rounded-full object-cover" />
                  ) : null}
                  <div className="font-bold text-stone-900">{player.name}</div>
                </div>
                <div className="mt-3 text-sm text-stone-600">
                  <div>שערים: {player.goals}</div>
                  <div>בישולים: {player.assists}</div>
                  <div>דקות: {player.minutes}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-black text-stone-900">שחקני הסגל</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {team.players.map((player) => (
              <Link
                key={player.id}
                href={`/players/${player.id}`}
                className="rounded-2xl border border-stone-200 bg-stone-50 p-4 transition hover:border-red-300"
              >
                <div className="flex items-center gap-3">
                  {player.photoUrl || player.uploads[0]?.filePath ? (
                    <img
                      src={player.photoUrl || player.uploads[0]?.filePath || ''}
                      alt={player.nameHe || player.nameEn}
                      className="h-14 w-14 rounded-full bg-white object-cover"
                    />
                  ) : null}
                  <div>
                    <div className="font-bold text-stone-900">{player.nameHe || player.nameEn}</div>
                    <div className="mt-1 text-sm text-stone-500">{player.position || 'ללא עמדה'}</div>
                    <div className="mt-2 text-xs text-stone-400">#{player.jerseyNumber ?? '-'}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-semibold text-stone-500">{label}</div>
      <div className="mt-3 text-3xl font-black text-stone-900">{value}</div>
    </article>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white px-3 py-3">
      <div className="text-xs font-semibold text-stone-500">{label}</div>
      <div className="mt-2 text-lg font-black text-stone-900">{value}</div>
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
