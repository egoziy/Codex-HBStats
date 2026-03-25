import Link from 'next/link';
import AdminManagerClient from '@/components/AdminManagerClient';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

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

  const [teams, seasons, fetchJobs] = await Promise.all([
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
  ]);

  const selectedSeasonId = searchParams?.season || seasons[0]?.id || null;
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) || seasons[0] || null;

  const rawData = selectedSeason
    ? await prisma.season.findUnique({
        where: { id: selectedSeason.id },
        include: {
          teams: {
            include: {
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

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <AdminManagerClient
          teams={groupedTeams}
          fetchTeams={teams}
          fetchJobs={fetchJobs}
          seasons={seasons}
          selectedSeasonId={selectedSeason?.id || null}
          rawData={rawData}
        />
      </div>
    </div>
  );
}
