import prisma from '@/lib/prisma';

export const HOMEPAGE_LIVE_LIMIT_SETTING_KEY = 'homepage_live_limit';
export const DEFAULT_HOMEPAGE_LIVE_LIMIT = 4;

export async function getHomepageLiveLimitSetting() {
  const setting = await prisma.siteSetting.findUnique({
    where: { key: HOMEPAGE_LIVE_LIMIT_SETTING_KEY },
  });

  const rawValue =
    typeof setting?.valueJson === 'number'
      ? setting.valueJson
      : setting?.valueJson &&
          typeof setting.valueJson === 'object' &&
          'limit' in (setting.valueJson as Record<string, unknown>) &&
          typeof (setting.valueJson as Record<string, unknown>).limit === 'number'
        ? (setting.valueJson as { limit: number }).limit
        : null;

  if (typeof rawValue === 'number' && Number.isInteger(rawValue) && rawValue >= 1 && rawValue <= 20) {
    return rawValue;
  }

  return DEFAULT_HOMEPAGE_LIVE_LIMIT;
}
