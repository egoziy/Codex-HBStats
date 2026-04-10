import prisma from '@/lib/prisma';

export const ZERO_STAT_PLAYERS_SETTING_KEY = 'display_zero_stat_players';

export async function getDisplayZeroStatPlayersSetting() {
  const setting = await prisma.siteSetting.findUnique({
    where: { key: ZERO_STAT_PLAYERS_SETTING_KEY },
  });

  if (typeof setting?.valueJson === 'boolean') {
    return setting.valueJson;
  }

  if (
    setting?.valueJson &&
    typeof setting.valueJson === 'object' &&
    'enabled' in (setting.valueJson as Record<string, unknown>) &&
    typeof (setting.valueJson as Record<string, unknown>).enabled === 'boolean'
  ) {
    return (setting.valueJson as { enabled: boolean }).enabled;
  }

  return false;
}
