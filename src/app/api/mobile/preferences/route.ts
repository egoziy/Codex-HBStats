import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { getMobilePreferencesPayload, updateMobilePreferencesPayload } from '@/lib/mobile-extra-api';

export const dynamic = 'force-dynamic';

export async function GET() {
  const payload = await getMobilePreferencesPayload();

  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(payload);
}

export async function PUT(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const payload = await updateMobilePreferencesPayload({
    userId: auth.id,
    favoriteTeamApiIds: body?.favoriteTeamApiIds,
    favoriteCompetitionApiIds: body?.favoriteCompetitionApiIds,
  });

  return NextResponse.json(payload);
}
