import { ActivityEntityType, CompetitionType, FetchJobStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUser } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { apiFootballFetch } from '@/lib/api-football';
import { getCompetitionById } from '@/lib/competitions';
import { derivePlayerDeepStats, deriveTeamDeepStats } from '@/lib/deep-stats';
import { cleanupFutureSeasons } from '@/lib/home-live';
import { storePlayerPhotoLocally, storeTeamLogoLocally } from '@/lib/media-storage';

type FetchBody = {
  season?: string;
  leagueId?: string;
  teamSelection?: string;
  resources?: string[];
};

type JobStep = {
  key: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  syncedCount?: number;
  fetchedCount?: number;
  note?: string;
};

const LEAGUE_NAMES: Record<string, string> = {
  '383': 'ליגת העל',
  '382': 'הליגה הלאומית',
  '384': 'גביע המדינה',
  '385': 'גביע הטוטו',
  '659': 'אלוף האלופים',
  '496': 'ליגה א׳',
};

const RESOURCE_LABELS: Record<string, string> = {
  countries: 'מדינות',
  seasons: 'עונות',
  leagues: 'ליגות',
  competitions: 'מסגרות ותחרויות',
  teams: 'קבוצות',
  players: 'שחקנים',
  fixtures: 'משחקים',
  standings: 'טבלאות',
  events: 'אירועים',
  lineups: 'הרכבים',
  statistics: 'סטטיסטיקות משחק',
  topScorers: 'מלכי שערים',
  topAssists: 'מלכי בישולים',
  injuries: 'פציעות',
  transfers: 'העברות',
  trophies: 'תארים',
  sidelined: 'מושבתים',
  odds: 'יחסים',
  predictions: 'תחזיות',
  h2h: 'ראש בראש',
  livescore: 'לייב',
};

const IMPLEMENTED_RESOURCES = new Set([
  'countries',
  'seasons',
  'leagues',
  'competitions',
  'teams',
  'players',
  'fixtures',
  'standings',
  'events',
  'statistics',
  'lineups',
  'topScorers',
  'topAssists',
  'injuries',
  'transfers',
  'trophies',
  'sidelined',
  'predictions',
  'h2h',
  'odds',
  'livescore',
]);

const ALL_TEAMS_ONLY_RESOURCES = new Set(['topScorers', 'topAssists']);

RESOURCE_LABELS.globalLivescore = 'לייב גלובלי';
IMPLEMENTED_RESOURCES.add('globalLivescore');
ALL_TEAMS_ONLY_RESOURCES.add('globalLivescore');

const NAME_TRANSLATIONS: Record<string, string> = {
  'Hapoel Beer Sheva': 'הפועל באר שבע',
  'Maccabi Tel Aviv': 'מכבי תל אביב',
  'Maccabi Haifa': 'מכבי חיפה',
  'Beitar Jerusalem': 'בית"ר ירושלים',
  'Hapoel Haifa': 'הפועל חיפה',
  'Maccabi Netanya': 'מכבי נתניה',
  'Bnei Sakhnin': 'בני סכנין',
  'Hapoel Jerusalem': 'הפועל ירושלים',
  'Maccabi Petah Tikva': 'מכבי פתח תקווה',
  'Hapoel Tel Aviv': 'הפועל תל אביב',
  Ashdod: 'מ.ס. אשדוד',
  'Hapoel Hadera': 'הפועל חדרה',
  'Maccabi Bnei Raina': 'מכבי בני ריינה',
};

const RESOURCE_STALE_HOURS = {
  players: 24 * 7,
  standings: 12,
  fixtures: 6,
  events: 6,
  statistics: 6,
  lineups: 3,
  predictions: 6,
  h2h: 24,
  odds: 2,
} as const;

function translateName(name: string | null | undefined) {
  if (!name) return name || '';
  return NAME_TRANSLATIONS[name] || name;
}

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isWithinHours(value: Date | string | null | undefined, hours: number) {
  const date = toDate(value);
  if (!date) return false;
  return Date.now() - date.getTime() <= hours * 60 * 60 * 1000;
}

function isGameUpcomingOrOngoing(status: string | undefined, dateTime: Date | string | null | undefined) {
  if (status === 'ONGOING') return true;
  if (status !== 'SCHEDULED') return false;
  const gameDate = toDate(dateTime);
  if (!gameDate) return false;
  return gameDate.getTime() >= Date.now() - 3 * 60 * 60 * 1000;
}

function isGameRecentOrOngoing(status: string | undefined, dateTime: Date | string | null | undefined, hours = 48) {
  if (status === 'ONGOING') return true;
  const gameDate = toDate(dateTime);
  if (!gameDate) return false;
  return Math.abs(Date.now() - gameDate.getTime()) <= hours * 60 * 60 * 1000;
}

function getMostRecentDate(values: Array<Date | string | null | undefined>) {
  return values
    .map(toDate)
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime())[0] || null;
}

function mapGameStatus(status: string | undefined) {
  if (!status) return 'SCHEDULED' as const;
  if (['FT', 'AET', 'PEN'].includes(status)) return 'COMPLETED' as const;
  if (['1H', '2H', 'HT', 'ET', 'BT', 'LIVE'].includes(status)) return 'ONGOING' as const;
  if (['PST', 'TBD', 'NS'].includes(status)) return 'SCHEDULED' as const;
  if (['CANC', 'ABD', 'AWD', 'WO'].includes(status)) return 'CANCELLED' as const;
  return 'SCHEDULED' as const;
}

function mapEventType(eventType: string | undefined, detail: string | undefined) {
  if (eventType === 'Goal') {
    if (detail === 'Own Goal') return 'OWN_GOAL';
    if (detail === 'Penalty') return 'PENALTY_GOAL';
    if (detail === 'Missed Penalty') return 'PENALTY_MISSED';
    return 'GOAL';
  }

  if (eventType === 'Card') {
    if (detail === 'Yellow Card') return 'YELLOW_CARD';
    if (detail === 'Red Card' || detail === 'Second Yellow card') return 'RED_CARD';
  }

  if (eventType === 'subst') return 'SUBSTITUTION_OUT';

  return 'ASSIST';
}

function mapLeaderboardCategory(resourceKey: string) {
  return resourceKey === 'topAssists' ? 'TOP_ASSISTS' : 'TOP_SCORERS';
}

function mapLineupRole(role: 'startXI' | 'substitutes' | 'coach') {
  if (role === 'startXI') return 'STARTER' as const;
  if (role === 'substitutes') return 'SUBSTITUTE' as const;
  return 'COACH' as const;
}

function translateTransferType(type: string | null | undefined) {
  const normalized = (type || '').trim();

  const labels: Record<string, string> = {
    Free: 'העברה חופשית',
    'Free agent': 'שחקן חופשי',
    'Free Transfer': 'העברה חופשית',
    Transfer: 'העברה',
    Loan: 'השאלה',
    'Back from Loan': 'חזרה מהשאלה',
    'Return from loan': 'חזרה מהשאלה',
    'N/A': 'ללא פירוט',
    '-': 'ללא פירוט',
  };

  return labels[normalized] || translateName(normalized) || normalized || null;
}

function translateTrophyPlace(place: string | null | undefined) {
  const normalized = (place || '').trim();

  const labels: Record<string, string> = {
    Winner: 'זוכה',
    '2nd Place': 'מקום שני',
    '3rd Place': 'מקום שלישי',
    Runnerup: 'סגנית',
    'Runner-up': 'סגנית',
  };

  return labels[normalized] || translateName(normalized) || normalized || null;
}

function buildEventApiFootballId(fixtureId: number, eventIndex: number) {
  const candidate = fixtureId * 1000 + eventIndex;
  return Number.isSafeInteger(candidate) && candidate <= 2147483647 ? candidate : null;
}

function parseStatisticValue(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const normalized = value.replace('%', '').trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parsePercentValue(value: unknown) {
  if (typeof value === 'number') return Math.round(value);
  if (typeof value === 'string') {
    const normalized = value.replace('%', '').trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }

  return null;
}

function mapFixtureStatistics(statisticsRows: any[]) {
  const home = statisticsRows[0]?.statistics || [];
  const away = statisticsRows[1]?.statistics || [];

  const readStat = (rows: any[], type: string) =>
    parseStatisticValue(rows.find((entry: any) => entry?.type === type)?.value);

  return {
    homeTeamPossession: readStat(home, 'Ball Possession'),
    awayTeamPossession: readStat(away, 'Ball Possession'),
    homeShotsOnTarget: readStat(home, 'Shots on Goal'),
    awayShotsOnTarget: readStat(away, 'Shots on Goal'),
    homeShotsTotal: readStat(home, 'Total Shots'),
    awayShotsTotal: readStat(away, 'Total Shots'),
    homeCorners: readStat(home, 'Corner Kicks'),
    awayCorners: readStat(away, 'Corner Kicks'),
    homeFouls: readStat(home, 'Fouls'),
    awayFouls: readStat(away, 'Fouls'),
    homeOffsides: readStat(home, 'Offsides'),
    awayOffsides: readStat(away, 'Offsides'),
    homeYellowCards: readStat(home, 'Yellow Cards'),
    awayYellowCards: readStat(away, 'Yellow Cards'),
    homeRedCards: readStat(home, 'Red Cards'),
    awayRedCards: readStat(away, 'Red Cards'),
  };
}

function isDateWithinSeason(date: Date | null, season: { startDate: Date; endDate: Date }) {
  if (!date || Number.isNaN(date.getTime())) return false;
  return date >= season.startDate && date <= season.endDate;
}

function matchesTrophySeasonLabel(label: string | null | undefined, seasonYear: number) {
  if (!label) return false;

  const trimmed = label.trim();
  const rangeMatch = trimmed.match(/^(\d{4})\s*[\/-]\s*(\d{4})$/);
  if (rangeMatch) {
    return Number(rangeMatch[1]) === seasonYear;
  }

  const yearMatch = trimmed.match(/^(\d{4})$/);
  if (yearMatch) {
    const year = Number(yearMatch[1]);
    return year === seasonYear || year === seasonYear + 1;
  }

  return trimmed.startsWith(String(seasonYear));
}

function overlapsSeasonRange(
  startDate: Date | null,
  endDate: Date | null,
  season: { startDate: Date; endDate: Date }
) {
  if (!startDate || Number.isNaN(startDate.getTime())) return false;
  const effectiveEnd = endDate && !Number.isNaN(endDate.getTime()) ? endDate : season.endDate;
  return startDate <= season.endDate && effectiveEnd >= season.startDate;
}

function formatSeasonLabel(year: number) {
  return `${year}-${year + 1}`;
}

async function findCanonicalPlayerMatch(apiFootballId: number | null, nameEn: string | null) {
  const matchedPlayer =
    (apiFootballId
      ? await prisma.player.findFirst({
          where: { apiFootballId },
          orderBy: [{ canonicalPlayerId: 'asc' }, { createdAt: 'asc' }],
        })
      : null) ||
    (nameEn
      ? await prisma.player.findFirst({
          where: { nameEn },
          orderBy: [{ canonicalPlayerId: 'asc' }, { createdAt: 'asc' }],
        })
      : null);

  if (!matchedPlayer) return null;

  if (matchedPlayer.canonicalPlayerId) {
  return prisma.player.findUnique({ where: { id: matchedPlayer.canonicalPlayerId } });
  }

  return matchedPlayer;
}

async function syncTeamCoachAssignment({
  teamId,
  seasonId,
  apiFootballCoachId,
  coachNameEn,
  coachNameHe,
  fixtureDate,
}: {
  teamId: string;
  seasonId: string;
  apiFootballCoachId: number | null;
  coachNameEn: string;
  coachNameHe: string | null;
  fixtureDate: Date | null;
}) {
  const existingAssignment =
    (apiFootballCoachId
      ? await prisma.teamCoachAssignment.findFirst({
          where: {
            teamId,
            seasonId,
            apiFootballCoachId,
          },
          orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
        })
      : null) ||
    (await prisma.teamCoachAssignment.findFirst({
      where: {
        teamId,
        seasonId,
        coachNameEn,
      },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    }));

  if (existingAssignment) {
    const nextStartDate =
      fixtureDate && (!existingAssignment.startDate || fixtureDate < existingAssignment.startDate)
        ? fixtureDate
        : existingAssignment.startDate;
    const nextEndDate =
      fixtureDate && (!existingAssignment.endDate || fixtureDate > existingAssignment.endDate)
        ? fixtureDate
        : existingAssignment.endDate;

    return prisma.teamCoachAssignment.update({
      where: { id: existingAssignment.id },
      data: {
        apiFootballCoachId: apiFootballCoachId || existingAssignment.apiFootballCoachId,
        coachNameHe: existingAssignment.coachNameHe || coachNameHe,
        startDate: nextStartDate,
        endDate: nextEndDate,
      },
    });
  }

  return prisma.teamCoachAssignment.create({
    data: {
      teamId,
      seasonId,
      apiFootballCoachId,
      coachNameEn,
      coachNameHe,
      startDate: fixtureDate,
      endDate: fixtureDate,
    },
  });
}

async function getOrCreateSeason(year: number) {
  const existing = await prisma.season.findUnique({ where: { year } });
  if (existing) return existing;

  return prisma.season.create({
    data: {
      year,
      name: formatSeasonLabel(year),
      startDate: new Date(`${year}-07-01T00:00:00.000Z`),
      endDate: new Date(`${year + 1}-06-30T23:59:59.999Z`),
    },
  });
}

async function fetchSeasonPlayers(teamApiFootballId: number, seasonYear: number) {
  const rows: any[] = [];

  for (let page = 1; page <= 20; page += 1) {
    const pageRows = await apiFootballFetch(`/players?team=${teamApiFootballId}&season=${seasonYear}&page=${page}`);
    if (!pageRows.length) break;

    rows.push(...pageRows);

    if (pageRows.length < 20) {
      break;
    }
  }

  return rows;
}

async function updateFetchJob(jobId: string, steps: JobStep[], status?: FetchJobStatus) {
  const doneSteps = steps.filter((step) => step.status === 'done').length;
  const progressPercent = steps.length ? Math.round((doneSteps / steps.length) * 100) : 0;

  await prisma.fetchJob.update({
    where: { id: jobId },
    data: {
      status,
      progressPercent,
      stepsJson: steps as any,
    },
  });
}

function markStep(steps: JobStep[], key: string, status: JobStep['status']) {
  return steps.map((step) => (step.key === key ? { ...step, status } : step));
}

function completeStep(
  steps: JobStep[],
  key: string,
  syncedCount: number,
  note?: string,
  fetchedCount?: number
): JobStep[] {
  return steps.map((step) =>
    step.key === key
      ? {
          ...step,
          status: 'done' as const,
          syncedCount,
          ...(fetchedCount !== undefined ? { fetchedCount } : {}),
          ...(note !== undefined ? { note } : {}),
        }
      : step
  );
}

async function syncDerivedStatistics({
  seasonId,
  competitionId,
  teamIds,
}: {
  seasonId: string;
  competitionId: string;
  teamIds?: string[];
}) {
  const teamFilter = teamIds?.length ? { id: { in: teamIds } } : {};

  const [teams, games] = await Promise.all([
    prisma.team.findMany({
      where: {
        seasonId,
        ...teamFilter,
      },
      include: {
        players: true,
        standings: {
          where: { competitionId },
        },
      },
    }),
    prisma.game.findMany({
      where: {
        seasonId,
        competitionId,
        ...(teamIds?.length
          ? {
              OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }],
            }
          : {}),
      },
      select: {
        id: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        status: true,
        events: {
          select: {
            minute: true,
            extraMinute: true,
            type: true,
            playerId: true,
            relatedPlayerId: true,
            teamId: true,
          },
        },
        lineupEntries: {
          select: {
            playerId: true,
            role: true,
            teamId: true,
          },
        },
        gameStats: {
          select: {
            homeTeamPossession: true,
            awayTeamPossession: true,
            homeShotsOnTarget: true,
            awayShotsOnTarget: true,
            homeShotsTotal: true,
            awayShotsTotal: true,
            homeCorners: true,
            awayCorners: true,
            homeFouls: true,
            awayFouls: true,
            homeOffsides: true,
            awayOffsides: true,
            homeYellowCards: true,
            awayYellowCards: true,
            homeRedCards: true,
            awayRedCards: true,
          },
        },
      },
    }),
  ]);

  for (const team of teams) {
    const teamGames = games.filter((game) => game.homeTeamId === team.id || game.awayTeamId === team.id);
    const teamDerived = deriveTeamDeepStats(team.id, teamGames);
    let totalAssists = 0;

    for (const player of team.players) {
      const playerDerived = derivePlayerDeepStats(player.id, teamGames);
      totalAssists += playerDerived.assists;

      await prisma.playerStatistics.upsert({
        where: {
          playerId_seasonId_competitionId: {
            playerId: player.id,
            seasonId,
            competitionId,
          },
        },
        update: {
          goals: playerDerived.goals,
          assists: playerDerived.assists,
          yellowCards: playerDerived.yellowCards,
          redCards: playerDerived.redCards,
          gamesPlayed: playerDerived.gamesPlayed,
          minutesPlayed: playerDerived.minutesPlayed,
          starts: playerDerived.starts,
          substituteAppearances: playerDerived.substituteAppearances,
          timesSubbedOff: playerDerived.timesSubbedOff,
        },
        create: {
          playerId: player.id,
          seasonId,
          competitionId,
          goals: playerDerived.goals,
          assists: playerDerived.assists,
          yellowCards: playerDerived.yellowCards,
          redCards: playerDerived.redCards,
          gamesPlayed: playerDerived.gamesPlayed,
          minutesPlayed: playerDerived.minutesPlayed,
          starts: playerDerived.starts,
          substituteAppearances: playerDerived.substituteAppearances,
          timesSubbedOff: playerDerived.timesSubbedOff,
        },
      });
    }

    const standing = team.standings[0] || null;

    await prisma.teamStatistics.upsert({
      where: {
        teamId_seasonId_competitionId: {
          teamId: team.id,
          seasonId,
          competitionId,
        },
      },
      update: {
        matchesPlayed: teamDerived.matchesPlayed,
        totalGoals: teamDerived.goalsFor,
        totalAssists,
        goalsConceded: teamDerived.goalsAgainst,
        cleanSheets: teamDerived.cleanSheets,
        yellowCards: teamDerived.yellowCards,
        redCards: teamDerived.redCards,
        shotsOnTarget: teamDerived.shotsOnTarget,
        shotsTotal: teamDerived.shotsTotal,
        corners: teamDerived.corners,
        fouls: teamDerived.fouls,
        offsides: teamDerived.offsides,
        averagePossession: teamDerived.averagePossession,
        wins: standing?.wins ?? 0,
        draws: standing?.draws ?? 0,
        losses: standing?.losses ?? 0,
        points: standing?.points ?? 0,
      },
      create: {
        teamId: team.id,
        seasonId,
        competitionId,
        matchesPlayed: teamDerived.matchesPlayed,
        totalGoals: teamDerived.goalsFor,
        totalAssists,
        goalsConceded: teamDerived.goalsAgainst,
        cleanSheets: teamDerived.cleanSheets,
        yellowCards: teamDerived.yellowCards,
        redCards: teamDerived.redCards,
        shotsOnTarget: teamDerived.shotsOnTarget,
        shotsTotal: teamDerived.shotsTotal,
        corners: teamDerived.corners,
        fouls: teamDerived.fouls,
        offsides: teamDerived.offsides,
        averagePossession: teamDerived.averagePossession,
        wins: standing?.wins ?? 0,
        draws: standing?.draws ?? 0,
        losses: standing?.losses ?? 0,
        points: standing?.points ?? 0,
      },
    });
  }
}

export async function POST(request: NextRequest) {
  const viewer = await getRequestUser(request);

  if (!viewer || viewer.role !== 'ADMIN') {
    return NextResponse.json({ error: 'אין הרשאה למשיכה.' }, { status: 403 });
  }

  const body = (await request.json()) as FetchBody;
  const seasonYear = Number(body.season || '2025');
  const leagueId = String(body.leagueId || '383');
  const selectedCompetitionMeta = getCompetitionById(leagueId);
  const teamSelection = body.teamSelection || 'all';
  const resources = Array.isArray(body.resources) ? body.resources : [];
  const requestedResources = resources.length
    ? resources
    : ['competitions', 'teams', 'players', 'fixtures', 'standings', 'events'];
  const effectiveResources = requestedResources.filter(
    (resource) => teamSelection === 'all' || !ALL_TEAMS_ONLY_RESOURCES.has(resource)
  );

  if (!effectiveResources.length) {
    return NextResponse.json({ error: 'לא נבחרו סעיפים זמינים למשיכה עבור החתך שנבחר.' }, { status: 400 });
  }

  const initialSteps: JobStep[] = effectiveResources.map((key) => ({
    key,
    label: RESOURCE_LABELS[key] || key,
    status: 'pending',
    syncedCount: 0,
    ...(IMPLEMENTED_RESOURCES.has(key) ? {} : { note: 'עדיין לא ממומש' }),
  }));

  const job = await prisma.fetchJob.create({
    data: {
      labelHe: `משיכת נתוני ${selectedCompetitionMeta?.nameHe || LEAGUE_NAMES[leagueId] || leagueId} לעונת ${formatSeasonLabel(seasonYear)}`,
      status: FetchJobStatus.RUNNING,
      requestPayload: body as any,
      progressPercent: 5,
      stepsJson: initialSteps as any,
      initiatedById: viewer.id,
    },
  });

  try {
    const season = await getOrCreateSeason(seasonYear);
    let steps = [...initialSteps];

    const competition = await prisma.competition.upsert({
      where: {
        apiFootballId: Number(leagueId),
      },
      update: {
        nameHe: selectedCompetitionMeta?.nameHe || LEAGUE_NAMES[leagueId] || `ליגה ${leagueId}`,
        nameEn: selectedCompetitionMeta?.nameEn || `Competition ${leagueId}`,
        type: selectedCompetitionMeta?.kind === 'CUP' ? CompetitionType.CUP : CompetitionType.LEAGUE,
      },
      create: {
        apiFootballId: Number(leagueId),
        nameEn: selectedCompetitionMeta?.nameEn || `Competition ${leagueId}`,
        nameHe: selectedCompetitionMeta?.nameHe || LEAGUE_NAMES[leagueId] || `ליגה ${leagueId}`,
        type: selectedCompetitionMeta?.kind === 'CUP' ? CompetitionType.CUP : CompetitionType.LEAGUE,
      },
    });

    const competitionSeason = await prisma.competitionSeason.upsert({
      where: {
        competitionId_seasonId: {
          competitionId: competition.id,
          seasonId: season.id,
        },
      },
      update: {},
      create: {
        competitionId: competition.id,
        seasonId: season.id,
      },
    });

    await prisma.fetchJob.update({
      where: { id: job.id },
      data: {
        seasonId: season.id,
        competitionId: competition.id,
        progressPercent: 10,
      },
    });

    const selectedDbTeam =
      teamSelection !== 'all'
        ? await prisma.team.findFirst({
            where: {
              OR: [{ id: teamSelection }, { apiFootballId: Number(teamSelection) || -1 }],
            },
          })
        : null;
    const selectedApiTeamId = teamSelection !== 'all' ? Number(teamSelection) || null : null;
    const selectedTeamName = selectedDbTeam?.nameEn || null;

    const [teamRows, standingsRows, fixtureRows] = await Promise.all([
      effectiveResources.some((key) =>
        [
          'teams',
          'players',
          'fixtures',
          'events',
          'lineups',
          'injuries',
          'transfers',
          'trophies',
          'predictions',
          'h2h',
          'odds',
        ].includes(key)
      )
        ? apiFootballFetch(`/teams?league=${leagueId}&season=${seasonYear}`)
        : [],
      effectiveResources.includes('standings')
        ? apiFootballFetch(`/standings?league=${leagueId}&season=${seasonYear}`)
        : [],
      effectiveResources.some((key) =>
        ['fixtures', 'events', 'statistics', 'lineups', 'injuries', 'predictions', 'h2h', 'odds'].includes(key)
      )
        ? apiFootballFetch(`/fixtures?league=${leagueId}&season=${seasonYear}`)
        : [],
    ]);

    const cupFixtureTeamIds = new Set<number>();
    const cupFixtureTeamNames = new Set<string>();
    if (selectedCompetitionMeta?.kind === 'CUP') {
      for (const fixture of fixtureRows) {
        const homeId = fixture?.teams?.home?.id;
        const awayId = fixture?.teams?.away?.id;
        const homeName = fixture?.teams?.home?.name;
        const awayName = fixture?.teams?.away?.name;
        if (typeof homeId === 'number') cupFixtureTeamIds.add(homeId);
        if (typeof awayId === 'number') cupFixtureTeamIds.add(awayId);
        if (typeof homeName === 'string' && homeName) cupFixtureTeamNames.add(homeName);
        if (typeof awayName === 'string' && awayName) cupFixtureTeamNames.add(awayName);
      }
    }

    const relevantTeams = teamRows.filter((row: any) => {
      const apiTeamId = row?.team?.id;
      const apiTeamName = row?.team?.name;
      if (selectedApiTeamId) return row?.team?.id === selectedApiTeamId;
      if (selectedTeamName) return row?.team?.name === selectedTeamName;
      if (selectedCompetitionMeta?.kind === 'CUP' && (cupFixtureTeamIds.size || cupFixtureTeamNames.size)) {
        return (
          (typeof apiTeamId === 'number' && cupFixtureTeamIds.has(apiTeamId)) ||
          (typeof apiTeamName === 'string' && cupFixtureTeamNames.has(apiTeamName))
        );
      }
      return true;
    });
    const teamsFetched = relevantTeams.filter((row: any) => !!row?.team?.name).length;

    let teamsAdded = 0;
    let playersAdded = 0;
    let gamesAdded = 0;
    let standingsUpdated = 0;
    let eventsSaved = 0;
    let statisticsSaved = 0;
    let lineupsSaved = 0;
    let topScorersSaved = 0;
    let topAssistsSaved = 0;
    let injuriesSaved = 0;
    let transfersSaved = 0;
    let trophiesSaved = 0;
    let countriesSaved = 0;
    let seasonsSaved = 0;
    let leaguesSaved = 0;
    let sidelinedSaved = 0;
    let predictionsSaved = 0;
    let h2hSaved = 0;
    let oddsSaved = 0;
    let livescoreSaved = 0;
    let globalLivescoreSaved = 0;
    let playersFetched = 0;
    let fixturesFetched = 0;
    let standingsFetched = 0;
    let eventsFetched = 0;
    let statisticsFetched = 0;
    let lineupsFetched = 0;
    let topScorersFetched = 0;
    let topAssistsFetched = 0;
    let injuriesFetched = 0;
    let transfersFetched = 0;
    let trophiesFetched = 0;
    let sidelinedFetched = 0;
    let predictionsFetched = 0;
    let h2hFetched = 0;
    let oddsFetched = 0;
    let livescoreFetched = 0;
    let globalLivescoreFetched = 0;

    const teamMap = new Map<string, any>();
    const existingSeasonTeams = await prisma.team.findMany({
      where: {
        seasonId: season.id,
      },
    });

    for (const existingTeam of existingSeasonTeams) {
      teamMap.set(existingTeam.nameEn, existingTeam);
    }

    if (effectiveResources.includes('countries')) {
      steps = markStep(steps, 'countries', 'running');
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);

      const countryRows = await apiFootballFetch('/countries');
      const countriesFetched = countryRows.filter((row: any) => !!row?.name).length;

      for (const row of countryRows) {
        if (!row?.name) continue;

        await prisma.countryCatalog.upsert({
          where: {
            nameEn: row.name,
          },
          update: {
            nameHe: translateName(row.name),
            code: row.code || null,
            flagUrl: row.flag || null,
          },
          create: {
            nameEn: row.name,
            nameHe: translateName(row.name),
            code: row.code || null,
            flagUrl: row.flag || null,
          },
        });
        countriesSaved += 1;
      }

      steps = completeStep(steps, 'countries', countriesSaved, 'קטלוג גלובלי', countriesFetched);
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);
    }

    if (effectiveResources.includes('seasons')) {
      steps = markStep(steps, 'seasons', 'running');
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);

      const availableSeasonYears = await apiFootballFetch('/leagues/seasons');
      const seasonsFetched = availableSeasonYears.filter((value: unknown) => Number.isInteger(Number(value))).length;

      for (const value of availableSeasonYears) {
        const year = Number(value);
        if (!Number.isInteger(year)) continue;
        await getOrCreateSeason(year);
        seasonsSaved += 1;
      }

      steps = completeStep(steps, 'seasons', seasonsSaved, 'ממלא את טבלת העונות המקומית', seasonsFetched);
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);
    }

    if (effectiveResources.includes('leagues')) {
      steps = markStep(steps, 'leagues', 'running');
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);

      const countryName = process.env.API_FOOTBALL_COUNTRY || 'Israel';
      const leagueRows = await apiFootballFetch(
        `/leagues?country=${encodeURIComponent(countryName)}&season=${seasonYear}`
      );
      const leaguesFetched = leagueRows.filter((row: any) => !!row?.league?.name).length;

      for (const row of leagueRows) {
        if (!row?.league?.name) continue;

        const leagueCompetition = await prisma.competition.upsert({
          where: {
            apiFootballId: row.league.id,
          },
          update: {
            nameEn: row.league.name,
            nameHe: translateName(row.league.name),
            logoUrl: row.league.logo || null,
            type: row.league.type === 'Cup' ? CompetitionType.CUP : CompetitionType.LEAGUE,
            countryEn: row.country?.name || null,
            countryHe: translateName(row.country?.name),
          },
          create: {
            apiFootballId: row.league.id,
            nameEn: row.league.name,
            nameHe: translateName(row.league.name),
            logoUrl: row.league.logo || null,
            type: row.league.type === 'Cup' ? CompetitionType.CUP : CompetitionType.LEAGUE,
            countryEn: row.country?.name || null,
            countryHe: translateName(row.country?.name),
          },
        });

        const seasonInfo = Array.isArray(row.seasons)
          ? row.seasons.find((entry: any) => Number(entry?.year) === seasonYear) || row.seasons[0]
          : null;

        await prisma.competitionSeason.upsert({
          where: {
            competitionId_seasonId: {
              competitionId: leagueCompetition.id,
              seasonId: season.id,
            },
          },
          update: {
            stageNameEn: null,
            stageNameHe: null,
            currentRoundEn: null,
            currentRoundHe: null,
          },
          create: {
            competitionId: leagueCompetition.id,
            seasonId: season.id,
            stageNameEn: null,
            stageNameHe: null,
            currentRoundEn: null,
            currentRoundHe: null,
          },
        });

        leaguesSaved += 1;
      }

      steps = completeStep(steps, 'leagues', leaguesSaved, 'לפי מדינת ברירת המחדל של המערכת', leaguesFetched);
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);
    }

    if (effectiveResources.includes('teams')) {
      steps = markStep(steps, 'teams', 'running');
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);

      for (const row of relevantTeams) {
        const apiTeam = row?.team;
        if (!apiTeam?.name) continue;

        const existing =
          (apiTeam.id
            ? await prisma.team.findFirst({
                where: {
                  apiFootballId: apiTeam.id,
                  seasonId: season.id,
                },
              })
            : null) ||
          (await prisma.team.findFirst({
            where: {
              nameEn: apiTeam.name,
              seasonId: season.id,
            },
          }));

        if (!existing) teamsAdded += 1;

        const localLogoUrl = await storeTeamLogoLocally({
          remoteUrl: apiTeam.logo || null,
          seasonYear,
          teamId: apiTeam.id || apiTeam.name,
          teamName: apiTeam.name,
        });

        const teamData = {
          apiFootballId: apiTeam.id,
          nameEn: apiTeam.name,
          nameHe: translateName(apiTeam.name),
          logoUrl: localLogoUrl || apiTeam.logo || null,
          coach: existing?.coach || null,
          coachHe: existing?.coachHe || null,
          code: apiTeam.code || null,
          countryEn: apiTeam.country || null,
          countryHe: translateName(apiTeam.country),
          founded: apiTeam.founded || null,
          stadiumEn: row?.venue?.name || null,
          cityEn: row?.venue?.city || null,
          seasonId: season.id,
        };

        const team = existing
          ? await prisma.team.update({
              where: { id: existing.id },
              data: teamData,
            })
          : await prisma.team.create({
              data: teamData,
            });

        teamMap.set(apiTeam.name, team);
      }

      steps = completeStep(steps, 'teams', teamsAdded, undefined, teamsFetched);
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);
    }

    if (effectiveResources.includes('players')) {
      steps = markStep(steps, 'players', 'running');
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);

      for (const row of relevantTeams) {
        const apiTeam = row?.team;
        const dbTeam = teamMap.get(apiTeam?.name);
        if (!apiTeam?.id || !dbTeam) continue;

        const seasonPlayerRows = await fetchSeasonPlayers(apiTeam.id, seasonYear);
        const importedApiPlayerIds = new Set<number>();
        const importedPlayerNames = new Set<string>();

        for (const playerEntry of seasonPlayerRows) {
          const playerRow = playerEntry?.player;
          const playerStatistic = Array.isArray(playerEntry?.statistics)
            ? playerEntry.statistics.find((stat: any) => stat?.team?.id === apiTeam.id) || playerEntry.statistics[0]
            : null;
          if (!playerRow?.name) continue;

          importedPlayerNames.add(playerRow.name);
          if (typeof playerRow.id === 'number') {
            importedApiPlayerIds.add(playerRow.id);
          }

            playersFetched += 1;
            const jerseyNumber =
              typeof playerStatistic?.games?.number === 'number'
                ? playerStatistic.games.number
                : typeof playerRow.number === 'number'
                  ? playerRow.number
                  : null;
            const canonicalPlayer = await findCanonicalPlayerMatch(playerRow.id || null, playerRow.name || null);

            const existingPlayer =
              (playerRow.id
                ? await prisma.player.findFirst({
                    where: {
                      apiFootballId: playerRow.id,
                      teamId: dbTeam.id,
                    },
                  })
                : null) ||
              (jerseyNumber !== null
                ? await prisma.player.findUnique({
                    where: {
                      jerseyNumber_teamId: {
                        jerseyNumber,
                        teamId: dbTeam.id,
                      },
                    },
                  })
                : null) ||
              (await prisma.player.findFirst({
                where: {
                  nameEn: playerRow.name,
                  teamId: dbTeam.id,
                },
              }));

            const canonicalPlayerId =
              canonicalPlayer && canonicalPlayer.id !== existingPlayer?.id ? canonicalPlayer.id : existingPlayer?.canonicalPlayerId || null;
            const resolvedNameHe =
              existingPlayer?.nameHe ||
              canonicalPlayer?.nameHe ||
              translateName(playerRow.name);
            const resolvedFirstNameHe =
              existingPlayer?.firstNameHe ||
              canonicalPlayer?.firstNameHe ||
              null;
            const resolvedLastNameHe =
              existingPlayer?.lastNameHe ||
              canonicalPlayer?.lastNameHe ||
              null;
            const jerseyConflict =
              jerseyNumber !== null
                ? await prisma.player.findUnique({
                    where: {
                      jerseyNumber_teamId: {
                        jerseyNumber,
                        teamId: dbTeam.id,
                      },
                    },
                    select: {
                      id: true,
                    },
                  })
                : null;
            const safeJerseyNumber =
              jerseyConflict && jerseyConflict.id !== existingPlayer?.id ? null : jerseyNumber;

            const playerData = {
              photoUrl:
                (await storePlayerPhotoLocally({
                  remoteUrl: playerRow.photo || null,
                  seasonYear,
                  teamName: apiTeam.name,
                  playerId: playerRow.id || playerRow.name,
                  playerName: playerRow.name,
                })) ||
                playerRow.photo ||
                null,
              apiFootballId: playerRow.id || null,
              nameEn: playerRow.name,
              nameHe: resolvedNameHe,
              firstNameHe: resolvedFirstNameHe,
              lastNameHe: resolvedLastNameHe,
              jerseyNumber: safeJerseyNumber,
              position: playerStatistic?.games?.position || playerRow.position || null,
              teamId: dbTeam.id,
              canonicalPlayerId,
            };

            if (!existingPlayer) {
              playersAdded += 1;
              const createdPlayer = await prisma.player.create({ data: playerData });

              if (!canonicalPlayer && (resolvedFirstNameHe || resolvedLastNameHe || resolvedNameHe)) {
                await prisma.player.update({
                  where: { id: createdPlayer.id },
                  data: {
                    canonicalPlayerId: null,
                    nameHe: resolvedNameHe,
                    firstNameHe: resolvedFirstNameHe,
                    lastNameHe: resolvedLastNameHe,
                  },
                });
              }
            } else {
              await prisma.player.update({
                where: { id: existingPlayer.id },
                data: {
                  ...playerData,
                  apiFootballId: playerRow.id || existingPlayer.apiFootballId,
                  nameHe: existingPlayer.nameHe || playerData.nameHe,
                  firstNameHe: existingPlayer.firstNameHe || playerData.firstNameHe,
                  lastNameHe: existingPlayer.lastNameHe || playerData.lastNameHe,
                  jerseyNumber: safeJerseyNumber ?? existingPlayer.jerseyNumber,
                  canonicalPlayerId:
                    canonicalPlayer && canonicalPlayer.id !== existingPlayer.id
                      ? canonicalPlayer.id
                      : existingPlayer.canonicalPlayerId,
                },
              });
            }
        }

        if (seasonPlayerRows.length > 0) {
          await prisma.player.deleteMany({
            where: {
              teamId: dbTeam.id,
              OR: [
                importedApiPlayerIds.size
                  ? {
                      apiFootballId: {
                        notIn: Array.from(importedApiPlayerIds),
                      },
                    }
                  : {
                      apiFootballId: {
                        not: null,
                      },
                    },
                {
                  apiFootballId: null,
                  nameEn: {
                    notIn: Array.from(importedPlayerNames),
                  },
                },
              ],
            },
          });
        }
      }

      steps = completeStep(steps, 'players', playersAdded, undefined, playersFetched);
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);

      await prisma.competitionSeason.update({
        where: { id: competitionSeason.id },
        data: {
          playersUpdatedAt: new Date(),
        },
      });
    }

    if (effectiveResources.includes('sidelined')) {
      steps = markStep(steps, 'sidelined', 'running');
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);

      const scopedPlayers = await prisma.player.findMany({
        where: {
          team: {
            seasonId: season.id,
            ...(selectedDbTeam?.id ? { id: selectedDbTeam.id } : {}),
          },
          apiFootballId: {
            not: null,
          },
        },
        select: {
          id: true,
          apiFootballId: true,
          nameEn: true,
        },
      });

      await prisma.playerSidelinedEntry.deleteMany({
        where: {
          seasonId: season.id,
          ...(scopedPlayers.length ? { playerId: { in: scopedPlayers.map((player) => player.id) } } : {}),
        },
      });

      for (const player of scopedPlayers) {
        if (!player.apiFootballId) continue;

        const sidelinedRows = await apiFootballFetch(`/sidelined?player=${player.apiFootballId}`);
        sidelinedFetched += sidelinedRows.length;
        const seenSidelinedKeys = new Set<string>();

        for (const row of sidelinedRows) {
          const startDate = row?.start ? new Date(row.start) : null;
          const endDate = row?.end ? new Date(row.end) : null;
          if (!overlapsSeasonRange(startDate, endDate, season)) continue;
          const typeEn = row?.type || 'Unknown';
          const startDateKey = startDate ? startDate.toISOString() : 'null';
          const dedupeKey = `${player.apiFootballId}:${typeEn}:${startDateKey}`;
          if (seenSidelinedKeys.has(dedupeKey)) continue;
          seenSidelinedKeys.add(dedupeKey);

          const existingEntry = await prisma.playerSidelinedEntry.findFirst({
            where: {
              seasonId: season.id,
              apiFootballPlayerId: player.apiFootballId,
              typeEn,
              startDate,
            },
            select: {
              id: true,
            },
          });

          const sidelinedData = {
            apiFootballPlayerId: player.apiFootballId,
            playerNameEn: player.nameEn,
            playerNameHe: translateName(player.nameEn),
            typeEn,
            typeHe: translateName(row?.type),
            startDate,
            endDate,
            seasonId: season.id,
            playerId: player.id,
          };

          if (existingEntry) {
            await prisma.playerSidelinedEntry.update({
              where: {
                id: existingEntry.id,
              },
              data: sidelinedData,
            });
            continue;
          }

          await prisma.playerSidelinedEntry.create({
            data: sidelinedData,
          });
          sidelinedSaved += 1;
        }
      }

      steps = completeStep(steps, 'sidelined', sidelinedSaved, 'רשומות שחופפות לעונה בלבד', sidelinedFetched);
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);
    }

    if (effectiveResources.includes('fixtures')) {
      steps = markStep(steps, 'fixtures', 'running');
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);

      for (const fixture of fixtureRows) {
        const homeName = fixture?.teams?.home?.name;
        const awayName = fixture?.teams?.away?.name;
        if (!homeName || !awayName) continue;
        if (selectedTeamName && homeName !== selectedTeamName && awayName !== selectedTeamName) continue;
        fixturesFetched += 1;

        const homeTeam = teamMap.get(homeName);
        const awayTeam = teamMap.get(awayName);
        if (!homeTeam || !awayTeam) continue;

        const existingGame =
          (fixture?.fixture?.id
            ? await prisma.game.findUnique({
                where: { apiFootballId: fixture.fixture.id },
              })
            : null) ||
          (await prisma.game.findFirst({
            where: {
              homeTeamId: homeTeam.id,
              awayTeamId: awayTeam.id,
              seasonId: season.id,
              dateTime: new Date(fixture.fixture.date),
            },
          }));

        const gameData = {
          apiFootballId: fixture?.fixture?.id || null,
          externalRef: String(fixture?.fixture?.id || ''),
          roundNameEn: fixture?.league?.round || null,
          roundNameHe: translateName(fixture?.league?.round),
          venueNameEn: fixture?.fixture?.venue?.name || null,
          refereeEn: fixture?.fixture?.referee || null,
          refereeHe: translateName(fixture?.fixture?.referee),
          dateTime: new Date(fixture.fixture.date),
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
          seasonId: season.id,
          competitionId: competition.id,
          homeScore: fixture?.goals?.home ?? null,
          awayScore: fixture?.goals?.away ?? null,
          status: mapGameStatus(fixture?.fixture?.status?.short),
        };

        if (!existingGame) {
          gamesAdded += 1;
          await prisma.game.create({ data: gameData });
        } else {
          await prisma.game.update({
            where: { id: existingGame.id },
            data: gameData,
          });
        }
      }

      steps = completeStep(steps, 'fixtures', gamesAdded, undefined, fixturesFetched);
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);

      await prisma.competitionSeason.update({
        where: { id: competitionSeason.id },
        data: {
          fixturesUpdatedAt: new Date(),
        },
      });
    }

    const scopedFixtureRows = fixtureRows.filter((fixture) => {
      const homeName = fixture?.teams?.home?.name;
      const awayName = fixture?.teams?.away?.name;
      if (!fixture?.fixture?.id || !homeName || !awayName) return false;
      if (selectedTeamName && homeName !== selectedTeamName && awayName !== selectedTeamName) return false;
      return true;
    });

    const scopedDbGames = await prisma.game.findMany({
      where: {
        seasonId: season.id,
        competitionId: competition.id,
        ...(selectedDbTeam?.id
          ? {
              OR: [{ homeTeamId: selectedDbTeam.id }, { awayTeamId: selectedDbTeam.id }],
            }
          : {}),
      },
      select: {
        id: true,
        apiFootballId: true,
        status: true,
        dateTime: true,
        updatedAt: true,
        gameStats: {
          select: {
            updatedAt: true,
          },
        },
        prediction: {
          select: {
            updatedAt: true,
          },
        },
        events: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            updatedAt: true,
          },
        },
        lineupEntries: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            updatedAt: true,
          },
        },
        headToHeadEntries: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            updatedAt: true,
          },
        },
        oddsValues: {
          orderBy: [{ oddsUpdatedAt: 'desc' }, { updatedAt: 'desc' }],
          take: 1,
          select: {
            id: true,
            updatedAt: true,
            oddsUpdatedAt: true,
          },
        },
      },
    });

    const dbGameByApiId = new Map(
      scopedDbGames
        .filter((game): game is typeof game & { apiFootballId: number } => typeof game.apiFootballId === 'number')
        .map((game) => [game.apiFootballId, game])
    );

    if (effectiveResources.includes('standings')) {
      steps = markStep(steps, 'standings', 'running');
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);

      for (const block of standingsRows) {
        const standings = block?.league?.standings || [];
        for (const group of standings) {
          for (const row of group) {
            const teamName = row?.team?.name;
            if (!teamName) continue;
            if (selectedTeamName && teamName !== selectedTeamName) continue;
            standingsFetched += 1;

            const dbTeam = teamMap.get(teamName);
            if (!dbTeam) continue;

            standingsUpdated += 1;
            await prisma.standing.upsert({
              where: {
                seasonId_teamId: {
                  seasonId: season.id,
                  teamId: dbTeam.id,
                },
              },
              update: {
                competitionId: competition.id,
                position: row.rank ?? 0,
                played: row?.all?.played ?? 0,
                wins: row?.all?.win ?? 0,
                draws: row?.all?.draw ?? 0,
                losses: row?.all?.lose ?? 0,
                goalsFor: row?.all?.goals?.for ?? 0,
                goalsAgainst: row?.all?.goals?.against ?? 0,
                points: row?.points ?? 0,
                form: row?.form ?? null,
              },
              create: {
                competitionId: competition.id,
                seasonId: season.id,
                teamId: dbTeam.id,
                position: row.rank ?? 0,
                played: row?.all?.played ?? 0,
                wins: row?.all?.win ?? 0,
                draws: row?.all?.draw ?? 0,
                losses: row?.all?.lose ?? 0,
                goalsFor: row?.all?.goals?.for ?? 0,
                goalsAgainst: row?.all?.goals?.against ?? 0,
                points: row?.points ?? 0,
                form: row?.form ?? null,
              },
            });
          }
        }
      }

      steps = completeStep(steps, 'standings', standingsUpdated, undefined, standingsFetched);
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);

      await prisma.competitionSeason.update({
        where: { id: competitionSeason.id },
        data: {
          standingsUpdatedAt: new Date(),
        },
      });
    }

    if (effectiveResources.includes('events')) {
      steps = markStep(steps, 'events', 'running');
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);

      const eventTargetRows = scopedFixtureRows.filter((fixture) => {
        const fixtureId = fixture?.fixture?.id;
        if (!fixtureId) return false;
        const game = dbGameByApiId.get(fixtureId);
        if (!game) return false;
        const latestEventUpdate = game.events[0]?.updatedAt || null;
        return (
          !game.events.length ||
          isGameRecentOrOngoing(game.status, game.dateTime) ||
          !isWithinHours(latestEventUpdate, RESOURCE_STALE_HOURS.events)
        );
      });

      for (const fixture of eventTargetRows) {
        const fixtureId = fixture?.fixture?.id;
        const homeName = fixture?.teams?.home?.name;
        const awayName = fixture?.teams?.away?.name;
        if (!fixtureId || !homeName || !awayName) continue;

        const game = dbGameByApiId.get(fixtureId);
        if (!game) continue;

        const eventRows = await apiFootballFetch(`/fixtures/events?fixture=${fixtureId}`);
        eventsFetched += eventRows.length;
        await prisma.gameEvent.deleteMany({ where: { gameId: game.id } });

        for (const [eventIndex, event] of eventRows.entries()) {
          const player = event?.player?.name
            ? await prisma.player.findFirst({
                where: {
                  nameEn: event.player.name,
                  team: {
                    seasonId: season.id,
                  },
                },
              })
            : null;
          const relatedPlayer = event?.assist?.name
            ? await prisma.player.findFirst({
                where: {
                  nameEn: event.assist.name,
                  team: {
                    seasonId: season.id,
                  },
                },
              })
            : null;
          const eventTeam = event?.team?.name ? teamMap.get(event.team.name) : null;

          await prisma.gameEvent.create({
            data: {
              apiFootballId: buildEventApiFootballId(fixtureId, eventIndex + 1),
              minute: event?.time?.elapsed || 0,
              extraMinute: event?.time?.extra || null,
              type: mapEventType(event?.type, event?.detail) as any,
              team: event?.team?.name || '',
              notesEn: event?.detail || null,
              notesHe: translateName(event?.detail),
              icon: event?.type || null,
              playerId: player?.id || null,
              relatedPlayerId: relatedPlayer?.id || null,
              gameId: game.id,
              teamId: eventTeam?.id || null,
            },
          });
          eventsSaved += 1;
        }
      }

      steps = completeStep(
        steps,
        'events',
        eventsSaved,
        eventTargetRows.length ? `עודכנו רק ${eventTargetRows.length} משחקים שחסרו או התיישנו` : 'לא נמצאו משחקים שדורשים רענון אירועים',
        eventsFetched
      );
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);
    }

    if (effectiveResources.includes('statistics')) {
      steps = markStep(steps, 'statistics', 'running');
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);

      const statisticsTargetRows = scopedFixtureRows.filter((fixture) => {
        const fixtureId = fixture?.fixture?.id;
        if (!fixtureId) return false;
        const game = dbGameByApiId.get(fixtureId);
        if (!game) return false;
        return (
          !game.gameStats ||
          isGameRecentOrOngoing(game.status, game.dateTime) ||
          !isWithinHours(game.gameStats.updatedAt, RESOURCE_STALE_HOURS.statistics)
        );
      });

      for (const fixture of statisticsTargetRows) {
        const fixtureId = fixture?.fixture?.id;
        const homeName = fixture?.teams?.home?.name;
        const awayName = fixture?.teams?.away?.name;
        if (!fixtureId || !homeName || !awayName) continue;

        const game = dbGameByApiId.get(fixtureId);
        if (!game) continue;

        const statisticsRows = await apiFootballFetch(`/fixtures/statistics?fixture=${fixtureId}`);
        if (statisticsRows.length) {
          statisticsFetched += 1;
        }
        const mappedStats = mapFixtureStatistics(statisticsRows);

        await prisma.gameStatistics.upsert({
          where: { gameId: game.id },
          update: mappedStats,
          create: {
            gameId: game.id,
            ...mappedStats,
          },
        });

        statisticsSaved += 1;
      }

      steps = completeStep(
        steps,
        'statistics',
        statisticsSaved,
        statisticsTargetRows.length ? `עודכנו רק ${statisticsTargetRows.length} משחקים שחסרו או התיישנו` : 'לא נמצאו משחקים שדורשים רענון סטטיסטיקות',
        statisticsFetched
      );
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);
    }

    if (effectiveResources.includes('lineups')) {
      steps = markStep(steps, 'lineups', 'running');
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);

      const lineupTargetRows = scopedFixtureRows.filter((fixture) => {
        const fixtureId = fixture?.fixture?.id;
        if (!fixtureId) return false;
        const game = dbGameByApiId.get(fixtureId);
        if (!game) return false;
        const latestLineupUpdate = game.lineupEntries[0]?.updatedAt || null;
        return (
          !game.lineupEntries.length ||
          isGameUpcomingOrOngoing(game.status, game.dateTime) ||
          isGameRecentOrOngoing(game.status, game.dateTime, 24) ||
          !isWithinHours(latestLineupUpdate, RESOURCE_STALE_HOURS.lineups)
        );
      });

      for (const fixture of lineupTargetRows) {
        const fixtureId = fixture?.fixture?.id;
        const homeName = fixture?.teams?.home?.name;
        const awayName = fixture?.teams?.away?.name;
        if (!fixtureId || !homeName || !awayName) continue;

        const game = dbGameByApiId.get(fixtureId);
        if (!game) continue;

        const lineupRows = await apiFootballFetch(`/fixtures/lineups?fixture=${fixtureId}`);
        const fixtureDate = fixture?.fixture?.date ? new Date(fixture.fixture.date) : null;
        await prisma.gameLineupEntry.deleteMany({ where: { gameId: game.id } });

        for (const lineupRow of lineupRows) {
          const apiTeamId = lineupRow?.team?.id;
          const teamName = lineupRow?.team?.name;
          const dbTeam =
            (apiTeamId
              ? await prisma.team.findFirst({
                  where: {
                    apiFootballId: apiTeamId,
                    seasonId: season.id,
                  },
                })
              : null) || (teamName ? teamMap.get(teamName) : null);
          if (!dbTeam) continue;

          const formation = lineupRow?.formation || null;
          lineupsFetched += (lineupRow?.startXI?.length || 0) + (lineupRow?.substitutes?.length || 0) + (lineupRow?.coach?.name ? 1 : 0);

          for (const starter of lineupRow?.startXI || []) {
            const playerPayload = starter?.player;
            const dbPlayer = playerPayload?.id
              ? await prisma.player.findFirst({
                  where: {
                    apiFootballId: playerPayload.id,
                    teamId: dbTeam.id,
                  },
                })
              : null;

            await prisma.gameLineupEntry.create({
              data: {
                apiFootballId: playerPayload?.id || null,
                role: mapLineupRole('startXI'),
                participantType: 'PLAYER',
                participantName: playerPayload?.name || null,
                formation,
                positionName: playerPayload?.pos || null,
                positionGrid: playerPayload?.grid || null,
                jerseyNumber: playerPayload?.number || null,
                gameId: game.id,
                teamId: dbTeam.id,
                playerId: dbPlayer?.id || null,
              },
            });
            lineupsSaved += 1;
          }

          for (const substitute of lineupRow?.substitutes || []) {
            const playerPayload = substitute?.player;
            const dbPlayer = playerPayload?.id
              ? await prisma.player.findFirst({
                  where: {
                    apiFootballId: playerPayload.id,
                    teamId: dbTeam.id,
                  },
                })
              : null;

            await prisma.gameLineupEntry.create({
              data: {
                apiFootballId: playerPayload?.id || null,
                role: mapLineupRole('substitutes'),
                participantType: 'PLAYER',
                participantName: playerPayload?.name || null,
                formation,
                positionName: playerPayload?.pos || null,
                positionGrid: playerPayload?.grid || null,
                jerseyNumber: playerPayload?.number || null,
                gameId: game.id,
                teamId: dbTeam.id,
                playerId: dbPlayer?.id || null,
              },
            });
            lineupsSaved += 1;
          }

          if (lineupRow?.coach?.name) {
            const coachNameEn = lineupRow.coach.name;
            const coachNameHe = translateName(coachNameEn);

            await syncTeamCoachAssignment({
              teamId: dbTeam.id,
              seasonId: season.id,
              apiFootballCoachId: lineupRow.coach.id || null,
              coachNameEn,
              coachNameHe,
              fixtureDate,
            });

            await prisma.gameLineupEntry.create({
              data: {
                apiFootballId: lineupRow.coach.id || null,
                role: mapLineupRole('coach'),
                participantType: 'COACH',
                participantName: coachNameEn,
                formation,
                gameId: game.id,
                teamId: dbTeam.id,
              },
            });
            lineupsSaved += 1;
          }
        }
      }

      steps = completeStep(
        steps,
        'lineups',
        lineupsSaved,
        lineupTargetRows.length ? `עודכנו רק ${lineupTargetRows.length} משחקים שחסרו או התיישנו` : 'לא נמצאו משחקים שדורשים רענון הרכבים',
        lineupsFetched
      );
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);
    }

    for (const leaderboardResource of ['topScorers', 'topAssists'] as const) {
      if (!effectiveResources.includes(leaderboardResource)) continue;

      steps = markStep(steps, leaderboardResource, 'running');
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);

      if (selectedTeamName) {
        steps = completeStep(steps, leaderboardResource, 0, 'זמין רק במשיכה של כל הקבוצות');
        await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);
        continue;
      }

      const endpoint =
        leaderboardResource === 'topScorers'
          ? `/players/topscorers?league=${leagueId}&season=${seasonYear}`
          : `/players/topassists?league=${leagueId}&season=${seasonYear}`;
      const leaderboardRows = await apiFootballFetch(endpoint);
      if (leaderboardResource === 'topScorers') topScorersFetched = leaderboardRows.length;
      if (leaderboardResource === 'topAssists') topAssistsFetched = leaderboardRows.length;

      await prisma.competitionLeaderboardEntry.deleteMany({
        where: {
          seasonId: season.id,
          competitionId: competition.id,
          category: mapLeaderboardCategory(leaderboardResource) as any,
        },
      });

      let leaderboardSaved = 0;
      for (const [index, row] of leaderboardRows.entries()) {
        const apiPlayerId = row?.player?.id || null;
        const apiTeamId = row?.statistics?.[0]?.team?.id || row?.statistics?.[0]?.team?.team_id || null;
        const teamName = row?.statistics?.[0]?.team?.name || null;

        const dbTeam =
          (apiTeamId
            ? await prisma.team.findFirst({
                where: {
                  apiFootballId: apiTeamId,
                  seasonId: season.id,
                },
              })
            : null) ||
          (teamName
            ? await prisma.team.findFirst({
                where: {
                  nameEn: teamName,
                  seasonId: season.id,
                },
              })
            : null);

        const dbPlayer =
          (apiPlayerId && dbTeam
            ? await prisma.player.findFirst({
                where: {
                  apiFootballId: apiPlayerId,
                  teamId: dbTeam.id,
                },
              })
            : null) ||
          (apiPlayerId
            ? await prisma.player.findFirst({
                where: {
                  apiFootballId: apiPlayerId,
                  team: { seasonId: season.id },
                },
              })
            : null);

        const statsBlock = row?.statistics?.[0];
        const value =
          leaderboardResource === 'topScorers'
            ? statsBlock?.goals?.total ?? 0
            : statsBlock?.goals?.assists ?? 0;

        await prisma.competitionLeaderboardEntry.create({
          data: {
            category: mapLeaderboardCategory(leaderboardResource) as any,
            rank: index + 1,
            value,
            gamesPlayed: statsBlock?.games?.appearences ?? 0,
            seasonId: season.id,
            competitionId: competition.id,
            teamId: dbTeam?.id || null,
            playerId: dbPlayer?.id || null,
            apiFootballPlayerId: apiPlayerId,
            playerNameEn: row?.player?.name || null,
            playerNameHe: translateName(row?.player?.name),
            teamNameEn: teamName,
            teamNameHe: translateName(teamName),
          },
        });
        leaderboardSaved += 1;
      }

      if (leaderboardResource === 'topScorers') topScorersSaved = leaderboardSaved;
      if (leaderboardResource === 'topAssists') topAssistsSaved = leaderboardSaved;

      steps = completeStep(
        steps,
        leaderboardResource,
        leaderboardSaved,
        undefined,
        leaderboardResource === 'topScorers' ? topScorersFetched : topAssistsFetched
      );
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);
    }

    if (effectiveResources.includes('injuries')) {
      steps = markStep(steps, 'injuries', 'running');
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);

      const injuriesEndpoint =
        selectedDbTeam?.apiFootballId || selectedApiTeamId
          ? `/injuries?league=${leagueId}&season=${seasonYear}&team=${selectedDbTeam?.apiFootballId || selectedApiTeamId}`
          : `/injuries?league=${leagueId}&season=${seasonYear}`;
      const injuryRows = await apiFootballFetch(injuriesEndpoint);
      injuriesFetched = injuryRows.length;

      await prisma.playerInjury.deleteMany({
        where: {
          seasonId: season.id,
          competitionId: competition.id,
          ...(selectedDbTeam?.id ? { teamId: selectedDbTeam.id } : {}),
        },
      });

      for (const row of injuryRows) {
        const apiFixtureId = row?.fixture?.id || null;
        const apiTeamId = row?.team?.id || null;
        const apiPlayerId = row?.player?.id || null;
        const teamName = row?.team?.name || null;
        const playerName = row?.player?.name || null;

        const dbTeam =
          (apiTeamId
            ? await prisma.team.findFirst({
                where: {
                  apiFootballId: apiTeamId,
                  seasonId: season.id,
                },
              })
            : null) ||
          (teamName
            ? await prisma.team.findFirst({
                where: {
                  nameEn: teamName,
                  seasonId: season.id,
                },
              })
            : null);

        const dbPlayer =
          (apiPlayerId && dbTeam
            ? await prisma.player.findFirst({
                where: {
                  apiFootballId: apiPlayerId,
                  teamId: dbTeam.id,
                },
              })
            : null) ||
          (apiPlayerId
            ? await prisma.player.findFirst({
                where: {
                  apiFootballId: apiPlayerId,
                  team: { seasonId: season.id },
                },
              })
            : null) ||
          (playerName
            ? await prisma.player.findFirst({
                where: {
                  nameEn: playerName,
                  team: { seasonId: season.id },
                },
              })
            : null);

        const dbGame = apiFixtureId
          ? await prisma.game.findUnique({
              where: {
                apiFootballId: apiFixtureId,
              },
            })
          : null;

        await prisma.playerInjury.create({
          data: {
            apiFootballPlayerId: apiPlayerId,
            apiFootballTeamId: apiTeamId,
            apiFootballFixtureId: apiFixtureId,
            playerNameEn: playerName,
            playerNameHe: translateName(playerName),
            teamNameEn: teamName,
            teamNameHe: translateName(teamName),
            typeEn: row?.player?.type || null,
            typeHe: translateName(row?.player?.type),
            reasonEn: row?.player?.reason || null,
            reasonHe: translateName(row?.player?.reason),
            fixtureDate: row?.fixture?.date ? new Date(row.fixture.date) : null,
            seasonId: season.id,
            competitionId: competition.id,
            teamId: dbTeam?.id || null,
            playerId: dbPlayer?.id || null,
            gameId: dbGame?.id || null,
          },
        });

        injuriesSaved += 1;
      }

      steps = completeStep(steps, 'injuries', injuriesSaved, undefined, injuriesFetched);
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);
    }

    if (effectiveResources.includes('transfers')) {
      steps = markStep(steps, 'transfers', 'running');
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);

      const transferScopeTeams =
        selectedDbTeam?.id
          ? existingSeasonTeams.filter((team) => team.id === selectedDbTeam.id)
          : existingSeasonTeams.filter((team) =>
              relevantTeams.some((row: any) => row?.team?.id && row.team.id === team.apiFootballId)
            );

      const transferTeamIds = transferScopeTeams.map((team) => team.id);

      await prisma.playerTransfer.deleteMany({
        where: {
          seasonId: season.id,
          ...(transferTeamIds.length
            ? {
                OR: [
                  { player: { teamId: { in: transferTeamIds } } },
                  { sourceTeamApiFootballId: { in: transferScopeTeams.map((team) => team.apiFootballId).filter(Boolean) as number[] } },
                  {
                    destinationTeamApiFootballId: {
                      in: transferScopeTeams.map((team) => team.apiFootballId).filter(Boolean) as number[],
                    },
                  },
                ],
              }
            : {}),
        },
      });

      for (const dbTeam of transferScopeTeams) {
        if (!dbTeam.apiFootballId) continue;

        const transferRows = await apiFootballFetch(`/transfers?team=${dbTeam.apiFootballId}`);
        transfersFetched += transferRows.reduce(
          (sum: number, row: any) => sum + (Array.isArray(row?.transfers) ? row.transfers.length : 0),
          0
        );

        for (const row of transferRows) {
          const apiPlayerId = row?.player?.id || null;
          const playerName = row?.player?.name || null;
          const dbPlayer =
            (apiPlayerId
              ? await prisma.player.findFirst({
                  where: {
                    apiFootballId: apiPlayerId,
                    team: { seasonId: season.id },
                  },
                })
              : null) ||
            (playerName
              ? await prisma.player.findFirst({
                  where: {
                    nameEn: playerName,
                    team: { seasonId: season.id },
                  },
                })
              : null);

          for (const transfer of row?.transfers || []) {
            const transferDate = transfer?.date ? new Date(transfer.date) : null;
            if (!isDateWithinSeason(transferDate, season)) continue;

            await prisma.playerTransfer.create({
              data: {
                apiFootballPlayerId: apiPlayerId,
                playerNameEn: playerName,
                playerNameHe: translateName(playerName),
                transferDate,
                transferTypeEn: transfer?.type || null,
                transferTypeHe: translateTransferType(transfer?.type),
                sourceTeamApiFootballId: transfer?.teams?.out?.id || null,
                sourceTeamNameEn: transfer?.teams?.out?.name || null,
                sourceTeamNameHe: translateName(transfer?.teams?.out?.name),
                sourceTeamLogoUrl: transfer?.teams?.out?.logo || null,
                destinationTeamApiFootballId: transfer?.teams?.in?.id || null,
                destinationTeamNameEn: transfer?.teams?.in?.name || null,
                destinationTeamNameHe: translateName(transfer?.teams?.in?.name),
                destinationTeamLogoUrl: transfer?.teams?.in?.logo || null,
                sourceUpdatedAt: row?.update ? new Date(row.update) : null,
                seasonId: season.id,
                playerId: dbPlayer?.id || null,
              },
            });

            transfersSaved += 1;
          }
        }
      }

      steps = completeStep(steps, 'transfers', transfersSaved, undefined, transfersFetched);
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);
    }

    if (effectiveResources.includes('trophies')) {
      steps = markStep(steps, 'trophies', 'running');
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);

      const trophyPlayers = await prisma.player.findMany({
        where: {
          team: {
            seasonId: season.id,
            ...(selectedDbTeam?.id ? { id: selectedDbTeam.id } : {}),
          },
          apiFootballId: {
            not: null,
          },
        },
        select: {
          id: true,
          apiFootballId: true,
          nameEn: true,
        },
      });

      await prisma.playerTrophy.deleteMany({
        where: {
          seasonId: season.id,
          ...(trophyPlayers.length ? { playerId: { in: trophyPlayers.map((player) => player.id) } } : {}),
        },
      });

      for (const player of trophyPlayers) {
        if (!player.apiFootballId) continue;

        const trophyRows = await apiFootballFetch(`/trophies?player=${player.apiFootballId}`);
        trophiesFetched += trophyRows.length;

        for (const trophy of trophyRows) {
          if (!matchesTrophySeasonLabel(trophy?.season || null, seasonYear)) continue;

          await prisma.playerTrophy.create({
            data: {
              apiFootballPlayerId: player.apiFootballId,
              playerNameEn: player.nameEn,
              playerNameHe: translateName(player.nameEn),
              leagueNameEn: trophy?.league || 'Unknown Trophy',
              leagueNameHe: translateName(trophy?.league),
              countryEn: trophy?.country || null,
              countryHe: translateName(trophy?.country),
              seasonLabel: trophy?.season || null,
              placeEn: trophy?.place || null,
              placeHe: translateTrophyPlace(trophy?.place),
              seasonId: season.id,
              playerId: player.id,
            },
          });

          trophiesSaved += 1;
        }
      }

      steps = completeStep(steps, 'trophies', trophiesSaved, undefined, trophiesFetched);
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);
    }

    const scopedUpcomingGames = await prisma.game.findMany({
      where: {
        seasonId: season.id,
        competitionId: competition.id,
        status: {
          in: ['SCHEDULED', 'ONGOING'],
        },
        ...(selectedDbTeam?.id
          ? {
              OR: [{ homeTeamId: selectedDbTeam.id }, { awayTeamId: selectedDbTeam.id }],
            }
          : {}),
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        prediction: {
          select: {
            updatedAt: true,
          },
        },
        headToHeadEntries: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            updatedAt: true,
          },
        },
        oddsValues: {
          orderBy: [{ oddsUpdatedAt: 'desc' }, { updatedAt: 'desc' }],
          take: 1,
          select: {
            id: true,
            updatedAt: true,
            oddsUpdatedAt: true,
          },
        },
      },
      orderBy: [{ dateTime: 'asc' }],
    });

    if (effectiveResources.includes('predictions')) {
      steps = markStep(steps, 'predictions', 'running');
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);

      const predictionTargetGames = scopedUpcomingGames.filter((game) => {
        return (
          !game.prediction ||
          game.status === 'ONGOING' ||
          !isWithinHours(game.prediction.updatedAt, RESOURCE_STALE_HOURS.predictions)
        );
      });

      await prisma.gamePrediction.deleteMany({
        where: {
          seasonId: season.id,
          competitionId: competition.id,
          ...(predictionTargetGames.length ? { gameId: { in: predictionTargetGames.map((game) => game.id) } } : {}),
        },
      });

      for (const game of predictionTargetGames) {
        if (!game.apiFootballId) continue;

        const predictionRows = await apiFootballFetch(`/predictions?fixture=${game.apiFootballId}`);
        predictionsFetched += predictionRows.length;
        const payload = predictionRows[0];
        if (!payload?.predictions) continue;

        await prisma.gamePrediction.create({
          data: {
            gameId: game.id,
            seasonId: season.id,
            competitionId: competition.id,
            winnerTeamApiFootballId: payload?.predictions?.winner?.id || null,
            winnerTeamNameEn: payload?.predictions?.winner?.name || null,
            winnerTeamNameHe: translateName(payload?.predictions?.winner?.name),
            winnerCommentEn: payload?.predictions?.winner?.comment || null,
            winnerCommentHe: translateName(payload?.predictions?.winner?.comment),
            adviceEn: payload?.predictions?.advice || null,
            adviceHe: translateName(payload?.predictions?.advice),
            winOrDraw: payload?.predictions?.win_or_draw ?? null,
            underOver: payload?.predictions?.under_over || null,
            goalsHome: payload?.predictions?.goals?.home || null,
            goalsAway: payload?.predictions?.goals?.away || null,
            percentHome: parsePercentValue(payload?.predictions?.percent?.home),
            percentDraw: parsePercentValue(payload?.predictions?.percent?.draw),
            percentAway: parsePercentValue(payload?.predictions?.percent?.away),
            comparisonJson: payload?.comparison || null,
            rawJson: payload as any,
          },
        });

        predictionsSaved += 1;
      }

      steps = completeStep(
        steps,
        'predictions',
        predictionsSaved,
        scopedUpcomingGames.length ? 'משחקים עתידיים או חיים בלבד' : 'אין משחקים עתידיים או חיים לסנכרון',
        predictionsFetched
      );
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);
    }

    if (effectiveResources.includes('h2h')) {
      steps = markStep(steps, 'h2h', 'running');
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);

      const h2hTargetGames = scopedUpcomingGames.filter((game) => {
        const latestH2hUpdate = game.headToHeadEntries[0]?.updatedAt || null;
        return (
          !game.headToHeadEntries.length ||
          game.status === 'ONGOING' ||
          !isWithinHours(latestH2hUpdate, RESOURCE_STALE_HOURS.h2h)
        );
      });

      await prisma.gameHeadToHeadEntry.deleteMany({
        where: {
          seasonId: season.id,
          competitionId: competition.id,
          ...(h2hTargetGames.length ? { gameId: { in: h2hTargetGames.map((game) => game.id) } } : {}),
        },
      });

      for (const game of h2hTargetGames) {
        if (!game.homeTeam.apiFootballId || !game.awayTeam.apiFootballId) continue;

        const h2hRows = await apiFootballFetch(
          `/fixtures/headtohead?h2h=${game.homeTeam.apiFootballId}-${game.awayTeam.apiFootballId}&last=5`
        );
        h2hFetched += h2hRows.length;

        for (const row of h2hRows) {
          await prisma.gameHeadToHeadEntry.create({
            data: {
              gameId: game.id,
              seasonId: season.id,
              competitionId: competition.id,
              apiFootballFixtureId: row?.fixture?.id,
              relatedCompetitionApiId: row?.league?.id || null,
              relatedCompetitionNameEn: row?.league?.name || null,
              relatedCompetitionNameHe: translateName(row?.league?.name),
              relatedRoundEn: row?.league?.round || null,
              relatedRoundHe: translateName(row?.league?.round),
              relatedDate: row?.fixture?.date ? new Date(row.fixture.date) : null,
              homeTeamApiFootballId: row?.teams?.home?.id || null,
              homeTeamNameEn: row?.teams?.home?.name || null,
              homeTeamNameHe: translateName(row?.teams?.home?.name),
              awayTeamApiFootballId: row?.teams?.away?.id || null,
              awayTeamNameEn: row?.teams?.away?.name || null,
              awayTeamNameHe: translateName(row?.teams?.away?.name),
              homeScore: row?.goals?.home ?? null,
              awayScore: row?.goals?.away ?? null,
              winnerTeamApiFootballId: row?.teams?.home?.winner
                ? row?.teams?.home?.id || null
                : row?.teams?.away?.winner
                  ? row?.teams?.away?.id || null
                  : null,
              rawJson: row as any,
            },
          });

          h2hSaved += 1;
        }
      }

      steps = completeStep(
        steps,
        'h2h',
        h2hSaved,
        scopedUpcomingGames.length ? '5 מפגשים אחרונים לכל משחק עתידי או חי' : 'אין משחקים עתידיים או חיים לסנכרון',
        h2hFetched
      );
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);
    }

    if (effectiveResources.includes('odds')) {
      steps = markStep(steps, 'odds', 'running');
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);

      const oddsTargetGames = scopedUpcomingGames.filter((game) => {
        const latestOddsUpdate = getMostRecentDate([
          game.oddsValues[0]?.oddsUpdatedAt || null,
          game.oddsValues[0]?.updatedAt || null,
        ]);
        return (
          !game.oddsValues.length ||
          game.status === 'ONGOING' ||
          !isWithinHours(latestOddsUpdate, RESOURCE_STALE_HOURS.odds)
        );
      });

      await prisma.gameOddsValue.deleteMany({
        where: {
          seasonId: season.id,
          competitionId: competition.id,
          ...(oddsTargetGames.length ? { gameId: { in: oddsTargetGames.map((game) => game.id) } } : {}),
        },
      });

      for (const game of oddsTargetGames) {
        if (!game.apiFootballId) continue;

        const oddsRows = await apiFootballFetch(`/odds?fixture=${game.apiFootballId}`);
        oddsFetched += oddsRows.reduce((sum: number, row: any) => {
          return (
            sum +
            (row?.bookmakers || []).reduce((bookmakerSum: number, bookmaker: any) => {
              return (
                bookmakerSum +
                (bookmaker?.bets || []).reduce((betSum: number, bet: any) => betSum + (bet?.values?.length || 0), 0)
              );
            }, 0)
          );
        }, 0);

        for (const row of oddsRows) {
          for (const bookmaker of row?.bookmakers || []) {
            for (const bet of bookmaker?.bets || []) {
              for (const value of bet?.values || []) {
                await prisma.gameOddsValue.create({
                  data: {
                    gameId: game.id,
                    seasonId: season.id,
                    competitionId: competition.id,
                    bookmakerApiId: bookmaker?.id || null,
                    bookmakerName: bookmaker?.name || 'Unknown bookmaker',
                    marketApiId: bet?.id || null,
                    marketName: bet?.name || 'Unknown market',
                    selectionValue: String(value?.value ?? ''),
                    odd: String(value?.odd ?? ''),
                    oddsUpdatedAt: row?.update ? new Date(row.update) : null,
                  },
                });

                oddsSaved += 1;
              }
            }
          }
        }
      }

      steps = completeStep(
        steps,
        'odds',
        oddsSaved,
        scopedUpcomingGames.length ? 'משחקים עתידיים או חיים בלבד' : 'אין משחקים עתידיים או חיים לסנכרון',
        oddsFetched
      );
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);
    }

    if (effectiveResources.includes('livescore')) {
      steps = markStep(steps, 'livescore', 'running');
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);

      const liveRows = await apiFootballFetch('/fixtures?live=all');

      await prisma.liveGameSnapshot.deleteMany({
        where: {
          feedScope: 'LOCAL',
          competitionId: competition.id,
          ...(season.id ? { seasonId: season.id } : {}),
        },
      });

      for (const row of liveRows) {
        if (String(row?.league?.id || '') !== leagueId) continue;

        const homeApiId = row?.teams?.home?.id || null;
        const awayApiId = row?.teams?.away?.id || null;
        const matchesSelectedTeam =
          !selectedDbTeam?.apiFootballId ||
          homeApiId === selectedDbTeam.apiFootballId ||
          awayApiId === selectedDbTeam.apiFootballId;
        if (!matchesSelectedTeam) continue;
        livescoreFetched += 1;

        const localGame =
          row?.fixture?.id
            ? await prisma.game.findUnique({
                where: { apiFootballId: row.fixture.id },
              })
            : null;

        await prisma.liveGameSnapshot.create({
          data: {
            apiFootballFixtureId: row?.fixture?.id,
            feedScope: 'LOCAL',
            leagueApiFootballId: row?.league?.id || null,
            leagueNameEn: row?.league?.name || null,
            leagueNameHe: translateName(row?.league?.name),
            roundEn: row?.league?.round || null,
            roundHe: translateName(row?.league?.round),
            statusShort: row?.fixture?.status?.short || null,
            statusLong: row?.fixture?.status?.long || null,
            elapsed: row?.fixture?.status?.elapsed ?? null,
            extra: row?.fixture?.status?.extra ?? null,
            snapshotAt: new Date(),
            fixtureDate: row?.fixture?.date ? new Date(row.fixture.date) : null,
            homeTeamApiFootballId: homeApiId,
            homeTeamNameEn: row?.teams?.home?.name || null,
            homeTeamNameHe: translateName(row?.teams?.home?.name),
            awayTeamApiFootballId: awayApiId,
            awayTeamNameEn: row?.teams?.away?.name || null,
            awayTeamNameHe: translateName(row?.teams?.away?.name),
            homeScore: row?.goals?.home ?? null,
            awayScore: row?.goals?.away ?? null,
            eventCount: Array.isArray(row?.events) ? row.events.length : 0,
            rawJson: row as any,
            gameId: localGame?.id || null,
            seasonId: season.id,
            competitionId: competition.id,
          },
        });

        livescoreSaved += 1;
      }

      steps = completeStep(steps, 'livescore', livescoreSaved, 'צילום מצב נוכחי של משחקים חיים', livescoreFetched);
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);
    }

    if (effectiveResources.includes('globalLivescore')) {
      steps = markStep(steps, 'globalLivescore', 'running');
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);

      const liveRows = await apiFootballFetch('/fixtures?live=all');

      await prisma.liveGameSnapshot.deleteMany({
        where: {
          feedScope: 'GLOBAL_HOMEPAGE',
        },
      });

      for (const row of liveRows) {
        if (!row?.fixture?.id) continue;
        globalLivescoreFetched += 1;

        const localGame = await prisma.game.findUnique({
          where: { apiFootballId: row.fixture.id },
        });

        await prisma.liveGameSnapshot.create({
          data: {
            apiFootballFixtureId: row.fixture.id,
            feedScope: 'GLOBAL_HOMEPAGE',
            leagueApiFootballId: row?.league?.id || null,
            leagueNameEn: row?.league?.name || null,
            leagueNameHe: translateName(row?.league?.name),
            roundEn: row?.league?.round || null,
            roundHe: translateName(row?.league?.round),
            statusShort: row?.fixture?.status?.short || null,
            statusLong: row?.fixture?.status?.long || null,
            elapsed: row?.fixture?.status?.elapsed ?? null,
            extra: row?.fixture?.status?.extra ?? null,
            snapshotAt: new Date(),
            fixtureDate: row?.fixture?.date ? new Date(row.fixture.date) : null,
            homeTeamApiFootballId: row?.teams?.home?.id || null,
            homeTeamNameEn: row?.teams?.home?.name || null,
            homeTeamNameHe: translateName(row?.teams?.home?.name),
            awayTeamApiFootballId: row?.teams?.away?.id || null,
            awayTeamNameEn: row?.teams?.away?.name || null,
            awayTeamNameHe: translateName(row?.teams?.away?.name),
            homeScore: row?.goals?.home ?? null,
            awayScore: row?.goals?.away ?? null,
            eventCount: Array.isArray(row?.events) ? row.events.length : 0,
            rawJson: row as any,
            gameId: localGame?.id || null,
            seasonId: localGame?.seasonId || null,
            competitionId: localGame?.competitionId || null,
          },
        });

        globalLivescoreSaved += 1;
      }

      steps = completeStep(steps, 'globalLivescore', globalLivescoreSaved, 'פיד לייב גלובלי לדף הבית', globalLivescoreFetched);
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);
    }

    const scopedTeams = await prisma.team.findMany({
      where: {
        seasonId: season.id,
        ...(selectedDbTeam?.id ? { id: selectedDbTeam.id } : {}),
      },
      select: { id: true },
    });

    await syncDerivedStatistics({
      seasonId: season.id,
      competitionId: competition.id,
      teamIds: scopedTeams.map((team) => team.id),
    });

    const futureSeasonsCleanup = await cleanupFutureSeasons();

    if (effectiveResources.includes('competitions')) {
      steps = completeStep(steps, 'competitions', 1, undefined, 1);
      await updateFetchJob(job.id, steps, FetchJobStatus.RUNNING);
    }

    for (const resourceKey of effectiveResources) {
      if (!IMPLEMENTED_RESOURCES.has(resourceKey) && resourceKey !== 'competitions') {
        steps = completeStep(steps, resourceKey, 0, 'עדיין לא ממומש');
      }
    }

    const resultPayload = {
      league: selectedCompetitionMeta?.nameHe || LEAGUE_NAMES[leagueId] || leagueId,
      teamsAdded,
      playersAdded,
      gamesAdded,
      standingsUpdated,
      countriesSaved,
      seasonsSaved,
      leaguesSaved,
      eventsSaved,
      statisticsSaved,
      lineupsSaved,
      topScorersSaved,
      topAssistsSaved,
      injuriesSaved,
      transfersSaved,
      trophiesSaved,
      sidelinedSaved,
      predictionsSaved,
      h2hSaved,
      oddsSaved,
      livescoreSaved,
      globalLivescoreSaved,
      futureSeasonsDeleted: futureSeasonsCleanup.count,
      resourceCounts: Object.fromEntries(
        steps.map((step) => [
          step.key,
          {
            syncedCount: step.syncedCount || 0,
            fetchedCount: step.fetchedCount || 0,
            note: step.note || null,
          },
        ])
      ),
    };

    await prisma.fetchJob.update({
      where: { id: job.id },
      data: {
        status: FetchJobStatus.COMPLETED,
        progressPercent: 100,
        finishedAt: new Date(),
        resultJson: resultPayload as any,
        teamId: selectedDbTeam?.id || null,
        stepsJson: steps as any,
      },
    });

    await logActivity({
      entityType: ActivityEntityType.FETCH_JOB,
      entityId: job.id,
      actionHe: `הושלמה משיכת נתונים עבור ${selectedCompetitionMeta?.nameHe || LEAGUE_NAMES[leagueId] || leagueId} עונת ${formatSeasonLabel(seasonYear)}`,
      userId: viewer.id,
      details: resultPayload,
    });

    return NextResponse.json({
      success: true,
      jobId: job.id,
      ...resultPayload,
      steps,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    await prisma.fetchJob.update({
      where: { id: job.id },
      data: {
        status: FetchJobStatus.FAILED,
        errorMessage: message,
        finishedAt: new Date(),
      },
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
