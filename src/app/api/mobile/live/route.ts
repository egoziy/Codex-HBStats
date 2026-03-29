import { NextRequest, NextResponse } from 'next/server';
import { getMobileLivePayload } from '@/lib/mobile-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limitParam = request.nextUrl.searchParams.get('limit');
  const parsedLimit = Number(limitParam);
  const payload = await getMobileLivePayload(Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 50);

  return NextResponse.json(payload);
}
