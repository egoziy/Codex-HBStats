import { notFound } from 'next/navigation';
import { requireAdminUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import AdminTeamEditorClient from '@/components/AdminTeamEditorClient';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: { teamKey: string };
  searchParams?: { season?: string };
};

export default async function AdminTeamEditorPage({ params, searchParams }: PageProps) {
  await requireAdminUser();

  const [kind, ...rest] = params.teamKey.split('-');
  const value = rest.join('-');

  const teamFamily = await prisma.team.findMany({
    where:
      kind === 'api' && value
        ? { apiFootballId: Number(value) || -1 }
        : kind === 'name' && value
          ? { nameEn: decodeURIComponent(value) }
          : undefined,
    include: {
      season: true,
      standings: true,
      players: {
        orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
      },
    },
    orderBy: { season: { year: 'desc' } },
  });

  if (!teamFamily.length) {
    notFound();
  }

  const selectedSeasonId = searchParams?.season || teamFamily[0].seasonId;
  const selectedTeam = teamFamily.find((team) => team.seasonId === selectedSeasonId) || teamFamily[0];

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-8">
      <div className="mx-auto max-w-7xl">
        <AdminTeamEditorClient
          teamKey={params.teamKey}
          selectedTeam={selectedTeam}
          currentStanding={selectedTeam.standings[0] || null}
          seasonOptions={teamFamily.map((team) => ({
            id: team.season.id,
            name: team.season.name,
            year: team.season.year,
          }))}
        />
      </div>
    </div>
  );
}
