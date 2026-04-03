import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUser } from '@/lib/auth';

function normalizeOptionalJerseyNumber(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;

  const normalized = typeof value === 'string' ? value.trim() : String(value);
  if (!normalized) return null;

  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('teamId');
  const playerId = searchParams.get('playerId');

  if (playerId) {
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: { playerStats: true, team: true, canonicalPlayer: true },
    });

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    return NextResponse.json(player);
  }

  if (!teamId) {
    return NextResponse.json(
      { error: 'teamId or playerId is required' },
      { status: 400 }
    );
  }

  const players = await prisma.player.findMany({
    where: { teamId },
    include: { playerStats: true },
  });

  return NextResponse.json(players);
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
  const { nameEn, nameHe, jerseyNumber, teamId, position, photoUrl, notesHe } = body;

  if (!nameEn || !nameHe || !teamId) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 }
    );
  }

  try {
    const player = await prisma.player.create({
      data: {
        nameEn,
        nameHe,
        jerseyNumber: normalizeOptionalJerseyNumber(jerseyNumber),
        teamId,
        position: position || null,
        photoUrl: photoUrl || null,
        additionalInfo: {
          notesHe: notesHe || null,
        },
      },
    });

    // Create player statistics
    await prisma.playerStatistics.create({
      data: { playerId: player.id },
    });

    return NextResponse.json(player, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to create player', details: error.message },
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
  const { id, nameEn, nameHe, firstNameHe, lastNameHe, jerseyNumber, position, photoUrl, notesHe } = body;

  if (!id) {
    return NextResponse.json(
      { error: 'Player ID is required' },
      { status: 400 }
    );
  }

  try {
    const existingPlayer = await prisma.player.findUnique({
      where: { id },
      select: { additionalInfo: true, canonicalPlayerId: true },
    });

    const canonicalPlayerId = existingPlayer?.canonicalPlayerId || id;

    const player = await prisma.player.update({
      where: { id },
      data: {
        ...(nameEn !== undefined && { nameEn }),
        ...(nameHe !== undefined && { nameHe }),
        ...(firstNameHe !== undefined && { firstNameHe: firstNameHe || null }),
        ...(lastNameHe !== undefined && { lastNameHe: lastNameHe || null }),
        ...(jerseyNumber !== undefined && { jerseyNumber: normalizeOptionalJerseyNumber(jerseyNumber) }),
        ...(position !== undefined && { position: position || null }),
        ...(photoUrl !== undefined && { photoUrl: photoUrl || null }),
        ...(notesHe !== undefined && {
          additionalInfo: {
            ...((existingPlayer?.additionalInfo as Record<string, unknown> | null) || {}),
            notesHe: notesHe || null,
          },
        }),
      },
    });

    if (nameEn !== undefined || nameHe !== undefined || firstNameHe !== undefined || lastNameHe !== undefined) {
      await prisma.player.updateMany({
        where: {
          OR: [{ id: canonicalPlayerId }, { canonicalPlayerId }],
        },
        data: {
          ...(nameEn !== undefined && { nameEn }),
          ...(nameHe !== undefined && { nameHe }),
          ...(firstNameHe !== undefined && { firstNameHe: firstNameHe || null }),
          ...(lastNameHe !== undefined && { lastNameHe: lastNameHe || null }),
        },
      });
    }

    return NextResponse.json(player);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to update player', details: error.message },
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
      { error: 'Player ID is required' },
      { status: 400 }
    );
  }

  try {
    await prisma.player.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to delete player', details: error.message },
      { status: 400 }
    );
  }
}
