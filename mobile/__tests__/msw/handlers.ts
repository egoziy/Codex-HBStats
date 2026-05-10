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
