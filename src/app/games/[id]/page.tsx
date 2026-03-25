import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { getCompetitionDisplayName, getGameScoreDisplay, getRoundDisplayName } from '@/lib/competition-display';

const eventLabels: Record<string, string> = {
  GOAL: '⚽ שער',
  ASSIST: '🎯 בישול',
  YELLOW_CARD: '🟨 כרטיס צהוב',
  RED_CARD: '🟥 כרטיס אדום',
  SUBSTITUTION_IN: '🔁 חילוף נכנס',
  SUBSTITUTION_OUT: '🔁 חילוף יוצא',
  OWN_GOAL: '🥅 שער עצמי',
  PENALTY_GOAL: '• פנדל',
  PENALTY_MISSED: '❌ פנדל מוחמץ',
};

export default async function GamePage({ params }: { params: { id: string } }) {
  const game = await prisma.game.findUnique({
    where: { id: params.id },
    include: {
      homeTeam: true,
      awayTeam: true,
      competition: true,
      gameStats: true,
      events: {
        include: {
          player: true,
          relatedPlayer: true,
        },
        orderBy: [{ minute: 'asc' }, { sortOrder: 'asc' }],
      },
    },
  });

  if (!game) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-stone-100 px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="grid flex-1 gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
              <div className="text-center md:text-left">
                {game.homeTeam.logoUrl ? (
                  <img
                    src={game.homeTeam.logoUrl}
                    alt={game.homeTeam.nameHe || game.homeTeam.nameEn}
                    className="mx-auto mb-3 h-16 w-16 object-contain md:mx-0"
                  />
                ) : null}
                <div className="text-2xl font-black text-stone-900">{game.homeTeam.nameHe || game.homeTeam.nameEn}</div>
                <div className="text-sm text-stone-500">{game.homeTeam.nameEn}</div>
              </div>
              <div className="text-center">
                <div className="inline-flex rounded-full bg-stone-900 px-5 py-3 text-2xl font-black text-white">
                  {getGameScoreDisplay(game)}
                </div>
                <div className="mt-2 text-xs text-stone-500">
                  {new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium', timeStyle: 'short' }).format(game.dateTime)}
                </div>
                <div className="mt-2 text-sm font-semibold text-stone-700">
                  {getCompetitionDisplayName(game.competition)}
                </div>
                <div className="mt-1 text-xs text-stone-500">{getRoundDisplayName(game.roundNameHe, game.roundNameEn)}</div>
              </div>
              <div className="text-center md:text-right">
                {game.awayTeam.logoUrl ? (
                  <img
                    src={game.awayTeam.logoUrl}
                    alt={game.awayTeam.nameHe || game.awayTeam.nameEn}
                    className="mx-auto mb-3 h-16 w-16 object-contain md:mr-0 md:ml-auto"
                  />
                ) : null}
                <div className="text-2xl font-black text-stone-900">{game.awayTeam.nameHe || game.awayTeam.nameEn}</div>
                <div className="text-sm text-stone-500">{game.awayTeam.nameEn}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="rounded-full border border-stone-300 px-5 py-3 font-bold text-stone-700">ייצוא PDF</button>
              <button className="rounded-full bg-stone-900 px-5 py-3 font-bold text-white">🖨️ הדפס</button>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-stone-900">סטטיסטיקות משחק</h2>
            {game.gameStats ? (
              <div className="mt-4 space-y-3">
                <StatRow label="אחזקת כדור בית" value={`${game.gameStats.homeTeamPossession ?? 0}%`} />
                <StatRow label="אחזקת כדור חוץ" value={`${game.gameStats.awayTeamPossession ?? 0}%`} />
                <StatRow label="בעיטות למסגרת בית" value={String(game.gameStats.homeShotsOnTarget ?? 0)} />
                <StatRow label="בעיטות למסגרת חוץ" value={String(game.gameStats.awayShotsOnTarget ?? 0)} />
                <StatRow label="קרנות בית" value={String(game.gameStats.homeCorners ?? 0)} />
                <StatRow label="קרנות חוץ" value={String(game.gameStats.awayCorners ?? 0)} />
              </div>
            ) : (
              <p className="mt-4 text-stone-500">אין עדיין סטטיסטיקות משחק מפורטות.</p>
            )}
          </div>

          <div className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-stone-900">ציר אירועים</h2>
            <div className="mt-4 space-y-3">
              {game.events.map((event) => (
                <article key={event.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-bold text-stone-900">{eventLabels[event.type] || event.type}</div>
                    <div className="text-sm font-semibold text-stone-600">
                      {event.minute}
                      {event.extraMinute ? `+${event.extraMinute}` : ''}
                      &apos;
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-stone-600">
                    {event.player?.nameHe || event.player?.nameEn || 'שחקן לא משויך'}
                    {event.relatedPlayer ? ` | ${event.relatedPlayer.nameHe || event.relatedPlayer.nameEn}` : ''}
                  </div>
                  {event.notesHe ? <div className="mt-1 text-xs text-stone-500">{event.notesHe}</div> : null}
                </article>
              ))}
              {game.events.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-stone-500">
                  אין אירועים שמורים למשחק זה.
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-stone-50 px-4 py-3 text-sm">
      <span className="font-semibold text-stone-600">{label}</span>
      <span className="font-black text-stone-900">{value}</span>
    </div>
  );
}
