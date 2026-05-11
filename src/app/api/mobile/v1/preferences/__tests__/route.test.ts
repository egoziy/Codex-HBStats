import { GET, PUT } from '../route';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { signAccessToken } from '@/lib/jwt';
import type { PreferencesPayload } from '@shared/types/mobile-api';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-at-least-32-bytes-long-xx';
});

describe('/api/mobile/v1/preferences contract', () => {
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `prefs-test-${Date.now()}@test.local`,
        name: 'Prefs Tester',
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

  test('GET returns 401 without Bearer', async () => {
    const req = new NextRequest('http://localhost/api/mobile/v1/preferences');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  test('GET with Bearer returns PreferencesPayload', async () => {
    const req = new NextRequest('http://localhost/api/mobile/v1/preferences', {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as PreferencesPayload;
    expect(Array.isArray(body.favoriteTeamApiIds)).toBe(true);
    expect(Array.isArray(body.favoriteCompetitionApiIds)).toBe(true);
  });

  test('PUT with Bearer updates preferences', async () => {
    const req = new NextRequest('http://localhost/api/mobile/v1/preferences', {
      method: 'PUT',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ favoriteTeamApiIds: [1, 2], favoriteCompetitionApiIds: [10] }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as PreferencesPayload;
    expect(body.favoriteTeamApiIds).toContain(1);
    expect(body.favoriteCompetitionApiIds).toContain(10);
  });
});
