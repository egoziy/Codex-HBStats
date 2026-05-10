import * as SecureStore from 'expo-secure-store';
import {
  storeRefreshToken,
  loadRefreshToken,
  clearRefreshToken,
  setAccessToken,
  getAccessToken,
  storeUser,
  loadUser,
} from '../auth';

const mockSet = SecureStore.setItemAsync as jest.Mock;
const mockGet = SecureStore.getItemAsync as jest.Mock;
const mockDelete = SecureStore.deleteItemAsync as jest.Mock;

beforeEach(() => {
  mockSet.mockClear();
  mockGet.mockClear();
  mockDelete.mockClear();
});

describe('auth token storage', () => {
  test('storeRefreshToken writes to SecureStore with WHEN_UNLOCKED_THIS_DEVICE_ONLY', async () => {
    await storeRefreshToken('rt-123');
    expect(mockSet).toHaveBeenCalledWith('hbs_refresh', 'rt-123', {
      keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    });
  });

  test('loadRefreshToken reads from SecureStore', async () => {
    mockGet.mockResolvedValue('rt-456');
    expect(await loadRefreshToken()).toBe('rt-456');
    expect(mockGet).toHaveBeenCalledWith('hbs_refresh');
  });

  test('clearRefreshToken deletes both refresh and user from SecureStore', async () => {
    await clearRefreshToken();
    expect(mockDelete).toHaveBeenCalledWith('hbs_refresh');
    expect(mockDelete).toHaveBeenCalledWith('hbs_user');
  });

  test('access token is held in module-scoped state, not persisted', () => {
    setAccessToken('at-xyz');
    expect(getAccessToken()).toBe('at-xyz');
    expect(mockSet).not.toHaveBeenCalled();
  });

  test('clearRefreshToken also clears in-memory access token', async () => {
    setAccessToken('at-xyz');
    await clearRefreshToken();
    expect(getAccessToken()).toBeNull();
  });

  test('storeUser writes JSON-encoded user to SecureStore', async () => {
    const user = { id: 'u1', email: 'a@b.c', name: 'A', role: 'USER' as const, avatarUrl: null };
    await storeUser(user);
    expect(mockSet).toHaveBeenCalledWith('hbs_user', JSON.stringify(user));
  });

  test('loadUser parses JSON from SecureStore', async () => {
    const user = { id: 'u1', email: 'a@b.c', name: 'A', role: 'USER' as const, avatarUrl: null };
    mockGet.mockResolvedValue(JSON.stringify(user));
    expect(await loadUser()).toEqual(user);
  });

  test('loadUser returns null on missing or malformed data', async () => {
    mockGet.mockResolvedValue(null);
    expect(await loadUser()).toBeNull();

    mockGet.mockResolvedValue('not-json');
    expect(await loadUser()).toBeNull();
  });
});
