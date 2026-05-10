import { apiClient } from '@/lib/apiClient';
import { setAccessToken, storeRefreshToken } from '@/lib/auth';
import * as SecureStore from 'expo-secure-store';

beforeEach(async () => {
  // Reset auth state — clear in-memory access token + SecureStore mock
  setAccessToken(null);
  await SecureStore.deleteItemAsync('hbs_refresh');
  await SecureStore.deleteItemAsync('hbs_user');
});

describe('Refresh transparency', () => {
  test('GET /home with stale access token → silently refreshes and returns data', async () => {
    setAccessToken('expired-access');
    await storeRefreshToken('old-refresh');

    const data = await apiClient.get<{ liveStrip: unknown[] }>('/home');
    expect(data.liveStrip).toEqual([]);
  });
});
