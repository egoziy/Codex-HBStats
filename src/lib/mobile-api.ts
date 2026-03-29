import { getCurrentUser } from '@/lib/auth';
import { getCurrentSeasonStartYear, getHomepageLiveSnapshots, type HomepageLiveSnapshot } from '@/lib/home-live';
import prisma from '@/lib/prisma';
import { sortStandings } from '@/lib/standings';
import {
  DEFAULT_TELEGRAM_SOURCES,
  fetchTelegramMessagesFromSources,
  normalizeTelegramSource,
} from '@/lib/telegram';

type MobileSearchParams = {
  team?: string | string[] | undefined;
  league?: string | string[] | undefined;
};

function parseSearchValues(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value];
  return [];
}

function getTeamLabel(team: { nameHe: string | null; nameEn: string }) {
  return team.nameHe || team.nameEn;
}

function getRoundLabel(game: { roundNameHe: string | null; roundNameEn: string | null }) {
  return game.roundNameHe || game.roundNameEn || null;
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

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

async function getConfiguredTelegramSources() {
  const telegramSourcesSetting = await prisma.siteSetting.findUnique({
    where: { key: 'telegram_sources' },
  });

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

  return telegramSources.length ? telegramSources : DEFAULT_TELEGRAM_SOURCES;
}

function mapTelegramMessage(message: {
  id: string;
  sourceLabel: string;
  teamLabel: string;
  url: string;
  imageUrl?: string | null;
  publishedAt: Date | null;
  text: string;
}) {
  return {
    id: message.id,
    source: message.sourceLabel,
    teamLabel: message.teamLabel,
    url: message.url,
    imageUrl: message.imageUrl || null,
    publishedAt: message.publishedAt ? message.publishedAt.toISOString() : null,
    title: truncateText(message.text.replace(/\s+/g, ' ').trim(), 80),
    previewText: truncateText(message.text, 160),
    fullText: message.text,
  };
}

function normalizeIdArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0)
    )
  );
}

export async function getMobileHomePayload(searchParams?: MobileSearchParams) {
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
    return {
      season: null,
      filters: {
        favoriteTeams: [],
        favoriteCompetitionApiIds: [],
      },
      summary: {
        hasData: false,
        message: 'אין עדיין נתונים להצגה.',
      },
      sections: {
        nextMatch: null,
        lastMatch: null,
        standings: [],
        predictions: [],
        headToHead: [],
        upcomingMatches: [],
        live: [],
        news: [],
      },
    };
  }

  const now = new Date();
  const [storedUser, seasonTeams, rawStandings, effectiveTelegramSources] = await Promise.all([
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
    prisma.standing.findMany({
      where: { seasonId: latestSeason.id },
      include: {
        team: true,
        competition: {
          select: {
            id: true,
            nameHe: true,
            nameEn: true,
            apiFootballId: true,
          },
        },
      },
    }),
    getConfiguredTelegramSources(),
  ]);

  const queryTeamIds = parseSearchValues(searchParams?.team);
  const queryLeagueIds = parseSearchValues(searchParams?.league)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  const favoriteTeamIds =
    queryTeamIds.length > 0
      ? queryTeamIds
      : seasonTeams
          .filter((team) => team.apiFootballId !== null && (storedUser?.favoriteTeamApiIds || []).includes(team.apiFootballId))
          .map((team) => team.id);
  const selectedCompetitionApiIds = queryLeagueIds.length > 0 ? queryLeagueIds : storedUser?.favoriteCompetitionApiIds || [];
  const selectedTeams = seasonTeams.filter((team) => favoriteTeamIds.includes(team.id));
  const selectedTeamIds = selectedTeams.map((team) => team.id);

  const sortedStandings = sortStandings(rawStandings);
  const compactStandings = (() => {
    if (!sortedStandings.length) return [];
    if (!selectedTeamIds.length) return sortedStandings.slice(0, 6);
    if (selectedTeamIds.length > 1) return sortedStandings.filter((row) => selectedTeamIds.includes(row.teamId)).slice(0, 8);
    const selectedIndex = sortedStandings.findIndex((row) => row.teamId === selectedTeamIds[0]);
    if (selectedIndex === -1) return sortedStandings.slice(0, 6);
    const start = Math.max(0, selectedIndex - 2);
    return sortedStandings.slice(start, Math.min(sortedStandings.length, start + 5));
  })();

  const [
    nextGamesRaw,
    lastGamesRaw,
    predictionsRaw,
    headToHeadEntriesRaw,
    nextRoundGamesRaw,
    telegramMessages,
    liveItems,
  ] = await Promise.all([
    prisma.game.findMany({
      where: {
        seasonId: latestSeason.id,
        status: 'SCHEDULED',
        dateTime: { gte: now },
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        competition: { select: { id: true, nameHe: true, nameEn: true, apiFootballId: true } },
        prediction: true,
      },
      orderBy: [{ dateTime: 'asc' }],
      take: 24,
    }),
    prisma.game.findMany({
      where: {
        seasonId: latestSeason.id,
        status: 'COMPLETED',
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        competition: { select: { id: true, nameHe: true, nameEn: true, apiFootballId: true } },
      },
      orderBy: [{ dateTime: 'desc' }],
      take: 24,
    }),
    prisma.gamePrediction.findMany({
      where: { seasonId: latestSeason.id },
      include: {
        game: {
          include: {
            homeTeam: true,
            awayTeam: true,
            competition: { select: { id: true, nameHe: true, nameEn: true, apiFootballId: true } },
          },
        },
      },
      orderBy: { game: { dateTime: 'asc' } },
      take: 12,
    }),
    prisma.gameHeadToHeadEntry.findMany({
      where: { seasonId: latestSeason.id },
      include: {
        game: {
          include: {
            homeTeam: true,
            awayTeam: true,
            competition: { select: { id: true, nameHe: true, nameEn: true, apiFootballId: true } },
          },
        },
      },
      orderBy: [{ gameId: 'asc' }, { relatedDate: 'desc' }],
      take: 60,
    }),
    prisma.game.findMany({
      where: {
        seasonId: latestSeason.id,
        status: 'SCHEDULED',
        dateTime: { gte: now },
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        competition: { select: { id: true, nameHe: true, nameEn: true, apiFootballId: true } },
        prediction: true,
      },
      orderBy: [{ dateTime: 'asc' }],
      take: 24,
    }),
    fetchTelegramMessagesFromSources(effectiveTelegramSources, 5).catch(() => []),
    getHomepageLiveSnapshots(null, { limit: 6 }),
  ]);

  const nextGame =
    nextGamesRaw
      .filter((game) => gameMatchesPreferredTeam(game, selectedTeamIds))
      .filter((game) => gameMatchesPreferredCompetition(game, selectedCompetitionApiIds))[0] || null;
  const lastGame =
    lastGamesRaw
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
  const nextRoundGames = nextGame
    ? nextRoundGamesRaw
        .filter((game) => (nextRoundCompetitionId ? game.competitionId === nextRoundCompetitionId : true) && getRoundLabel(game) === nextRoundLabel)
        .filter((game) => gameMatchesPreferredTeam(game, selectedTeamIds))
        .filter((game) => gameMatchesPreferredCompetition(game, selectedCompetitionApiIds))
        .slice(0, 6)
    : [];

  const groupedHeadToHeadMap = new Map<
    string,
    {
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
    }
  >();

  for (const entry of headToHeadEntries) {
    if (!groupedHeadToHeadMap.has(entry.gameId)) {
      groupedHeadToHeadMap.set(entry.gameId, {
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

  return {
    season: {
      id: latestSeason.id,
      year: latestSeason.year,
      label: latestSeason.name,
    },
    filters: {
      favoriteTeams: selectedTeams.map((team) => ({
        id: team.id,
        apiFootballId: team.apiFootballId,
        name: getTeamLabel(team),
      })),
      favoriteCompetitionApiIds: selectedCompetitionApiIds,
    },
    summary: {
      hasData: true,
      selectedTeamCount: selectedTeams.length,
      selectedCompetitionCount: selectedCompetitionApiIds.length,
      liveCount: liveItems.length,
      newsCount: telegramMessages.length,
    },
    sections: {
      nextMatch: nextGame
        ? {
            id: nextGame.id,
            href: `/games/${nextGame.id}`,
            competition: nextGame.competition?.nameHe || nextGame.competition?.nameEn || 'ללא מסגרת',
            homeTeamName: getTeamLabel(nextGame.homeTeam),
            awayTeamName: getTeamLabel(nextGame.awayTeam),
            dateTime: nextGame.dateTime.toISOString(),
            predictionLabel: nextGame.prediction?.winnerTeamNameHe || nextGame.prediction?.winnerTeamNameEn || null,
          }
        : null,
      lastMatch: lastGame
        ? {
            id: lastGame.id,
            href: `/games/${lastGame.id}`,
            competition: lastGame.competition?.nameHe || lastGame.competition?.nameEn || 'ללא מסגרת',
            homeTeamName: getTeamLabel(lastGame.homeTeam),
            awayTeamName: getTeamLabel(lastGame.awayTeam),
            dateTime: lastGame.dateTime.toISOString(),
            homeScore: lastGame.homeScore ?? 0,
            awayScore: lastGame.awayScore ?? 0,
          }
        : null,
      standings: compactStandings.map((row) => ({
        id: row.id,
        teamId: row.teamId,
        teamName: row.team.nameHe || row.team.nameEn,
        position: row.displayPosition,
        points: row.adjustedPoints,
        isFavorite: selectedTeamIds.includes(row.teamId),
      })),
      predictions: predictions.map((prediction) => ({
        id: prediction.id,
        gameId: prediction.game.id,
        href: `/games/${prediction.game.id}`,
        competition: prediction.game.competition?.nameHe || prediction.game.competition?.nameEn || 'ללא מסגרת',
        homeTeamName: getTeamLabel(prediction.game.homeTeam),
        awayTeamName: getTeamLabel(prediction.game.awayTeam),
        dateTime: prediction.game.dateTime.toISOString(),
        winnerLabel: prediction.winnerTeamNameHe || prediction.winnerTeamNameEn || null,
        percentHome: prediction.percentHome,
        percentDraw: prediction.percentDraw,
        percentAway: prediction.percentAway,
      })),
      headToHead: Array.from(groupedHeadToHeadMap.entries())
        .slice(0, 3)
        .map(([gameId, group]) => ({
          gameId,
          fixtureLabel: group.fixtureLabel,
          fixtureHref: group.fixtureHref,
          roundLabel: group.roundLabel,
          items: group.items.map((item) => ({
            ...item,
            dateTime: item.date ? item.date.toISOString() : null,
          })),
        })),
      upcomingMatches: nextRoundGames.map((game) => ({
        id: game.id,
        href: `/games/${game.id}`,
        competition: game.competition?.nameHe || game.competition?.nameEn || 'ללא מסגרת',
        homeTeamName: getTeamLabel(game.homeTeam),
        awayTeamName: getTeamLabel(game.awayTeam),
        dateTime: game.dateTime.toISOString(),
      })),
      live: liveItems,
      news: telegramMessages.slice(0, 5).map((message) => ({
        id: message.id,
        source: message.sourceLabel,
        teamLabel: message.teamLabel,
        url: message.url,
        imageUrl: message.imageUrl || null,
        publishedAt: message.publishedAt ? message.publishedAt.toISOString() : null,
        title: truncateText(message.text.replace(/\s+/g, ' ').trim(), 80),
        previewText: truncateText(message.text, 160),
        fullText: message.text,
      })),
    },
  };
}

export async function getMobileLivePayload(limit = 50) {
  const items = await getHomepageLiveSnapshots(null, { limit });

  const groups = items.reduce(
    (map, item) => {
      const key = `${item.countryLabel}__${item.leagueLabel}`;
      if (!map[key]) {
        map[key] = {
          key,
          countryLabel: item.countryLabel,
          countryFlagUrl: item.countryFlagUrl,
          leagueLabel: item.leagueLabel,
          matches: [],
        };
      }

      map[key].matches.push(item);
      return map;
    },
    {} as Record<
      string,
      {
        key: string;
        countryLabel: string;
        countryFlagUrl: string | null;
        leagueLabel: string;
        matches: HomepageLiveSnapshot[];
      }
    >
  );

  return {
    updatedAt: new Date().toISOString(),
    hasLive: items.length > 0,
    message: items.length > 0 ? null : 'נכון לעכשיו אין משחקים בלייב',
    items,
    groups: Object.values(groups),
  };
}
