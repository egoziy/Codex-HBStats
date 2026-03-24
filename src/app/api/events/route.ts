import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get('gameId');

  if (!gameId) {
    return NextResponse.json(
      { error: 'gameId is required' },
      { status: 400 }
    );
  }

  const events = await prisma.gameEvent.findMany({
    where: { gameId },
    include: {
      player: true,
    },
    orderBy: { minute: 'asc' },
  });

  return NextResponse.json(events);
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
  const { gameId, playerId, minute, type, team, assistPlayerId } = body;

  if (!gameId || !playerId || minute === undefined || !type || !team) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 }
    );
  }

  try {
    const event = await prisma.gameEvent.create({
      data: {
        gameId,
        playerId,
        minute: parseInt(minute),
        type,
        team,
        assistPlayerId: assistPlayerId || null,
      },
      include: {
        player: true,
      },
    });

    // Update player statistics based on event type
    if (type === 'GOAL') {
      await prisma.playerStatistics.updateMany({
        where: { playerId },
        data: { goals: { increment: 1 } },
      });
    } else if (type === 'ASSIST') {
      await prisma.playerStatistics.updateMany({
        where: { playerId },
        data: { assists: { increment: 1 } },
      });
    } else if (type === 'YELLOW_CARD') {
      await prisma.playerStatistics.updateMany({
        where: { playerId },
        data: { yellowCards: { increment: 1 } },
      });
    } else if (type === 'RED_CARD') {
      await prisma.playerStatistics.updateMany({
        where: { playerId },
        data: { redCards: { increment: 1 } },
      });
    }

    return NextResponse.json(event, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to create event', details: error.message },
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
  const playerId = searchParams.get('playerId');
  const type = searchParams.get('type');

  if (!id) {
    return NextResponse.json(
      { error: 'Event ID is required' },
      { status: 400 }
    );
  }

  try {
      // Reverse the statistics update if needed
      if (playerId && type) {
        if (type === 'GOAL') {
        await prisma.playerStatistics.updateMany({
          where: { playerId },
          data: { goals: { decrement: 1 } },
        });
      } else if (type === 'ASSIST') {
        await prisma.playerStatistics.updateMany({
          where: { playerId },
          data: { assists: { decrement: 1 } },
        });
      } else if (type === 'YELLOW_CARD') {
        await prisma.playerStatistics.updateMany({
          where: { playerId },
          data: { yellowCards: { decrement: 1 } },
        });
      } else if (type === 'RED_CARD') {
        await prisma.playerStatistics.updateMany({
          where: { playerId },
          data: { redCards: { decrement: 1 } },
        });
      }
    }

    await prisma.gameEvent.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to delete event', details: error.message },
      { status: 400 }
    );
  }
}
