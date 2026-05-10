import { NextRequest, NextResponse } from 'next/server';
import { getMobileHomePayload } from '@/lib/mobile-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const payload = await getMobileHomePayload({
    team: request.nextUrl.searchParams.getAll('team'),
    league: request.nextUrl.searchParams.getAll('league'),
  });

  return NextResponse.json(payload);
}
