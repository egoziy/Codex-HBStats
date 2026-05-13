import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import {
  runFlashscoreImport,
  runFlashscoreMergeOnly,
  getFlashscoreStatus,
  type FlashscoreOptions,
} from '@/lib/flashscore-runner';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body?.action;

  if (action === 'status') {
    return NextResponse.json(getFlashscoreStatus());
  }

  if (action === 'merge') {
    if (getFlashscoreStatus().running) {
      return NextResponse.json({ error: 'תהליך כבר רץ', status: getFlashscoreStatus() }, { status: 429 });
    }
    runFlashscoreMergeOnly().catch(() => null);
    return NextResponse.json({ success: true, message: 'מיזוג התחיל' });
  }

  if (action === 'start') {
    if (getFlashscoreStatus().running) {
      return NextResponse.json({ error: 'תהליך כבר רץ', status: getFlashscoreStatus() }, { status: 429 });
    }
    const opts: FlashscoreOptions = {
      leagueSlug: String(body?.leagueSlug || 'ligat-ha-al'),
      season: String(body?.season || '2025-2026'),
      skipFixtures: !!body?.skipFixtures,
      skipTeams: !!body?.skipTeams,
      skipMatches: !!body?.skipMatches,
      skipPlayers: !!body?.skipPlayers,
      skipMerge: !!body?.skipMerge,
      headful: !!body?.headful,
    };
    runFlashscoreImport(opts).catch(() => null);
    return NextResponse.json({ success: true, message: 'ייבוא התחיל', options: opts });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
