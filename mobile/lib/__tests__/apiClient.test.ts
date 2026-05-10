import { setAccessToken } from '../auth';
import { apiClient } from '../apiClient';
import * as SecureStore from 'expo-secure-store';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  fetchMock.mockReset();
  setAccessToken(null);
});

describe('apiClient header injection', () => {
  test('does not add Authorization header when no access token', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await apiClient.get('/home');
    const [, init] = fetchMock.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization ?? headers.Authorization).toBeUndefined();
  });

  test('adds Authorization: Bearer <token> header when access token is set', async () => {
    setAccessToken('access-123');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await apiClient.get('/home');
    const [, init] = fetchMock.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    const auth = headers.authorization ?? headers.Authorization;
    expect(auth).toBe('Bearer access-123');
  });

  test('parses JSON response on 200', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ value: 42 }), { status: 200 }));
    const data = await apiClient.get<{ value: number }>('/home');
    expect(data.value).toBe(42);
  });

  test('throws on non-2xx response', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'boom' }), { status: 500 }));
    await expect(apiClient.get('/home')).rejects.toThrow();
  });

  test('post sends JSON body and content-type', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await apiClient.post('/auth/login', { email: 'a@b.c', password: 'x' });
    const [, init] = fetchMock.mock.calls[0];
    const i = init as RequestInit;
    expect(i.method).toBe('POST');
    expect(JSON.parse(i.body as string)).toEqual({ email: 'a@b.c', password: 'x' });
    const headers = i.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
  });
});

describe('apiClient 401-refresh-retry', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    setAccessToken(null);
    (SecureStore.getItemAsync as jest.Mock).mockReset();
    (SecureStore.setItemAsync as jest.Mock).mockReset();
    (SecureStore.deleteItemAsync as jest.Mock).mockReset();
  });

  test('on 401, calls /auth/refresh and retries the original request', async () => {
    setAccessToken('expired');
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('refresh-1');

    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'unauth' }), { status: 401 }))
    );
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        new Response(JSON.stringify({ accessToken: 'new-access', refreshToken: 'refresh-2' }), { status: 200 })
      )
    );
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    );

    const data = await apiClient.get<{ ok: boolean }>('/home');
    expect(data.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [, retryInit] = fetchMock.mock.calls[2];
    const headers = (retryInit as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer new-access');
  });

  test('singleflight: 3 concurrent 401s share ONE refresh call', async () => {
    setAccessToken('expired');
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('refresh-1');

    let refreshCalls = 0;
    fetchMock.mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes('/auth/refresh')) {
        refreshCalls += 1;
        return Promise.resolve(
          new Response(JSON.stringify({ accessToken: 'new', refreshToken: 'rt2' }), { status: 200 })
        );
      }
      const callsForUrl = fetchMock.mock.calls.filter((c) => c[0] === url).length;
      if (callsForUrl === 1) {
        return Promise.resolve(new Response('', { status: 401 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ url: urlStr }), { status: 200 }));
    });

    await Promise.all([apiClient.get('/a'), apiClient.get('/b'), apiClient.get('/c')]);
    expect(refreshCalls).toBe(1);
  });

  test('does not retry more than once if 401 persists', async () => {
    setAccessToken('expired');
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('refresh-1');
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/auth/refresh')) {
        return Promise.resolve(new Response('', { status: 401 }));
      }
      return Promise.resolve(new Response('', { status: 401 }));
    });

    await expect(apiClient.get('/home')).rejects.toThrow();
    // 1 original 401 + 1 refresh attempt that also 401s = 2 total.
    // No retry of /home because refresh failed.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('clears refresh token if refresh fails with 401', async () => {
    setAccessToken('expired');
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('refresh-1');
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/auth/refresh')) {
        return Promise.resolve(new Response('', { status: 401 }));
      }
      return Promise.resolve(new Response('', { status: 401 }));
    });

    await expect(apiClient.get('/home')).rejects.toThrow();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('hbs_refresh');
  });
});
