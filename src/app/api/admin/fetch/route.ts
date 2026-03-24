import { ActivityEntityType, CompetitionType, FetchJobStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUser } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { apiFootballFetch } from '@/lib/api-football';
import { getCompetitionById } from '@/lib/competitions';
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
};

const LEAGUE_NAMES: Record<string, string> = {
  '383': 'ליגת העל',
  '382': 'הליגה הלאומית',
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
  'Ashdod': 'מ.ס. אשדוד',
  'Hapoel Hadera': 'הפועל חדרה',
  'Maccabi Bnei Raina': 'מכבי בני ריינה',
};

function translateName(name: string | null | undefined) {
  if (!name) {
    return name || '';
  }

  return NAME_TRANSLATIONS[name] || name;
}

function mapGameStatus(status: string | undefined) {
  if (!status) return 'SCHEDULED' as const;
  if (['FT', 'AET', 'PEN'].includes(status)) return 'COMPLETED' as const;
  if (['1H', '2H', 'HT', 'ET', 'BT', 'LIVE'].includes(status)) return 'ONGOING' as const;
  if (['PST', 'CANC', 'ABD'].includes(status)) return 'CANCELLED' as const;
  return 'SCHEDULED' as const;
}

async function getOrCreateSeason(year: number) {
  const existing = await prisma.season.findUnique({ where: { year } });
  if (existing) return existing;

  return prisma.season.create({
    data: {
      year,
      name: `${year}/${year + 1}`,
      startDate: new Date(`${year}-07-01T00:00:00.000Z`),
      endDate: new Date(`${year + 1}-06-30T23:59:59.999Z`),
    },
  });
}

async function updateFetchJob(jobId: string, steps: JobStep[], currentKey?: string, status?: FetchJobStatus) {
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

export async function POST(request: NextRequest) {
  const viewer = await getRequestUser(request);

  if (!viewer || viewer.role !== 'ADMIN') {
    return NextResponse.json({ error: 'אין הרשאה למשיכה.' }, { status: 403 });
  }

  const body = (await request.json()) as FetchBody;
  const seasonYear = Number(body.season || '2024');
  const leagueId = String(body.leagueId || '383');
  const selectedCompetitionMeta = getCompetitionById(leagueId);
  const teamSelection = body.teamSelection || 'all';
  const resources = Array.isArray(body.resources) ? body.resources : [];
  const effectiveResources = resources.length
    ? resources
    : ['competitions', 'teams', 'players', 'fixtures', 'standings', 'events'];

  const initialSteps: JobStep[] = effectiveResources.map((key) => ({
    key,
    label: RESOURCE_LABELS[key] || key,
    status: 'pending',
  }));

  const job = await prisma.fetchJob.create({
    data: {
      labelHe: `משיכת נתוני ${LEAGUE_NAMES[leagueId] || leagueId} לעונת ${seasonYear}`,
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
        nameHe: LEAGUE_NAMES[leagueId] || `ליגה ${leagueId}`,
        nameEn: `League ${leagueId}`,
      },
      create: {
        apiFootballId: Number(leagueId),
        nameEn: `League ${leagueId}`,
        nameHe: LEAGUE_NAMES[leagueId] || `ליגה ${leagueId}`,
        type: CompetitionType.LEAGUE,
      },
    });

    await prisma.competitionSeason.upsert({
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
      effectiveResources.some((key) => ['teams', 'players', 'fixtures', 'events'].includes(key))
        ? apiFootballFetch(`/teams?league=${leagueId}&season=${seasonYear}`)
        : [],
      effectiveResources.includes('standings')
        ? apiFootballFetch(`/standings?league=${leagueId}&season=${seasonYear}`)
        : [],
      effectiveResources.some((key) => ['fixtures', 'events'].includes(key))
        ? apiFootballFetch(`/fixtures?league=${leagueId}&season=${seasonYear}`)
        : [],
    ]);

    const relevantTeams = teamRows.filter((row: any) => {
      if (selectedApiTeamId) {
        return row?.team?.id === selectedApiTeamId;
      }

      if (selectedTeamName) {
        return row?.team?.name === selectedTeamName;
      }

      return true;
    });

    let teamsAdded = 0;
    let playersAdded = 0;
    let gamesAdded = 0;
    let standingsUpdated = 0;
    let eventsSaved = 0;

    const teamMap = new Map<string, any>();

    if (effectiveResources.includes('teams')) {
      steps = markStep(steps, 'teams', 'running');
      await updateFetchJob(job.id, steps, 'teams', FetchJobStatus.RUNNING);

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
          code: apiTeam.code || null,
          countryEn: apiTeam.country || null,
          countryHe: translateName(apiTeam.country),
          founded: apiTeam.founded || null,
          coach: row?.venue?.name || null,
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

      steps = markStep(steps, 'teams', 'done');
      await updateFetchJob(job.id, steps, 'teams', FetchJobStatus.RUNNING);
    }

    if (effectiveResources.includes('players')) {
      steps = markStep(steps, 'players', 'running');
      await updateFetchJob(job.id, steps, 'players', FetchJobStatus.RUNNING);

      for (const row of relevantTeams) {
        const apiTeam = row?.team;
        const dbTeam = teamMap.get(apiTeam?.name);
        if (!apiTeam?.id || !dbTeam) continue;

        const squadRows = await apiFootballFetch(`/players/squads?team=${apiTeam.id}`);

        for (const squad of squadRows) {
          for (const playerRow of squad.players || []) {
            const jerseyNumber = typeof playerRow.number === 'number' ? playerRow.number : null;

            const existingPlayer =
              (playerRow.id
                ? await prisma.player.findFirst({
                    where: {
                      apiFootballId: playerRow.id,
                      teamId: dbTeam.id,
                    },
                  })
                : null) ||
              (jerseyNumber !== null &&
                (await prisma.player.findUnique({
                  where: {
                    jerseyNumber_teamId: {
                      jerseyNumber,
                      teamId: dbTeam.id,
                    },
                  },
                }))) ||
              (await prisma.player.findFirst({
                where: {
                  nameEn: playerRow.name,
                  teamId: dbTeam.id,
                },
              }));

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
              nameHe: translateName(playerRow.name),
              jerseyNumber,
              position: playerRow.position || null,
              teamId: dbTeam.id,
            };

            if (!existingPlayer) {
              playersAdded += 1;
              await prisma.player.create({
                data: playerData,
              });
              continue;
            }

            await prisma.player.update({
              where: { id: existingPlayer.id },
              data: {
                ...playerData,
                apiFootballId: playerRow.id || existingPlayer.apiFootballId,
                jerseyNumber: jerseyNumber ?? existingPlayer.jerseyNumber,
              },
            });
          }
        }
      }

      steps = markStep(steps, 'players', 'done');
      await updateFetchJob(job.id, steps, 'players', FetchJobStatus.RUNNING);
    }

    if (effectiveResources.includes('fixtures')) {
      steps = markStep(steps, 'fixtures', 'running');
      await updateFetchJob(job.id, steps, 'fixtures', FetchJobStatus.RUNNING);

      for (const fixture of fixtureRows) {
        const homeName = fixture?.teams?.home?.name;
        const awayName = fixture?.teams?.away?.name;
        if (!homeName || !awayName) continue;
        if (selectedTeamName && homeName !== selectedTeamName && awayName !== selectedTeamName) continue;

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

        if (!existingGame) {
          gamesAdded += 1;
          await prisma.game.create({
            data: {
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
              homeScore: fixture?.goals?.home ?? 0,
              awayScore: fixture?.goals?.away ?? 0,
              status: mapGameStatus(fixture?.fixture?.status?.short),
            },
          });
        } else {
          await prisma.game.update({
            where: { id: existingGame.id },
            data: {
              apiFootballId: fixture?.fixture?.id || existingGame.apiFootballId,
              roundNameEn: fixture?.league?.round || null,
              roundNameHe: translateName(fixture?.league?.round),
              venueNameEn: fixture?.fixture?.venue?.name || null,
              refereeEn: fixture?.fixture?.referee || null,
              refereeHe: translateName(fixture?.fixture?.referee),
              homeScore: fixture?.goals?.home ?? 0,
              awayScore: fixture?.goals?.away ?? 0,
              status: mapGameStatus(fixture?.fixture?.status?.short),
              competitionId: competition.id,
            },
          });
        }
      }

      steps = markStep(steps, 'fixtures', 'done');
      await updateFetchJob(job.id, steps, 'fixtures', FetchJobStatus.RUNNING);
    }

    if (effectiveResources.includes('standings')) {
      steps = markStep(steps, 'standings', 'running');
      await updateFetchJob(job.id, steps, 'standings', FetchJobStatus.RUNNING);

      for (const block of standingsRows) {
        const standings = block?.league?.standings || [];
        for (const group of standings) {
          for (const row of group) {
            const teamName = row?.team?.name;
            if (!teamName) continue;
            if (selectedTeamName && teamName !== selectedTeamName) continue;

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

      steps = markStep(steps, 'standings', 'done');
      await updateFetchJob(job.id, steps, 'standings', FetchJobStatus.RUNNING);
    }

    if (effectiveResources.includes('events')) {
      steps = markStep(steps, 'events', 'running');
      await updateFetchJob(job.id, steps, 'events', FetchJobStatus.RUNNING);

      for (const fixture of fixtureRows) {
        const apiEvents = fixture?.events || [];
        const gameId = fixture?.fixture?.id;
        if (!gameId || !apiEvents.length) continue;

        const game = await prisma.game.findUnique({ where: { apiFootballId: gameId } });
        if (!game) continue;

        for (const event of apiEvents) {
          const player = event?.player?.name
            ? await prisma.player.findFirst({
                where: {
                  nameEn: event.player.name,
                },
              })
            : null;
          const relatedPlayer = event?.assist?.name
            ? await prisma.player.findFirst({
                where: {
                  nameEn: event.assist.name,
                },
              })
            : null;

          const type =
            event?.type === 'Goal'
              ? 'GOAL'
              : event?.detail === 'Yellow Card'
              ? 'YELLOW_CARD'
              : event?.detail === 'Red Card'
              ? 'RED_CARD'
              : 'ASSIST';

          await prisma.gameEvent.create({
            data: {
              apiFootballId: event?.time?.elapsed ? Number(`${gameId}${event.time.elapsed}`) : null,
              minute: event?.time?.elapsed || 0,
              extraMinute: event?.time?.extra || null,
              type: type as any,
              team: event?.team?.name || '',
              notesEn: event?.detail || null,
              notesHe: translateName(event?.detail),
              playerId: player?.id || null,
              relatedPlayerId: relatedPlayer?.id || null,
              gameId: game.id,
              teamId: null,
            },
          });
          eventsSaved += 1;
        }
      }

      steps = markStep(steps, 'events', 'done');
      await updateFetchJob(job.id, steps, 'events', FetchJobStatus.RUNNING);
    }

    const resultPayload = {
      league: LEAGUE_NAMES[leagueId] || leagueId,
      teamsAdded,
      playersAdded,
      gamesAdded,
      standingsUpdated,
      eventsSaved,
    };

    await prisma.fetchJob.update({
      where: { id: job.id },
      data: {
        status: FetchJobStatus.COMPLETED,
        progressPercent: 100,
        finishedAt: new Date(),
        resultJson: resultPayload as any,
        teamId: selectedDbTeam?.id || null,
        stepsJson: steps.map((step) => ({ ...step, status: 'done' })) as any,
      },
    });

    await logActivity({
      entityType: ActivityEntityType.FETCH_JOB,
      entityId: job.id,
      actionHe: `הושלמה משיכת נתונים עבור ${LEAGUE_NAMES[leagueId] || leagueId} עונת ${seasonYear}`,
      userId: viewer.id,
      details: resultPayload,
    });

    return NextResponse.json({
      success: true,
      jobId: job.id,
      ...resultPayload,
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
