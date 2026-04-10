import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

// GET /api/referees — list all referees with game counts
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const referees = await prisma.referee.findMany({
    include: { _count: { select: { games: true } } },
    orderBy: { nameEn: 'asc' },
  });

  return NextResponse.json(referees);
}

// PUT /api/referees — update referee nameHe / nameEn
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const id = normalizeString(body.id);
    const nameHe = normalizeString(body.nameHe);
    const nameEn = normalizeString(body.nameEn);

    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const existing = await prisma.referee.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Referee not found' }, { status: 404 });

    const updated = await prisma.referee.update({
      where: { id },
      data: {
        ...(nameHe ? { nameHe } : {}),
        ...(nameEn ? { nameEn } : {}),
      },
    });

    // Also update denormalized fields on related games
    if (nameHe || nameEn) {
      await prisma.game.updateMany({
        where: { refereeId: id },
        data: {
          ...(nameHe ? { refereeHe: nameHe } : {}),
          ...(nameEn ? { refereeEn: nameEn } : {}),
        },
      });
    }

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update' }, { status: 400 });
  }
}

// POST /api/referees — merge two referees (keep target, absorb source)
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = normalizeString(body.action);

    if (action === 'merge') {
      const targetId = normalizeString(body.targetId);
      const sourceId = normalizeString(body.sourceId);

      if (!targetId || !sourceId) return NextResponse.json({ error: 'Missing targetId or sourceId' }, { status: 400 });
      if (targetId === sourceId) return NextResponse.json({ error: 'Cannot merge referee with itself' }, { status: 400 });

      const [target, source] = await Promise.all([
        prisma.referee.findUnique({ where: { id: targetId }, include: { _count: { select: { games: true } } } }),
        prisma.referee.findUnique({ where: { id: sourceId }, include: { _count: { select: { games: true } } } }),
      ]);

      if (!target) return NextResponse.json({ error: 'Target referee not found' }, { status: 404 });
      if (!source) return NextResponse.json({ error: 'Source referee not found' }, { status: 404 });

      // Move all games from source to target
      const movedGames = await prisma.game.updateMany({
        where: { refereeId: sourceId },
        data: {
          refereeId: targetId,
          refereeEn: target.nameEn,
          refereeHe: target.nameHe || target.nameEn,
        },
      });

      // Delete the source referee
      await prisma.referee.delete({ where: { id: sourceId } });

      return NextResponse.json({
        message: `Merged "${source.nameEn}" into "${target.nameEn}". ${movedGames.count} games reassigned.`,
        target,
        deletedSource: source.nameEn,
        gamesReassigned: movedGames.count,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 400 });
  }
}

// DELETE /api/referees — delete referee (only if no games)
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id') || '';
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const referee = await prisma.referee.findUnique({
      where: { id },
      include: { _count: { select: { games: true } } },
    });

    if (!referee) return NextResponse.json({ error: 'Referee not found' }, { status: 404 });
    if (referee._count.games > 0) {
      return NextResponse.json({ error: `Cannot delete — referee has ${referee._count.games} games` }, { status: 400 });
    }

    await prisma.referee.delete({ where: { id } });
    return NextResponse.json({ message: 'Deleted' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete' }, { status: 400 });
  }
}
