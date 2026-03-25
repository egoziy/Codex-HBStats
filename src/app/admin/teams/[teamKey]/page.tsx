import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import AdminTeamEditorClient from '@/components/AdminTeamEditorClient';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: { teamKey: string };
  searchParams?: { season?: string };
};

export default async function AdminTeamEditorPage({ params, searchParams }: PageProps) {
  const user = await getCurrentUser();

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-16">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-stone-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-3xl font-black text-stone-900">גישה לאזור אדמין</h1>
          <p className="mt-4 text-sm leading-7 text-stone-600">
            צריך להיות מחובר עם משתמש מנהל כדי לערוך קבוצות ושחקנים.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link href="/login" className="rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white">
              להתחברות
            </Link>
            <Link href="/admin" className="rounded-full border border-stone-300 px-5 py-3 text-sm font-bold text-stone-700">
              חזרה לאדמין
            </Link>
          </div>
        </div>
      </div>
    );
  }

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
