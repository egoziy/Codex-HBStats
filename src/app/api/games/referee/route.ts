import { NextRequest, NextResponse } from 'next/server';

import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

function normalizeInput(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const gameId = normalizeInput((body as { gameId?: unknown })?.gameId);
  const refereeNameEn = normalizeInput((body as { refereeNameEn?: unknown })?.refereeNameEn);
  const refereeNameHe = normalizeInput((body as { refereeNameHe?: unknown })?.refereeNameHe);
  const fallbackName = refereeNameEn || refereeNameHe;

  if (!gameId) {
    return NextResponse.json({ error: 'Game ID is required' }, { status: 400 });
  }

  if (!fallbackName) {
    return NextResponse.json({ error: 'Referee name is required' }, { status: 400 });
  }

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { id: true, refereeId: true },
  });

  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  const refereeNameToStoreEn = refereeNameEn || fallbackName;
  const refereeNameToStoreHe = refereeNameHe || refereeNameEn || fallbackName;

  const existingReferee = await prisma.referee.findFirst({
    where: {
      OR: [
        { nameEn: { equals: refereeNameToStoreEn, mode: 'insensitive' as const } },
        ...(refereeNameToStoreHe
          ? [{ nameHe: { equals: refereeNameToStoreHe, mode: 'insensitive' as const } }]
          : []),
      ],
    },
  });

  const referee = existingReferee
    ? await prisma.referee.update({
        where: { id: existingReferee.id },
        data: {
          nameEn: refereeNameToStoreEn || existingReferee.nameEn,
          nameHe: refereeNameToStoreHe || existingReferee.nameHe,
        },
      })
    : await prisma.referee.create({
        data: {
          nameEn: refereeNameToStoreEn,
          nameHe: refereeNameToStoreHe || null,
        },
      });

  const updatedGame = await prisma.game.update({
    where: { id: game.id },
    data: {
      refereeId: referee.id,
      refereeEn: refereeNameToStoreEn,
      refereeHe: refereeNameToStoreHe,
    },
    select: {
      id: true,
      refereeId: true,
      refereeEn: true,
      refereeHe: true,
    },
  });

  return NextResponse.json({
    ok: true,
    game: updatedGame,
    referee,
  });
}
