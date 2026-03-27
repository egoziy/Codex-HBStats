import { notFound } from 'next/navigation';
import { getCompetitionDisplayName, getGameScoreDisplay, getRoundDisplayName } from '@/lib/competition-display';
import { formatPlayerName } from '@/lib/player-display';
import prisma from '@/lib/prisma';

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

  const hasDetailedStats = hasDetailedGameStats(game.gameStats);
  const eventSummary = buildEventSummary(game);

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
            {hasDetailedStats && game.gameStats ? (
              <div className="mt-4 space-y-3">
                <StatRow label="אחזקת כדור בית" value={formatPercent(game.gameStats.homeTeamPossession)} />
                <StatRow label="אחזקת כדור חוץ" value={formatPercent(game.gameStats.awayTeamPossession)} />
                <StatRow label="בעיטות למסגרת בית" value={formatNumber(game.gameStats.homeShotsOnTarget)} />
                <StatRow label="בעיטות למסגרת חוץ" value={formatNumber(game.gameStats.awayShotsOnTarget)} />
                <StatRow label="בעיטות בית" value={formatNumber(game.gameStats.homeShotsTotal)} />
                <StatRow label="בעיטות חוץ" value={formatNumber(game.gameStats.awayShotsTotal)} />
                <StatRow label="קרנות בית" value={formatNumber(game.gameStats.homeCorners)} />
                <StatRow label="קרנות חוץ" value={formatNumber(game.gameStats.awayCorners)} />
                <StatRow label="עבירות בית" value={formatNumber(game.gameStats.homeFouls)} />
                <StatRow label="עבירות חוץ" value={formatNumber(game.gameStats.awayFouls)} />
                <StatRow label="נבדלים בית" value={formatNumber(game.gameStats.homeOffsides)} />
                <StatRow label="נבדלים חוץ" value={formatNumber(game.gameStats.awayOffsides)} />
                <StatRow label="צהובים בית" value={formatNumber(game.gameStats.homeYellowCards)} />
                <StatRow label="צהובים חוץ" value={formatNumber(game.gameStats.awayYellowCards)} />
                <StatRow label="אדומים בית" value={formatNumber(game.gameStats.homeRedCards)} />
                <StatRow label="אדומים חוץ" value={formatNumber(game.gameStats.awayRedCards)} />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-stone-500">אין כרגע סטטיסטיקת API מפורטת למשחק הזה. מוצג סיכום שנגזר מהאירועים שנשמרו.</p>
                <StatRow label="שערי בית" value={String(eventSummary.homeGoals)} />
                <StatRow label="שערי חוץ" value={String(eventSummary.awayGoals)} />
                <StatRow label="צהובים בית" value={String(eventSummary.homeYellowCards)} />
                <StatRow label="צהובים חוץ" value={String(eventSummary.awayYellowCards)} />
                <StatRow label="אדומים בית" value={String(eventSummary.homeRedCards)} />
                <StatRow label="אדומים חוץ" value={String(eventSummary.awayRedCards)} />
                <StatRow label="חילופים בית" value={String(eventSummary.homeSubstitutions)} />
                <StatRow label="חילופים חוץ" value={String(eventSummary.awaySubstitutions)} />
              </div>
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
                    {event.player ? formatPlayerName(event.player) : 'שחקן לא משויך'}
                    {event.relatedPlayer ? ` | ${formatPlayerName(event.relatedPlayer)}` : ''}
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

function hasDetailedGameStats(
  stats:
    | {
        homeTeamPossession: number | null;
        awayTeamPossession: number | null;
        homeShotsOnTarget: number | null;
        awayShotsOnTarget: number | null;
        homeShotsTotal: number | null;
        awayShotsTotal: number | null;
        homeCorners: number | null;
        awayCorners: number | null;
        homeFouls: number | null;
        awayFouls: number | null;
        homeOffsides: number | null;
        awayOffsides: number | null;
        homeYellowCards: number | null;
        awayYellowCards: number | null;
        homeRedCards: number | null;
        awayRedCards: number | null;
      }
    | null
) {
  if (!stats) return false;

  return [
    stats.homeTeamPossession,
    stats.awayTeamPossession,
    stats.homeShotsOnTarget,
    stats.awayShotsOnTarget,
    stats.homeShotsTotal,
    stats.awayShotsTotal,
    stats.homeCorners,
    stats.awayCorners,
    stats.homeFouls,
    stats.awayFouls,
    stats.homeOffsides,
    stats.awayOffsides,
    stats.homeYellowCards,
    stats.awayYellowCards,
    stats.homeRedCards,
    stats.awayRedCards,
  ].some((value) => value !== null);
}

function formatNumber(value: number | null) {
  return value === null ? '—' : String(value);
}

function formatPercent(value: number | null) {
  return value === null ? '—' : `${value}%`;
}

function buildEventSummary(
  game: {
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number | null;
    awayScore: number | null;
    events: Array<{ teamId: string | null; type: string }>;
  }
) {
  const countEvents = (teamId: string, types: string[]) =>
    game.events.filter((event) => event.teamId === teamId && types.includes(event.type)).length;

  return {
    homeGoals: game.homeScore ?? countEvents(game.homeTeamId, ['GOAL', 'PENALTY_GOAL', 'OWN_GOAL']),
    awayGoals: game.awayScore ?? countEvents(game.awayTeamId, ['GOAL', 'PENALTY_GOAL', 'OWN_GOAL']),
    homeYellowCards: countEvents(game.homeTeamId, ['YELLOW_CARD']),
    awayYellowCards: countEvents(game.awayTeamId, ['YELLOW_CARD']),
    homeRedCards: countEvents(game.homeTeamId, ['RED_CARD']),
    awayRedCards: countEvents(game.awayTeamId, ['RED_CARD']),
    homeSubstitutions: countEvents(game.homeTeamId, ['SUBSTITUTION_IN']),
    awaySubstitutions: countEvents(game.awayTeamId, ['SUBSTITUTION_IN']),
  };
}
