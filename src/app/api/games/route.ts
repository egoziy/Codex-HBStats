import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const seasonId = searchParams.get('seasonId');
  const teamId = searchParams.get('teamId');

  let where: any = {};
  if (seasonId) where.seasonId = seasonId;
  if (teamId) {
    where.OR = [
      { homeTeamId: teamId },
      { awayTeamId: teamId },
    ];
  }

  const games = await prisma.game.findMany({
    where,
    include: {
      homeTeam: true,
      awayTeam: true,
      events: true,
      gameStats: true,
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
  const { dateTime, homeTeamId, awayTeamId, seasonId } = body;

  if (!dateTime || !homeTeamId || !awayTeamId || !seasonId) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 }
    );
  }

  try {
    const game = await prisma.game.create({
      data: {
        dateTime: new Date(dateTime),
        homeTeamId,
        awayTeamId,
        seasonId,
        status: 'SCHEDULED',
      },
      include: {
        homeTeam: true,
        awayTeam: true,
      },
    });

    // Create game statistics
    await prisma.gameStatistics.create({
      data: { gameId: game.id },
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
  const { id, homeScore, awayScore, status } = body;

  if (!id) {
    return NextResponse.json(
      { error: 'Game ID is required' },
      { status: 400 }
    );
  }

  try {
    const game = await prisma.game.update({
      where: { id },
      data: {
        ...(homeScore !== undefined && { homeScore }),
        ...(awayScore !== undefined && { awayScore }),
        ...(status && { status }),
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        events: true,
      },
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
