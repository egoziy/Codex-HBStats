import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const playerId = body?.playerId;
  const typeHe = body?.typeHe?.trim() || null;
  const typeEn = body?.typeEn?.trim() || typeHe || 'Injury';
  const startDate = body?.startDate ? new Date(body.startDate) : new Date();

  if (!playerId || !typeHe) {
    return NextResponse.json({ error: 'playerId and typeHe are required' }, { status: 400 });
  }

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { id: true, nameEn: true, nameHe: true, apiFootballId: true, team: { select: { seasonId: true } } },
  });

  if (!player) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  const entry = await prisma.playerSidelinedEntry.create({
    data: {
      playerNameEn: player.nameEn,
      playerNameHe: player.nameHe,
      apiFootballPlayerId: player.apiFootballId,
      typeEn,
      typeHe,
      startDate,
      endDate: null,
      seasonId: player.team.seasonId,
      playerId: player.id,
    },
  });

  return NextResponse.json(entry, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const id = body?.id;
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const data: any = {};
  if (body.typeHe !== undefined) data.typeHe = body.typeHe?.trim() || null;
  if (body.typeEn !== undefined) data.typeEn = body.typeEn?.trim() || null;
  if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null;
  if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null;

  const entry = await prisma.playerSidelinedEntry.update({ where: { id }, data });
  return NextResponse.json(entry);
}

export async function DELETE(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  await prisma.playerSidelinedEntry.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
