import Link from 'next/link';

import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import AdminGameEditorClient from '@/components/AdminGameEditorClient';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams?: {
    season?: string;
    gameId?: string;
  };
};

export default async function AdminGamesPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-16">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-stone-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-3xl font-black text-stone-900">גישה לאזור אדמין</h1>
          <p className="mt-4 text-sm leading-7 text-stone-600">
            צריך להיות מחובר עם משתמש מנהל כדי לערוך משחקים ואירועים.
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

  const seasons = await prisma.season.findMany({
    orderBy: { year: 'desc' },
  });

  const selectedSeasonId = searchParams?.season || seasons[0]?.id || null;
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) || seasons[0] || null;

  if (!selectedSeason) {
    return (
      <div className="min-h-screen bg-stone-100 px-4 py-8">
        <div className="mx-auto max-w-4xl rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-black text-stone-900">ניהול משחקים</h1>
          <p className="mt-3 text-sm text-stone-600">אין עונות זמינות במערכת.</p>
        </div>
      </div>
    );
  }

  const [seasonGames, teams, competitionsRaw, venues, players] = await Promise.all([
    prisma.game.findMany({
      where: { seasonId: selectedSeason.id },
      include: {
        homeTeam: true,
        awayTeam: true,
        competition: true,
        venue: true,
        referee: true,
        gameStats: true,
        events: {
          include: {
            player: true,
            relatedPlayer: true,
            eventTeam: true,
          },
          orderBy: [{ minute: 'asc' }, { sortOrder: 'asc' }],
        },
      },
      orderBy: [{ dateTime: 'desc' }],
    }),
    prisma.team.findMany({
      where: { seasonId: selectedSeason.id },
      orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
    }),
    prisma.competitionSeason.findMany({
      where: { seasonId: selectedSeason.id },
      include: {
        competition: true,
      },
      orderBy: [{ competition: { nameHe: 'asc' } }],
    }),
    prisma.venue.findMany({
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
      orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
    }),
  ]);

  const selectedGame = seasonGames.find((game) => game.id === searchParams?.gameId) || seasonGames[0] || null;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/admin" className="text-sm font-bold text-red-800">
              חזרה לאדמין
            </Link>
            <h1 className="mt-2 text-4xl font-black text-stone-900">ניהול משחקים ואירועים</h1>
            <p className="mt-2 text-sm text-stone-600">
              עריכת משחקים לפי עונה, שיוך למסגרת, ותיקון/הזנה ידנית של משחקים ישנים ואירועים.
            </p>
          </div>
          <div className="rounded-full bg-white px-4 py-2 text-sm font-bold text-stone-700 shadow-sm">
            עונה נבחרת: {selectedSeason.name}
          </div>
        </div>

        <AdminGameEditorClient
          seasons={seasons.map((season) => ({
            id: season.id,
            name: season.name,
            year: season.year,
          }))}
          selectedSeasonId={selectedSeason.id}
          teams={teams.map((team) => ({
            id: team.id,
            nameHe: team.nameHe,
            nameEn: team.nameEn,
          }))}
          competitions={competitionsRaw.map((row) => row.competition)}
          venues={venues.map((venue) => ({
            id: venue.id,
            nameEn: venue.nameEn,
            nameHe: venue.nameHe,
            cityEn: venue.cityEn,
            cityHe: venue.cityHe,
          }))}
          players={players.map((player) => ({
            id: player.id,
            nameHe: player.nameHe,
            nameEn: player.nameEn,
            teamId: player.teamId,
            team: {
              id: player.team.id,
              nameHe: player.team.nameHe,
              nameEn: player.team.nameEn,
            },
          }))}
          games={seasonGames.map((game) => ({
            id: game.id,
            dateTime: game.dateTime.toISOString(),
            status: game.status,
            homeScore: game.homeScore,
            awayScore: game.awayScore,
            roundNameHe: game.roundNameHe,
            roundNameEn: game.roundNameEn,
            venueNameHe: game.venueNameHe,
            venueNameEn: game.venueNameEn,
            refereeEn: game.refereeEn,
            refereeHe: game.refereeHe,
            competitionId: game.competitionId,
            venueId: game.venueId,
            refereeId: game.refereeId,
            seasonId: game.seasonId,
            homeTeam: {
              id: game.homeTeamId,
              nameHe: game.homeTeam.nameHe,
              nameEn: game.homeTeam.nameEn,
            },
            awayTeam: {
              id: game.awayTeamId,
              nameHe: game.awayTeam.nameHe,
              nameEn: game.awayTeam.nameEn,
            },
            competition: game.competition
              ? {
                  id: game.competition.id,
                  nameHe: game.competition.nameHe,
                  nameEn: game.competition.nameEn,
                  type: game.competition.type,
                  apiFootballId: game.competition.apiFootballId,
                }
              : null,
            venue: game.venue
              ? {
                  id: game.venue.id,
                  nameHe: game.venue.nameHe,
                  nameEn: game.venue.nameEn,
                }
              : null,
            referee: game.referee
              ? {
                  id: game.referee.id,
                  nameHe: game.referee.nameHe,
                  nameEn: game.referee.nameEn,
                }
              : null,
            gameStats: game.gameStats
              ? {
                  homeTeamPossession: game.gameStats.homeTeamPossession,
                  awayTeamPossession: game.gameStats.awayTeamPossession,
                  homeShotsOnTarget: game.gameStats.homeShotsOnTarget,
                  awayShotsOnTarget: game.gameStats.awayShotsOnTarget,
                  homeShotsTotal: game.gameStats.homeShotsTotal,
                  awayShotsTotal: game.gameStats.awayShotsTotal,
                  homeCorners: game.gameStats.homeCorners,
                  awayCorners: game.gameStats.awayCorners,
                  homeFouls: game.gameStats.homeFouls,
                  awayFouls: game.gameStats.awayFouls,
                  homeOffsides: game.gameStats.homeOffsides,
                  awayOffsides: game.gameStats.awayOffsides,
                  homeYellowCards: game.gameStats.homeYellowCards,
                  awayYellowCards: game.gameStats.awayYellowCards,
                  homeRedCards: game.gameStats.homeRedCards,
                  awayRedCards: game.gameStats.awayRedCards,
                }
              : null,
            events: game.events.map((event) => ({
              id: event.id,
              minute: event.minute,
              extraMinute: event.extraMinute,
              type: event.type,
              team: event.team,
              teamId: event.teamId,
              sortOrder: event.sortOrder,
              notesHe: event.notesHe,
              notesEn: event.notesEn,
              playerId: event.playerId,
              relatedPlayerId: event.relatedPlayerId,
              assistPlayerId: event.assistPlayerId,
              player: event.player
                ? {
                    id: event.player.id,
                    nameHe: event.player.nameHe,
                    nameEn: event.player.nameEn,
                  }
                : null,
              relatedPlayer: event.relatedPlayer
                ? {
                    id: event.relatedPlayer.id,
                    nameHe: event.relatedPlayer.nameHe,
                    nameEn: event.relatedPlayer.nameEn,
                  }
                : null,
              eventTeam: event.eventTeam
                ? {
                    id: event.eventTeam.id,
                    nameHe: event.eventTeam.nameHe,
                    nameEn: event.eventTeam.nameEn,
                  }
                : null,
            })),
          }))}
          selectedGameId={selectedGame?.id || null}
        />
      </div>
    </div>
  );
}
