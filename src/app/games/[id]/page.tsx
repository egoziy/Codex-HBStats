import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { getCompetitionDisplayName, getGameScoreDisplay, getRoundDisplayName } from '@/lib/competition-display';
import { getEventDisplayLabel, getEventIconPath } from '@/lib/event-display';
import { getCurrentUser } from '@/lib/auth';
import { getDisplayMode } from '@/lib/display-mode';
import { formatPlayerName } from '@/lib/player-display';
import prisma from '@/lib/prisma';
import { GameRefereeForm } from '@/components/GameRefereeForm';
import GameAdminQuickEditorClient from '@/components/GameAdminQuickEditorClient';

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

type GamePremierTab = 'overview' | 'stats' | 'events' | 'lineups';

export default async function GamePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { view?: string; tab?: string };
}) {
  const displayMode = await getDisplayMode(searchParams?.view);
  const selectedTab = normalizeGamePremierTab(searchParams?.tab);
  const currentUser = await getCurrentUser();
  const game = await prisma.game.findUnique({
    where: { id: params.id },
    include: {
      homeTeam: true,
      awayTeam: true,
      competition: true,
      gameStats: true,
      referee: {
        select: {
          id: true,
          nameEn: true,
          nameHe: true,
        },
      },
      events: {
        include: {
          player: true,
          relatedPlayer: true,
        },
        orderBy: [{ minute: 'asc' }, { sortOrder: 'asc' }],
      },
      lineupEntries: {
        include: {
          player: {
            select: {
              nameHe: true,
              nameEn: true,
              photoUrl: true,
              position: true,
            },
          },
          team: true,
        },
        orderBy: [{ role: 'asc' }, { positionGrid: 'asc' }, { jerseyNumber: 'asc' }, { participantName: 'asc' }],
      },
    },
  });

  if (!game) {
    notFound();
  }

  const adminPlayers =
    currentUser?.role === 'ADMIN'
      ? await prisma.player.findMany({
          where: {
            teamId: {
              in: [game.homeTeamId, game.awayTeamId],
            },
          },
          select: {
            id: true,
            nameHe: true,
            nameEn: true,
            teamId: true,
            team: {
              select: {
                id: true,
                nameHe: true,
                nameEn: true,
              },
            },
          },
          orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
        })
      : [];

  const hasDetailedStats = hasDetailedGameStats(game.gameStats);
  const eventSummary = buildEventSummary(game);
  const homeLineup = buildTeamLineup(game, game.homeTeamId);
  const awayLineup = buildTeamLineup(game, game.awayTeamId);
  const comparisonRows = buildComparisonRows(game.gameStats, eventSummary);
  const summaryCards = buildSummaryCards(game.gameStats, eventSummary);
  const adminEditorProps = {
    game: {
      id: game.id,
      dateTime: game.dateTime.toISOString(),
      status: game.status,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      homePenalty: (game as any).homePenalty ?? null,
      awayPenalty: (game as any).awayPenalty ?? null,
      roundNameHe: game.roundNameHe,
      roundNameEn: game.roundNameEn,
      refereeHe: game.referee?.nameHe || game.refereeHe,
      refereeEn: game.referee?.nameEn || game.refereeEn,
      events: game.events.map((event) => ({
        id: event.id,
        minute: event.minute,
        extraMinute: event.extraMinute,
        type: event.type,
        team: event.team,
        teamId: event.teamId,
        sortOrder: event.sortOrder,
        notesHe: event.notesHe,
        notesEn: event.notesEn,
        playerId: event.playerId,
        participantName: (event as any).participantName ?? null,
        relatedPlayerId: event.relatedPlayerId,
        relatedParticipantName: (event as any).relatedParticipantName ?? null,
        assistPlayerId: event.assistPlayerId,
        player: event.player,
        relatedPlayer: event.relatedPlayer,
      })),
    },
    teams: [
      {
        id: game.homeTeam.id,
        nameHe: game.homeTeam.nameHe,
        nameEn: game.homeTeam.nameEn,
      },
      {
        id: game.awayTeam.id,
        nameHe: game.awayTeam.nameHe,
        nameEn: game.awayTeam.nameEn,
      },
    ],
    players: adminPlayers,
  };

  if (displayMode === 'premier') {
    return (
      <PremierGameView
        currentUserRole={currentUser?.role || null}
        game={game}
        eventSummary={eventSummary}
        comparisonRows={comparisonRows}
        summaryCards={summaryCards}
        homeLineup={homeLineup}
        awayLineup={awayLineup}
        hasDetailedStats={hasDetailedStats}
        selectedTab={selectedTab}
        adminEditorProps={adminEditorProps}
      />
    );
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
                <div className="mt-3 inline-flex rounded-full bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-700">
                  שופט: {game.referee?.nameHe || game.referee?.nameEn || game.refereeHe || game.refereeEn || 'לא זמין'}
                </div>
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

        {currentUser?.role === 'ADMIN' ? (
          <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-stone-900">הוספת שופט ידנית</h2>
                <p className="mt-2 text-sm text-stone-500">
                  אם לא נמשך שופט מה־API או אם השם נשמר חלקית, אפשר להשלים אותו כאן. השמירה תיכנס גם לסטטיסטיקות.
                </p>
              </div>
              <div className="rounded-full bg-stone-100 px-4 py-2 text-sm font-bold text-stone-700">
                {game.referee ? 'שופט שמור' : 'שופט חסר'}
              </div>
            </div>
            <GameRefereeForm
              gameId={game.id}
              refereeNameEn={game.referee?.nameEn || game.refereeEn || ''}
              refereeNameHe={game.referee?.nameHe || game.refereeHe || ''}
            />
          </section>
        ) : null}

        {currentUser?.role === 'ADMIN' ? <GameAdminQuickEditorClient {...adminEditorProps} /> : null}

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-stone-900">סטטיסטיקת משחק</h2>
            <p className="mt-2 text-sm text-stone-500">השוואה רחבה של הנתונים ששמורים לנו ברמת המשחק.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {summaryCards.map((card) => (
                <div key={card.label} className="rounded-[20px] border border-stone-200 bg-stone-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">{card.label}</div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div className="text-lg font-black text-stone-900">{card.value}</div>
                    {card.delta ? <div className="text-xs font-bold text-stone-500">{card.delta}</div> : null}
                  </div>
                  {card.note ? <div className="mt-1 text-sm text-stone-600">{card.note}</div> : null}
                </div>
              ))}
            </div>
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
            <div className="mt-4">
              <MatchEventTimeline
                events={game.events}
                homeTeam={{ id: game.homeTeamId, name: game.homeTeam.nameHe || game.homeTeam.nameEn }}
                awayTeam={{ id: game.awayTeamId, name: game.awayTeam.nameHe || game.awayTeam.nameEn }}
                variant="classic"
              />
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

      </div>
    </div>
  );
}

function PremierGameView({
  currentUserRole,
  game,
  eventSummary,
  comparisonRows,
  summaryCards,
  homeLineup,
  awayLineup,
  hasDetailedStats,
  selectedTab,
  adminEditorProps,
}: {
  currentUserRole: string | null;
  game: any;
  eventSummary: ReturnType<typeof buildEventSummary>;
  comparisonRows: ReturnType<typeof buildComparisonRows>;
  summaryCards: ReturnType<typeof buildSummaryCards>;
  homeLineup: ReturnType<typeof buildTeamLineup>;
  awayLineup: ReturnType<typeof buildTeamLineup>;
  hasDetailedStats: boolean;
  selectedTab: GamePremierTab;
  adminEditorProps: any;
}) {
  const tabs: Array<{ id: GamePremierTab; label: string }> = [
    { id: 'overview', label: 'סקירה' },
    { id: 'stats', label: 'סטטיסטיקה' },
    { id: 'events', label: 'אירועים' },
    { id: 'lineups', label: 'הרכבים' },
  ];

  const homeTeamName = game.homeTeam.nameHe || game.homeTeam.nameEn;
  const awayTeamName = game.awayTeam.nameHe || game.awayTeam.nameEn;
  const refereeName = game.referee?.nameHe || game.referee?.nameEn || game.refereeHe || game.refereeEn || 'לא זמין';

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fbff_0%,#eef3ff_100%)] px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[34px] border border-white/60 bg-white shadow-[0_24px_80px_rgba(38,54,120,0.10)]">
          <div className="bg-[linear-gradient(135deg,#5a0b8a_0%,#3d168f_48%,#1499d3_100%)] p-6 text-white md:p-8">
            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-5">
                <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold tracking-[0.22em] text-white/85">
                  מרכז משחק
                </div>
                <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
                  <PremierTeamBadge name={homeTeamName} logoUrl={game.homeTeam.logoUrl} align="right" />
                  <div className="text-center">
                    <div className="text-sm font-semibold text-white/80">{getCompetitionDisplayName(game.competition)}</div>
                    <div className="mt-2 text-4xl font-black tracking-tight md:text-5xl">{getGameScoreDisplay(game)}</div>
                    <div className="mt-2 text-sm text-white/80">
                      {new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium', timeStyle: 'short' }).format(game.dateTime)}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white/90">
                      {getRoundDisplayName(game.roundNameHe, game.roundNameEn)}
                    </div>
                  </div>
                  <PremierTeamBadge name={awayTeamName} logoUrl={game.awayTeam.logoUrl} align="left" />
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-white/12 px-3 py-1.5">שופט: {refereeName}</span>
                  <span className="rounded-full bg-white/12 px-3 py-1.5">שערים: {eventSummary.homeGoals}-{eventSummary.awayGoals}</span>
                  <span className="rounded-full bg-white/12 px-3 py-1.5">סטטוס: {formatGameStatus(game.status)}</span>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <PremierMetricCard label="כדורגל שליטה" value={`${formatPercent(game.gameStats?.homeTeamPossession ?? null)} / ${formatPercent(game.gameStats?.awayTeamPossession ?? null)}`} />
                <PremierMetricCard label="בעיטות למסגרת" value={`${formatNumber(game.gameStats?.homeShotsOnTarget ?? null)} / ${formatNumber(game.gameStats?.awayShotsOnTarget ?? null)}`} />
                <PremierMetricCard label="כרטיסים צהובים" value={`${eventSummary.homeYellowCards} / ${eventSummary.awayYellowCards}`} />
                <PremierMetricCard label="חילופים" value={`${homeLineup.substitutes.length} / ${awayLineup.substitutes.length}`} />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200/80 bg-white px-6 py-4 md:px-8">
            <div className="flex flex-wrap items-center gap-3">
              {tabs.map((tab) => (
                <Link
                  key={tab.id}
                  href={`/games/${game.id}?view=premier&tab=${tab.id}`}
                  className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                    selectedTab === tab.id ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </Link>
              ))}
            </div>
          </div>
        </section>

        {selectedTab === 'overview' ? (
          <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-6">
              <PremierPanel title="תמונת משחק">
                <div className="grid gap-3 sm:grid-cols-2">
                  {summaryCards.slice(0, 6).map((card) => (
                    <div key={card.label} className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-semibold tracking-[0.18em] text-slate-500">{card.label}</div>
                      <div className="mt-2 text-2xl font-black text-slate-900">{card.value}</div>
                      {card.delta ? <div className="mt-1 text-xs font-bold text-slate-500">{card.delta}</div> : null}
                      {card.note ? <div className="mt-2 text-sm text-slate-600">{card.note}</div> : null}
                    </div>
                  ))}
                </div>
              </PremierPanel>

              <PremierPanel title="אירועים מרכזיים">
                <div className="space-y-3">
                  {game.events.slice(0, 8).map((event: any) => (
                    <PremierEventCard key={event.id} event={event} />
                  ))}
                  {game.events.length === 0 ? <PremierEmptyState text="אין אירועים שמורים למשחק הזה." /> : null}
                </div>
              </PremierPanel>
            </div>

            <div className="space-y-6">
              <PremierPanel title="נתוני משחק">
                <div className="grid gap-3 sm:grid-cols-2">
                  <StatPairCard label="בעיטות" homeDisplay={formatNumber(game.gameStats?.homeShotsTotal ?? null)} awayDisplay={formatNumber(game.gameStats?.awayShotsTotal ?? null)} />
                  <StatPairCard label="קרנות" homeDisplay={formatNumber(game.gameStats?.homeCorners ?? null)} awayDisplay={formatNumber(game.gameStats?.awayCorners ?? null)} />
                  <StatPairCard label="עבירות" homeDisplay={formatNumber(game.gameStats?.homeFouls ?? null)} awayDisplay={formatNumber(game.gameStats?.awayFouls ?? null)} />
                  <StatPairCard label="נבדלים" homeDisplay={formatNumber(game.gameStats?.homeOffsides ?? null)} awayDisplay={formatNumber(game.gameStats?.awayOffsides ?? null)} />
                </div>
              </PremierPanel>

              {currentUserRole === 'ADMIN' ? (
                <PremierPanel title="ניהול שופט">
                  <p className="mb-4 text-sm text-slate-600">אם שם השופט חסר או חלקי, אפשר להשלים אותו כאן.</p>
                  <GameRefereeForm
                    gameId={game.id}
                    refereeNameEn={game.referee?.nameEn || game.refereeEn || ''}
                    refereeNameHe={game.referee?.nameHe || game.refereeHe || ''}
                  />
                </PremierPanel>
              ) : null}
            </div>
          </section>
        ) : null}

        {selectedTab === 'stats' ? (
          <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <PremierPanel title="מדדי משחק">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {summaryCards.map((card) => (
                  <div key={card.label} className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold tracking-[0.18em] text-slate-500">{card.label}</div>
                    <div className="mt-2 text-2xl font-black text-slate-900">{card.value}</div>
                    {card.note ? <div className="mt-2 text-sm text-slate-600">{card.note}</div> : null}
                  </div>
                ))}
              </div>
            </PremierPanel>

            <PremierPanel title="השוואת קבוצות">
              <div className="space-y-4">
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
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                  חלק מהגרפים מבוססים על אירועים מקומיים כי נתוני ה-API למשחק הזה חלקיים.
                </div>
              ) : null}
            </PremierPanel>
          </section>
        ) : null}

        {selectedTab === 'events' ? (
          <>
            <PremierPanel title="ציר אירועי המשחק">
              <MatchEventTimeline
                events={game.events}
                homeTeam={{ id: game.homeTeamId, name: homeTeamName }}
                awayTeam={{ id: game.awayTeamId, name: awayTeamName }}
                variant="premier"
              />
            </PremierPanel>
            {currentUserRole === 'ADMIN' ? <GameAdminQuickEditorClient {...adminEditorProps} /> : null}
          </>
        ) : null}

        {selectedTab === 'lineups' ? (
          <PremierPanel title="הרכבים ועמדות">
            <div className="mb-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
              {homeLineup.formation || awayLineup.formation ? (
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">
                  מערכים: {homeLineup.formation || '-'} מול {awayLineup.formation || '-'}
                </span>
              ) : null}
            </div>
            <div className="grid gap-6 xl:grid-cols-2">
              <TeamLineupCard teamName={homeTeamName} side="home" lineup={homeLineup} />
              <TeamLineupCard teamName={awayTeamName} side="away" lineup={awayLineup} />
            </div>
          </PremierPanel>
        ) : null}
      </div>
    </div>
  );
}

function PremierPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[30px] border border-white/70 bg-white p-6 shadow-[0_18px_50px_rgba(28,42,102,0.08)]">
      <h2 className="text-2xl font-black text-slate-900">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function PremierMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
      <div className="text-xs font-semibold tracking-[0.18em] text-white/70">{label}</div>
      <div className="mt-2 text-2xl font-black text-white">{value}</div>
    </div>
  );
}

function PremierTeamBadge({
  name,
  logoUrl,
  align,
}: {
  name: string;
  logoUrl: string | null;
  align: 'right' | 'left';
}) {
  return (
    <div className={`text-center ${align === 'right' ? 'md:text-right' : 'md:text-left'}`}>
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={name}
          className={`mx-auto mb-3 h-16 w-16 rounded-full bg-white/90 object-contain p-2 ${align === 'right' ? 'md:mr-0 md:ml-auto' : 'md:ml-0 md:mr-auto'}`}
        />
      ) : null}
      <div className="text-xl font-black md:text-2xl">{name}</div>
    </div>
  );
}

function StatPairCard({
  label,
  homeDisplay,
  awayDisplay,
}: {
  label: string;
  homeDisplay: string;
  awayDisplay: string;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-semibold tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="text-xl font-black text-slate-900">{homeDisplay}</div>
        <div className="text-xs font-bold text-slate-400">בית / חוץ</div>
        <div className="text-xl font-black text-slate-900">{awayDisplay}</div>
      </div>
    </div>
  );
}

function MatchEventTimeline({
  events,
  homeTeam,
  awayTeam,
  variant,
}: {
  events: any[];
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  variant: 'classic' | 'premier';
}) {
  if (!events.length) {
    return variant === 'premier' ? <PremierEmptyState text="אין אירועים שמורים למשחק הזה." /> : (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-stone-500">
        אין אירועים שמורים למשחק הזה.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="hidden grid-cols-2 gap-4 px-2 text-xs font-black text-stone-500 md:grid">
        <div className="text-right">{homeTeam.name}</div>
        <div className="text-left">{awayTeam.name}</div>
      </div>
      <div className="space-y-3">
        {events.map((event) => {
          const column = resolveEventColumn(event, homeTeam, awayTeam);
          const card = variant === 'premier' ? <PremierEventCard event={event} /> : <ClassicEventCard event={event} />;

          return (
            <div
              key={event.id}
              className={
                column === 'unknown'
                  ? 'md:grid md:grid-cols-1'
                  : `md:grid md:grid-cols-2 md:gap-4 ${column === 'home' ? 'md:[&>div]:col-start-1' : 'md:[&>div]:col-start-2'}`
              }
            >
              <div>{card}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ClassicEventCard({ event }: { event: any }) {
  const participantRows = getEventParticipantRows(event);

  return (
    <article className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {getEventIconPath(event.type) ? (
            <img
              src={getEventIconPath(event.type) || ''}
              alt={getEventDisplayLabel(event.type)}
              className="h-10 w-10 rounded-2xl object-contain shadow-sm"
            />
          ) : null}
          <div className="font-bold text-stone-900">{getEventDisplayLabel(event.type)}</div>
        </div>
        <div className="text-sm font-semibold text-stone-600">
          {event.minute}
          {event.extraMinute ? `+${event.extraMinute}` : ''}
          &apos;
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {participantRows.map((row) => (
          <div
            key={row.label}
            className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm ${
              row.emphasis ? 'bg-white font-bold text-stone-900' : 'bg-stone-100 text-stone-700'
            }`}
          >
            <span>{row.label}</span>
            <span>{row.value}</span>
          </div>
        ))}
      </div>
      {event.notesHe ? <div className="mt-1 text-xs text-stone-500">{event.notesHe}</div> : null}
    </article>
  );
}

function resolveEventColumn(
  event: { teamId?: string | null; team?: string | null },
  homeTeam: { id: string; name: string },
  awayTeam: { id: string; name: string }
) {
  if (event.teamId && event.teamId === homeTeam.id) return 'home';
  if (event.teamId && event.teamId === awayTeam.id) return 'away';

  const normalizedTeam = (event.team || '').toLowerCase();
  if (normalizedTeam && normalizedTeam.includes(homeTeam.name.toLowerCase())) return 'home';
  if (normalizedTeam && normalizedTeam.includes(awayTeam.name.toLowerCase())) return 'away';

  return 'unknown';
}

function PremierEventCard({ event }: { event: any }) {
  const participantRows = getEventParticipantRows(event);

  return (
    <article className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {getEventIconPath(event.type) ? (
            <img
              src={getEventIconPath(event.type) || ''}
              alt={getEventDisplayLabel(event.type)}
              className="h-12 w-12 rounded-2xl object-contain shadow-sm"
            />
          ) : null}
          <div className="font-bold text-slate-900">{getEventDisplayLabel(event.type)}</div>
        </div>
        <div className="text-sm font-semibold text-slate-500">
          {event.minute}
          {event.extraMinute ? `+${event.extraMinute}` : ''}
          &apos;
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {participantRows.map((row) => (
          <div
            key={row.label}
            className={`flex items-center justify-between gap-3 rounded-2xl px-3 py-2 text-sm ${
              row.emphasis ? 'bg-white font-bold text-slate-900' : 'bg-slate-100 text-slate-700'
            }`}
          >
            <span>{row.label}</span>
            <span>{row.value}</span>
          </div>
        ))}
      </div>
      {event.notesHe ? <div className="mt-1 text-xs text-slate-500">{event.notesHe}</div> : null}
    </article>
  );
}

function getEventParticipantRows(event: any) {
  const primaryPlayer =
    event.player ? formatPlayerName(event.player) :
    event.participantName ? event.participantName :
    null;
  const relatedPlayer =
    event.relatedPlayer ? formatPlayerName(event.relatedPlayer) :
    event.relatedParticipantName ? event.relatedParticipantName :
    null;

  if (event.type === 'SUBSTITUTION_OUT') {
    return [
      { label: 'יוצא', value: primaryPlayer || 'שחקן לא משויך', emphasis: true },
      ...(relatedPlayer ? [{ label: 'נכנס', value: relatedPlayer, emphasis: false }] : []),
    ];
  }

  if (event.type === 'SUBSTITUTION_IN') {
    return [
      { label: 'נכנס', value: primaryPlayer || 'שחקן לא משויך', emphasis: true },
      ...(relatedPlayer ? [{ label: 'יוצא', value: relatedPlayer, emphasis: false }] : []),
    ];
  }

  if (event.type === 'GOAL' || event.type === 'PENALTY_GOAL' || event.type === 'OWN_GOAL') {
    return [
      { label: 'כובש', value: primaryPlayer || 'שחקן לא משויך', emphasis: true },
      ...(relatedPlayer ? [{ label: 'מבשל', value: relatedPlayer, emphasis: false }] : []),
    ];
  }

  return [
    { label: 'שחקן', value: primaryPlayer || 'שחקן לא משויך', emphasis: true },
    ...(relatedPlayer ? [{ label: 'שחקן נוסף', value: relatedPlayer, emphasis: false }] : []),
  ];
}

function PremierEmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-slate-500">
      {text}
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
        <FootballPitch side={side} starters={lineup.starters} formation={lineup.formation} />
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

type LineupPlayer = { id: string; displayName: string; photoUrl: string | null; jerseyNumber: number | null; positionName: string | null; positionGrid: string | null; playerPosition: string | null };

function FootballPitch({
  side,
  starters,
  formation,
}: {
  side: 'home' | 'away';
  starters: LineupPlayer[];
  formation: string | null;
}) {
  const rows = buildFormationRows(starters, side, formation);

  return (
    <div className="mt-4 overflow-hidden rounded-[24px] shadow-[0_8px_30px_rgba(0,60,30,0.25)]">
      {/* Pitch background with stripe pattern */}
      <div className="relative bg-[#1a8a4a]">
        {/* Grass stripes */}
        <div className="pointer-events-none absolute inset-0" style={{
          backgroundImage: 'repeating-linear-gradient(180deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 40px, transparent 40px, transparent 80px)',
        }} />

        <div className="relative px-4 py-6">
          {/* Outer pitch border */}
          <div className="pointer-events-none absolute inset-x-3 inset-y-4 rounded-lg border-2 border-white/30" />
          {/* Halfway line */}
          <div className="pointer-events-none absolute inset-x-3 top-1/2 h-0.5 bg-white/30" />
          {/* Center circle */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/30" />
          {/* Center dot */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40" />
          {/* Top penalty area */}
          <div className="pointer-events-none absolute left-1/2 top-4 h-12 w-36 -translate-x-1/2 rounded-b-lg border-x-2 border-b-2 border-white/25" />
          {/* Top goal area */}
          <div className="pointer-events-none absolute left-1/2 top-4 h-5 w-20 -translate-x-1/2 rounded-b border-x-2 border-b-2 border-white/20" />
          {/* Bottom penalty area */}
          <div className="pointer-events-none absolute bottom-4 left-1/2 h-12 w-36 -translate-x-1/2 rounded-t-lg border-x-2 border-t-2 border-white/25" />
          {/* Bottom goal area */}
          <div className="pointer-events-none absolute bottom-4 left-1/2 h-5 w-20 -translate-x-1/2 rounded-t border-x-2 border-t-2 border-white/20" />
          {/* Corner arcs (decorative) */}
          <div className="pointer-events-none absolute left-3 top-4 h-4 w-4 rounded-br-full border-b-2 border-r-2 border-white/20" />
          <div className="pointer-events-none absolute right-3 top-4 h-4 w-4 rounded-bl-full border-b-2 border-l-2 border-white/20" />
          <div className="pointer-events-none absolute bottom-4 left-3 h-4 w-4 rounded-tr-full border-t-2 border-r-2 border-white/20" />
          <div className="pointer-events-none absolute bottom-4 right-3 h-4 w-4 rounded-tl-full border-t-2 border-l-2 border-white/20" />

          {/* Player rows */}
          <div className="relative z-10 grid gap-5 py-2">
            {rows.map((row, index) => (
              <div key={`${side}-${index}`} className="flex items-start justify-center gap-2 sm:gap-4">
                {row.map((player) => (
                  <div key={player.id} className="w-[72px] text-center sm:w-[84px]">
                    <div className="group relative mx-auto h-11 w-11 sm:h-12 sm:w-12">
                      {player.photoUrl ? (
                        <img
                          src={player.photoUrl}
                          alt={player.displayName}
                          className="h-full w-full rounded-full border-2 border-white/60 object-cover shadow-[0_2px_12px_rgba(0,0,0,0.3)]"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center rounded-full border-2 border-white/50 bg-white/90 text-sm font-black text-[#1a6b3a] shadow-[0_2px_12px_rgba(0,0,0,0.3)]">
                          {player.jerseyNumber ?? '?'}
                        </div>
                      )}
                      {player.photoUrl ? (
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-black text-[#1a6b3a] shadow-sm">
                          {player.jerseyNumber ?? ''}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1.5 text-[11px] font-bold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                      {player.displayName}
                    </div>
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

function buildSummaryCards(
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
  const homeGoals = eventSummary.homeGoals;
  const awayGoals = eventSummary.awayGoals;
  const homeShotsOnTarget = stats?.homeShotsOnTarget ?? null;
  const awayShotsOnTarget = stats?.awayShotsOnTarget ?? null;
  const homeShotsTotal = stats?.homeShotsTotal ?? null;
  const awayShotsTotal = stats?.awayShotsTotal ?? null;
  const homePossession = stats?.homeTeamPossession ?? null;
  const awayPossession = stats?.awayTeamPossession ?? null;
  const homeCorners = stats?.homeCorners ?? null;
  const awayCorners = stats?.awayCorners ?? null;
  const homeFouls = stats?.homeFouls ?? null;
  const awayFouls = stats?.awayFouls ?? null;
  const homeYellowCards = stats?.homeYellowCards ?? eventSummary.homeYellowCards;
  const awayYellowCards = stats?.awayYellowCards ?? eventSummary.awayYellowCards;
  const homeRedCards = stats?.homeRedCards ?? eventSummary.homeRedCards;
  const awayRedCards = stats?.awayRedCards ?? eventSummary.awayRedCards;

  const shotAccuracyHome = homeShotsTotal && homeShotsTotal > 0 && homeShotsOnTarget !== null ? Math.round((homeShotsOnTarget / homeShotsTotal) * 100) : null;
  const shotAccuracyAway = awayShotsTotal && awayShotsTotal > 0 && awayShotsOnTarget !== null ? Math.round((awayShotsOnTarget / awayShotsTotal) * 100) : null;
  const goalConversionHome = homeShotsOnTarget && homeShotsOnTarget > 0 ? Math.round((homeGoals / homeShotsOnTarget) * 100) : null;
  const goalConversionAway = awayShotsOnTarget && awayShotsOnTarget > 0 ? Math.round((awayGoals / awayShotsOnTarget) * 100) : null;

  return [
    {
      label: 'תוצאה',
      value: `${homeGoals}-${awayGoals}`,
      delta: homeGoals === awayGoals ? 'תיקו' : homeGoals > awayGoals ? 'יתרון בית' : 'יתרון חוץ',
      note: 'מופק גם מאירועים אם תוצאת ה־API לא זמינה',
    },
    {
      label: 'דיוק בבעיטות',
      value: `${formatPercent(shotAccuracyHome)} / ${formatPercent(shotAccuracyAway)}`,
      delta: 'בית / חוץ',
      note: 'אחוז הבעיטות למסגרת מתוך כלל הבעיטות',
    },
    {
      label: 'ניצול מצבים',
      value: `${formatPercent(goalConversionHome)} / ${formatPercent(goalConversionAway)}`,
      delta: 'בית / חוץ',
      note: 'שערים חלקי בעיטות למסגרת',
    },
    {
      label: 'אחזקת כדור',
      value: `${formatPercent(homePossession)} / ${formatPercent(awayPossession)}`,
      delta: 'בית / חוץ',
      note: 'אחוזי שליטה במשחק',
    },
    {
      label: 'קרנות',
      value: `${formatNumber(homeCorners)} / ${formatNumber(awayCorners)}`,
      delta: homeCorners !== null && awayCorners !== null ? diffLabel(homeCorners, awayCorners) : null,
      note: 'קרנות לטובת כל צד',
    },
    {
      label: 'עבירות',
      value: `${formatNumber(homeFouls)} / ${formatNumber(awayFouls)}`,
      delta: homeFouls !== null && awayFouls !== null ? diffLabel(homeFouls, awayFouls) : null,
      note: 'עבירות שנרשמו במשחק',
    },
    {
      label: 'צהובים',
      value: `${formatNumber(homeYellowCards)} / ${formatNumber(awayYellowCards)}`,
      delta: homeYellowCards !== null && awayYellowCards !== null ? diffLabel(homeYellowCards, awayYellowCards) : null,
      note: 'כולל נתון שמור או מחושב מהאירועים',
    },
    {
      label: 'אדומים',
      value: `${formatNumber(homeRedCards)} / ${formatNumber(awayRedCards)}`,
      delta: homeRedCards !== null && awayRedCards !== null ? diffLabel(homeRedCards, awayRedCards) : null,
      note: 'כולל נתון שמור או מחושב מהאירועים',
    },
    {
      label: 'בעיטות למסגרת',
      value: `${formatNumber(homeShotsOnTarget)} / ${formatNumber(awayShotsOnTarget)}`,
      delta: homeShotsOnTarget !== null && awayShotsOnTarget !== null ? diffLabel(homeShotsOnTarget, awayShotsOnTarget) : null,
      note: 'ניסיונות שהלכו למסגרת',
    },
  ];
}

function diffLabel(left: number, right: number) {
  const delta = left - right;
  if (delta === 0) return 'שוויון';
  return delta > 0 ? `+${delta}` : `${delta}`;
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
      player: { nameHe: string; nameEn: string; photoUrl: string | null; position: string | null } | null;
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
  player: { nameHe: string; nameEn: string; photoUrl: string | null; position: string | null } | null;
}) {
  return {
    id: entry.id,
    displayName: entry.player ? formatPlayerName(entry.player) : entry.participantName || 'שחקן',
    photoUrl: entry.player?.photoUrl || null,
    positionName: entry.positionName,
    positionGrid: entry.positionGrid,
    jerseyNumber: entry.jerseyNumber,
    playerPosition: entry.player?.position || null,
  };
}

function resolvePositionGroup(player: LineupPlayer): 'G' | 'D' | 'M' | 'F' {
  // 1. positionName from lineup entry (API grid data: G, D, M, F)
  const posChar = player.positionName?.charAt(0)?.toUpperCase();
  if (posChar === 'G' || posChar === 'D' || posChar === 'M' || posChar === 'F') return posChar;

  // 2. playerPosition from Player model (Goalkeeper, Defender, Midfielder, Attacker)
  const pp = player.playerPosition?.toLowerCase();
  if (pp) {
    if (pp.includes('goal')) return 'G';
    if (pp.includes('def')) return 'D';
    if (pp.includes('mid')) return 'M';
    if (pp.includes('att') || pp.includes('forw') || pp.includes('strik')) return 'F';
  }

  return 'M'; // default fallback
}

function buildFormationRows(
  starters: LineupPlayer[],
  side: 'home' | 'away',
  formation: string | null
) {
  const hasGridData = starters.some((p) => p.positionGrid);

  let sortedRows: LineupPlayer[][];

  if (hasGridData) {
    // Group by positionGrid row number
    const grouped = new Map<number, LineupPlayer[]>();
    for (const player of starters) {
      const row = Number(player.positionGrid?.split(':')[0] || 0);
      const existing = grouped.get(row) || [];
      existing.push(player);
      grouped.set(row, existing);
    }
    sortedRows = Array.from(grouped.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, players]) =>
        [...players].sort((a, b) => {
          const aCol = Number(a.positionGrid?.split(':')[1] || 0);
          const bCol = Number(b.positionGrid?.split(':')[1] || 0);
          return aCol - bCol;
        })
      );
  } else {
    // No grid data — sort by known position, then distribute into formation rows
    const knownCount = starters.filter((p) => {
      const g = resolvePositionGroup(p);
      // Only count as "known" if it came from actual data, not the 'M' fallback
      const posChar = p.positionName?.charAt(0)?.toUpperCase();
      const pp = p.playerPosition?.toLowerCase();
      return posChar === 'G' || posChar === 'D' || posChar === 'M' || posChar === 'F' ||
        (pp && (pp.includes('goal') || pp.includes('def') || pp.includes('mid') || pp.includes('att') || pp.includes('forw')));
    }).length;

    if (knownCount >= Math.ceil(starters.length * 0.7)) {
      // Enough position data — group by position
      const posOrder: Array<'G' | 'D' | 'M' | 'F'> = ['G', 'D', 'M', 'F'];
      const grouped = new Map<string, LineupPlayer[]>();
      for (const player of starters) {
        const pos = resolvePositionGroup(player);
        const existing = grouped.get(pos) || [];
        existing.push(player);
        grouped.set(pos, existing);
      }
      sortedRows = posOrder
        .filter((pos) => grouped.has(pos))
        .map((pos) => grouped.get(pos)!);
    } else {
      // Not enough position data — sort known positions to front, then split by formation
      const posWeight = { G: 0, D: 1, M: 2, F: 3 } as const;
      const sorted = [...starters].sort((a, b) => {
        const aKnown = hasKnownPosition(a);
        const bKnown = hasKnownPosition(b);
        if (aKnown && !bKnown) return -1;
        if (!aKnown && bKnown) return 1;
        if (aKnown && bKnown) return posWeight[resolvePositionGroup(a)] - posWeight[resolvePositionGroup(b)];
        return 0;
      });

      const lineSizes = formation
        ? [1, ...formation.split('-').map(Number).filter((n) => !Number.isNaN(n) && n > 0)]
        : getDefaultLineSizes(sorted.length);

      sortedRows = [];
      let offset = 0;
      for (const size of lineSizes) {
        sortedRows.push(sorted.slice(offset, offset + size));
        offset += size;
      }
      if (offset < sorted.length && sortedRows.length > 0) {
        sortedRows[sortedRows.length - 1].push(...sorted.slice(offset));
      }
    }
  }

  // Home: GK at top (defense → attack top-to-bottom), Away: reversed
  return side === 'home' ? sortedRows : [...sortedRows].reverse();
}

function hasKnownPosition(player: LineupPlayer): boolean {
  const posChar = player.positionName?.charAt(0)?.toUpperCase();
  if (posChar === 'G' || posChar === 'D' || posChar === 'M' || posChar === 'F') return true;
  const pp = player.playerPosition?.toLowerCase();
  return Boolean(pp && (pp.includes('goal') || pp.includes('def') || pp.includes('mid') || pp.includes('att') || pp.includes('forw') || pp.includes('strik')));
}

function getDefaultLineSizes(playerCount: number): number[] {
  if (playerCount === 11) return [1, 4, 3, 3];
  if (playerCount === 10) return [1, 4, 3, 2];
  if (playerCount >= 7) return [1, 3, 3, playerCount - 7];
  const perRow = Math.ceil(playerCount / 3);
  return [1, perRow, perRow, Math.max(1, playerCount - 1 - perRow * 2)].filter((n) => n > 0);
}

function normalizeGamePremierTab(value: string | null | undefined): GamePremierTab {
  switch (value) {
    case 'stats':
    case 'events':
    case 'lineups':
      return value;
    default:
      return 'overview';
  }
}

function formatGameStatus(status: string | null | undefined) {
  switch (status) {
    case 'COMPLETED':
      return 'הסתיים';
    case 'LIVE':
      return 'חי';
    case 'IN_PLAY':
      return 'במשחק';
    case 'SCHEDULED':
      return 'מתוכנן';
    case 'POSTPONED':
      return 'נדחה';
    case 'CANCELLED':
      return 'בוטל';
    default:
      return status || 'לא זמין';
  }
}
