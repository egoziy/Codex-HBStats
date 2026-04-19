import { ChangePasswordForm } from '@/components/AuthForms';
import AccountPreferencesForm from '@/components/AccountPreferencesForm';
import { requireUser } from '@/lib/auth';
import { getCurrentSeasonStartYear } from '@/lib/home-live';
import prisma from '@/lib/prisma';
import type { Theme, ColorSchemePref } from '@/components/ThemeProvider';

export default async function AccountPage() {
  const user = await requireUser();
  const [storedUser, latestSeason, competitions] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        favoriteTeamApiIds: true,
        favoriteCompetitionApiIds: true,
        theme: true,
        colorScheme: true,
      },
    }),
    prisma.season.findFirst({
      where: { year: { lte: getCurrentSeasonStartYear() } },
      orderBy: { year: 'desc' },
    }),
    prisma.competition.findMany({
      where: { apiFootballId: { not: null } },
      orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
      select: { apiFootballId: true, nameHe: true, nameEn: true },
    }),
  ]);

  const teams = latestSeason
    ? await prisma.team.findMany({
        where: { seasonId: latestSeason.id, apiFootballId: { not: null } },
        orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
        select: { apiFootballId: true, nameHe: true, nameEn: true },
      })
    : [];

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="rounded-[24px] border border-white/70 bg-white/90 p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Account</p>
          <h1 className="mt-2 text-3xl font-black text-stone-900">{user.name}</h1>
          <p className="mt-2 text-stone-600">{user.email}</p>
          <p className="mt-1 text-sm text-stone-500">
            תפקיד: {user.role === 'ADMIN' ? 'אדמין' : 'משתמש רגיל'}
          </p>
        </section>

        <AccountPreferencesForm
          teams={teams.map((t) => ({ apiFootballId: t.apiFootballId!, name: t.nameHe || t.nameEn || '' }))}
          competitions={competitions.map((c) => ({ apiFootballId: c.apiFootballId!, name: c.nameHe || c.nameEn || '' }))}
          initialFavoriteTeamApiIds={storedUser?.favoriteTeamApiIds || []}
          initialFavoriteCompetitionApiIds={storedUser?.favoriteCompetitionApiIds || []}
          initialTheme={(storedUser?.theme as Theme) || 'modern'}
          initialColorScheme={(storedUser?.colorScheme as ColorSchemePref) || 'auto'}
        />

        <ChangePasswordForm />
      </div>
    </div>
  );
}
