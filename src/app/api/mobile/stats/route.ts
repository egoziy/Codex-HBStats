import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const CATEGORIES = [
  'TOP_SCORERS',
  'TOP_ASSISTS',
  'TOP_YELLOW_CARDS',
  'TOP_RED_CARDS',
] as const;

const CATEGORY_KEYS: Record<string, string> = {
  TOP_SCORERS: 'topScorers',
  TOP_ASSISTS: 'topAssists',
  TOP_YELLOW_CARDS: 'topYellowCards',
  TOP_RED_CARDS: 'topRedCards',
};

function extractPhotoUrl(additionalInfo: unknown): string | null {
  if (!additionalInfo || typeof additionalInfo !== 'object') return null;
  const info = additionalInfo as Record<string, unknown>;
  const player = info.player;
  if (!player || typeof player !== 'object') return null;
  const photo = (player as Record<string, unknown>).photo;
  return typeof photo === 'string' ? photo : null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get('year');
  const currentYear = new Date().getFullYear();
  const targetYear = yearParam ? parseInt(yearParam, 10) : currentYear;

  // Find the season by year, or fall back to latest
  let season = await prisma.season.findFirst({
    where: { year: targetYear },
  });

  if (!season) {
    season = await prisma.season.findFirst({
      where: { year: { lte: currentYear } },
      orderBy: { year: 'desc' },
    });
  }

  if (!season) {
    return NextResponse.json(
      { error: 'No season found' },
      { status: 404 }
    );
  }

  // Find the Ligat Ha'al competition via leaderboard entries for this season
  const distinctComps = await prisma.competitionLeaderboardEntry.findMany({
    where: { seasonId: season.id },
    select: {
      competitionId: true,
      competition: { select: { id: true, nameHe: true, nameEn: true, type: true } },
    },
    distinct: ['competitionId'],
  });

  const competition =
    distinctComps.find(
      (e) =>
        e.competition?.type === 'LEAGUE' &&
        (e.competition?.nameEn?.toLowerCase().includes('ligat') ||
          e.competition?.nameEn?.toLowerCase().includes('liga'))
    )?.competition ??
    distinctComps.find((e) => e.competition?.type === 'LEAGUE')?.competition ??
    null;

  // Build leaderboard entries for each category
  const competitionFilter = competition ? { competitionId: competition.id } : {};

  const entriesByCategory = await Promise.all(
    CATEGORIES.map((category) =>
      prisma.competitionLeaderboardEntry.findMany({
        where: {
          seasonId: season!.id,
          category,
          ...competitionFilter,
        },
        orderBy: [{ rank: 'asc' }, { value: 'desc' }],
        take: 20,
      })
    )
  );

  const categories: Record<string, unknown[]> = {};
  CATEGORIES.forEach((category, index) => {
    const key = CATEGORY_KEYS[category];
    categories[key] = entriesByCategory[index].map((entry) => ({
      rank: entry.rank,
      playerId: entry.playerId,
      playerNameHe: entry.playerNameHe,
      playerNameEn: entry.playerNameEn,
      teamNameHe: entry.teamNameHe,
      teamNameEn: entry.teamNameEn,
      value: entry.value,
      gamesPlayed: entry.gamesPlayed,
      photoUrl: extractPhotoUrl(entry.additionalInfo),
    }));
  });

  return NextResponse.json({
    season: { id: season.id, year: season.year, name: season.name },
    competition: competition
      ? { id: competition.id, nameHe: competition.nameHe, nameEn: competition.nameEn }
      : null,
    categories,
  });
}
