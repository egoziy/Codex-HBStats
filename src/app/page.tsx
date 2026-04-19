import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getCompetitionDisplayName, getRoundDisplayName } from '@/lib/competition-display';
import { getDisplayMode } from '@/lib/display-mode';
import prisma from '@/lib/prisma';
import { sortStandings } from '@/lib/standings';
import {
  DEFAULT_TELEGRAM_SOURCES,
  fetchTelegramMessagesFromSources,
  normalizeTelegramSource,
  type TelegramChannelMessage,
} from '@/lib/telegram';
import { getHomepageLiveLimitSetting } from '@/lib/homepage-live-settings';
import { getCurrentSeasonStartYear, getHomepageLiveSnapshots } from '@/lib/home-live';
import HomeLivePanel from '@/components/HomeLivePanel';
import { GoalMinutesChart } from '@/components/Charts';
import HomeFilterBar from '@/components/HomeFilterBar';

export const dynamic = 'force-dynamic';

type SearchParams = { team?: string | string[]; league?: string | string[]; view?: string | string[] };

type HeadToHeadGroup = {
  gameId: string;
  fixtureLabel: string;
  fixtureHref: string;
  roundLabel: string | null;
  items: Array<{
    id: string;
    date: Date | null;
    homeTeamName: string;
    awayTeamName: string;
    scoreLabel: string;
  }>;
};

function formatDate(date: Date | null | undefined, withTime = false) {
  if (!date) return 'לא זמין';
  return new Intl.DateTimeFormat('he-IL', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
  }).format(date);
}

function getTeamLabel(team: { nameHe: string | null; nameEn: string }) {
  return team.nameHe || team.nameEn;
}

function getRoundLabel(game: { roundNameHe: string | null; roundNameEn: string | null }) {
  return getRoundDisplayName(game.roundNameHe, game.roundNameEn);
}

function getStatusLabel(status: string) {
  if (status === 'ONGOING') return 'חי';
  if (status === 'COMPLETED') return 'הסתיים';
  if (status === 'CANCELLED') return 'בוטל';
  return 'בקרוב';
}

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function getTelegramPreviewTitle(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'עדכון טלגרם חדש';
  return truncateText(normalized.split('\n')[0].replace(/[!?.:;,]+$/g, ''), 80);
}

function shouldCollapseTelegramText(text: string) {
  return text.length > 220 || text.split('\n').length > 3;
}

function gameMatchesPreferredTeam(
  game: { homeTeamId?: string; awayTeamId?: string; game?: { homeTeamId: string; awayTeamId: string } | null } | null,
  selectedTeamIds: string[]
) {
  if (!selectedTeamIds.length || !game) return true;
  if (game.game) return selectedTeamIds.includes(game.game.homeTeamId) || selectedTeamIds.includes(game.game.awayTeamId);
  return selectedTeamIds.includes(game.homeTeamId || '') || selectedTeamIds.includes(game.awayTeamId || '');
}

function gameMatchesPreferredCompetition(
  game: { competition?: { apiFootballId: number | null } | null; game?: { competition?: { apiFootballId: number | null } | null } | null } | null,
  selectedCompetitionApiIds: number[]
) {
  if (!selectedCompetitionApiIds.length || !game) return true;
  const competitionApiFootballId = game.game?.competition?.apiFootballId ?? game.competition?.apiFootballId ?? null;
  return competitionApiFootballId !== null && selectedCompetitionApiIds.includes(competitionApiFootballId);
}

function parseSearchValues(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    return [value];
  }

  return [];
}

export default async function HomePage({ searchParams }: { searchParams?: SearchParams }) {
  const displayMode = await getDisplayMode(Array.isArray(searchParams?.view) ? searchParams.view[0] : searchParams?.view);
  const viewer = await getCurrentUser();
  const latestSeason = await prisma.season.findFirst({
    where: {
      year: {
        lte: getCurrentSeasonStartYear(),
      },
    },
    orderBy: { year: 'desc' },
  });

  if (!latestSeason) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16">
        <EmptyPanel title="עדיין אין נתונים להצגה" text="צריך קודם למשוך עונה, משחקים ונתוני בית כדי שדף הבית יציג תוכן." />
      </div>
    );
  }

  const now = new Date();
  const [storedUser, seasonTeams, rawStandings, telegramSourcesSetting, homepageLiveLimit] = await Promise.all([
    viewer
      ? prisma.user.findUnique({
          where: { id: viewer.id },
          select: { favoriteTeamApiIds: true, favoriteCompetitionApiIds: true },
        })
      : Promise.resolve(null),
    prisma.team.findMany({
      where: { seasonId: latestSeason.id },
      orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
      select: { id: true, apiFootballId: true, nameHe: true, nameEn: true },
    }),
    prisma.standing.findMany({ where: { seasonId: latestSeason.id, competition: { apiFootballId: 383 } }, include: { team: true } }),
    prisma.siteSetting.findUnique({
      where: { key: 'telegram_sources' },
    }),
    getHomepageLiveLimitSetting(),
  ]);
  const configuredTelegramSourcesRaw = Array.isArray(telegramSourcesSetting?.valueJson)
    ? (telegramSourcesSetting.valueJson as Array<Record<string, unknown>>)
    : [];
  const telegramSources =
    configuredTelegramSourcesRaw
      .map((source) =>
        normalizeTelegramSource({
          slug: typeof source.slug === 'string' ? source.slug : null,
          url: typeof source.url === 'string' ? source.url : null,
          label: typeof source.label === 'string' ? source.label : '',
          teamLabel: typeof source.teamLabel === 'string' ? source.teamLabel : '',
        })
      )
      .filter((source): source is NonNullable<typeof source> => Boolean(source)) || [];
  const effectiveTelegramSources = telegramSources.length ? telegramSources : DEFAULT_TELEGRAM_SOURCES;

  const queryTeamIds = parseSearchValues(searchParams?.team);
  const queryLeagueIds = parseSearchValues(searchParams?.league).map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0);
  const favoriteTeamIdsFromUser =
    queryTeamIds.length > 0
      ? queryTeamIds
      : seasonTeams
          .filter((team) => team.apiFootballId !== null && (storedUser?.favoriteTeamApiIds || []).includes(team.apiFootballId))
          .map((team) => team.id);
  const selectedCompetitionApiIds = queryLeagueIds.length > 0 ? queryLeagueIds : storedUser?.favoriteCompetitionApiIds || [];
  const selectedTeams = seasonTeams.filter((team) => favoriteTeamIdsFromUser.includes(team.id));
  const selectedTeam = selectedTeams.length === 1 ? selectedTeams[0] : null;
  const selectedTeamIds = selectedTeams.map((team) => team.id);

  const sortedStandings = sortStandings(rawStandings);
  const compactStandings = (() => {
    if (!sortedStandings.length) return [];
    if (!selectedTeamIds.length) return sortedStandings.slice(0, 6);
    if (selectedTeamIds.length > 1) return sortedStandings.filter((row) => selectedTeamIds.includes(row.teamId)).slice(0, 8);
    const selectedIndex = sortedStandings.findIndex((row) => row.teamId === selectedTeam.id);
    if (selectedIndex === -1) return sortedStandings.slice(0, 6);
    const start = Math.max(0, selectedIndex - 2);
    return sortedStandings.slice(start, Math.min(sortedStandings.length, start + 5));
  })();

  const [nextGamesRaw, lastGamesRaw, predictionsRaw, headToHeadEntriesRaw, nextRoundGamesRaw, telegramMessages, initialLiveItems] =
    await Promise.all([
      prisma.game.findMany({
        where: {
          seasonId: latestSeason.id,
          status: 'SCHEDULED',
          dateTime: { gte: now },
        },
        include: { homeTeam: true, awayTeam: true, competition: { select: { nameHe: true, nameEn: true, apiFootballId: true } }, prediction: true },
        orderBy: [{ dateTime: 'asc' }],
        take: 24,
      }),
      prisma.game.findMany({
        where: {
          seasonId: latestSeason.id,
          status: 'COMPLETED',
        },
        include: { homeTeam: true, awayTeam: true, competition: { select: { nameHe: true, nameEn: true, apiFootballId: true } } },
        orderBy: [{ dateTime: 'desc' }],
        take: 24,
      }),
      prisma.gamePrediction.findMany({
        where: { seasonId: latestSeason.id, game: { status: 'SCHEDULED', dateTime: { gte: now } } },
        include: { game: { include: { homeTeam: true, awayTeam: true, competition: { select: { nameHe: true, nameEn: true, apiFootballId: true } } } } },
        orderBy: { game: { dateTime: 'asc' } },
        take: 6,
      }),
      prisma.gameHeadToHeadEntry.findMany({
        where: {
          seasonId: latestSeason.id,
          game: {
            OR: [
              { status: 'SCHEDULED', dateTime: { gte: now } },
              { status: 'ONGOING' },
              { status: 'COMPLETED', dateTime: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } },
            ],
          },
        },
        include: { game: { include: { homeTeam: true, awayTeam: true, competition: { select: { nameHe: true, nameEn: true, apiFootballId: true } } } } },
        orderBy: [{ game: { dateTime: 'desc' } }, { relatedDate: 'desc' }],
        take: 60,
      }),
      prisma.game.findMany({
        where: {
          seasonId: latestSeason.id,
          status: 'SCHEDULED',
          dateTime: { gte: now },
        },
        include: { homeTeam: true, awayTeam: true, competition: { select: { nameHe: true, nameEn: true, apiFootballId: true } }, prediction: true },
        orderBy: [{ dateTime: 'asc' }],
        take: 24,
      }),
      fetchTelegramMessagesFromSources(effectiveTelegramSources, 5).catch(() => []),
      getHomepageLiveSnapshots(null, { limit: homepageLiveLimit }),
    ]);

  // Winner odds for today's matches
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);
  const winnerOddsRaw = await prisma.winnerOdds.findMany({
    where: { matchTime: { gte: todayStart, lt: todayEnd } },
    orderBy: { fetchedAt: 'desc' },
  });
  // Keep latest per winnerId, index by matchDesc for lookup
  const seenWinner = new Set<number>();
  const winnerOddsMap: Record<string, typeof winnerOddsRaw[0]> = {};
  for (const o of winnerOddsRaw) {
    if (seenWinner.has(o.winnerId)) continue;
    seenWinner.add(o.winnerId);
    winnerOddsMap[o.matchDesc] = o;
    if (o.gameId) winnerOddsMap[o.gameId] = o;
  }

  // ── Additional data: leaderboards, red cards, goal minutes ──
  const [topScorers, topAssists, recentRedCards, yellowCardCounts, goalMinutesRaw] = await Promise.all([
    prisma.competitionLeaderboardEntry.findMany({
      where: { seasonId: latestSeason.id, competitionId: 'comp_liga_haal', category: 'TOP_SCORERS' },
      orderBy: { value: 'desc' },
      take: 5,
      select: { playerNameHe: true, playerNameEn: true, teamNameHe: true, teamNameEn: true, value: true, playerId: true, player: { select: { nameHe: true, nameEn: true } } },
    }),
    prisma.competitionLeaderboardEntry.findMany({
      where: { seasonId: latestSeason.id, competitionId: 'comp_liga_haal', category: 'TOP_ASSISTS' },
      orderBy: { value: 'desc' },
      take: 5,
      select: { playerNameHe: true, playerNameEn: true, teamNameHe: true, teamNameEn: true, value: true, playerId: true, player: { select: { nameHe: true, nameEn: true } } },
    }),
    prisma.gameEvent.findMany({
      where: {
        type: 'RED_CARD',
        playerId: { not: null },
        game: { seasonId: latestSeason.id, competitionId: 'comp_liga_haal', status: 'COMPLETED' },
      },
      select: {
        player: { select: { id: true, nameHe: true, team: { select: { nameHe: true } } } },
        game: { select: { roundNameHe: true, dateTime: true } },
      },
      orderBy: { game: { dateTime: 'desc' } },
      take: 5,
    }),
    // Yellow card counts per player this season (for 5th/9th yellow detection)
    prisma.gameEvent.groupBy({
      by: ['playerId'],
      where: {
        type: 'YELLOW_CARD',
        playerId: { not: null },
        game: { seasonId: latestSeason.id, competitionId: 'comp_liga_haal' },
      },
      _count: { playerId: true },
      having: { playerId: { _count: { gte: 5 } } },
    }),
    prisma.$queryRaw<Array<{ bucket: string; goals: number }>>`
      SELECT
        CASE
          WHEN minute BETWEEN 1 AND 15 THEN '1-15'
          WHEN minute BETWEEN 16 AND 30 THEN '16-30'
          WHEN minute BETWEEN 31 AND 45 THEN '31-45'
          WHEN minute BETWEEN 46 AND 60 THEN '46-60'
          WHEN minute BETWEEN 61 AND 75 THEN '61-75'
          WHEN minute BETWEEN 76 AND 90 THEN '76-90'
          WHEN minute > 90 THEN '90+'
        END as bucket,
        COUNT(*)::int as goals
      FROM game_events ge
      JOIN games g ON ge."gameId" = g.id
      WHERE ge.type IN ('GOAL', 'PENALTY_GOAL')
      AND g."seasonId" = ${latestSeason.id}
      AND g."competitionId" = 'comp_liga_haal'
      GROUP BY bucket
      ORDER BY MIN(minute)
    `,
  ]);

  // Find suspended players: red card in current or previous round, OR 5th/9th yellow
  const goalMinutesData = goalMinutesRaw.map((row) => ({ name: row.bucket, goals: Number(row.goals) }));

  const nextGame = nextGamesRaw
    .filter((game) => gameMatchesPreferredTeam(game, selectedTeamIds))
    .filter((game) => gameMatchesPreferredCompetition(game, selectedCompetitionApiIds))[0] || null;
  const lastGame = lastGamesRaw
    .filter((game) => gameMatchesPreferredTeam(game, selectedTeamIds))
    .filter((game) => gameMatchesPreferredCompetition(game, selectedCompetitionApiIds))[0] || null;

  const predictions = predictionsRaw
    .filter((prediction) => prediction.game.status !== 'CANCELLED')
    .filter((prediction) => gameMatchesPreferredTeam(prediction, selectedTeamIds))
    .filter((prediction) => gameMatchesPreferredCompetition(prediction, selectedCompetitionApiIds))
    .slice(0, 4);
  const headToHeadEntries = headToHeadEntriesRaw
    .filter((entry) => gameMatchesPreferredTeam(entry, selectedTeamIds))
    .filter((entry) => gameMatchesPreferredCompetition(entry, selectedCompetitionApiIds));
  const nextRoundLabel = nextGame ? getRoundLabel(nextGame) : null;
  const nextRoundCompetitionId = nextGame?.competitionId || null;
  const nextRoundGamesAll = nextGame
    ? nextRoundGamesRaw
        .filter((game) => (nextRoundCompetitionId ? game.competitionId === nextRoundCompetitionId : true) && getRoundLabel(game) === nextRoundLabel)
        .filter((game) => gameMatchesPreferredCompetition(game, selectedCompetitionApiIds))
    : [];
  // Sort: favorite team games first, then by date
  const nextRoundGames = nextRoundGamesAll.sort((a, b) => {
    const aFav = selectedTeamIds.includes(a.homeTeamId) || selectedTeamIds.includes(a.awayTeamId) ? 0 : 1;
    const bFav = selectedTeamIds.includes(b.homeTeamId) || selectedTeamIds.includes(b.awayTeamId) ? 0 : 1;
    if (aFav !== bFav) return aFav - bFav;
    return +new Date(a.dateTime || 0) - +new Date(b.dateTime || 0);
  });

  // Suspended players: red card in last 2 rounds + 5th/9th yellow
  const currentRoundLabel = nextRoundLabel || recentRedCards[0]?.game?.roundNameHe || null;
  const currentRoundNum = currentRoundLabel ? parseInt(currentRoundLabel.replace(/\D/g, '')) || 0 : 0;
  const relevantRounds = [currentRoundNum, currentRoundNum - 1].filter(Boolean).map((n) => `מחזור ${n}`);

  const redCardSuspended = recentRedCards
    .filter((e) => relevantRounds.includes(e.game.roundNameHe || '') && e.player)
    .map((e) => ({ id: e.player!.id, name: e.player!.nameHe, team: e.player!.team?.nameHe || '', reason: `כרטיס אדום ב${e.game.roundNameHe}` }));

  const yellowSuspensionPlayerIds = yellowCardCounts
    .filter((row) => row._count.playerId === 5 || row._count.playerId === 9)
    .map((row) => row.playerId!)
    .filter(Boolean);

  const yellowSuspendedPlayers = yellowSuspensionPlayerIds.length
    ? await prisma.player.findMany({
        where: { id: { in: yellowSuspensionPlayerIds } },
        select: { id: true, nameHe: true, team: { select: { nameHe: true } } },
      })
    : [];

  const yellowSuspended = yellowSuspendedPlayers.map((pl) => ({
    id: pl.id,
    name: pl.nameHe,
    team: pl.team?.nameHe || '',
    reason: `צהוב ${yellowCardCounts.find((r) => r.playerId === pl.id)?._count.playerId || 5} — הרחקה`,
  }));

  const suspendedMap = new Map<string, { id: string; name: string; team: string; reason: string }>();
  for (const s of [...redCardSuspended, ...yellowSuspended]) {
    if (!suspendedMap.has(s.id)) suspendedMap.set(s.id, s);
  }
  const suspendedPlayers = Array.from(suspendedMap.values());

  const groupedHeadToHeadMap = new Map<string, HeadToHeadGroup>();
  for (const entry of headToHeadEntries) {
    if (!groupedHeadToHeadMap.has(entry.gameId)) {
      groupedHeadToHeadMap.set(entry.gameId, {
        gameId: entry.gameId,
        fixtureLabel: `${getTeamLabel(entry.game.homeTeam)} - ${getTeamLabel(entry.game.awayTeam)}`,
        fixtureHref: `/games/${entry.game.id}`,
        roundLabel: getRoundLabel(entry.game),
        items: [],
      });
    }
    const group = groupedHeadToHeadMap.get(entry.gameId);
    if (!group || group.items.length >= 3) continue;
    group.items.push({
      id: entry.id,
      date: entry.relatedDate,
      homeTeamName: entry.homeTeamNameHe || entry.homeTeamNameEn || 'לא ידוע',
      awayTeamName: entry.awayTeamNameHe || entry.awayTeamNameEn || 'לא ידוע',
      scoreLabel: entry.homeScore !== null && entry.awayScore !== null ? `${entry.homeScore} - ${entry.awayScore}` : 'ללא תוצאה',
    });
  }

  const headToHeadGroups = Array.from(groupedHeadToHeadMap.values()).slice(0, 3);
  const featuredTelegramMessage = telegramMessages[0] || null;
  const telegramFeedMessages = featuredTelegramMessage ? telegramMessages.slice(1) : telegramMessages;

  const heroGame = nextGame || lastGame;
  const heroCompleted = heroGame?.status === 'COMPLETED';

  return (
    <div className="min-h-screen">
      {/* ── HERO: Featured Match ── */}
      {heroGame ? (
        <section className="hero-featured-match relative overflow-hidden">
          <div className="relative mx-auto max-w-7xl px-4 pb-8 pt-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${heroGame.status === 'ONGOING' ? 'animate-pulse bg-yellow-300' : heroCompleted ? 'bg-emerald-300' : 'bg-white/50'}`} />
                <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/60">
                  {heroGame.status === 'ONGOING' ? 'משחק חי' : heroCompleted ? 'משחק אחרון' : 'המשחק הבא'}
                </span>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/60">{latestSeason.name}</span>
            </div>
            <Link href={`/games/${heroGame.id}`} className="block">
              <div className="text-center">
                <div className="text-[11px] font-medium text-white/40">{getCompetitionDisplayName(heroGame.competition)}</div>
                <div className="mt-5 flex items-center justify-center gap-8 md:gap-16">
                  <div className="min-w-[110px] text-center">
                    <div className="text-2xl font-black text-white md:text-4xl leading-tight">{getTeamLabel(heroGame.homeTeam)}</div>
                    <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/35">בית</div>
                  </div>
                  <div className="flex flex-col items-center">
                    {heroCompleted ? (
                      <div className="rounded-2xl bg-white/10 px-8 py-4 backdrop-blur-sm ring-1 ring-white/10">
                        <div className="text-5xl font-black tabular-nums text-white md:text-6xl">
                          {heroGame.homeScore ?? 0}<span className="mx-2 text-white/25">–</span>{heroGame.awayScore ?? 0}
                        </div>
                        <div className="mt-1 text-center text-[10px] font-bold tracking-widest text-emerald-300">סיום</div>
                      </div>
                    ) : (
                      <div className="rounded-2xl bg-white/10 px-8 py-4 backdrop-blur-sm ring-1 ring-white/10">
                        <div className="text-4xl font-black text-white md:text-5xl">VS</div>
                        <div className="mt-1 text-center text-[11px] text-white/50">{formatDate(heroGame.dateTime, true)}</div>
                      </div>
                    )}
                  </div>
                  <div className="min-w-[110px] text-center">
                    <div className="text-2xl font-black text-white md:text-4xl leading-tight">{getTeamLabel(heroGame.awayTeam)}</div>
                    <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/35">חוץ</div>
                  </div>
                </div>
                {!heroCompleted && <div className="mt-4 text-[11px] text-white/35">{formatDate(heroGame.dateTime, true)}</div>}
              </div>
            </Link>
          </div>
        </section>
      ) : null}

      {/* ── Team/League selector ── */}
      <HomeFilterBar teams={seasonTeams} selectedTeamIds={selectedTeamIds} />

      {/* ── MAIN GRID ── */}
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="grid gap-5 lg:grid-cols-3">

          {/* ── COL 1: Standings + Live ── */}
          <div className="space-y-5">
            <Card title="טבלת ליגת העל" actionHref="/standings" actionLabel="טבלה מלאה">
              {compactStandings.length ? (
                <div className="space-y-1">
                  {compactStandings.map((row, idx) => {
                    const highlighted = selectedTeam?.id === row.teamId;
                    const pos = row.displayPosition ?? idx + 1;
                    const posColor = pos === 1
                      ? 'bg-[var(--accent)] text-white'
                      : pos <= 4
                      ? 'bg-[var(--accent-glow)] text-[var(--accent-text)]'
                      : pos >= 13
                      ? 'bg-red-100 text-red-700'
                      : 'bg-stone-100 text-stone-500';
                    return (
                      <div key={row.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 transition ${highlighted ? 'bg-[var(--accent-glow)] ring-1 ring-[var(--accent)]/20' : 'hover:bg-stone-50'}`}>
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${posColor}`}>{pos}</span>
                        <Link href={`/teams/${row.teamId}`} className={`flex-1 text-sm font-bold transition hover:text-[var(--accent)] ${highlighted ? 'text-[var(--accent-text)]' : 'text-stone-800'}`}>
                          {row.team.nameHe || row.team.nameEn}
                        </Link>
                        <span className="text-xs text-stone-400">{(row as any).played ?? ''}</span>
                        <span className={`min-w-[28px] text-right text-sm font-black ${highlighted ? 'text-[var(--accent)]' : 'text-stone-900'}`}>{row.adjustedPoints}</span>
                      </div>
                    );
                  })}
                </div>
              ) : <EmptyState text="אין טבלה זמינה." />}
            </Card>

            <Card title="לייב" actionHref="/live" actionLabel="כל המשחקים">
              <HomeLivePanel initialItems={initialLiveItems} selectedTeamId={null} limit={homepageLiveLimit} />
            </Card>

            {predictions.length > 0 && (
              <Card title="תחזיות" actionHref="/games" actionLabel="למשחקים">
                <div className="space-y-2">
                  {predictions.map((prediction) => (
                    <Link key={prediction.id} href={`/games/${prediction.game.id}`} className="block rounded-xl border border-stone-100 bg-stone-50 p-3 transition hover:border-stone-300 hover:bg-white">
                      <div className="text-sm font-bold text-stone-900">{getTeamLabel(prediction.game.homeTeam)} - {getTeamLabel(prediction.game.awayTeam)}</div>
                      <div className="mt-1.5 flex flex-wrap gap-2 text-[11px]">
                        <span className="rounded-full bg-stone-200 px-2 py-0.5 font-bold text-stone-600">{prediction.winnerTeamNameHe || prediction.winnerTeamNameEn || 'ללא הכרעה'}</span>
                        <span className="rounded-full bg-red-100 px-2 py-0.5 font-bold text-red-800">בית {prediction.percentHome ?? '—'}%</span>
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 font-bold text-stone-600">תיקו {prediction.percentDraw ?? '—'}%</span>
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800">חוץ {prediction.percentAway ?? '—'}%</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </Card>
            )}

            {suspendedPlayers.length > 0 && (
              <Card title="מורחקים" actionHref="/statistics" actionLabel="לסטטיסטיקות">
                <div className="space-y-2">
                  {suspendedPlayers.map((player) => (
                    <Link key={player.id} href={`/players/${player.id}`} className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50 p-3 transition hover:border-red-300">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-800 text-xs font-black text-white">X</span>
                      <div>
                        <div className="text-sm font-black text-red-900">{player.name}</div>
                        <div className="text-[11px] text-red-700">{player.team} · {player.reason}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* ── COL 2: Next Round + Last Game ── */}
          <div className="space-y-5">
            <Card title={`משחקי ${nextRoundLabel || 'המחזור'}`} actionHref="/games" actionLabel="כל המשחקים">
              <div className="space-y-2">
                {nextRoundGames.map((game) => {
                  const isFav = selectedTeamIds.includes(game.homeTeamId) || selectedTeamIds.includes(game.awayTeamId);
                  const completed = game.status === 'COMPLETED';
                  const wo = winnerOddsMap[game.id] || winnerOddsMap[`${getTeamLabel(game.homeTeam)} - ${getTeamLabel(game.awayTeam)}`];
                  return (
                    <Link key={game.id} href={`/games/${game.id}`} className={`block rounded-xl border p-3 transition hover:shadow-sm ${isFav ? 'border-[var(--accent)]/20 bg-[var(--accent-glow)]' : 'border-stone-100 bg-stone-50/60 hover:bg-white hover:border-stone-200'}`}>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <span className={`text-center text-sm font-bold ${isFav ? 'text-[var(--accent-text)]' : 'text-stone-800'}`}>{getTeamLabel(game.homeTeam)}</span>
                        {completed ? (
                          <span className="shrink-0 rounded-lg bg-stone-800 px-3 py-1 text-sm font-black tabular-nums text-white">{game.homeScore ?? 0}–{game.awayScore ?? 0}</span>
                        ) : (
                          <span className="shrink-0 rounded-lg bg-[var(--accent-glow)] px-3 py-1 text-[11px] font-bold text-[var(--accent-text)]">{getStatusLabel(game.status)}</span>
                        )}
                        <span className={`text-center text-sm font-bold ${isFav ? 'text-[var(--accent-text)]' : 'text-stone-800'}`}>{getTeamLabel(game.awayTeam)}</span>
                      </div>
                      <div className="mt-1 text-center text-[11px] text-stone-400">{formatDate(game.dateTime, true)}</div>
                      {wo && !completed && (
                        <div className="mt-2 grid grid-cols-3 gap-1 border-t border-stone-200 pt-2">
                          <div className="rounded-md bg-white px-1 py-1 text-center">
                            <div className="text-[10px] text-stone-400">1</div>
                            <div className="text-xs font-bold text-stone-800">{wo.odds1}</div>
                            <div className="text-[10px] text-emerald-600">{wo.pct1.toFixed(0)}%</div>
                          </div>
                          <div className="rounded-md bg-white px-1 py-1 text-center">
                            <div className="text-[10px] text-stone-400">X</div>
                            <div className="text-xs font-bold text-stone-800">{wo.oddsX}</div>
                            <div className="text-[10px] text-emerald-600">{wo.pctX.toFixed(0)}%</div>
                          </div>
                          <div className="rounded-md bg-white px-1 py-1 text-center">
                            <div className="text-[10px] text-stone-400">2</div>
                            <div className="text-xs font-bold text-stone-800">{wo.odds2}</div>
                            <div className="text-[10px] text-emerald-600">{wo.pct2.toFixed(0)}%</div>
                          </div>
                        </div>
                      )}
                    </Link>
                  );
                })}
                {nextRoundGames.length === 0 && <EmptyState text="אין משחקי מחזור קרוב." />}
              </div>
            </Card>

            {lastGame && heroGame?.id !== lastGame.id && (
              <Card title="משחק אחרון" actionHref={`/games/${lastGame.id}`} actionLabel="לדף המשחק">
                <Link href={`/games/${lastGame.id}`} className="block rounded-xl border border-stone-200 bg-stone-50 p-4 transition hover:bg-white">
                  <div className="text-center text-xs text-stone-400">{getCompetitionDisplayName(lastGame.competition)}</div>
                  <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <span className="text-center text-base font-black text-stone-900">{getTeamLabel(lastGame.homeTeam)}</span>
                    <span className="shrink-0 rounded-xl bg-red-800 px-5 py-2 text-xl font-black tabular-nums text-white">{lastGame.homeScore ?? 0} - {lastGame.awayScore ?? 0}</span>
                    <span className="text-center text-base font-black text-stone-900">{getTeamLabel(lastGame.awayTeam)}</span>
                  </div>
                  <div className="mt-2 text-center text-[11px] text-stone-400">{formatDate(lastGame.dateTime, true)}</div>
                </Link>
              </Card>
            )}

            {headToHeadGroups.length > 0 && (
              <Card title="ראש בראש" actionHref="/games" actionLabel="למשחקים">
                <div className="space-y-3">
                  {headToHeadGroups.map((group) => (
                    <div key={group.gameId} className="rounded-xl border border-stone-100 bg-stone-50 p-3">
                      <Link href={group.fixtureHref} className="text-sm font-black text-stone-900 transition hover:text-red-700">{group.fixtureLabel}</Link>
                      <div className="mt-2 space-y-1.5">
                        {group.items.map((item) => (
                          <div key={item.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-[12px]">
                            <span className="font-semibold text-stone-700">{item.homeTeamName}</span>
                            <span className="font-black text-red-800">{item.scoreLabel}</span>
                            <span className="font-semibold text-stone-700">{item.awayTeamName}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {topScorers.length > 0 && (
              <Card title="מלכי השערים" actionHref="/statistics" actionLabel="לסטטיסטיקות">
                <LeaderboardBars rows={topScorers} />
              </Card>
            )}

            {topAssists.length > 0 && (
              <Card title="מלכי הבישולים" actionHref="/statistics" actionLabel="לסטטיסטיקות">
                <LeaderboardBars rows={topAssists} />
              </Card>
            )}

            {goalMinutesData.length > 0 && (
              <Card title="שערים לפי דקות" actionHref="/statistics" actionLabel="לסטטיסטיקות">
                <GoalMinutesChart data={goalMinutesData} />
              </Card>
            )}
          </div>

          {/* ── COL 3: Telegram ── */}
          <div className="space-y-5">
            <Card title="חדשות" actionHref="https://t.me/vasermilya" actionLabel="לערוצי טלגרם">
              {featuredTelegramMessage ? (
                <div className="mb-4 overflow-hidden rounded-xl border border-stone-200">
                  <div className="relative h-44">
                    {featuredTelegramMessage.imageUrl ? (
                      <img src={featuredTelegramMessage.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    ) : featuredTelegramMessage.channelPhotoUrl ? (
                      <img src={featuredTelegramMessage.channelPhotoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-red-900 to-stone-900" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-3">
                      <div className="text-sm font-black leading-5 text-white">{getTelegramPreviewTitle(featuredTelegramMessage.text)}</div>
                      <div className="mt-1 text-[11px] text-white/60">{featuredTelegramMessage.sourceLabel} · {formatDate(featuredTelegramMessage.publishedAt, true)}</div>
                    </div>
                  </div>
                  <div className="bg-white p-3">
                    <TelegramMessageBody message={featuredTelegramMessage} featured />
                    <a href={featuredTelegramMessage.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-bold text-red-700 hover:text-red-600">פתח בטלגרם →</a>
                  </div>
                </div>
              ) : null}

              <div className="space-y-3">
                {telegramFeedMessages.map((message) => (
                  <article key={message.id} className="rounded-xl border border-stone-100 bg-white p-3 transition hover:border-stone-300 hover:shadow-sm">
                    <div className="grid grid-cols-[1fr_48px] items-start gap-3">
                      <div className="min-w-0 text-sm font-bold leading-5 text-stone-900">{getTelegramPreviewTitle(message.text)}</div>
                      <img src={message.imageUrl || message.channelPhotoUrl || ''} alt="" className="h-12 w-12 rounded-lg object-cover" />
                    </div>
                    <TelegramMessageBody message={message} />
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[11px] text-stone-400">{message.sourceLabel} · {formatDate(message.publishedAt, true)}</span>
                      <a href={message.url} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-red-700 hover:text-red-600">בטלגרם →</a>
                    </div>
                  </article>
                ))}
                {telegramMessages.length === 0 && <EmptyState text="אין הודעות טלגרם." />}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function LeaderboardBars({ rows }: { rows: Array<{ player?: { nameHe: string | null; nameEn: string | null } | null; playerNameHe: string | null; playerNameEn: string | null; teamNameHe: string | null; teamNameEn: string | null; value: number; playerId: string | null }> }) {
  const max = rows[0]?.value || 1;
  return (
    <div className="space-y-2.5">
      {rows.map((row, idx) => {
        const name = row.player?.nameHe || row.playerNameHe || row.player?.nameEn || row.playerNameEn || '';
        const team = row.teamNameHe || row.teamNameEn || '';
        const pct = Math.round((row.value / max) * 100);
        return (
          <div key={idx} className="flex items-center gap-3">
            <span className="w-4 shrink-0 text-[11px] font-black text-stone-400">#{idx + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-stone-900 truncate">
                  {row.playerId ? <Link href={`/players/${row.playerId}`} className="hover:text-[var(--accent)]">{name}</Link> : name}
                </span>
                <span className="shrink-0 mr-2 text-sm font-black text-[var(--accent)]">{row.value}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-stone-100">
                  <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                </div>
                <span className="shrink-0 text-[10px] text-stone-400 w-16 text-left truncate">{team}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Card({ title, actionHref, actionLabel, children }: { title: string; actionHref: string; actionLabel: string; children: React.ReactNode }) {
  return (
    <section className="modern-card rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="border-r-[3px] border-[var(--accent)] pr-3 text-base font-black text-stone-900">{title}</h2>
        {actionHref.startsWith('http') ? (
          <a href={actionHref} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-[var(--accent)] transition hover:opacity-75">{actionLabel} →</a>
        ) : (
          <Link href={actionHref} className="text-[11px] font-semibold text-[var(--accent)] transition hover:opacity-75">{actionLabel} →</Link>
        )}
      </div>
      {children}
    </section>
  );
}

function TelegramMessageBody({ message, featured = false }: { message: TelegramChannelMessage; featured?: boolean }) {
  const collapsible = shouldCollapseTelegramText(message.text);
  const textClasses = featured ? 'text-sm leading-6 text-stone-600' : 'text-[13px] leading-5 text-stone-500';
  if (!collapsible) return <div className={`mt-2 whitespace-pre-line ${textClasses}`}>{message.text}</div>;
  return (
    <details className="group mt-2">
      <div className={`whitespace-pre-line group-open:hidden ${textClasses}`}>{truncateText(message.text, featured ? 280 : 120)}</div>
      <div className={`hidden whitespace-pre-line rounded-lg bg-stone-50 p-3 group-open:block ${textClasses}`}>{message.text}</div>
      <summary className="mt-1 cursor-pointer list-none text-[11px] font-bold text-red-700 marker:hidden hover:text-red-600">הצג עוד</summary>
    </details>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-5 text-center text-sm text-stone-500">{text}</div>;
}

function EmptyPanel({ title, text }: { title: string; text: string }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
      <h1 className="text-3xl font-black text-stone-900">{title}</h1>
      <p className="mt-4 max-w-2xl text-lg leading-8 text-stone-600">{text}</p>
      <div className="mt-6"><Link href="/admin" className="rounded-full bg-red-800 px-6 py-3 font-bold text-white">לאזור האדמין</Link></div>
    </section>
  );
}
