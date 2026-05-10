import Constants from 'expo-constants';

const API_BASE_URL =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  'http://localhost:8011';

export const config = {
  apiBaseUrl: API_BASE_URL,
  apiVersion: 'v1' as const,
};

export function apiUrl(path: string): string {
  const base = config.apiBaseUrl.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : '/' + path;
  return `${base}/api/mobile/${config.apiVersion}${suffix}`;
}
