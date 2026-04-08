import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const seasonId = searchParams.get('seasonId');
  const teamId = searchParams.get('teamId');

  if (!seasonId && !teamId) {
    return NextResponse.json({ error: 'seasonId or teamId is required' }, { status: 400 });
  }

  const standings = await prisma.standing.findMany({
    where: {
      ...(seasonId ? { seasonId } : {}),
      ...(teamId ? { teamId } : {}),
    },
    include: {
      team: true,
      season: true,
      competition: true,
    },
    orderBy: [{ position: 'asc' }],
  });

  return NextResponse.json(standings);
}

export async function PUT(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { teamId, seasonId, pointsAdjustment, pointsAdjustmentNoteHe } = body;

  if (!teamId || !seasonId) {
    return NextResponse.json({ error: 'teamId and seasonId are required' }, { status: 400 });
  }

  const adjustmentValue = Number(pointsAdjustment ?? 0);
  if (Number.isNaN(adjustmentValue)) {
    return NextResponse.json({ error: 'pointsAdjustment must be numeric' }, { status: 400 });
  }

  try {
    const standing = await prisma.standing.upsert({
      where: {
        seasonId_teamId: {
          seasonId,
          teamId,
        },
      },
      update: {
        pointsAdjustment: adjustmentValue,
        pointsAdjustmentNoteHe: pointsAdjustmentNoteHe?.trim() || null,
      },
      create: {
        seasonId,
        teamId,
        position: 0,
        points: 0,
        pointsAdjustment: adjustmentValue,
        pointsAdjustmentNoteHe: pointsAdjustmentNoteHe?.trim() || null,
      },
      include: {
        team: true,
        season: true,
      },
    });

    await prisma.activityLog.create({
      data: {
        entityType: 'TEAM',
        entityId: teamId,
        actionHe: `עודכן תיקון נקודות לעונה ${standing.season.name}`,
        userId: auth.id,
      },
    });

    return NextResponse.json(standing);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to update standing adjustment' },
      { status: 400 }
    );
  }
}
