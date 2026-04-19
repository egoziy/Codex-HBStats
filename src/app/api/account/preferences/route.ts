import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUser } from '@/lib/auth';

const VALID_THEMES = ['classic', 'modern'] as const;
const VALID_COLORS = ['auto', 'red', 'yellow', 'green', 'blue'] as const;

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

  // Only update fields that were explicitly included in the request body
  const updates: Record<string, unknown> = {};

  if (body?.favoriteTeamApiIds !== undefined) {
    updates.favoriteTeamApiIds = normalizeIdArray(body.favoriteTeamApiIds);
  }
  if (body?.favoriteCompetitionApiIds !== undefined) {
    updates.favoriteCompetitionApiIds = normalizeIdArray(body.favoriteCompetitionApiIds);
  }
  if (typeof body?.theme === 'string' && VALID_THEMES.includes(body.theme as typeof VALID_THEMES[number])) {
    updates.theme = body.theme;
  }
  if (typeof body?.colorScheme === 'string' && VALID_COLORS.includes(body.colorScheme as typeof VALID_COLORS[number])) {
    updates.colorScheme = body.colorScheme;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true, message: 'No changes' });
  }

  const user = await prisma.user.update({
    where: { id: auth.id },
    data: updates,
    select: {
      favoriteTeamApiIds: true,
      favoriteCompetitionApiIds: true,
      theme: true,
      colorScheme: true,
    },
  });

  return NextResponse.json({ ok: true, ...user });
}
