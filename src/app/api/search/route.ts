import { NextRequest, NextResponse } from 'next/server';
import { formatPlayerName } from '@/lib/player-display';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim();

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  const [teams, players, games, venues] = await Promise.all([
    prisma.team.findMany({
      where: {
        OR: [
          { nameHe: { contains: query, mode: 'insensitive' } },
          { nameEn: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 5,
    }),
    prisma.player.findMany({
      where: {
        OR: [
          { nameHe: { contains: query, mode: 'insensitive' } },
          { nameEn: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: { team: true, canonicalPlayer: true },
      take: 5,
    }),
    prisma.game.findMany({
      where: {
        OR: [
          { homeTeam: { nameHe: { contains: query, mode: 'insensitive' } } },
          { homeTeam: { nameEn: { contains: query, mode: 'insensitive' } } },
          { awayTeam: { nameHe: { contains: query, mode: 'insensitive' } } },
          { awayTeam: { nameEn: { contains: query, mode: 'insensitive' } } },
        ],
      },
      include: {
        homeTeam: true,
        awayTeam: true,
      },
      take: 5,
    }),
    prisma.venue.findMany({
      where: {
        OR: [
          { nameHe: { contains: query, mode: 'insensitive' } },
          { nameEn: { contains: query, mode: 'insensitive' } },
          { cityHe: { contains: query, mode: 'insensitive' } },
          { cityEn: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 5,
    }),
  ]);

  const results = [
    ...teams.map((team) => ({
      id: team.id,
      type: 'team',
      label: team.nameHe || team.nameEn,
      subtitle: team.nameEn,
      href: `/teams/${team.id}`,
    })),
    ...players.map((player) => ({
      id: player.id,
      type: 'player',
      label: formatPlayerName(player),
      subtitle: player.team?.nameHe || player.team?.nameEn || undefined,
      href: `/players/${player.canonicalPlayerId || player.id}`,
    })),
    ...games.map((game) => ({
      id: game.id,
      type: 'game',
      label: `${game.homeTeam.nameHe || game.homeTeam.nameEn} מול ${game.awayTeam.nameHe || game.awayTeam.nameEn}`,
      subtitle: new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium' }).format(game.dateTime),
      href: `/games/${game.id}`,
    })),
    ...venues.map((venue) => ({
      id: venue.id,
      type: 'venue',
      label: venue.nameHe || venue.nameEn,
      subtitle: venue.cityHe || venue.cityEn || undefined,
      href: `/venues?q=${encodeURIComponent(venue.nameHe || venue.nameEn)}`,
    })),
  ];

  return NextResponse.json({ results });
}
