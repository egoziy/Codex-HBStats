import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { getDisplayZeroStatPlayersSetting, ZERO_STAT_PLAYERS_SETTING_KEY } from '@/lib/player-zero-stat-settings';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    displayZeroStatPlayers: await getDisplayZeroStatPlayersSetting(),
  });
}

export async function PUT(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const enabled = Boolean(body?.displayZeroStatPlayers);

  await prisma.siteSetting.upsert({
    where: { key: ZERO_STAT_PLAYERS_SETTING_KEY },
    update: { valueJson: { enabled } as any },
    create: {
      key: ZERO_STAT_PLAYERS_SETTING_KEY,
      valueJson: { enabled } as any,
    },
  });

  return NextResponse.json({
    ok: true,
    displayZeroStatPlayers: enabled,
  });
}
