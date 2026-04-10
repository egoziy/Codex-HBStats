import Link from 'next/link';

import AdminQuickEditClient from '@/components/AdminQuickEditClient';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function AdminQuickEditPage({
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
          <p className="mt-4 text-sm leading-7 text-stone-600">צריך להיות מחובר עם משתמש מנהל כדי לערוך נתונים.</p>
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

  const seasons = await prisma.season.findMany({
    orderBy: { year: 'desc' },
  });

  const selectedSeasonId = searchParams?.season || seasons[0]?.id || null;
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) || seasons[0] || null;

  if (!selectedSeason) {
    return (
      <div className="min-h-screen bg-stone-100 px-4 py-8">
        <div className="mx-auto max-w-4xl rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-black text-stone-900">עריכה מהירה</h1>
          <p className="mt-3 text-sm text-stone-600">אין עונות זמינות במערכת.</p>
        </div>
      </div>
    );
  }

  const [teams, players, games] = await Promise.all([
    prisma.team.findMany({
      where: { seasonId: selectedSeason.id },
      orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
    }),
    prisma.player.findMany({
      where: {
        team: {
          seasonId: selectedSeason.id,
        },
      },
      include: {
        team: true,
      },
      orderBy: [{ team: { nameHe: 'asc' } }, { nameHe: 'asc' }, { nameEn: 'asc' }],
    }),
    prisma.game.findMany({
      where: { seasonId: selectedSeason.id },
      include: {
        homeTeam: true,
        awayTeam: true,
        events: {
          include: {
            eventTeam: true,
          },
          orderBy: [{ minute: 'asc' }, { sortOrder: 'asc' }],
        },
      },
      orderBy: [{ dateTime: 'desc' }],
    }),
  ]);

  const gameOptions = games.map((game) => ({
    id: game.id,
    label: `${game.homeTeam.nameHe || game.homeTeam.nameEn} - ${game.awayTeam.nameHe || game.awayTeam.nameEn} | ${new Intl.DateTimeFormat('he-IL', {
      dateStyle: 'medium',
    }).format(game.dateTime)}`,
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
  }));

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/admin" className="text-sm font-bold text-red-800">
              חזרה לאדמין
            </Link>
            <h1 className="mt-2 text-4xl font-black text-stone-900">עריכה מהירה לשחקנים ואירועים</h1>
            <p className="mt-2 text-sm text-stone-600">מסך טבלאי ומהיר לעריכות שכיחות, בנוסף לעורכים המלאים.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={`/admin/games?season=${selectedSeason.id}`} className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700 shadow-sm">
              לעורך המשחקים המלא
            </Link>
          </div>
        </div>

        <AdminQuickEditClient
          seasons={seasons.map((season) => ({
            id: season.id,
            name: season.name,
          }))}
          selectedSeasonId={selectedSeason.id}
          teams={teams.map((team) => ({
            id: team.id,
            nameHe: team.nameHe,
            nameEn: team.nameEn,
          }))}
          players={players.map((player) => ({
            id: player.id,
            teamId: player.teamId,
            teamName: player.team.nameHe || player.team.nameEn,
            nameHe: player.nameHe,
            nameEn: player.nameEn,
            firstNameHe: player.firstNameHe,
            lastNameHe: player.lastNameHe,
            position: player.position,
            jerseyNumber: player.jerseyNumber,
            photoUrl: player.photoUrl,
          }))}
          games={gameOptions}
          events={games.flatMap((game) =>
            game.events.map((event) => ({
              id: event.id,
              gameId: game.id,
              gameLabel: `${game.homeTeam.nameHe || game.homeTeam.nameEn} - ${game.awayTeam.nameHe || game.awayTeam.nameEn}`,
              teamId: event.teamId,
              teamName: event.eventTeam ? event.eventTeam.nameHe || event.eventTeam.nameEn : event.team,
              minute: event.minute,
              extraMinute: event.extraMinute,
              type: event.type,
              playerId: event.playerId,
              relatedPlayerId: event.relatedPlayerId,
              assistPlayerId: event.assistPlayerId,
              notesHe: event.notesHe,
              sortOrder: event.sortOrder,
            }))
          )}
          playersByTeam={players.map((player) => ({
            id: player.id,
            nameHe: player.nameHe,
            nameEn: player.nameEn,
            teamId: player.teamId,
          }))}
        />
      </div>
    </div>
  );
}
