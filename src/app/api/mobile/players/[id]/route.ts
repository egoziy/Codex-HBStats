import { NextRequest, NextResponse } from 'next/server';
import { getMobilePlayerPayload } from '@/lib/mobile-details-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const payload = await getMobilePlayerPayload(params.id, {
    season: request.nextUrl.searchParams.get('season') || undefined,
    view: request.nextUrl.searchParams.get('view') || undefined,
  });

  if (!payload) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  return NextResponse.json(payload);
}
