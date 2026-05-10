import { setAccessToken } from '../auth';
import { apiClient } from '../apiClient';

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
