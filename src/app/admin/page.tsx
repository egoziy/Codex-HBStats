import AdminManagerClient from '@/components/AdminManagerClient';
import { requireAdminUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  await requireAdminUser();

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
        <AdminManagerClient teams={groupedTeams} fetchTeams={teams} fetchJobs={fetchJobs} seasons={seasons} />
      </div>
    </div>
  );
}
