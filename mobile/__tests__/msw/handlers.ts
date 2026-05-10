import { http, HttpResponse } from 'msw';

export const handlers = [
  http.post('http://localhost:8011/api/mobile/v1/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    if (body.email === 'good@test.tld' && body.password === 'GoodPass') {
      return HttpResponse.json({
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        user: { id: 'u1', email: 'good@test.tld', name: 'Good', role: 'USER', avatarUrl: null },
      });
    }
    return HttpResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }),
];

export const refreshHandlers = [
  http.get('http://localhost:8011/api/mobile/v1/home', ({ request }) => {
    const auth = request.headers.get('authorization');
    if (auth === 'Bearer fresh-access') {
      return HttpResponse.json({ liveStrip: [], compactStandings: [] });
    }
    return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }),
  http.post('http://localhost:8011/api/mobile/v1/auth/refresh', async ({ request }) => {
    const body = (await request.json()) as { refreshToken: string };
    if (body.refreshToken === 'old-refresh') {
      return HttpResponse.json({ accessToken: 'fresh-access', refreshToken: 'new-refresh' });
    }
    return HttpResponse.json({ error: 'Invalid' }, { status: 401 });
  }),
];
