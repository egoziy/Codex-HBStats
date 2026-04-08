import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUser } from '@/lib/auth';

function parseOptionalInteger(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseOptionalFloat(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

function parseOptionalString(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function buildGameStatsData(gameStats: unknown) {
  if (!gameStats || typeof gameStats !== 'object') {
    return null;
  }

  const stats = gameStats as Record<string, unknown>;
  return {
    homeTeamPossession: parseOptionalFloat(stats.homeTeamPossession),
    awayTeamPossession: parseOptionalFloat(stats.awayTeamPossession),
    homeShotsOnTarget: parseOptionalInteger(stats.homeShotsOnTarget),
    awayShotsOnTarget: parseOptionalInteger(stats.awayShotsOnTarget),
    homeShotsTotal: parseOptionalInteger(stats.homeShotsTotal),
    awayShotsTotal: parseOptionalInteger(stats.awayShotsTotal),
    homeCorners: parseOptionalInteger(stats.homeCorners),
    awayCorners: parseOptionalInteger(stats.awayCorners),
    homeFouls: parseOptionalInteger(stats.homeFouls),
    awayFouls: parseOptionalInteger(stats.awayFouls),
    homeOffsides: parseOptionalInteger(stats.homeOffsides),
    awayOffsides: parseOptionalInteger(stats.awayOffsides),
    homeYellowCards: parseOptionalInteger(stats.homeYellowCards),
    awayYellowCards: parseOptionalInteger(stats.awayYellowCards),
    homeRedCards: parseOptionalInteger(stats.homeRedCards),
    awayRedCards: parseOptionalInteger(stats.awayRedCards),
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const seasonId = searchParams.get('seasonId');
  const teamId = searchParams.get('teamId');
  const competitionId = searchParams.get('competitionId');
  const round = searchParams.get('round');

  let where: any = {};
  if (seasonId) where.seasonId = seasonId;
  if (competitionId) where.competitionId = competitionId;
  if (round) {
    where.OR = [
      ...(where.OR || []),
      { roundNameHe: round },
      { roundNameEn: round },
    ];
  }
  if (teamId) {
    where.AND = [
      ...(where.AND || []),
      {
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      },
    ];
  }

  const games = await prisma.game.findMany({
    where,
    include: {
      homeTeam: true,
      awayTeam: true,
      events: true,
      gameStats: true,
      venue: true,
      referee: true,
      competition: true,
    },
    orderBy: { dateTime: 'desc' },
  });

  return NextResponse.json(games);
}

export async function POST(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const body = await request.json();
  const {
    dateTime,
    homeTeamId,
    awayTeamId,
    seasonId,
    competitionId,
    roundNameHe,
    roundNameEn,
    venueId,
    venueNameHe,
    venueNameEn,
    refereeId,
    refereeEn,
    refereeHe,
    homeScore,
    awayScore,
    status,
    gameStats,
  } = body;

  if (!dateTime || !homeTeamId || !awayTeamId || !seasonId) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 }
    );
  }

  try {
    const venueRecord = venueId
      ? await prisma.venue.findUnique({
          where: { id: venueId },
          select: { id: true, nameEn: true, nameHe: true },
        })
      : null;
    const refereeRecord = refereeId
      ? await prisma.referee.findUnique({
          where: { id: refereeId },
          select: { id: true, nameEn: true, nameHe: true },
        })
      : null;

    const game = await prisma.game.create({
      data: {
        dateTime: new Date(dateTime),
        homeTeamId,
        awayTeamId,
        seasonId,
        competitionId: competitionId || null,
        roundNameHe: parseOptionalString(roundNameHe),
        roundNameEn: parseOptionalString(roundNameEn),
        venueId: venueId || null,
        venueNameEn: parseOptionalString(venueNameEn) || venueRecord?.nameEn || null,
        venueNameHe: parseOptionalString(venueNameHe) || venueRecord?.nameHe || null,
        refereeId: refereeId || null,
        refereeEn: parseOptionalString(refereeEn) || refereeRecord?.nameEn || null,
        refereeHe: parseOptionalString(refereeHe) || refereeRecord?.nameHe || refereeRecord?.nameEn || null,
        homeScore: parseOptionalInteger(homeScore),
        awayScore: parseOptionalInteger(awayScore),
        status: status || 'SCHEDULED',
      },
      include: {
        homeTeam: true,
        awayTeam: true,
      },
    });

    const statsData = buildGameStatsData(gameStats);
    await prisma.gameStatistics.create({
      data: {
        gameId: game.id,
        ...(statsData || {}),
      },
    });

    return NextResponse.json(game, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to create game', details: error.message },
      { status: 400 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const body = await request.json();
  const {
    id,
    dateTime,
    homeTeamId,
    awayTeamId,
    seasonId,
    competitionId,
    roundNameHe,
    roundNameEn,
    venueId,
    venueNameHe,
    venueNameEn,
    refereeId,
    refereeEn,
    refereeHe,
    homeScore,
    awayScore,
    homePenalty,
    awayPenalty,
    status,
    gameStats,
  } = body;

  if (!id) {
    return NextResponse.json(
      { error: 'Game ID is required' },
      { status: 400 }
    );
  }

  try {
    const venueRecord = venueId
      ? await prisma.venue.findUnique({
          where: { id: venueId },
          select: { id: true, nameEn: true, nameHe: true },
        })
      : null;
    const refereeRecord = refereeId
      ? await prisma.referee.findUnique({
          where: { id: refereeId },
          select: { id: true, nameEn: true, nameHe: true },
        })
      : null;

    const statsData = buildGameStatsData(gameStats);
    const game = await prisma.$transaction(async (tx) => {
      const updatedGame = await tx.game.update({
        where: { id },
        data: {
          ...(dateTime !== undefined && { dateTime: new Date(dateTime) }),
          ...(homeTeamId !== undefined && { homeTeamId }),
          ...(awayTeamId !== undefined && { awayTeamId }),
          ...(seasonId !== undefined && { seasonId }),
          ...(competitionId !== undefined && { competitionId }),
          ...(roundNameHe !== undefined && { roundNameHe: parseOptionalString(roundNameHe) }),
          ...(roundNameEn !== undefined && { roundNameEn: parseOptionalString(roundNameEn) }),
          ...(venueId !== undefined && { venueId: venueId || null }),
          ...(venueNameEn !== undefined && {
            venueNameEn: parseOptionalString(venueNameEn) || venueRecord?.nameEn || null,
          }),
          ...(venueNameHe !== undefined && {
            venueNameHe: parseOptionalString(venueNameHe) || venueRecord?.nameHe || null,
          }),
          ...(refereeId !== undefined && { refereeId: refereeId || null }),
          ...(refereeEn !== undefined && {
            refereeEn: parseOptionalString(refereeEn) || refereeRecord?.nameEn || null,
          }),
          ...(refereeHe !== undefined && {
            refereeHe: parseOptionalString(refereeHe) || refereeRecord?.nameHe || refereeRecord?.nameEn || null,
          }),
          ...(homeScore !== undefined && { homeScore: parseOptionalInteger(homeScore) }),
          ...(awayScore !== undefined && { awayScore: parseOptionalInteger(awayScore) }),
          ...(homePenalty !== undefined && { homePenalty: parseOptionalInteger(homePenalty) }),
          ...(awayPenalty !== undefined && { awayPenalty: parseOptionalInteger(awayPenalty) }),
          ...(status !== undefined && { status }),
        },
        include: {
          homeTeam: true,
          awayTeam: true,
          events: true,
        },
      });

      if (statsData) {
        await tx.gameStatistics.upsert({
          where: { gameId: id },
          create: {
            gameId: id,
            ...statsData,
          },
          update: statsData,
        });
      }

      return updatedGame;
    });

    return NextResponse.json(game);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to update game', details: error.message },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { error: 'Game ID is required' },
      { status: 400 }
    );
  }

  try {
    await prisma.game.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to delete game', details: error.message },
      { status: 400 }
    );
  }
}
