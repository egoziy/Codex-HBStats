import { notFound } from 'next/navigation';
import { getCompetitionDisplayName, getGameScoreDisplay, getRoundDisplayName } from '@/lib/competition-display';
import { formatPlayerName } from '@/lib/player-display';
import prisma from '@/lib/prisma';

const eventLabels: Record<string, string> = {
  GOAL: 'שער',
  ASSIST: 'בישול',
  YELLOW_CARD: 'כרטיס צהוב',
  RED_CARD: 'כרטיס אדום',
  SUBSTITUTION_IN: 'חילוף נכנס',
  SUBSTITUTION_OUT: 'חילוף יוצא',
  OWN_GOAL: 'שער עצמי',
  PENALTY_GOAL: 'פנדל',
  PENALTY_MISSED: 'פנדל מוחמץ',
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
      lineupEntries: {
        include: {
          player: true,
          team: true,
        },
        orderBy: [{ role: 'asc' }, { positionGrid: 'asc' }, { jerseyNumber: 'asc' }, { participantName: 'asc' }],
      },
    },
  });

  if (!game) {
    notFound();
  }

  const hasDetailedStats = hasDetailedGameStats(game.gameStats);
  const eventSummary = buildEventSummary(game);
  const homeLineup = buildTeamLineup(game, game.homeTeamId);
  const awayLineup = buildTeamLineup(game, game.awayTeamId);
  const comparisonRows = buildComparisonRows(game.gameStats, eventSummary);

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
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-stone-900">סטטיסטיקת משחק</h2>
            <p className="mt-2 text-sm text-stone-500">גרפים השוואתיים של נתוני המשחק בין שתי הקבוצות.</p>
            <div className="mt-5 space-y-4">
              {comparisonRows.map((row) => (
                <ComparisonBar
                  key={row.label}
                  label={row.label}
                  homeValue={row.homeValue}
                  awayValue={row.awayValue}
                  homeDisplay={row.homeDisplay}
                  awayDisplay={row.awayDisplay}
                />
              ))}
            </div>
            {!hasDetailedStats ? (
              <div className="mt-5 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 text-sm text-stone-500">
                נתוני ה־API למשחק הזה חלקיים, ולכן חלק מהגרפים מבוססים על סיכום האירועים שנשמרו.
              </div>
            ) : null}
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

        <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-stone-900">הרכבים ומחליפים</h2>
              <p className="mt-2 text-sm text-stone-500">הרכב פותח לפי עמדות על המגרש, כולל ספסל ומאמן לכל קבוצה.</p>
            </div>
            {(homeLineup.formation || awayLineup.formation) ? (
              <div className="rounded-full bg-stone-100 px-4 py-2 text-sm font-bold text-stone-700">
                {homeLineup.formation || '-'} מול {awayLineup.formation || '-'}
              </div>
            ) : null}
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <TeamLineupCard teamName={game.homeTeam.nameHe || game.homeTeam.nameEn} side="home" lineup={homeLineup} />
            <TeamLineupCard teamName={game.awayTeam.nameHe || game.awayTeam.nameEn} side="away" lineup={awayLineup} />
          </div>
        </section>

        <section className="rounded-[24px] border border-amber-200 bg-amber-50/70 p-6 shadow-sm">
          <h2 className="text-2xl font-black text-stone-900">xG - שערים צפויים</h2>
          <p className="mt-3 text-sm leading-7 text-stone-700">
            אפשר לחשב <strong>xG</strong>, אבל כדי לחשב אותו בצורה אמינה צריך נתוני בעיטה ברמת אירוע כמו מיקום הבעיטה,
            סוג הבעיטה, חלק גוף, מצב נייח, זווית, מרחק ולחץ הגנתי. בנתונים שיש כרגע במערכת אין מספיק פירוט כזה,
            ולכן אפשר לכל היותר לייצר הערכה גסה ולא xG אמיתי ברמה של ספקי דאטה מקצועיים.
          </p>
          <p className="mt-3 text-sm leading-7 text-stone-700">
            אם נתחיל לשמור נתוני shots מפורטים יותר מה־API, אפשר יהיה להוסיף בהמשך גם מודל xG משוער לדף המשחק.
          </p>
        </section>
      </div>
    </div>
  );
}

function TeamLineupCard({
  teamName,
  side,
  lineup,
}: {
  teamName: string;
  side: 'home' | 'away';
  lineup: ReturnType<typeof buildTeamLineup>;
}) {
  return (
    <div className="rounded-[24px] border border-stone-200 bg-stone-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-black text-stone-900">{teamName}</h3>
          <div className="mt-1 text-xs text-stone-500">
            {lineup.coachName ? `מאמן: ${lineup.coachName}` : 'מאמן לא זמין'}
          </div>
        </div>
        {lineup.formation ? (
          <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-stone-700">{lineup.formation}</span>
        ) : null}
      </div>

      {lineup.starters.length > 0 ? (
        <FootballPitch side={side} starters={lineup.starters} />
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-white p-5 text-center text-sm text-stone-500">
          אין הרכב פותח שמור לקבוצה זו.
        </div>
      )}

      <div className="mt-4 rounded-[20px] border border-stone-200 bg-white p-4">
        <div className="text-sm font-black text-stone-900">מחליפים</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {lineup.substitutes.map((player) => (
            <div key={player.id} className="rounded-2xl bg-stone-50 px-3 py-2 text-sm">
              <div className="font-semibold text-stone-900">
                {player.jerseyNumber ? `${player.jerseyNumber}. ` : ''}
                {player.displayName}
              </div>
              <div className="text-xs text-stone-500">{player.positionName || 'ספסל'}</div>
            </div>
          ))}
          {lineup.substitutes.length === 0 ? <div className="text-sm text-stone-500">אין מחליפים שמורים.</div> : null}
        </div>
      </div>
    </div>
  );
}

function FootballPitch({
  side,
  starters,
}: {
  side: 'home' | 'away';
  starters: Array<{ id: string; displayName: string; jerseyNumber: number | null; positionName: string | null; positionGrid: string | null }>;
}) {
  const rows = buildFormationRows(starters, side);

  return (
    <div className="mt-4 overflow-hidden rounded-[24px] border border-emerald-900/20 bg-[linear-gradient(180deg,#0f5132,#0b3b2a)] p-4 shadow-inner">
      <div className="rounded-[22px] border border-white/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-3">
        <div className="relative overflow-hidden rounded-[18px] border border-white/10 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.10),transparent_48%),linear-gradient(180deg,#166534,#14532d)] px-3 py-4">
          <div className="pointer-events-none absolute inset-3 rounded-[14px] border border-white/20" />
          <div className="pointer-events-none absolute inset-x-3 top-1/2 h-px bg-white/20" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />

          <div className="relative z-10 grid gap-4">
            {rows.map((row, index) => (
              <div key={`${side}-${index}`} className="flex flex-wrap items-center justify-center gap-3">
                {row.map((player) => (
                  <div key={player.id} className="min-w-[74px] max-w-[96px] text-center">
                    <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/25 bg-white/90 text-sm font-black text-emerald-900 shadow-sm">
                      {player.jerseyNumber ?? '?'}
                    </div>
                    <div className="mt-1 text-[11px] font-bold leading-4 text-white">{player.displayName}</div>
                    <div className="text-[10px] text-emerald-100/80">{player.positionName || 'שחקן'}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ComparisonBar({
  label,
  homeValue,
  awayValue,
  homeDisplay,
  awayDisplay,
}: {
  label: string;
  homeValue: number | null;
  awayValue: number | null;
  homeDisplay: string;
  awayDisplay: string;
}) {
  const safeHome = homeValue ?? 0;
  const safeAway = awayValue ?? 0;
  const total = Math.max(safeHome + safeAway, 1);
  const homeWidth = (safeHome / total) * 100;
  const awayWidth = (safeAway / total) * 100;

  return (
    <div className="rounded-[20px] border border-stone-200 bg-stone-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-lg font-black text-stone-900">{homeDisplay}</div>
        <div className="text-sm font-bold text-stone-600">{label}</div>
        <div className="text-lg font-black text-stone-900">{awayDisplay}</div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="h-3 overflow-hidden rounded-full bg-stone-200">
          <div className="h-full rounded-full bg-red-700" style={{ width: `${homeWidth}%`, marginInlineStart: 'auto' }} />
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-stone-200">
          <div className="h-full rounded-full bg-stone-900" style={{ width: `${awayWidth}%` }} />
        </div>
      </div>
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

function formatPercent(value: number | null) {
  return value === null ? '—' : `${value}%`;
}

function formatNumber(value: number | null) {
  return value === null ? '—' : String(value);
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

function buildComparisonRows(
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
    | null,
  eventSummary: ReturnType<typeof buildEventSummary>
) {
  return [
    {
      label: 'אחזקת כדור',
      homeValue: stats?.homeTeamPossession ?? null,
      awayValue: stats?.awayTeamPossession ?? null,
      homeDisplay: formatPercent(stats?.homeTeamPossession ?? null),
      awayDisplay: formatPercent(stats?.awayTeamPossession ?? null),
    },
    {
      label: 'בעיטות למסגרת',
      homeValue: stats?.homeShotsOnTarget ?? null,
      awayValue: stats?.awayShotsOnTarget ?? null,
      homeDisplay: formatNumber(stats?.homeShotsOnTarget ?? null),
      awayDisplay: formatNumber(stats?.awayShotsOnTarget ?? null),
    },
    {
      label: 'בעיטות',
      homeValue: stats?.homeShotsTotal ?? null,
      awayValue: stats?.awayShotsTotal ?? null,
      homeDisplay: formatNumber(stats?.homeShotsTotal ?? null),
      awayDisplay: formatNumber(stats?.awayShotsTotal ?? null),
    },
    {
      label: 'קרנות',
      homeValue: stats?.homeCorners ?? null,
      awayValue: stats?.awayCorners ?? null,
      homeDisplay: formatNumber(stats?.homeCorners ?? null),
      awayDisplay: formatNumber(stats?.awayCorners ?? null),
    },
    {
      label: 'עבירות',
      homeValue: stats?.homeFouls ?? null,
      awayValue: stats?.awayFouls ?? null,
      homeDisplay: formatNumber(stats?.homeFouls ?? null),
      awayDisplay: formatNumber(stats?.awayFouls ?? null),
    },
    {
      label: 'נבדלים',
      homeValue: stats?.homeOffsides ?? null,
      awayValue: stats?.awayOffsides ?? null,
      homeDisplay: formatNumber(stats?.homeOffsides ?? null),
      awayDisplay: formatNumber(stats?.awayOffsides ?? null),
    },
    {
      label: 'צהובים',
      homeValue: stats?.homeYellowCards ?? eventSummary.homeYellowCards,
      awayValue: stats?.awayYellowCards ?? eventSummary.awayYellowCards,
      homeDisplay: formatNumber(stats?.homeYellowCards ?? eventSummary.homeYellowCards),
      awayDisplay: formatNumber(stats?.awayYellowCards ?? eventSummary.awayYellowCards),
    },
    {
      label: 'אדומים',
      homeValue: stats?.homeRedCards ?? eventSummary.homeRedCards,
      awayValue: stats?.awayRedCards ?? eventSummary.awayRedCards,
      homeDisplay: formatNumber(stats?.homeRedCards ?? eventSummary.homeRedCards),
      awayDisplay: formatNumber(stats?.awayRedCards ?? eventSummary.awayRedCards),
    },
  ];
}

function buildTeamLineup(
  game: {
    lineupEntries: Array<{
      id: string;
      role: 'STARTER' | 'SUBSTITUTE' | 'COACH';
      participantName: string | null;
      formation: string | null;
      positionName: string | null;
      positionGrid: string | null;
      jerseyNumber: number | null;
      player: { nameHe: string; nameEn: string } | null;
      teamId: string;
    }>;
  },
  teamId: string
) {
  const entries = game.lineupEntries.filter((entry) => entry.teamId === teamId);
  const starters = entries.filter((entry) => entry.role === 'STARTER').map(mapLineupPlayer);
  const substitutes = entries.filter((entry) => entry.role === 'SUBSTITUTE').map(mapLineupPlayer);
  const coach = entries.find((entry) => entry.role === 'COACH');
  const formation = entries.find((entry) => entry.formation)?.formation || null;

  return {
    formation,
    coachName: coach?.participantName || null,
    starters,
    substitutes,
  };
}

function mapLineupPlayer(entry: {
  id: string;
  participantName: string | null;
  positionName: string | null;
  positionGrid: string | null;
  jerseyNumber: number | null;
  player: { nameHe: string; nameEn: string } | null;
}) {
  return {
    id: entry.id,
    displayName: entry.player ? formatPlayerName(entry.player) : entry.participantName || 'שחקן',
    positionName: entry.positionName,
    positionGrid: entry.positionGrid,
    jerseyNumber: entry.jerseyNumber,
  };
}

function buildFormationRows(
  starters: Array<{ id: string; displayName: string; jerseyNumber: number | null; positionName: string | null; positionGrid: string | null }>,
  side: 'home' | 'away'
) {
  const grouped = new Map<number, typeof starters>();

  for (const player of starters) {
    const row = Number(player.positionGrid?.split(':')[0] || 0);
    const existing = grouped.get(row) || [];
    existing.push(player);
    grouped.set(row, existing);
  }

  const sortedRows = Array.from(grouped.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, players]) =>
      [...players].sort((a, b) => {
        const aCol = Number(a.positionGrid?.split(':')[1] || 0);
        const bCol = Number(b.positionGrid?.split(':')[1] || 0);
        return side === 'home' ? aCol - bCol : bCol - aCol;
      })
    );

  return side === 'home' ? sortedRows : [...sortedRows].reverse();
}
