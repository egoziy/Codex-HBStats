import Link from 'next/link';
import { notFound } from 'next/navigation';
import { derivePlayerDeepStats } from '@/lib/deep-stats';
import prisma from '@/lib/prisma';

export default async function PlayerPage({ params }: { params: { id: string } }) {
  const player = await prisma.player.findUnique({
    where: { id: params.id },
    include: {
      team: {
        include: {
          season: true,
        },
      },
      uploads: {
        orderBy: [{ createdAt: 'asc' }],
      },
      playerStats: {
        where: { seasonId: { not: null } },
        include: {
          season: true,
          competition: true,
        },
        orderBy: [{ season: { year: 'desc' } }, { competition: { nameHe: 'asc' } }],
      },
    },
  });

  if (!player) {
    notFound();
  }

  const seasonGames = await prisma.game.findMany({
    where: {
      seasonId: player.team.seasonId,
      OR: [{ homeTeamId: player.teamId }, { awayTeamId: player.teamId }],
    },
    include: {
      competition: true,
      homeTeam: true,
      awayTeam: true,
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
  });

  const derived = derivePlayerDeepStats(player.id, seasonGames);
  const displayPhoto = player.photoUrl || player.uploads[0]?.filePath || null;
  const primarySeasonStats =
    player.playerStats.find((stat) => stat.seasonId === player.team.seasonId) || player.playerStats[0] || null;

  return (
    <div className="min-h-screen bg-stone-100 px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-5">
              {displayPhoto ? (
                <img src={displayPhoto} alt={player.nameEn} className="h-28 w-28 rounded-full border border-stone-200 bg-white object-cover" />
              ) : null}
              <div>
                <h1 className="text-3xl font-black text-stone-900">{player.nameHe || player.nameEn}</h1>
                <p className="mt-1 text-stone-500">{player.nameEn}</p>
                <p className="mt-2 text-sm text-stone-600">
                  {player.team.nameHe || player.team.nameEn} | עונת {player.team.season.name}
                </p>
                <p className="mt-1 text-sm text-stone-600">
                  {player.position || 'ללא עמדה'} | מספר {player.jerseyNumber ?? '-'}
                </p>
              </div>
            </div>
            <Link href={`/players/${player.id}/charts`} className="rounded-full bg-stone-900 px-5 py-3 font-bold text-white">
              גרפים עונתיים
            </Link>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="שערים" value={String(derived.goals)} />
          <StatCard label="בישולים" value={String(derived.assists)} />
          <StatCard label="דקות" value={String(derived.minutesPlayed)} />
          <StatCard label="משחקים" value={String(derived.gamesPlayed)} />
          <StatCard label="פתיחות" value={String(derived.starts)} />
          <StatCard label="כניסות כמחליף" value={String(derived.substituteAppearances)} />
          <StatCard label="הוחלף החוצה" value={String(derived.timesSubbedOff)} />
          <StatCard label="כרטיסים" value={`${derived.yellowCards} / ${derived.redCards}`} />
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-stone-900">פרטי שחקן</h2>
            <div className="mt-4 space-y-3 text-sm">
              <StatRow label="עמדה" value={player.position || 'לא צוין'} />
              <StatRow label="לאום" value={player.nationalityHe || player.nationalityEn || 'לא צוין'} />
              <StatRow label="קבוצה" value={player.team.nameHe || player.team.nameEn} />
              <StatRow label="תמונות נוספות" value={String(player.uploads.length)} />
            </div>
          </div>

          <div className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-stone-900">חלוקת דקות ותרומה לפי טווחי זמן</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {derived.bucketSummaries.map((bucket) => (
                <div key={bucket.key} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <div className="text-lg font-black text-stone-900">דקות {bucket.label}</div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <StatMini label="דקות" value={String(bucket.minutesPlayed)} />
                    <StatMini label="שערים" value={String(bucket.goals)} />
                    <StatMini label="בישולים" value={String(bucket.assists)} />
                    <StatMini label="כרטיסים" value={`${bucket.yellowCards}/${bucket.redCards}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-black text-stone-900">סטטיסטיקות שמורות לפי עונה ומסגרת</h2>
          {player.playerStats.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-right">
                <thead>
                  <tr className="border-b border-stone-200 text-sm text-stone-500">
                    <th className="px-3 py-3">עונה</th>
                    <th className="px-3 py-3">מסגרת</th>
                    <th className="px-3 py-3">שערים</th>
                    <th className="px-3 py-3">בישולים</th>
                    <th className="px-3 py-3">דקות</th>
                    <th className="px-3 py-3">פתיחות</th>
                    <th className="px-3 py-3">מחליף</th>
                    <th className="px-3 py-3">צהובים</th>
                    <th className="px-3 py-3">אדומים</th>
                  </tr>
                </thead>
                <tbody>
                  {player.playerStats.map((stat) => (
                    <tr key={stat.id} className="border-b border-stone-100 text-sm">
                      <td className="px-3 py-3">{stat.season?.name || stat.seasonLabelHe || stat.seasonLabelEn || '-'}</td>
                      <td className="px-3 py-3">{stat.competition?.nameHe || stat.competition?.nameEn || 'כולל'}</td>
                      <td className="px-3 py-3">{stat.goals}</td>
                      <td className="px-3 py-3">{stat.assists}</td>
                      <td className="px-3 py-3">{stat.minutesPlayed}</td>
                      <td className="px-3 py-3">{stat.starts}</td>
                      <td className="px-3 py-3">{stat.substituteAppearances}</td>
                      <td className="px-3 py-3">{stat.yellowCards}</td>
                      <td className="px-3 py-3">{stat.redCards}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-stone-500">אין עדיין סטטיסטיקות שמורות לשחקן הזה.</p>
          )}
          {primarySeasonStats ? (
            <p className="mt-4 text-sm text-stone-500">
              סיכום עונה נוכחית: {primarySeasonStats.gamesPlayed} משחקים, {primarySeasonStats.minutesPlayed} דקות, {primarySeasonStats.starts} פתיחות.
            </p>
          ) : null}
        </section>

        {player.uploads.length > 0 ? (
          <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-stone-900">גלריית שחקן</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {player.uploads.map((upload) => (
                <div key={upload.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-50">
                  <img src={upload.filePath} alt={upload.title || player.nameEn} className="h-56 w-full object-cover" />
                  <div className="p-4 text-sm text-stone-600">
                    <div className="font-semibold text-stone-900">{upload.title || 'ללא כותרת'}</div>
                    {upload.isPrimary ? <div className="mt-2 font-bold text-red-700">תמונה ראשית</div> : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
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
