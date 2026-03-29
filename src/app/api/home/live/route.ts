import { NextRequest, NextResponse } from 'next/server';
import { getHomepageLiveSnapshots } from '@/lib/home-live';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const teamId = request.nextUrl.searchParams.get('teamId');
  const limitParam = request.nextUrl.searchParams.get('limit');
  const parsedLimit = Number(limitParam);
  const items = await getHomepageLiveSnapshots(teamId, {
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined,
  });

  return NextResponse.json({
    items,
    updatedAt: new Date().toISOString(),
  });
}
