import prisma from '@/lib/prisma';
import { apiFootballFetch, isApiFootballRateLimitError } from '@/lib/api-football';

export type HomepageLiveEvent = {
  id: string;
  minuteLabel: string;
  typeLabel: string;
  iconLabel: string;
  iconClassName: string;
  teamName: string;
  primaryText: string;
  secondaryText: string | null;
};

export type HomepageLiveSnapshot = {
  id: string;
  fixtureId: number | null;
  countryLabel: string;
  countryFlagUrl: string | null;
  leagueLabel: string;
  roundLabel: string;
  statusLabel: string;
  minuteLabel: string;
  homeTeamName: string;
  awayTeamName: string;
  scoreLabel: string;
  eventCount: number;
  gameHref: string;
  events: HomepageLiveEvent[];
};

const LIVE_TRANSLATIONS: Record<string, string> = {
  Halftime: 'מחצית',
  'Second Half': 'מחצית שנייה',
  'First Half': 'מחצית ראשונה',
  'Extra Time': 'הארכה',
  'Break Time': 'הפסקה',
  'Match Finished': 'הסתיים',
  Finished: 'הסתיים',
  Live: 'חי',
  Friendlies: 'משחקי ידידות',
  'Friendly International': 'ידידות בינלאומית',
};

function translateLiveText(value: string | null | undefined) {
  if (!value) return '';
  return LIVE_TRANSLATIONS[value] || value;
}

function formatLiveMinute(
  elapsed: number | null | undefined,
  extra: number | null | undefined,
  statusShort?: string | null,
  statusLong?: string | null
) {
  const normalizedShort = String(statusShort || '').toUpperCase();
  if (normalizedShort === 'HT') return 'מחצית';
  if (normalizedShort === 'BT') return 'הפסקה';
  if (normalizedShort === 'FT' || normalizedShort === 'AET' || normalizedShort === 'PEN') {
    return translateLiveText(statusLong || statusShort) || 'הסתיים';
  }
  if (typeof elapsed !== 'number') return 'LIVE';
  return `${elapsed}${extra ? `+${extra}` : ''}'`;
}

function normalizeLiveEvents(rawJson: any): HomepageLiveEvent[] {
  const events = Array.isArray(rawJson?.events) ? rawJson.events : [];

  return events.map((event: any, index: number) => {
    const elapsed = event?.time?.elapsed;
    const extra = event?.time?.extra;
    const minuteLabel = typeof elapsed === 'number' ? `${elapsed}${extra ? `+${extra}` : ''}'` : '-';
    const teamName = translateLiveText(event?.team?.name) || event?.team?.name || 'קבוצה';
    const playerName = event?.player?.name || 'לא ידוע';
    const assistName = event?.assist?.name || null;
    const detail = event?.detail || '';
    const comments = event?.comments || null;

    if (event?.type === 'Goal') {
      return {
        id: `${event?.time?.elapsed || 'e'}-${index}`,
        minuteLabel,
        typeLabel: detail === 'Penalty' ? 'פנדל' : detail === 'Own Goal' ? 'שער עצמי' : 'שער',
        iconLabel: 'ש',
        iconClassName: 'bg-emerald-100 text-emerald-800',
        teamName,
        primaryText: playerName,
        secondaryText: assistName ? `בישול: ${assistName}` : comments,
      };
    }

    if (event?.type === 'Card') {
      const isRed = String(detail).toLowerCase().includes('red');
      return {
        id: `${event?.time?.elapsed || 'e'}-${index}`,
        minuteLabel,
        typeLabel: isRed ? 'כרטיס אדום' : 'כרטיס צהוב',
        iconLabel: isRed ? 'א' : 'צ',
        iconClassName: isRed ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800',
        teamName,
        primaryText: playerName,
        secondaryText: comments,
      };
    }

    if (event?.type === 'subst') {
      return {
        id: `${event?.time?.elapsed || 'e'}-${index}`,
        minuteLabel,
        typeLabel: 'חילוף',
        iconLabel: 'ח',
        iconClassName: 'bg-sky-100 text-sky-800',
        teamName,
        primaryText: playerName,
        secondaryText: assistName ? `יצא: ${assistName}` : comments,
      };
    }

    return {
      id: `${event?.time?.elapsed || 'e'}-${index}`,
      minuteLabel,
      typeLabel: translateLiveText(event?.type) || event?.type || 'אירוע',
      iconLabel: '•',
      iconClassName: 'bg-stone-100 text-stone-700',
      teamName,
      primaryText: playerName,
      secondaryText: detail || comments,
    };
  });
}

export function getCurrentSeasonStartYear(referenceDate = new Date()) {
  return referenceDate.getMonth() >= 6 ? referenceDate.getFullYear() : referenceDate.getFullYear() - 1;
}

export async function cleanupFutureSeasons() {
  const currentSeasonStartYear = getCurrentSeasonStartYear();
  return prisma.season.deleteMany({
    where: {
      year: {
        gt: currentSeasonStartYear,
      },
    },
  });
}

export async function refreshGlobalHomepageLiveSnapshots() {
  const liveRows = await apiFootballFetch('/fixtures?live=all');
  const fixtureIds = liveRows.map((row: any) => row?.fixture?.id).filter((id: unknown): id is number => typeof id === 'number');

  const localGames = fixtureIds.length
    ? await prisma.game.findMany({
        where: {
          apiFootballId: {
            in: fixtureIds,
          },
        },
        select: {
          id: true,
          apiFootballId: true,
          seasonId: true,
          competitionId: true,
          homeTeamId: true,
          awayTeamId: true,
        },
      })
    : [];

  const localGameMap = new Map(localGames.map((game) => [game.apiFootballId, game]));

  if (fixtureIds.length) {
    await prisma.liveGameSnapshot.deleteMany({
      where: {
        feedScope: 'GLOBAL_HOMEPAGE',
        apiFootballFixtureId: {
          notIn: fixtureIds,
        },
      },
    });
  } else {
    await prisma.liveGameSnapshot.deleteMany({
      where: {
        feedScope: 'GLOBAL_HOMEPAGE',
      },
    });
  }

  for (const row of liveRows) {
    const fixtureId = row?.fixture?.id;
    if (typeof fixtureId !== 'number') continue;

    const localGame = localGameMap.get(fixtureId);

    await prisma.liveGameSnapshot.upsert({
      where: {
        apiFootballFixtureId_feedScope: {
          apiFootballFixtureId: fixtureId,
          feedScope: 'GLOBAL_HOMEPAGE',
        },
      },
      create: {
        apiFootballFixtureId: fixtureId,
        feedScope: 'GLOBAL_HOMEPAGE',
        leagueApiFootballId: row?.league?.id || null,
        leagueNameEn: row?.league?.name || null,
        leagueNameHe: translateLiveText(row?.league?.name) || row?.league?.name || null,
        roundEn: row?.league?.round || null,
        roundHe: translateLiveText(row?.league?.round) || row?.league?.round || null,
        statusShort: row?.fixture?.status?.short || null,
        statusLong: row?.fixture?.status?.long || null,
        elapsed: row?.fixture?.status?.elapsed ?? null,
        extra: row?.fixture?.status?.extra ?? null,
        snapshotAt: new Date(),
        fixtureDate: row?.fixture?.date ? new Date(row.fixture.date) : null,
        homeTeamApiFootballId: row?.teams?.home?.id || null,
        homeTeamNameEn: row?.teams?.home?.name || null,
        homeTeamNameHe: translateLiveText(row?.teams?.home?.name) || row?.teams?.home?.name || null,
        awayTeamApiFootballId: row?.teams?.away?.id || null,
        awayTeamNameEn: row?.teams?.away?.name || null,
        awayTeamNameHe: translateLiveText(row?.teams?.away?.name) || row?.teams?.away?.name || null,
        homeScore: row?.goals?.home ?? null,
        awayScore: row?.goals?.away ?? null,
        eventCount: Array.isArray(row?.events) ? row.events.length : 0,
        rawJson: row as any,
        gameId: localGame?.id || null,
        seasonId: localGame?.seasonId || null,
        competitionId: localGame?.competitionId || null,
      },
      update: {
        leagueApiFootballId: row?.league?.id || null,
        leagueNameEn: row?.league?.name || null,
        leagueNameHe: translateLiveText(row?.league?.name) || row?.league?.name || null,
        roundEn: row?.league?.round || null,
        roundHe: translateLiveText(row?.league?.round) || row?.league?.round || null,
        statusShort: row?.fixture?.status?.short || null,
        statusLong: row?.fixture?.status?.long || null,
        elapsed: row?.fixture?.status?.elapsed ?? null,
        extra: row?.fixture?.status?.extra ?? null,
        snapshotAt: new Date(),
        fixtureDate: row?.fixture?.date ? new Date(row.fixture.date) : null,
        homeTeamApiFootballId: row?.teams?.home?.id || null,
        homeTeamNameEn: row?.teams?.home?.name || null,
        homeTeamNameHe: translateLiveText(row?.teams?.home?.name) || row?.teams?.home?.name || null,
        awayTeamApiFootballId: row?.teams?.away?.id || null,
        awayTeamNameEn: row?.teams?.away?.name || null,
        awayTeamNameHe: translateLiveText(row?.teams?.away?.name) || row?.teams?.away?.name || null,
        homeScore: row?.goals?.home ?? null,
        awayScore: row?.goals?.away ?? null,
        eventCount: Array.isArray(row?.events) ? row.events.length : 0,
        rawJson: row as any,
        gameId: localGame?.id || null,
        seasonId: localGame?.seasonId || null,
        competitionId: localGame?.competitionId || null,
      },
    });
  }

  return liveRows.length;
}

function mapSnapshotToHomepage(snapshot: any): HomepageLiveSnapshot {
  const rawLeague = snapshot.rawJson?.league || {};
  const countryLabel = translateLiveText(rawLeague.country || '') || 'בינלאומי';
  return {
    id: snapshot.id,
    fixtureId: snapshot.apiFootballFixtureId ?? null,
    countryLabel,
    countryFlagUrl: rawLeague.flag || null,
    leagueLabel: translateLiveText(snapshot.leagueNameHe || snapshot.leagueNameEn) || 'ליגה',
    roundLabel: translateLiveText(snapshot.roundHe || snapshot.roundEn) || 'ללא מחזור',
    statusLabel: translateLiveText(snapshot.statusLong || snapshot.statusShort) || 'משחק חי',
    minuteLabel: formatLiveMinute(snapshot.elapsed, snapshot.extra, snapshot.statusShort, snapshot.statusLong),
    homeTeamName: snapshot.homeTeamNameHe || snapshot.homeTeamNameEn || 'קבוצת בית',
    awayTeamName: snapshot.awayTeamNameHe || snapshot.awayTeamNameEn || 'קבוצת חוץ',
    scoreLabel: `${snapshot.homeScore ?? 0} - ${snapshot.awayScore ?? 0}`,
    eventCount: snapshot.eventCount ?? 0,
    gameHref: snapshot.game?.id ? `/games/${snapshot.game.id}` : '/games',
    events: normalizeLiveEvents(snapshot.rawJson),
  };
}

function sortLiveSnapshots<T extends { countryLabel: string; leagueLabel: string }>(snapshots: T[]) {
  return [...snapshots].sort((a, b) => {
    const countryCompare = a.countryLabel.localeCompare(b.countryLabel, 'he');
    if (countryCompare !== 0) return countryCompare;
    return a.leagueLabel.localeCompare(b.leagueLabel, 'he');
  });
}

export async function getHomepageLiveSnapshots(
  selectedTeamId?: string | null,
  options?: {
    limit?: number;
  }
) {
  const limit = options?.limit ?? 4;
  const latestSeason = await prisma.season.findFirst({
    where: {
      year: {
        lte: getCurrentSeasonStartYear(),
      },
    },
    orderBy: { year: 'desc' },
  });

  const latestGlobalSnapshot = await prisma.liveGameSnapshot.findFirst({
    where: { feedScope: 'GLOBAL_HOMEPAGE' },
    orderBy: { snapshotAt: 'desc' },
    select: { snapshotAt: true },
  });

  const shouldRefresh =
    !latestGlobalSnapshot ||
    Date.now() - new Date(latestGlobalSnapshot.snapshotAt).getTime() >= 55_000;

  if (shouldRefresh) {
    try {
      await refreshGlobalHomepageLiveSnapshots();
    } catch (error) {
      if (!isApiFootballRateLimitError(error)) {
        throw error;
      }
    }
  }

  const selectedTeam = selectedTeamId
    ? await prisma.team.findUnique({
        where: { id: selectedTeamId },
        select: { id: true, apiFootballId: true },
      })
    : null;

  const globalSnapshots = await prisma.liveGameSnapshot.findMany({
    where: { feedScope: 'GLOBAL_HOMEPAGE' },
    include: {
      game: {
        select: {
          id: true,
          homeTeamId: true,
          awayTeamId: true,
        },
      },
    },
    orderBy: [{ snapshotAt: 'desc' }, { apiFootballFixtureId: 'asc' }],
    take: 250,
  });

  const filteredGlobalSnapshots = globalSnapshots.filter((snapshot) => {
    if (!selectedTeam) return true;
    if (snapshot.game) {
      return snapshot.game.homeTeamId === selectedTeam.id || snapshot.game.awayTeamId === selectedTeam.id;
    }
    return snapshot.homeTeamApiFootballId === selectedTeam.apiFootballId || snapshot.awayTeamApiFootballId === selectedTeam.apiFootballId;
  });

  const sourceSnapshots =
    filteredGlobalSnapshots.length > 0
      ? filteredGlobalSnapshots
      : latestSeason
        ? await prisma.liveGameSnapshot.findMany({
            where: {
              seasonId: latestSeason.id,
              feedScope: 'LOCAL',
              ...(selectedTeam
                ? {
                    OR: [
                      { game: { homeTeamId: selectedTeam.id } },
                      { game: { awayTeamId: selectedTeam.id } },
                    ],
                  }
                : {}),
            },
            include: {
              game: {
                select: {
                  id: true,
                  homeTeamId: true,
                  awayTeamId: true,
                },
              },
            },
            orderBy: [{ snapshotAt: 'desc' }],
            take: 100,
          })
        : [];

  return sortLiveSnapshots(sourceSnapshots.map(mapSnapshotToHomepage)).slice(0, limit);
}
