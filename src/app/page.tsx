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

  // ── Additional data: top scorers/assists from events, red cards, goal minutes ──
  const [topScorerCounts, topAssistLeaderboard, recentRedCards, yellowCardCounts, goalMinutesRaw] = await Promise.all([
    prisma.gameEvent.groupBy({
      by: ['playerId'],
      where: {
        type: { in: ['GOAL', 'PENALTY_GOAL'] },
        playerId: { not: null },
        game: { seasonId: latestSeason.id, competitionId: 'comp_liga_haal', status: 'COMPLETED' },
      },
      _count: { playerId: true },
      orderBy: { _count: { playerId: 'desc' } },
      take: 5,
    }),
    prisma.competitionLeaderboardEntry.findMany({
      where: { seasonId: latestSeason.id, competitionId: 'comp_liga_haal', category: 'TOP_ASSISTS' },
      orderBy: { value: 'desc' },
      take: 5,
      select: { playerNameHe: true, playerNameEn: true, teamNameHe: true, value: true, playerId: true },
    }),
    prisma.gameEvent.findMany({
      where: {
        type: 'RED_CARD',
        OR: [{ playerId: { not: null } }, { participantName: { not: '' } }],
        game: { seasonId: latestSeason.id, competitionId: 'comp_liga_haal', status: 'COMPLETED' },
      },
      select: {
        playerId: true,
        participantName: true,
        player: { select: { id: true, nameHe: true, team: { select: { nameHe: true } } } },
        game: { select: { roundNameHe: true, dateTime: true } },
        eventTeam: { select: { nameHe: true } },
      },
      orderBy: { game: { dateTime: 'desc' } },
      take: 10,
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

  // Resolve player names for top scorers/assists
  const allLeaderboardPlayerIds = [
    ...topScorerCounts.map((r) => r.playerId!),
    ...topAssistLeaderboard.map((r) => r.playerId!),
  ].filter(Boolean);
  const leaderboardPlayers = allLeaderboardPlayerIds.length
    ? await prisma.player.findMany({
        where: { id: { in: allLeaderboardPlayerIds } },
        select: { id: true, nameHe: true, team: { select: { nameHe: true } } },
      })
    : [];
  const playerMap = new Map(leaderboardPlayers.map((p) => [p.id, p]));
  const topScorers = topScorerCounts.map((r) => {
    const pl = playerMap.get(r.playerId!);
    return { playerId: r.playerId, playerNameHe: pl?.nameHe || '', teamNameHe: pl?.team?.nameHe || '', value: r._count.playerId };
  });
  const topAssists = topAssistLeaderboard.map((r) => {
    const pl = r.playerId ? playerMap.get(r.playerId) : null;
    return { playerId: r.playerId, playerNameHe: pl?.nameHe || r.playerNameHe || r.playerNameEn || '', teamNameHe: pl?.team?.nameHe || r.teamNameHe || '', value: r.value };
  });

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

  // Suspended players: red card OR 5th/9th yellow — only if it happened in their LAST game
  // Get the last completed round
  const lastCompletedRound = lastGamesRaw[0]?.roundNameHe || null;

  // Red card suspensions: only players whose red card was in the most recent completed round
  const redCardSuspended = recentRedCards
    .filter((e) => (e.player || e.participantName) && e.game.roundNameHe === lastCompletedRound)
    .map((e) => ({
      id: e.player?.id || `unlinked-${e.participantName}`,
      name: e.player?.nameHe || e.participantName || '',
      team: e.player?.team?.nameHe || e.eventTeam?.nameHe || '',
      reason: `כרטיס אדום ב${e.game.roundNameHe}`,
      playerId: e.playerId,
    }));

  // Yellow card suspensions: players with exactly 5 or 9 yellows where their last yellow was in the last round
  const yellowSuspensionPlayerIds = yellowCardCounts
    .filter((row) => row._count.playerId === 5 || row._count.playerId === 9)
    .map((row) => row.playerId!)
    .filter(Boolean);

  // For each candidate, check if their last yellow was in the last completed round
  const yellowLastEvents = yellowSuspensionPlayerIds.length
    ? await prisma.gameEvent.findMany({
        where: {
          type: 'YELLOW_CARD',
          playerId: { in: yellowSuspensionPlayerIds },
          game: { seasonId: latestSeason.id, competitionId: 'comp_liga_haal', status: 'COMPLETED' },
        },
        select: {
          playerId: true,
          player: { select: { id: true, nameHe: true, team: { select: { nameHe: true } } } },
          game: { select: { roundNameHe: true, dateTime: true } },
        },
        orderBy: { game: { dateTime: 'desc' } },
      })
    : [];

  // Group by player — keep only those whose LAST yellow was in the last completed round
  const yellowLastByPlayer = new Map<string, typeof yellowLastEvents[0]>();
  for (const ev of yellowLastEvents) {
    if (ev.playerId && !yellowLastByPlayer.has(ev.playerId)) {
      yellowLastByPlayer.set(ev.playerId, ev);
    }
  }
  const yellowSuspended = Array.from(yellowLastByPlayer.values())
    .filter((ev) => ev.game.roundNameHe === lastCompletedRound)
    .map((ev) => ({
      id: ev.player!.id,
      name: ev.player!.nameHe,
      team: ev.player!.team?.nameHe || '',
      reason: `צהוב ${yellowCardCounts.find((r) => r.playerId === ev.playerId)?._count.playerId || 5} — הרחקה`,
      playerId: ev.playerId,
    }));

  const suspendedMap = new Map<string, { id: string; name: string; team: string; reason: string; playerId?: string | null }>();
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
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-stone-100">
      {/* ── HERO: Featured Match ── */}
      {heroGame ? (
        <section className="relative overflow-hidden bg-gradient-to-br from-[#8b1a1a] via-[#b91c1c] to-[#991b1b]">
          <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 0h40v40H0z\' fill=\'none\'/%3E%3Cpath d=\'M20 0v40M0 20h40\' stroke=\'white\' stroke-width=\'.5\'/%3E%3C/svg%3E")' }} />
          <div className="relative mx-auto max-w-7xl px-4 pb-7 pt-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`h-2 w-2 rounded-full ${heroGame.status === 'ONGOING' ? 'animate-pulse bg-yellow-300' : heroCompleted ? 'bg-emerald-300' : 'bg-white/60'}`} />
                <span className="text-xs font-bold uppercase tracking-[0.3em] text-white/70">
                  {heroGame.status === 'ONGOING' ? 'משחק חי' : heroCompleted ? 'משחק אחרון' : 'המשחק הבא'}
                </span>
              </div>
              <span className="rounded-full bg-white/10 px-4 py-1.5 text-[11px] font-bold text-white/70">{latestSeason.name}</span>
            </div>
            <Link href={`/games/${heroGame.id}`} className="group block">
              <div className="text-center">
                <div className="text-xs font-semibold text-white/50">{getCompetitionDisplayName(heroGame.competition)}</div>
                <div className="mt-4 flex items-center justify-center gap-6 md:gap-14">
                  <div className="min-w-[100px] text-center md:min-w-[140px]">
                    <div className="text-xl font-black text-white md:text-3xl">{getTeamLabel(heroGame.homeTeam)}</div>
                    <div className="mt-1 text-[11px] text-white/40">בית</div>
                  </div>
                  <div className="flex flex-col items-center">
                    {heroCompleted ? (
                      <div className="rounded-2xl bg-white/10 px-7 py-4 backdrop-blur-sm">
                        <div className="text-5xl font-black tabular-nums tracking-wider text-white md:text-6xl">
                          {heroGame.homeScore ?? 0} <span className="text-white/30">:</span> {heroGame.awayScore ?? 0}
                        </div>
                        <div className="mt-1 text-center text-[11px] font-bold text-emerald-300">הסתיים</div>
                      </div>
                    ) : (
                      <div className="rounded-2xl bg-white/10 px-7 py-4 backdrop-blur-sm">
                        <div className="text-3xl font-black text-white md:text-4xl">VS</div>
                        <div className="mt-1 text-center text-[11px] font-bold text-white/60">{formatDate(heroGame.dateTime, true)}</div>
                      </div>
                    )}
                  </div>
                  <div className="min-w-[100px] text-center md:min-w-[140px]">
                    <div className="text-xl font-black text-white md:text-3xl">{getTeamLabel(heroGame.awayTeam)}</div>
                    <div className="mt-1 text-[11px] text-white/40">חוץ</div>
                  </div>
                </div>
                {!heroCompleted && <div className="mt-5 text-xs text-white/40">{formatDate(heroGame.dateTime, true)}</div>}
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
                <div className="overflow-hidden rounded-xl border border-stone-200">
                  <table className="w-full text-right text-sm">
                    <thead><tr className="bg-stone-100 text-[11px] text-stone-500"><th className="px-3 py-2">#</th><th className="px-3 py-2">קבוצה</th><th className="px-3 py-2">מש׳</th><th className="px-3 py-2">נק׳</th></tr></thead>
                    <tbody>
                      {compactStandings.map((row) => {
                        const highlighted = selectedTeam?.id === row.teamId;
                        return (
                          <tr key={row.id} className={`border-t border-stone-100 transition ${highlighted ? 'bg-red-50' : 'hover:bg-stone-50'}`}>
                            <td className="px-3 py-2.5 font-black text-stone-400">{row.displayPosition}</td>
                            <td className="px-3 py-2.5"><Link href={`/teams/${row.teamId}`} className={`font-bold transition hover:text-red-700 ${highlighted ? 'text-red-800' : 'text-stone-900'}`}>{row.team.nameHe || row.team.nameEn}</Link></td>
                            <td className="px-3 py-2.5 text-stone-500">{(row as any).played ?? ''}</td>
                            <td className="px-3 py-2.5 font-black text-red-800">{row.adjustedPoints}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
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
                  {suspendedPlayers.map((player) => {
                    const hasLink = player.playerId;
                    const inner = (
                      <>
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-800 text-xs font-black text-white">X</span>
                        <div>
                          <div className="text-sm font-black text-red-900">{player.name}</div>
                          <div className="text-[11px] text-red-700">{player.team} · {player.reason}</div>
                        </div>
                      </>
                    );
                    return hasLink ? (
                      <Link key={player.id} href={`/players/${player.playerId}`} className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50 p-3 transition hover:border-red-300">
                        {inner}
                      </Link>
                    ) : (
                      <div key={player.id} className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50 p-3">
                        {inner}
                      </div>
                    );
                  })}
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
                  return (
                    <Link key={game.id} href={`/games/${game.id}`} className={`block rounded-xl border p-3 transition hover:bg-white ${isFav ? 'border-red-200 bg-red-50' : 'border-stone-100 bg-stone-50 hover:border-stone-300'}`}>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <span className={`text-center text-sm font-bold ${isFav ? 'text-red-900' : 'text-stone-900'}`}>{getTeamLabel(game.homeTeam)}</span>
                        {completed ? (
                          <span className="shrink-0 rounded-lg bg-stone-900 px-3 py-1 text-sm font-black tabular-nums text-white">{game.homeScore ?? 0} - {game.awayScore ?? 0}</span>
                        ) : (
                          <span className="shrink-0 rounded-lg bg-red-100 px-3 py-1 text-[11px] font-bold text-red-800">{getStatusLabel(game.status)}</span>
                        )}
                        <span className={`text-center text-sm font-bold ${isFav ? 'text-red-900' : 'text-stone-900'}`}>{getTeamLabel(game.awayTeam)}</span>
                      </div>
                      <div className="mt-1 text-center text-[11px] text-stone-400">{formatDate(game.dateTime, true)}</div>
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
                <div className="overflow-hidden rounded-xl border border-stone-200">
                  <table className="w-full text-right text-sm">
                    <thead><tr className="bg-stone-100 text-[11px] text-stone-500"><th className="px-3 py-2">#</th><th className="px-3 py-2">שחקן</th><th className="px-3 py-2">קבוצה</th><th className="px-3 py-2">שערים</th></tr></thead>
                    <tbody>
                      {topScorers.map((row, idx) => (
                        <tr key={idx} className="border-t border-stone-100 hover:bg-stone-50">
                          <td className="px-3 py-2.5 font-black text-stone-400">{idx + 1}</td>
                          <td className="px-3 py-2.5 font-bold text-stone-900">{row.playerId ? <Link href={`/players/${row.playerId}`} className="hover:text-red-700">{row.playerNameHe}</Link> : row.playerNameHe}</td>
                          <td className="px-3 py-2.5 text-stone-500">{row.teamNameHe}</td>
                          <td className="px-3 py-2.5 font-black text-red-800">{row.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {topAssists.length > 0 && (
              <Card title="מלכי הבישולים" actionHref="/statistics" actionLabel="לסטטיסטיקות">
                <div className="overflow-hidden rounded-xl border border-stone-200">
                  <table className="w-full text-right text-sm">
                    <thead><tr className="bg-stone-100 text-[11px] text-stone-500"><th className="px-3 py-2">#</th><th className="px-3 py-2">שחקן</th><th className="px-3 py-2">קבוצה</th><th className="px-3 py-2">בישולים</th></tr></thead>
                    <tbody>
                      {topAssists.map((row, idx) => (
                        <tr key={idx} className="border-t border-stone-100 hover:bg-stone-50">
                          <td className="px-3 py-2.5 font-black text-stone-400">{idx + 1}</td>
                          <td className="px-3 py-2.5 font-bold text-stone-900">{row.playerId ? <Link href={`/players/${row.playerId}`} className="hover:text-red-700">{row.playerNameHe}</Link> : row.playerNameHe}</td>
                          <td className="px-3 py-2.5 text-stone-500">{row.teamNameHe}</td>
                          <td className="px-3 py-2.5 font-black text-red-800">{row.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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

function Card({ title, actionHref, actionLabel, children }: { title: string; actionHref: string; actionLabel: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-black text-stone-900">{title}</h2>
        {actionHref.startsWith('http') ? (
          <a href={actionHref} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-red-700 transition hover:text-red-600">{actionLabel} →</a>
        ) : (
          <Link href={actionHref} className="text-[11px] font-bold text-red-700 transition hover:text-red-600">{actionLabel} →</Link>
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
