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
  // Slice by code points, not UTF-16 code units, so emoji surrogate pairs
  // (e.g. 🚩) don't get split — a lone surrogate on the server renders as
  // ◆ (U+FFFD) on the client and breaks hydration.
  const chars = Array.from(text);
  if (chars.length <= maxLength) return text;
  return `${chars.slice(0, maxLength).join('').trim()}...`;
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
  const [storedUser, seasonTeams, rawStandings, telegramSourcesSetting, homepageLiveLimit, ligaHaalGames] = await Promise.all([
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
    // Exclude null-roundNameEn games — IFA-only duplicates of API-Football games.
    // Include CANCELLED games with scores — these are technical wins (e.g. 3-0 forfeit).
    prisma.game.findMany({
      where: {
        seasonId: latestSeason.id,
        competition: { apiFootballId: 383 },
        homeScore: { not: null },
        roundNameEn: { not: null },
        OR: [{ status: 'COMPLETED' }, { status: 'CANCELLED', awayScore: { not: null } }],
      },
      select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, roundNameEn: true },
      orderBy: { dateTime: 'asc' },
    }),
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

  // Detect stale standings: compare highest round in completed games vs max(played) in stored standings.
  const maxRoundInHomeStandings = rawStandings.length > 0
    ? Math.max(0, ...rawStandings.map((s) => s.played))
    : 0;
  const maxRoundInLigaGames = ligaHaalGames.reduce((max, g) => {
    const m = g.roundNameEn?.match(/(\d+)\s*$/);
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);
  const hasOutdatedStandings = maxRoundInLigaGames > maxRoundInHomeStandings;

  // Playoff awareness: if standings have group info (Championship Round / Relegation Round),
  // upper-playoff teams take positions 1..N and lower-playoff teams start at N+1, regardless of points.
  const isChampionshipGroup = (g: string | null | undefined) => /championship/i.test(g || '');
  const isRelegationGroup = (g: string | null | undefined) => /relegation/i.test(g || '');
  const hasPlayoffGroups = rawStandings.some((s) => isChampionshipGroup((s as any).groupNameEn) || isRelegationGroup((s as any).groupNameEn));

  const sortedStandings = (() => {
    if (hasPlayoffGroups && rawStandings.length > 0) {
      const upper = sortStandings(rawStandings.filter((s) => isChampionshipGroup((s as any).groupNameEn)));
      const lower = sortStandings(rawStandings.filter((s) => isRelegationGroup((s as any).groupNameEn)));
      const ungrouped = sortStandings(rawStandings.filter((s) => !isChampionshipGroup((s as any).groupNameEn) && !isRelegationGroup((s as any).groupNameEn)));
      const upperCount = upper.length;
      return [
        ...upper,
        ...lower.map((r, i) => ({ ...r, displayPosition: upperCount + i + 1 })),
        ...ungrouped.map((r, i) => ({ ...r, displayPosition: upperCount + lower.length + i + 1 })),
      ];
    }
    if (hasOutdatedStandings || rawStandings.length === 0) {
      if (ligaHaalGames.length === 0) return sortStandings(rawStandings);
      const teamMap = new Map(seasonTeams.map((t) => [t.id, t]));
      const rows = new Map<string, { id: string; position: number; played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; points: number; pointsAdjustment: number; pointsAdjustmentNoteHe: null; teamId: string; team: typeof seasonTeams[number] }>();
      for (const game of ligaHaalGames) {
        for (const tid of [game.homeTeamId, game.awayTeamId]) {
          if (!rows.has(tid) && teamMap.has(tid)) {
            rows.set(tid, { id: `home-${tid}`, position: 999, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0, pointsAdjustment: 0, pointsAdjustmentNoteHe: null, teamId: tid, team: teamMap.get(tid)! });
          }
        }
        if (game.homeScore === null || game.awayScore === null) continue;
        const home = rows.get(game.homeTeamId);
        const away = rows.get(game.awayTeamId);
        if (!home || !away) continue;
        home.played++; away.played++;
        home.goalsFor += game.homeScore; home.goalsAgainst += game.awayScore;
        away.goalsFor += game.awayScore; away.goalsAgainst += game.homeScore;
        if (game.homeScore > game.awayScore) { home.wins++; home.points += 3; away.losses++; }
        else if (game.homeScore < game.awayScore) { away.wins++; away.points += 3; home.losses++; }
        else { home.draws++; away.draws++; home.points++; away.points++; }
      }
      let pos = 1;
      const derived = sortStandings([...rows.values()].map((r) => ({ ...r, position: pos++ })));
      // Overlay stored point adjustments (deductions) onto game-derived standings
      const adjMap = new Map(
        rawStandings
          .filter((s) => (s as any).pointsAdjustment !== 0)
          .map((s) => [s.teamId, { pointsAdjustment: (s as any).pointsAdjustment, pointsAdjustmentNoteHe: (s as any).pointsAdjustmentNoteHe }])
      );
      if (adjMap.size === 0) return derived;
      let pos2 = 1;
      return sortStandings(derived.map((row) => {
        const adj = adjMap.get(row.teamId);
        return adj ? { ...row, ...adj, position: pos2++ } : { ...row, position: pos2++ };
      }));
    }
    return sortStandings(rawStandings);
  })();

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
  const [topScorersRaw, topAssists, recentRedCards, allYellowCards, goalMinutesRaw] = await Promise.all([
    // Derive top scorers from game events — always up-to-date unlike the Walla-scraped leaderboard
    prisma.$queryRaw<Array<{ playerId: string; playerNameHe: string | null; playerNameEn: string | null; teamNameHe: string | null; value: number }>>`
      SELECT ge."playerId", p."nameHe" AS "playerNameHe", p."nameEn" AS "playerNameEn",
             t."nameHe" AS "teamNameHe", COUNT(*)::int AS value
      FROM game_events ge
      JOIN players p ON p.id = ge."playerId"
      LEFT JOIN teams t ON t.id = p."teamId"
      JOIN games g ON g.id = ge."gameId"
      WHERE ge.type IN ('GOAL', 'PENALTY_GOAL')
        AND g."seasonId" = ${latestSeason.id}
        AND g."competitionId" = 'comp_liga_haal'
        AND g.status = 'COMPLETED'
        AND ge."playerId" IS NOT NULL
      GROUP BY ge."playerId", p."nameHe", p."nameEn", t."nameHe"
      ORDER BY value DESC
      LIMIT 5
    `,
    // Derive top assists from game events too (assister = relatedPlayerId on GOAL events).
    // Same reasoning as topScorers — live data, no dependency on the Walla-scraped table.
    prisma.$queryRaw<Array<{ playerId: string; playerNameHe: string | null; playerNameEn: string | null; teamNameHe: string | null; value: number }>>`
      SELECT ge."relatedPlayerId" AS "playerId",
             p."nameHe" AS "playerNameHe", p."nameEn" AS "playerNameEn",
             t."nameHe" AS "teamNameHe", COUNT(*)::int AS value
      FROM game_events ge
      JOIN players p ON p.id = ge."relatedPlayerId"
      LEFT JOIN teams t ON t.id = p."teamId"
      JOIN games g ON g.id = ge."gameId"
      WHERE ge.type IN ('GOAL', 'PENALTY_GOAL')
        AND g."seasonId" = ${latestSeason.id}
        AND g."competitionId" = 'comp_liga_haal'
        AND g.status = 'COMPLETED'
        AND ge."relatedPlayerId" IS NOT NULL
      GROUP BY ge."relatedPlayerId", p."nameHe", p."nameEn", t."nameHe"
      ORDER BY value DESC
      LIMIT 5
    `,
    prisma.gameEvent.findMany({
      where: {
        type: 'RED_CARD',
        playerId: { not: null },
        game: { seasonId: latestSeason.id, competitionId: 'comp_liga_haal', status: 'COMPLETED' },
      },
      select: {
        player: { select: { id: true, nameHe: true, team: { select: { nameHe: true } } } },
        game: { select: { roundNameHe: true, roundNameEn: true, dateTime: true } },
      },
      orderBy: { game: { dateTime: 'desc' } },
      take: 15,
    }),
    // All yellow cards this season — single JOIN query instead of N+1 batch loads
    prisma.$queryRaw<Array<{ playerId: string; nameHe: string | null; teamNameHe: string | null; roundNameEn: string | null; dateTime: Date | null }>>`
      SELECT ge."playerId", p."nameHe", t."nameHe" AS "teamNameHe",
             g."roundNameEn", g."dateTime"
      FROM game_events ge
      JOIN games g ON g.id = ge."gameId"
      JOIN players p ON p.id = ge."playerId"
      LEFT JOIN teams t ON t.id = p."teamId"
      WHERE ge.type = 'YELLOW_CARD'
        AND ge."playerId" IS NOT NULL
        AND g."seasonId" = ${latestSeason.id}
      ORDER BY g."dateTime" ASC
    `,
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

  // Map raw scorer + assister queries to LeaderboardBars-compatible shape
  const toLeaderboardRow = (r: { playerId: string; playerNameHe: string | null; playerNameEn: string | null; teamNameHe: string | null; value: number }) => ({
    playerId: r.playerId,
    playerNameHe: r.playerNameHe,
    playerNameEn: r.playerNameEn,
    teamNameHe: r.teamNameHe,
    teamNameEn: null as string | null,
    value: Number(r.value),
    player: null as { nameHe: string | null; nameEn: string | null } | null,
  });
  const topScorers = topScorersRaw.map(toLeaderboardRow);
  const topAssistsMapped = topAssists.map(toLeaderboardRow);

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

  // Suspended players (red card in last completed match + 5th/9th/13th yellow on last match).
  // Date-based: a player is suspended when their milestone yellow OR red card was earned
  // in the most recent matchday (within ~5 days of the latest completed league match).
  const allYellowTimes = allYellowCards.map((y) => +new Date(y.dateTime ?? 0)).filter((t) => t > 0);
  const allRedTimes = recentRedCards.map((r) => +new Date(r.game?.dateTime ?? 0)).filter((t) => t > 0);
  const latestCompletedMatchTime = Math.max(0, ...allYellowTimes, ...allRedTimes);
  // "Latest matchday" = anything within the last 5 days of the latest completed match.
  const matchdayCutoff = latestCompletedMatchTime - 5 * 24 * 3600 * 1000;
  const isInLatestMatchday = (t: number) => latestCompletedMatchTime > 0 && t >= matchdayCutoff;

  const redCardSuspended = recentRedCards
    .filter((e) => e.player && isInLatestMatchday(+new Date(e.game?.dateTime ?? 0)))
    .map((e) => ({
      id: e.player!.id,
      name: e.player!.nameHe,
      team: e.player!.team?.nameHe || '',
      reason: `כרטיס אדום ב${getRoundDisplayName(e.game.roundNameHe, e.game.roundNameEn)}`,
    }));

  const yellowsByPlayer = new Map<string, typeof allYellowCards>();
  for (const ev of allYellowCards) {
    if (!ev.playerId) continue;
    if (!yellowsByPlayer.has(ev.playerId)) yellowsByPlayer.set(ev.playerId, []);
    yellowsByPlayer.get(ev.playerId)!.push(ev);
  }
  const yellowSuspended: Array<{ id: string; name: string; team: string; reason: string }> = [];
  const yellowAtRisk: Array<{ id: string; name: string; team: string; count: number; nextMilestone: number }> = [];

  for (const [, yellows] of yellowsByPlayer) {
    const sorted = yellows.slice().sort((a, b) => +new Date(a.dateTime ?? 0) - +new Date(b.dateTime ?? 0));
    // Suspension at 5th / 9th / 13th yellow (zero-indexed: 4, 8, 12).
    // Player is suspended ONLY when: (a) they have at least N yellows, and (b) the milestone yellow was in the most recent matchday.
    for (const milestoneIdx of [4, 8, 12]) {
      if (sorted.length > milestoneIdx) {
        const milestone = sorted[milestoneIdx];
        const milestoneTime = +new Date(milestone.dateTime ?? 0);
        // Only "just earned" if the milestone IS the player's most recent yellow AND it was in the latest matchday
        if (milestoneIdx === sorted.length - 1 && isInLatestMatchday(milestoneTime)) {
          yellowSuspended.push({
            id: milestone.playerId,
            name: milestone.nameHe,
            team: milestone.teamNameHe || '',
            reason: `${milestoneIdx + 1} כרטיסים צהובים — הרחקה`,
          });
          break;
        }
      }
    }
    // At-risk: current count is 4, 8, or 12 — next yellow triggers suspension.
    const last = sorted[sorted.length - 1];
    if (!last) continue;
    if ([4, 8, 12].includes(sorted.length)) {
      yellowAtRisk.push({
        id: last.playerId,
        name: last.nameHe,
        team: last.teamNameHe || '',
        count: sorted.length,
        nextMilestone: sorted.length + 1,
      });
    }
  }

  // Sort at-risk by count desc (12 > 8 > 4) then by name
  // Group at-risk by team so same-team players appear adjacent.
  yellowAtRisk.sort((a, b) =>
    (a.team || '').localeCompare(b.team || '', 'he') ||
    b.count - a.count ||
    a.name.localeCompare(b.name, 'he')
  );

  const suspendedMap = new Map<string, { id: string; name: string; team: string; reason: string }>();
  for (const s of [...redCardSuspended, ...yellowSuspended]) {
    if (!suspendedMap.has(s.id)) suspendedMap.set(s.id, s);
  }
  const suspendedPlayers = Array.from(suspendedMap.values()).sort((a, b) =>
    (a.team || '').localeCompare(b.team || '', 'he') ||
    a.name.localeCompare(b.name, 'he')
  );

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
          <div className="relative mx-auto max-w-7xl px-4 pb-4 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`h-1.5 w-1.5 rounded-full ${heroGame.status === 'ONGOING' ? 'animate-pulse bg-yellow-300' : heroCompleted ? 'bg-emerald-300' : 'bg-white/50'}`} />
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/60">
                  {heroGame.status === 'ONGOING' ? 'משחק חי' : heroCompleted ? 'משחק אחרון' : 'המשחק הבא'}
                </span>
              </div>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/50">{latestSeason.name}</span>
            </div>
            <Link href={`/games/${heroGame.id}`} className="block">
              <div className="text-center">
                <div className="text-[10px] font-medium text-white/35">{getCompetitionDisplayName(heroGame.competition)}</div>
                <div className="mt-2 flex items-center justify-center gap-6 md:gap-12">
                  <div className="min-w-[90px] text-center">
                    <div className="text-lg font-black text-white md:text-2xl leading-tight">{getTeamLabel(heroGame.homeTeam)}</div>
                    <div className="mt-1 text-[9px] font-semibold uppercase tracking-widest text-white/35">בית</div>
                  </div>
                  <div className="flex flex-col items-center">
                    {heroCompleted ? (
                      <div className="rounded-xl bg-white/10 px-6 py-2 backdrop-blur-sm ring-1 ring-white/10">
                        <div className="text-3xl font-black tabular-nums text-white md:text-4xl">
                          {heroGame.homeScore ?? 0}<span className="mx-2 text-white/25">–</span>{heroGame.awayScore ?? 0}
                        </div>
                        <div className="mt-0.5 text-center text-[9px] font-bold tracking-widest text-emerald-300">סיום</div>
                      </div>
                    ) : (
                      <div className="rounded-xl bg-white/10 px-6 py-2 backdrop-blur-sm ring-1 ring-white/10">
                        <div className="text-2xl font-black text-white md:text-3xl">VS</div>
                        <div className="mt-0.5 text-center text-[10px] text-white/50">{formatDate(heroGame.dateTime, true)}</div>
                      </div>
                    )}
                  </div>
                  <div className="min-w-[90px] text-center">
                    <div className="text-lg font-black text-white md:text-2xl leading-tight">{getTeamLabel(heroGame.awayTeam)}</div>
                    <div className="mt-1 text-[9px] font-semibold uppercase tracking-widest text-white/35">חוץ</div>
                  </div>
                </div>
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

            {yellowAtRisk.length > 0 && (
              <Card title="זהירות מהרחקה" actionHref="/statistics" actionLabel="לסטטיסטיקות">
                <div className="mb-2 text-[11px] text-amber-800">שחקנים שכרטיס צהוב נוסף יביא להרחקה אוטומטית</div>
                <div className="space-y-2">
                  {yellowAtRisk.map((player) => (
                    <Link key={player.id} href={`/players/${player.id}`} className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50 p-3 transition hover:border-amber-300">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-black text-white">{player.count}</span>
                      <div>
                        <div className="text-sm font-black text-amber-900">{player.name}</div>
                        <div className="text-[11px] text-amber-700">{player.team} · {player.count} צהובים — צהוב נוסף = הרחקה</div>
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

            {topAssistsMapped.length > 0 && (
              <Card title="מלכי הבישולים" actionHref="/statistics" actionLabel="לסטטיסטיקות">
                <LeaderboardBars rows={topAssistsMapped} />
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
