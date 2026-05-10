import { NextResponse } from 'next/server';
import { getMobileTeamPayload } from '@/lib/mobile-details-api';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const payload = await getMobileTeamPayload(params.id);

  if (!payload) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }

  return NextResponse.json(payload);
}
