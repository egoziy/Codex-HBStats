import { cookies } from 'next/headers';

export const DISPLAY_MODE_COOKIE = 'display_mode';

export type DisplayMode = 'classic' | 'premier';

export function normalizeDisplayMode(value: string | null | undefined): DisplayMode {
  return value === 'premier' ? 'premier' : 'classic';
}

export async function getDisplayMode(preferredValue?: string | null): Promise<DisplayMode> {
  if (preferredValue) {
    return normalizeDisplayMode(preferredValue);
  }

  const cookieStore = await cookies();
  return normalizeDisplayMode(cookieStore.get(DISPLAY_MODE_COOKIE)?.value);
}
