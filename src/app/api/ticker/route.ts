import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const revalidate = 60;

export async function GET() {
  const now = new Date();
  const [live, recent, upcoming] = await Promise.all([
    prisma.game.findMany({
      where: { status: 'ONGOING', competitionId: 'comp_liga_haal' },
      include: {
        homeTeam: { select: { nameHe: true, nameEn: true } },
        awayTeam: { select: { nameHe: true, nameEn: true } },
      },
      take: 6,
    }),
    prisma.game.findMany({
      where: { status: 'COMPLETED', competitionId: 'comp_liga_haal' },
      orderBy: { dateTime: 'desc' },
      include: {
        homeTeam: { select: { nameHe: true, nameEn: true } },
        awayTeam: { select: { nameHe: true, nameEn: true } },
      },
      take: 6,
    }),
    prisma.game.findMany({
      where: { status: 'SCHEDULED', competitionId: 'comp_liga_haal', dateTime: { gte: now } },
      orderBy: { dateTime: 'asc' },
      include: {
        homeTeam: { select: { nameHe: true, nameEn: true } },
        awayTeam: { select: { nameHe: true, nameEn: true } },
      },
      take: 4,
    }),
  ]);

  const label = (t: { nameHe: string | null; nameEn: string | null }) =>
    t.nameHe || t.nameEn || '';

  const items = [
    ...live.map((g) => ({
      kind: 'live' as const,
      home: label(g.homeTeam),
      away: label(g.awayTeam),
      score: `${g.homeScore ?? 0}–${g.awayScore ?? 0}`,
    })),
    ...recent.map((g) => ({
      kind: 'ft' as const,
      home: label(g.homeTeam),
      away: label(g.awayTeam),
      score: `${g.homeScore ?? 0}–${g.awayScore ?? 0}`,
    })),
    ...upcoming.map((g) => ({
      kind: 'ns' as const,
      home: label(g.homeTeam),
      away: label(g.awayTeam),
      time: g.dateTime
        ? new Date(g.dateTime).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
        : '',
    })),
  ];

  return NextResponse.json({ items });
}
