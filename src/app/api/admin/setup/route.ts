import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { runFullSetup, getSetupStatus, type SetupMode } from '@/lib/setup-runner';

export async function POST(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const action = body?.action;

  if (action === 'start') {
    const mode: SetupMode = body?.mode || 'full';
    const status = getSetupStatus();
    if (status.running) {
      return NextResponse.json({ error: 'ייבוא כבר רץ', status }, { status: 429 });
    }
    // Start in background — don't await
    runFullSetup(mode).catch(() => null);
    return NextResponse.json({ success: true, message: 'ייבוא התחיל' });
  }

  if (action === 'status') {
    return NextResponse.json(getSetupStatus());
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
