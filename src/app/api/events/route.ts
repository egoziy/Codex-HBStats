import { NextRequest, NextResponse } from 'next/server';
import { EventType } from '@prisma/client';

import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

function parseOptionalInteger(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseOptionalString(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function buildStatDelta(type: string, direction: 1 | -1) {
  const increment = direction === 1 ? 1 : -1;

  if (type === 'GOAL') return { goals: increment };
  if (type === 'ASSIST') return { assists: increment };
  if (type === 'YELLOW_CARD') return { yellowCards: increment };
  if (type === 'RED_CARD') return { redCards: increment };
  return null;
}

async function applyStatDelta(
  tx: any,
  playerId: string | null | undefined,
  type: string,
  direction: 1 | -1
) {
  if (!playerId) return;
  const delta = buildStatDelta(type, direction);
  if (!delta) return;

  await tx.playerStatistics.updateMany({
    where: { playerId },
    data: delta,
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get('gameId');

  if (!gameId) {
    return NextResponse.json({ error: 'gameId is required' }, { status: 400 });
  }

  const events = await prisma.gameEvent.findMany({
    where: { gameId },
    include: {
      player: true,
      relatedPlayer: true,
      eventTeam: true,
    },
    orderBy: [{ minute: 'asc' }, { sortOrder: 'asc' }],
  });

  return NextResponse.json(events);
}

export async function POST(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const gameId = parseOptionalString(body?.gameId);
  const playerId = parseOptionalString(body?.playerId);
  const participantName = parseOptionalString(body?.participantName);
  const relatedPlayerId = parseOptionalString(body?.relatedPlayerId);
  const relatedParticipantName = parseOptionalString(body?.relatedParticipantName);
  const assistPlayerId = parseOptionalString(body?.assistPlayerId);
  const team = parseOptionalString(body?.team);
  const teamId = parseOptionalString(body?.teamId);
  const type = parseOptionalString(body?.type);
  const allowedTypes = new Set<EventType>([
    'GOAL',
    'ASSIST',
    'YELLOW_CARD',
    'RED_CARD',
    'SUBSTITUTION_IN',
    'SUBSTITUTION_OUT',
    'OWN_GOAL',
    'PENALTY_GOAL',
    'PENALTY_MISSED',
  ]);

  if (!gameId || !type || !team || body?.minute === undefined) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (!allowedTypes.has(type as EventType)) {
    return NextResponse.json({ error: 'Invalid event type' }, { status: 400 });
  }

  const minute = parseOptionalInteger(body?.minute);
  const extraMinute = parseOptionalInteger(body?.extraMinute);
  const sortOrder = parseOptionalInteger(body?.sortOrder) ?? 0;

  if (minute === null || minute === undefined) {
    return NextResponse.json({ error: 'Invalid minute' }, { status: 400 });
  }

  try {
    const event = await prisma.$transaction(async (tx) => {
      const created = await tx.gameEvent.create({
        data: {
          gameId,
          playerId: playerId || null,
          participantName: participantName || null,
          relatedPlayerId: relatedPlayerId || null,
          relatedParticipantName: relatedParticipantName || null,
          assistPlayerId: assistPlayerId || null,
          minute,
          extraMinute,
          type,
          team,
          teamId: teamId || null,
          notesEn: parseOptionalString(body?.notesEn),
          notesHe: parseOptionalString(body?.notesHe),
          sortOrder,
        } as any,
        include: {
          player: true,
          relatedPlayer: true,
          eventTeam: true,
        },
      });

      await applyStatDelta(tx, playerId, type, 1);

      return created;
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to create event' }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const id = parseOptionalString(body?.id);

  if (!id) {
    return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
  }

  const minute = parseOptionalInteger(body?.minute);
  const extraMinute = parseOptionalInteger(body?.extraMinute);
  const sortOrder = parseOptionalInteger(body?.sortOrder);
  const playerId = parseOptionalString(body?.playerId);
  const participantName = parseOptionalString(body?.participantName);
  const relatedPlayerId = parseOptionalString(body?.relatedPlayerId);
  const relatedParticipantName = parseOptionalString(body?.relatedParticipantName);
  const assistPlayerId = parseOptionalString(body?.assistPlayerId);
  const team = parseOptionalString(body?.team);
  const teamId = parseOptionalString(body?.teamId);
  const type = parseOptionalString(body?.type);
  const notesEn = parseOptionalString(body?.notesEn);
  const notesHe = parseOptionalString(body?.notesHe);

  try {
    const updatedEvent = await prisma.$transaction(async (tx) => {
      const existing = await tx.gameEvent.findUnique({
        where: { id },
        select: { playerId: true, type: true },
      });

      if (!existing) {
        throw new Error('Event not found');
      }

      await applyStatDelta(tx, existing.playerId, existing.type, -1);

      const event = await tx.gameEvent.update({
        where: { id },
        data: {
          ...(minute !== undefined && minute !== null && { minute }),
          ...(extraMinute !== undefined && { extraMinute }),
          ...(sortOrder !== undefined && { sortOrder }),
          ...(playerId !== undefined && { playerId }),
          ...(participantName !== undefined && { participantName }),
          ...(relatedPlayerId !== undefined && { relatedPlayerId }),
          ...(relatedParticipantName !== undefined && { relatedParticipantName }),
          ...(assistPlayerId !== undefined && { assistPlayerId }),
          ...(team !== undefined && { team }),
          ...(teamId !== undefined && { teamId }),
          ...(type !== undefined && { type }),
          ...(notesEn !== undefined && { notesEn }),
          ...(notesHe !== undefined && { notesHe }),
        } as any,
        include: {
          player: true,
          relatedPlayer: true,
          eventTeam: true,
        },
      });

      await applyStatDelta(tx, event.playerId, event.type, 1);

      return event;
    });

    return NextResponse.json(updatedEvent);
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to update event' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.gameEvent.findUnique({
        where: { id },
        select: { playerId: true, type: true },
      });

      if (existing) {
        await applyStatDelta(tx, existing.playerId, existing.type, -1);
      }

      await tx.gameEvent.delete({ where: { id } });
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to delete event' }, { status: 400 });
  }
}
