import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get('year');

  // Find the season by year, or fall back to latest
  const seasonWhere = yearParam
    ? { year: parseInt(yearParam, 10) }
    : { year: { lte: new Date().getFullYear() } };

  const season = await prisma.season.findFirst({
    where: seasonWhere,
    orderBy: { year: 'desc' },
  });

  if (!season) {
    return NextResponse.json({ teams: [], season: null });
  }

  const teams = await prisma.team.findMany({
    where: { seasonId: season.id },
    orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
    select: {
      id: true,
      nameHe: true,
      nameEn: true,
      shortNameHe: true,
      shortNameEn: true,
      logoUrl: true,
      season: {
        select: { id: true, year: true, name: true },
      },
    },
  });

  return NextResponse.json({
    season: { id: season.id, year: season.year, name: season.name },
    teams: teams.map((t) => ({
      id: t.id,
      nameHe: t.nameHe,
      nameEn: t.nameEn,
      shortNameHe: t.shortNameHe,
      shortNameEn: t.shortNameEn,
      logoUrl: t.logoUrl,
    })),
  });
}
