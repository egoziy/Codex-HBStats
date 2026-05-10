import { GET } from '../route';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { signAccessToken } from '@/lib/jwt';
import type { HomePayload } from '@shared/types/mobile-api';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-at-least-32-bytes-long-xx';
});

function mkReq(token?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest('http://localhost/api/mobile/v1/home', { headers });
}

describe('GET /api/mobile/v1/home — HomePayload contract', () => {
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `home-test-${Date.now()}@test.local`,
        name: 'Home Tester',
        password: await hashPassword('x'),
        isActive: true,
      },
    });
    userId = user.id;
    accessToken = signAccessToken(userId);
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  test('anonymous request returns 200 with user=null', async () => {
    const res = await GET(mkReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as HomePayload;
    expect(body.user).toBeNull();
  });

  test('authenticated request returns 200 with user populated', async () => {
    const res = await GET(mkReq(accessToken));
    expect(res.status).toBe(200);
    const body = (await res.json()) as HomePayload;
    expect(body.user?.id).toBe(userId);
  });

  test('response shape matches HomePayload contract', async () => {
    const res = await GET(mkReq(accessToken));
    const body = (await res.json()) as HomePayload;

    expect(body).toHaveProperty('user');
    expect(body).toHaveProperty('favoriteTeam');
    expect(body).toHaveProperty('nextMatch');
    expect(body).toHaveProperty('lastMatch');
    expect(body).toHaveProperty('compactStandings');
    expect(body).toHaveProperty('liveStrip');
    expect(body).toHaveProperty('newsStrip');

    expect(Array.isArray(body.compactStandings)).toBe(true);
    expect(Array.isArray(body.liveStrip)).toBe(true);
    expect(Array.isArray(body.newsStrip)).toBe(true);

    expect(body.newsStrip.length).toBeLessThanOrEqual(4);
  });
});
