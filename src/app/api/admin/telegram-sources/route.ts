import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUser } from '@/lib/auth';
import { DEFAULT_TELEGRAM_SOURCES, normalizeTelegramSource } from '@/lib/telegram';

const TELEGRAM_SOURCES_SETTING_KEY = 'telegram_sources';

function normalizeSourcesPayload(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) =>
      normalizeTelegramSource({
        slug: typeof item?.slug === 'string' ? item.slug : null,
        url: typeof item?.url === 'string' ? item.url : null,
        label: typeof item?.label === 'string' ? item.label : '',
        teamLabel: typeof item?.teamLabel === 'string' ? item.teamLabel : '',
      })
    )
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export async function GET(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const setting = await prisma.siteSetting.findUnique({
    where: { key: TELEGRAM_SOURCES_SETTING_KEY },
  });

  const sources = normalizeSourcesPayload(setting?.valueJson) || [];

  return NextResponse.json({
    sources: sources.length ? sources : DEFAULT_TELEGRAM_SOURCES,
  });
}

export async function PUT(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const sources = normalizeSourcesPayload(body?.sources);

  if (!sources.length) {
    return NextResponse.json({ error: 'יש להגדיר לפחות מקור טלגרם אחד תקין.' }, { status: 400 });
  }

  const uniqueSources = Array.from(
    sources.reduce((map, source) => map.set(source.slug, source), new Map<string, (typeof sources)[number]>()).values()
  );

  const setting = await prisma.siteSetting.upsert({
    where: { key: TELEGRAM_SOURCES_SETTING_KEY },
    update: { valueJson: uniqueSources as any },
    create: {
      key: TELEGRAM_SOURCES_SETTING_KEY,
      valueJson: uniqueSources as any,
    },
  });

  return NextResponse.json({
    ok: true,
    sources: normalizeSourcesPayload(setting.valueJson),
  });
}
