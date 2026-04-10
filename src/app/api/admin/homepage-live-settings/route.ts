import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import {
  DEFAULT_HOMEPAGE_LIVE_LIMIT,
  getHomepageLiveLimitSetting,
  HOMEPAGE_LIVE_LIMIT_SETTING_KEY,
} from '@/lib/homepage-live-settings';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    homepageLiveLimit: await getHomepageLiveLimitSetting(),
  });
}

export async function PUT(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = Number(body?.homepageLiveLimit);
  const homepageLiveLimit =
    Number.isInteger(parsed) && parsed >= 1 && parsed <= 20 ? parsed : DEFAULT_HOMEPAGE_LIVE_LIMIT;

  await prisma.siteSetting.upsert({
    where: { key: HOMEPAGE_LIVE_LIMIT_SETTING_KEY },
    update: { valueJson: { limit: homepageLiveLimit } as any },
    create: {
      key: HOMEPAGE_LIVE_LIMIT_SETTING_KEY,
      valueJson: { limit: homepageLiveLimit } as any,
    },
  });

  return NextResponse.json({
    ok: true,
    homepageLiveLimit,
  });
}
