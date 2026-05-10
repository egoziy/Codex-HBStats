import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get('year');

  const season = await prisma.season.findFirst({
    where: yearParam ? { year: parseInt(yearParam, 10) } : { year: { lte: new Date().getFullYear() } },
    orderBy: { year: 'desc' },
  });

  if (!season) return NextResponse.json({ standings: [], season: null });

  // Find Ligat Ha'al competition
  const competitions = await prisma.competition.findMany({
    where: { type: 'LEAGUE' },
    select: { id: true, nameHe: true, nameEn: true },
  });

  const standings = await prisma.standing.findMany({
    where: { seasonId: season.id },
    include: {
      team: { select: { id: true, nameHe: true, nameEn: true, logoUrl: true } },
      competition: { select: { id: true, nameHe: true, nameEn: true, type: true } },
    },
    orderBy: [{ position: 'asc' }],
  });

  // Group by competition
  const groups = new Map<string, typeof standings>();
  for (const row of standings) {
    const key = row.competitionId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  // Prefer Ligat Ha'al league
  const sorted = Array.from(groups.entries()).sort(([, a], [, b]) => {
    const aComp = a[0]?.competition;
    const bComp = b[0]?.competition;
    const aIsLeague = aComp?.type === 'LEAGUE' &&
      (aComp?.nameEn?.toLowerCase().includes('ligat') || aComp?.nameEn?.toLowerCase().includes('liga'));
    const bIsLeague = bComp?.type === 'LEAGUE' &&
      (bComp?.nameEn?.toLowerCase().includes('ligat') || bComp?.nameEn?.toLowerCase().includes('liga'));
    if (aIsLeague && !bIsLeague) return -1;
    if (!aIsLeague && bIsLeague) return 1;
    return 0;
  });

  const result = sorted.map(([, rows]) => ({
    competition: rows[0]?.competition
      ? { id: rows[0].competition.id, nameHe: rows[0].competition.nameHe, nameEn: rows[0].competition.nameEn }
      : null,
    rows: rows.map((r) => ({
      position: r.position,
      teamId: r.team.id,
      teamNameHe: r.team.nameHe,
      teamNameEn: r.team.nameEn,
      logoUrl: r.team.logoUrl,
      played: r.played,
      wins: r.wins,
      draws: r.draws,
      losses: r.losses,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      goalsDiff: r.goalsDiff,
      points: r.points,
      form: r.form,
      description: r.descriptionHe || r.descriptionEn,
    })),
  }));

  return NextResponse.json({
    season: { id: season.id, year: season.year, name: season.name },
    groups: result,
  });
}
