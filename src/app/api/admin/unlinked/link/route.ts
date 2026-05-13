import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const kind: 'lineup' | 'event' | undefined = body?.kind;
  const id: string | undefined = body?.id;
  const playerId: string | null | undefined = body?.playerId ?? null;
  const dismiss: boolean = Boolean(body?.dismiss);

  if (!kind || !id) {
    return NextResponse.json({ error: 'kind and id required' }, { status: 400 });
  }

  // "Dismiss" means: keep the participantName but clear the flashscore marker
  // so the row stops showing up in the unlinked queue.
  if (dismiss) {
    if (kind === 'lineup') {
      // Lineups have no marker column; deleting the row is the cleanest dismiss.
      await prisma.gameLineupEntry.delete({ where: { id } });
    } else {
      await prisma.gameEvent.update({ where: { id }, data: { notesEn: 'flashscore-dismissed' } });
    }
    return NextResponse.json({ ok: true, dismissed: true });
  }

  if (!playerId) {
    return NextResponse.json({ error: 'playerId required when not dismissing' }, { status: 400 });
  }

  // Verify the chosen player exists and belongs to the same team as the row.
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { id: true, teamId: true } });
  if (!player) {
    return NextResponse.json({ error: 'player not found' }, { status: 400 });
  }

  if (kind === 'lineup') {
    const row = await prisma.gameLineupEntry.findUnique({ where: { id }, select: { teamId: true } });
    if (!row) return NextResponse.json({ error: 'lineup row not found' }, { status: 404 });
    if (row.teamId !== player.teamId) {
      return NextResponse.json({ error: 'player belongs to a different team' }, { status: 400 });
    }
    await prisma.gameLineupEntry.update({ where: { id }, data: { playerId } });
  } else {
    const row = await prisma.gameEvent.findUnique({ where: { id }, select: { teamId: true } });
    if (!row) return NextResponse.json({ error: 'event row not found' }, { status: 404 });
    if (row.teamId && row.teamId !== player.teamId) {
      return NextResponse.json({ error: 'player belongs to a different team' }, { status: 400 });
    }
    await prisma.gameEvent.update({ where: { id }, data: { playerId } });
  }

  return NextResponse.json({ ok: true });
}
