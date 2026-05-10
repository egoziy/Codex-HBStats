import { NextRequest, NextResponse } from 'next/server';
import { getMobileNewsPayload } from '@/lib/mobile-extra-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limitParam = request.nextUrl.searchParams.get('limit');
  const parsedLimit = Number(limitParam);
  const payload = await getMobileNewsPayload(Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10);

  return NextResponse.json(payload);
}
