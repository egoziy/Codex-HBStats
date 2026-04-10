import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { getAllowedLiveCountryLabels, LIVE_COUNTRIES_SETTING_KEY } from '@/lib/live-competition-settings';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    countryLabels: (await getAllowedLiveCountryLabels()) || [],
  });
}

export async function PUT(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const rawCountries = Array.isArray(body?.countryLabels) ? body.countryLabels : [];
  const countryLabels = rawCountries.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0);

  await prisma.siteSetting.upsert({
    where: { key: LIVE_COUNTRIES_SETTING_KEY },
    update: { valueJson: { countryLabels } as any },
    create: {
      key: LIVE_COUNTRIES_SETTING_KEY,
      valueJson: { countryLabels } as any,
    },
  });

  return NextResponse.json({
    ok: true,
    countryLabels,
  });
}
