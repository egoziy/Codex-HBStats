import { NextResponse } from 'next/server';
import { getMobileGamePayload } from '@/lib/mobile-details-api';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const payload = await getMobileGamePayload(params.id);

  if (!payload) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  return NextResponse.json(payload);
}
