import Link from 'next/link';
import AdminCollapsible from '@/components/AdminCollapsible';
import AdminLiveCountriesClient from '@/components/AdminLiveCountriesClient';
import AdminHomepageLiveSettingsClient from '@/components/AdminHomepageLiveSettingsClient';
import AdminPlayerDisplaySettingsClient from '@/components/AdminPlayerDisplaySettingsClient';
import AdminTelegramSourcesClient from '@/components/AdminTelegramSourcesClient';
import AdminManagerClient from '@/components/AdminManagerClient';
import { buildAdminCoverageRows } from '@/lib/admin-data-coverage';
import { getCurrentUser } from '@/lib/auth';
import { getHomepageLiveLimitSetting } from '@/lib/homepage-live-settings';
import { getAllowedLiveCountryLabels } from '@/lib/live-competition-settings';
import { getDisplayZeroStatPlayersSetting } from '@/lib/player-zero-stat-settings';
import prisma from '@/lib/prisma';
import { DEFAULT_TELEGRAM_SOURCES, normalizeTelegramSource } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: { season?: string };
}) {
  const user = await getCurrentUser();

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-16">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-stone-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-3xl font-black text-stone-900">גישה לאזור אדמין</h1>
          <p className="mt-4 text-sm leading-7 text-stone-600">
            כדי להיכנס לאדמין צריך להיות מחובר עם משתמש בעל הרשאת מנהל.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link href="/login" className="rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white">
              להתחברות
            </Link>
            <Link href="/" className="rounded-full border border-stone-300 px-5 py-3 text-sm font-bold text-stone-700">
              חזרה לדף הבית
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const [teams, seasons, fetchJobs, telegramSourcesSetting, displayZeroStatPlayers, homepageLiveLimit, liveCountryLabels, liveSnapshots, coverageSeasons] = await Promise.all([
    prisma.team.findMany({
      include: { season: true },
      orderBy: [{ updatedAt: 'desc' }],
    }),
    prisma.season.findMany({
      orderBy: { year: 'desc' },
    }),
    prisma.fetchJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.siteSetting.findUnique({
      where: { key: 'telegram_sources' },
    }),
    getDisplayZeroStatPlayersSetting(),
    getHomepageLiveLimitSetting(),
    getAllowedLiveCountryLabels(),
    prisma.liveGameSnapshot.findMany({
      where: {
        feedScope: 'GLOBAL_HOMEPAGE',
      },
      select: {
        rawJson: true,
      },
      orderBy: [{ snapshotAt: 'desc' }],
      take: 250,
    }),
    prisma.season.findMany({
      orderBy: { year: 'desc' },
      include: {
        competitions: {
          include: {
            competition: {
              select: {
                id: true,
                apiFootballId: true,
                nameHe: true,
                nameEn: true,
                countryHe: true,
                countryEn: true,
                type: true,
              },
            },
          },
        },
        teams: {
          select: {
            id: true,
            apiFootballId: true,
            nameHe: true,
            nameEn: true,
            venueId: true,
            _count: {
              select: {
                players: true,
              },
            },
          },
        },
        games: {
          select: {
            id: true,
            competitionId: true,
            homeTeamId: true,
            awayTeamId: true,
            venueId: true,
            status: true,
            dateTime: true,
            updatedAt: true,
            _count: {
              select: {
                events: true,
                lineupEntries: true,
              },
            },
          },
        },
        standings: {
          select: {
            id: true,
            competitionId: true,
            teamId: true,
            updatedAt: true,
          },
        },
        playerStats: {
          select: {
            id: true,
            competitionId: true,
            updatedAt: true,
            player: {
              select: {
                id: true,
                teamId: true,
              },
            },
          },
        },
        teamStats: {
          select: {
            id: true,
            competitionId: true,
            teamId: true,
            updatedAt: true,
          },
        },
        leaderboardEntries: {
          select: {
            id: true,
            competitionId: true,
            teamId: true,
            updatedAt: true,
          },
        },
        predictions: {
          select: {
            id: true,
            competitionId: true,
            updatedAt: true,
            game: {
              select: {
                homeTeamId: true,
                awayTeamId: true,
                status: true,
                dateTime: true,
              },
            },
          },
        },
        headToHeadEntries: {
          select: {
            id: true,
            competitionId: true,
            updatedAt: true,
            game: {
              select: {
                homeTeamId: true,
                awayTeamId: true,
                status: true,
                dateTime: true,
              },
            },
          },
        },
        oddsValues: {
          select: {
            id: true,
            competitionId: true,
            updatedAt: true,
            oddsUpdatedAt: true,
            game: {
              select: {
                homeTeamId: true,
                awayTeamId: true,
                status: true,
                dateTime: true,
              },
            },
          },
        },
        liveSnapshots: {
          select: {
            id: true,
            competitionId: true,
            snapshotAt: true,
            feedScope: true,
            gameId: true,
            homeTeamApiFootballId: true,
            awayTeamApiFootballId: true,
          },
        },
        fetchJobs: {
          where: {
            status: 'COMPLETED',
          },
          select: {
            id: true,
            competitionId: true,
            teamId: true,
            createdAt: true,
            finishedAt: true,
            stepsJson: true,
          },
          orderBy: [{ finishedAt: 'desc' }, { createdAt: 'desc' }],
        },
      },
    }),
  ]);

  const telegramSourcesRaw = Array.isArray(telegramSourcesSetting?.valueJson)
    ? (telegramSourcesSetting.valueJson as Array<Record<string, unknown>>)
    : [];
  const telegramSources =
    telegramSourcesRaw
      .map((source) =>
        normalizeTelegramSource({
          slug: typeof source.slug === 'string' ? source.slug : null,
          url: typeof source.url === 'string' ? source.url : null,
          label: typeof source.label === 'string' ? source.label : '',
          teamLabel: typeof source.teamLabel === 'string' ? source.teamLabel : '',
        })
      )
      .filter((source): source is NonNullable<typeof source> => Boolean(source)) || [];

  const selectedSeasonId = searchParams?.season || seasons[0]?.id || null;
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) || seasons[0] || null;
  const coverageRows = buildAdminCoverageRows(coverageSeasons);
  const liveCountries = Array.from(
    new Set(
      liveSnapshots
        .map((snapshot) => {
          const country = snapshot.rawJson && typeof snapshot.rawJson === 'object' ? (snapshot.rawJson as any)?.league?.country : null;
          return typeof country === 'string' && country.trim() ? country.trim() : null;
        })
        .filter((country): country is string => Boolean(country))
    )
  ).sort((a, b) => a.localeCompare(b, 'he'));

  const rawData = selectedSeason
    ? await prisma.season.findUnique({
        where: { id: selectedSeason.id },
        include: {
          teams: {
            include: {
              coachAssignments: {
                orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
              },
              players: {
                orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
              },
              standings: {
                include: {
                  competition: true,
                },
                orderBy: [{ position: 'asc' }],
              },
            },
            orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
          },
          games: {
            include: {
              homeTeam: true,
              awayTeam: true,
              competition: true,
              lineupEntries: {
                include: {
                  team: true,
                  player: true,
                },
                orderBy: [{ role: 'asc' }, { teamId: 'asc' }],
              },
              events: {
                include: {
                  player: true,
                  relatedPlayer: true,
                  eventTeam: true,
                },
                orderBy: [{ minute: 'asc' }, { sortOrder: 'asc' }],
              },
              gameStats: true,
            },
            orderBy: [{ dateTime: 'desc' }],
          },
          standings: {
            include: {
              team: true,
              competition: true,
            },
            orderBy: [{ position: 'asc' }, { points: 'desc' }],
          },
          fetchJobs: {
            include: {
              competition: true,
              team: true,
            },
            orderBy: [{ createdAt: 'desc' }],
          },
          playerStats: {
            include: {
              player: {
                include: {
                  team: true,
                },
              },
              competition: true,
            },
            orderBy: [{ goals: 'desc' }, { assists: 'desc' }],
          },
          teamStats: {
            include: {
              team: true,
              competition: true,
            },
            orderBy: [{ points: 'desc' }],
          },
          competitions: {
            include: {
              competition: true,
            },
            orderBy: [{ createdAt: 'desc' }],
          },
          leaderboardEntries: {
            include: {
              player: true,
              team: true,
              competition: true,
            },
            orderBy: [{ category: 'asc' }, { rank: 'asc' }],
          },
          injuries: {
            include: {
              player: true,
              team: true,
              competition: true,
              game: {
                include: {
                  homeTeam: true,
                  awayTeam: true,
                },
              },
            },
            orderBy: [{ fixtureDate: 'desc' }, { createdAt: 'desc' }],
          },
          transfers: {
            include: {
              player: true,
            },
            orderBy: [{ transferDate: 'desc' }, { createdAt: 'desc' }],
          },
          trophies: {
            include: {
              player: true,
            },
            orderBy: [{ playerNameHe: 'asc' }, { leagueNameEn: 'asc' }],
          },
          predictions: {
            include: {
              game: {
                include: {
                  homeTeam: true,
                  awayTeam: true,
                },
              },
            },
            orderBy: [{ createdAt: 'desc' }],
          },
          headToHeadEntries: {
            include: {
              game: {
                include: {
                  homeTeam: true,
                  awayTeam: true,
                },
              },
            },
            orderBy: [{ relatedDate: 'desc' }],
          },
          oddsValues: {
            include: {
              game: {
                include: {
                  homeTeam: true,
                  awayTeam: true,
                },
              },
            },
            orderBy: [{ oddsUpdatedAt: 'desc' }, { bookmakerName: 'asc' }],
          },
          liveSnapshots: {
            where: {
              feedScope: 'LOCAL',
            },
            orderBy: [{ snapshotAt: 'desc' }],
          },
        },
      })
    : null;

  const groupedTeams = Array.from(
    teams.reduce((map, team) => {
      const key = team.apiFootballId ? `api-${team.apiFootballId}` : `name-${encodeURIComponent(team.nameEn)}`;
      const existing = map.get(key);

      if (!existing) {
        map.set(key, {
          key,
          displayNameHe: team.nameHe,
          displayNameEn: team.nameEn,
          logoUrl: team.logoUrl,
          seasons: [team.season.name],
          latestSeasonYear: team.season.year,
        });
        return map;
      }

      existing.seasons.push(team.season.name);
      if (team.season.year > existing.latestSeasonYear) {
        existing.latestSeasonYear = team.season.year;
        existing.displayNameHe = team.nameHe;
        existing.displayNameEn = team.nameEn;
        existing.logoUrl = team.logoUrl;
      }

      return map;
    }, new Map<string, {
      key: string;
      displayNameHe: string | null;
      displayNameEn: string;
      logoUrl: string | null;
      seasons: string[];
      latestSeasonYear: number;
    }>())
  )
    .map(([, value]) => ({
      ...value,
      seasons: Array.from(new Set(value.seasons)).sort().reverse(),
    }))
    .sort((a, b) => a.displayNameEn.localeCompare(b.displayNameEn));

  const adminTab = (searchParams as any)?.adminTab || 'data';

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        {/* Compact header with quick links */}
        <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,#7f1d1d,#1f2937)] px-6 py-5 text-white shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-2xl font-black">אזור אדמין</h1>
            <div className="flex flex-wrap gap-2 text-xs font-bold">
              <Link href={`/admin/quick-edit?season=${selectedSeason?.id || ''}`} className="rounded-full bg-white/15 px-3 py-1.5 transition hover:bg-white/25">עריכה מהירה</Link>
              <Link href={`/admin/games?season=${selectedSeason?.id || ''}`} className="rounded-full bg-white/15 px-3 py-1.5 transition hover:bg-white/25">משחקים</Link>
              <Link href="/admin/venues" className="rounded-full bg-white/15 px-3 py-1.5 transition hover:bg-white/25">אצטדיונים</Link>
              <Link href="/admin/scrape" className="rounded-full bg-blue-500/30 px-3 py-1.5 transition hover:bg-blue-500/50">סריקת אתרים</Link>
            </div>
          </div>
        </section>

        {/* Tab navigation */}
        <nav className="flex flex-wrap gap-2">
          {[
            { key: 'data', label: 'נתונים ומשיכה' },
            { key: 'settings', label: 'הגדרות' },
          ].map((tab) => (
            <Link
              key={tab.key}
              href={`/admin?season=${selectedSeason?.id || ''}&adminTab=${tab.key}`}
              className={`rounded-full px-5 py-2.5 text-sm font-bold transition ${
                adminTab === tab.key
                  ? 'bg-stone-900 text-white shadow-sm'
                  : 'bg-white text-stone-600 hover:bg-stone-100'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        {/* Settings tab */}
        {adminTab === 'settings' ? (
          <div className="space-y-4">
            <AdminLiveCountriesClient options={liveCountries} initialSelectedCountries={liveCountryLabels || liveCountries} />
            <AdminHomepageLiveSettingsClient initialHomepageLiveLimit={homepageLiveLimit} />
            <AdminPlayerDisplaySettingsClient initialDisplayZeroStatPlayers={displayZeroStatPlayers} />
            <AdminTelegramSourcesClient initialSources={telegramSources.length ? telegramSources : DEFAULT_TELEGRAM_SOURCES} />
          </div>
        ) : null}

        {/* Data tab (default) */}
        {adminTab === 'data' ? (
          <AdminManagerClient
            teams={groupedTeams}
            fetchTeams={teams}
            fetchJobs={fetchJobs}
            seasons={seasons}
            selectedSeasonId={selectedSeason?.id || null}
            rawData={rawData}
            coverageRows={coverageRows}
          />
        ) : null}
      </div>
    </div>
  );
}
