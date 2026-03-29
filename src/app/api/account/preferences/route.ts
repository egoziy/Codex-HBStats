import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUser } from '@/lib/auth';

function normalizeIdArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0)
    )
  );
}

export async function PUT(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const favoriteTeamApiIds = normalizeIdArray(body?.favoriteTeamApiIds);
  const favoriteCompetitionApiIds = normalizeIdArray(body?.favoriteCompetitionApiIds);

  const user = await prisma.user.update({
    where: { id: auth.id },
    data: {
      favoriteTeamApiIds,
      favoriteCompetitionApiIds,
    },
    select: {
      favoriteTeamApiIds: true,
      favoriteCompetitionApiIds: true,
    },
  });

  return NextResponse.json({
    ok: true,
    favoriteTeamApiIds: user.favoriteTeamApiIds,
    favoriteCompetitionApiIds: user.favoriteCompetitionApiIds,
  });
}
