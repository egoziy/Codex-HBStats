import prisma from '@/lib/prisma';
import { apiFootballFetch, isApiFootballRateLimitError } from '@/lib/api-football';
import { getAllowedLiveCountryLabels } from '@/lib/live-competition-settings';

export type HomepageLiveEvent = {
  id: string;
  minuteLabel: string;
  typeLabel: string;
  iconPath: string | null;
  iconLabel: string;
  iconClassName: string;
  teamName: string;
  primaryText: string;
  secondaryText: string | null;
};

export type HomepageLiveSnapshot = {
  id: string;
  fixtureId: number | null;
  leagueApiFootballId: number | null;
  homeTeamApiFootballId: number | null;
  awayTeamApiFootballId: number | null;
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
  if (value === 'Israel') return 'ישראל';
  if (value === 'Liga Leumit') return 'ליגה לאומית';
  if (value === "Ligat Ha'al" || value === "Lןigat Ha'al") return 'ליגת העל';
  if (value === 'State Cup') return 'גביע המדינה';
  if (value === 'Super Cup') return 'אלוף האלופים';
  if (value === 'Toto Cup Ligat Al') return 'גביע הטוטו';
  if (value === 'Regular Season') return 'מחזור';
  return LIVE_TRANSLATIONS[value] || value;
}

function getLiveEventIconPath(eventType: string | null | undefined, detail: string | null | undefined) {
  const normalizedType = (eventType || '').toLowerCase();
  const normalizedDetail = (detail || '').toLowerCase();

  if (normalizedType === 'goal') {
    return '/Icons/event-goal-nav-96.png';
  }

  if (normalizedType === 'card') {
    return normalizedDetail === 'red card' ? '/Icons/event-red-card-nav-96.png' : '/Icons/event-yellow-card-nav-96.png';
  }

  if (normalizedType === 'subst') {
    return '/Icons/event-sub-in-nav-96.png';
  }

  if (normalizedType.includes('injur') || normalizedDetail.includes('injur')) {
    return '/Icons/event-injury-nav-96.png';
  }

  return null;
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
        iconPath: getLiveEventIconPath(event?.type, detail),
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
        iconPath: getLiveEventIconPath(event?.type, detail),
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
        iconPath: getLiveEventIconPath(event?.type, detail),
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
      iconPath: getLiveEventIconPath(event?.type, detail),
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
  const teamApiIds = Array.from(
    new Set(
      liveRows
        .flatMap((row: any) => [row?.teams?.home?.id, row?.teams?.away?.id])
        .filter((id: unknown): id is number => typeof id === 'number')
    )
  );

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
          homeTeam: {
            select: {
              nameHe: true,
              nameEn: true,
            },
          },
          awayTeam: {
            select: {
              nameHe: true,
              nameEn: true,
            },
          },
        },
      })
    : [];

  const localTeams = teamApiIds.length
    ? await prisma.team.findMany({
        where: {
          apiFootballId: {
            in: teamApiIds,
          },
        },
        select: {
          apiFootballId: true,
          nameHe: true,
          nameEn: true,
          season: {
            select: {
              year: true,
            },
          },
        },
        orderBy: [{ season: { year: 'desc' } }],
      })
    : [];

  const localGameMap = new Map(localGames.map((game) => [game.apiFootballId, game]));
  const localTeamMap = new Map<number, (typeof localTeams)[number]>();

  for (const team of localTeams) {
    if (typeof team.apiFootballId !== 'number') continue;
    if (!localTeamMap.has(team.apiFootballId)) {
      localTeamMap.set(team.apiFootballId, team);
    }
  }

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
    const localHomeTeam = localGame?.homeTeam || localTeamMap.get(row?.teams?.home?.id);
    const localAwayTeam = localGame?.awayTeam || localTeamMap.get(row?.teams?.away?.id);
    const resolvedHomeTeamNameHe =
      localHomeTeam?.nameHe || translateLiveText(row?.teams?.home?.name) || row?.teams?.home?.name || null;
    const resolvedHomeTeamNameEn = localHomeTeam?.nameEn || row?.teams?.home?.name || null;
    const resolvedAwayTeamNameHe =
      localAwayTeam?.nameHe || translateLiveText(row?.teams?.away?.name) || row?.teams?.away?.name || null;
    const resolvedAwayTeamNameEn = localAwayTeam?.nameEn || row?.teams?.away?.name || null;

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
        homeTeamNameEn: resolvedHomeTeamNameEn,
        homeTeamNameHe: resolvedHomeTeamNameHe,
        awayTeamApiFootballId: row?.teams?.away?.id || null,
        awayTeamNameEn: resolvedAwayTeamNameEn,
        awayTeamNameHe: resolvedAwayTeamNameHe,
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
        homeTeamNameEn: resolvedHomeTeamNameEn,
        homeTeamNameHe: resolvedHomeTeamNameHe,
        awayTeamApiFootballId: row?.teams?.away?.id || null,
        awayTeamNameEn: resolvedAwayTeamNameEn,
        awayTeamNameHe: resolvedAwayTeamNameHe,
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
    leagueApiFootballId: snapshot.leagueApiFootballId ?? null,
    homeTeamApiFootballId: snapshot.homeTeamApiFootballId ?? null,
    awayTeamApiFootballId: snapshot.awayTeamApiFootballId ?? null,
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

const ISRAELI_LEAGUE_IDS = new Set([383, 385, 1114, 1115]);
const ISRAELI_TEAM_IDS = new Set([563, 604, 657, 2253, 4195, 4481, 4492, 4495, 4499, 4500, 4507, 4510, 8670, 8681]);
const ISRAELI_KEYWORDS = [
  'israel',
  'ligat ha',
  'toto cup',
  'state cup',
  'winner cup',
  'hapoel',
  'maccabi',
  'beitar',
  'bnei',
  'ironi',
  'beer sheva',
  'jerusalem',
  'tel aviv',
  'haifa',
  'netanya',
  'petah tikva',
  'sakhnin',
  'ashdod',
  'kiryat',
  'katamon',
  'kfar saba',
  'nazareth',
];

function normalizeLiveSortText(value: string | null | undefined) {
  return String(value || '').toLowerCase();
}

function includesIsraeliKeyword(value: string) {
  return ISRAELI_KEYWORDS.some((keyword) => value.includes(keyword));
}

function isIsraeliLiveSnapshot(snapshot: {
  countryLabel: string;
  leagueLabel: string;
  homeTeamName: string;
  awayTeamName: string;
  leagueApiFootballId?: number | null;
  homeTeamApiFootballId?: number | null;
  awayTeamApiFootballId?: number | null;
}) {
  if (snapshot.leagueApiFootballId && ISRAELI_LEAGUE_IDS.has(snapshot.leagueApiFootballId)) {
    return true;
  }

  if (snapshot.homeTeamApiFootballId && ISRAELI_TEAM_IDS.has(snapshot.homeTeamApiFootballId)) {
    return true;
  }

  if (snapshot.awayTeamApiFootballId && ISRAELI_TEAM_IDS.has(snapshot.awayTeamApiFootballId)) {
    return true;
  }

  const country = normalizeLiveSortText(snapshot.countryLabel);
  const league = normalizeLiveSortText(snapshot.leagueLabel);
  const teams = normalizeLiveSortText(`${snapshot.homeTeamName} ${snapshot.awayTeamName}`);

  if (country.includes('israel')) {
    return true;
  }

  return includesIsraeliKeyword(league) || includesIsraeliKeyword(teams);
}

function sortLiveSnapshots<
  T extends {
    countryLabel: string;
    leagueLabel: string;
    homeTeamName: string;
    awayTeamName: string;
    leagueApiFootballId?: number | null;
    homeTeamApiFootballId?: number | null;
    awayTeamApiFootballId?: number | null;
  },
>(snapshots: T[]) {
  return [...snapshots].sort((a, b) => {
    const aIsraeli = isIsraeliLiveSnapshot(a);
    const bIsraeli = isIsraeliLiveSnapshot(b);

    if (aIsraeli !== bIsraeli) {
      return aIsraeli ? -1 : 1;
    }

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
  const [latestSeason, allowedCountryLabels] = await Promise.all([
    prisma.season.findFirst({
      where: {
        year: {
          lte: getCurrentSeasonStartYear(),
        },
      },
      orderBy: { year: 'desc' },
    }),
    getAllowedLiveCountryLabels(),
  ]);

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
    const snapshotCountry =
      snapshot.rawJson && typeof snapshot.rawJson === 'object' ? String((snapshot.rawJson as any)?.league?.country || '').trim() : '';
    if (Array.isArray(allowedCountryLabels) && !allowedCountryLabels.includes(snapshotCountry)) {
      return false;
    }
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

  const countryFilteredSnapshots = Array.isArray(allowedCountryLabels)
    ? sourceSnapshots.filter((snapshot) => {
        const snapshotCountry =
          snapshot.rawJson && typeof snapshot.rawJson === 'object' ? String((snapshot.rawJson as any)?.league?.country || '').trim() : '';
        return allowedCountryLabels.includes(snapshotCountry);
      })
    : sourceSnapshots;

  const filteredSourceSnapshots = selectedTeam
    ? countryFilteredSnapshots.filter((snapshot) => {
        if (snapshot.game) {
          return snapshot.game.homeTeamId === selectedTeam.id || snapshot.game.awayTeamId === selectedTeam.id;
        }
        return snapshot.homeTeamApiFootballId === selectedTeam.apiFootballId || snapshot.awayTeamApiFootballId === selectedTeam.apiFootballId;
      })
    : countryFilteredSnapshots;

  const teamApiIds = Array.from(
    new Set(
      filteredSourceSnapshots
        .flatMap((snapshot) => [snapshot.homeTeamApiFootballId, snapshot.awayTeamApiFootballId])
        .filter((id: unknown): id is number => typeof id === 'number')
    )
  );

  const localTeams = teamApiIds.length
    ? await prisma.team.findMany({
        where: {
          apiFootballId: {
            in: teamApiIds,
          },
        },
        select: {
          apiFootballId: true,
          nameHe: true,
          nameEn: true,
          season: {
            select: {
              year: true,
            },
          },
        },
        orderBy: [{ season: { year: 'desc' } }],
      })
    : [];

  const localTeamMap = new Map<number, (typeof localTeams)[number]>();

  for (const team of localTeams) {
    if (typeof team.apiFootballId !== 'number') continue;
    if (!localTeamMap.has(team.apiFootballId)) {
      localTeamMap.set(team.apiFootballId, team);
    }
  }

  const normalizedSnapshots = filteredSourceSnapshots.map((snapshot) => {
    const localHomeTeam =
      typeof snapshot.homeTeamApiFootballId === 'number'
        ? localTeamMap.get(snapshot.homeTeamApiFootballId)
        : null;
    const localAwayTeam =
      typeof snapshot.awayTeamApiFootballId === 'number'
        ? localTeamMap.get(snapshot.awayTeamApiFootballId)
        : null;

    return {
      ...snapshot,
      homeTeamNameHe: localHomeTeam?.nameHe || snapshot.homeTeamNameHe,
      homeTeamNameEn: localHomeTeam?.nameEn || snapshot.homeTeamNameEn,
      awayTeamNameHe: localAwayTeam?.nameHe || snapshot.awayTeamNameHe,
      awayTeamNameEn: localAwayTeam?.nameEn || snapshot.awayTeamNameEn,
    };
  });

  return sortLiveSnapshots(normalizedSnapshots.map(mapSnapshotToHomepage)).slice(0, limit);
}
