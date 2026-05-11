import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { runMatchdayUpdate, getMatchdayStatus, type MatchdayOptions } from '@/lib/matchday-runner';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body?.action;

  if (action === 'start') {
    const status = getMatchdayStatus();
    if (status.running) {
      return NextResponse.json({ error: 'עדכון כבר רץ', status }, { status: 429 });
    }
    const options: MatchdayOptions = {
      date: body?.date || new Date().toISOString().slice(0, 10),
      league: body?.league || 'ipl',
      skipApiFootball: !!body?.skipApiFootball,
      skipFootyStats: !!body?.skipFootyStats,
      skipIfa: !!body?.skipIfa,
      skipWalla: !!body?.skipWalla,
      skipMerge: !!body?.skipMerge,
      headful: !!body?.headful,
    };
    runMatchdayUpdate(options).catch(() => null);
    return NextResponse.json({ success: true, message: 'עדכון התחיל', options });
  }

  if (action === 'status') {
    return NextResponse.json(getMatchdayStatus());
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
