import prisma from '@/lib/prisma';

export const LIVE_COUNTRIES_SETTING_KEY = 'live_countries';

export async function getAllowedLiveCountryLabels() {
  const setting = await prisma.siteSetting.findUnique({
    where: { key: LIVE_COUNTRIES_SETTING_KEY },
  });

  if (!setting?.valueJson || typeof setting.valueJson !== 'object') {
    return null;
  }

  const rawCountries = (setting.valueJson as { countryLabels?: unknown }).countryLabels;
  if (!Array.isArray(rawCountries)) {
    return null;
  }

  return rawCountries.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}
