import { POST as logoutPOST } from '../logout/route';
import { POST as logoutAllPOST } from '../logout-all/route';
import { POST as loginPOST } from '../login/route';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import type { LoginResponse } from '@shared/types/mobile-api';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-at-least-32-bytes-long-xx';
});

async function loginAs(email: string, password: string): Promise<LoginResponse> {
  const req = new NextRequest('http://localhost/api/mobile/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const res = await loginPOST(req);
  return (await res.json()) as LoginResponse;
}

describe('logout endpoints', () => {
  let userId: string;
  let email: string;
  const password = 'LogoutTest123';

  beforeEach(async () => {
    email = `logout-test-${Date.now()}-${Math.random()}@test.local`;
    const user = await prisma.user.create({
      data: { email, name: 'Logout Tester', password: await hashPassword(password), isActive: true },
    });
    userId = user.id;

    // Reset rate limiter — logout tests call loginAs() which hits the login rate limit
    const { _resetRateLimitForTests } = await import('@/lib/rate-limit');
    _resetRateLimitForTests();
  });

  afterEach(async () => {
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  test('POST /logout with refreshToken in body deletes only that session', async () => {
    const device1 = await loginAs(email, password);
    const device2 = await loginAs(email, password);
    expect(await prisma.session.count({ where: { userId } })).toBe(2);

    const req = new NextRequest('http://localhost/api/mobile/v1/auth/logout', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${device1.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ refreshToken: device1.refreshToken }),
    });
    const res = await logoutPOST(req);
    expect(res.status).toBe(204);

    expect(await prisma.session.count({ where: { userId } })).toBe(1);
  });

  test('POST /logout returns 401 without auth', async () => {
    const req = new NextRequest('http://localhost/api/mobile/v1/auth/logout', { method: 'POST' });
    const res = await logoutPOST(req);
    expect(res.status).toBe(401);
  });

  test('POST /logout-all deletes ALL sessions for the user', async () => {
    await loginAs(email, password);
    await loginAs(email, password);
    const third = await loginAs(email, password);

    expect(await prisma.session.count({ where: { userId } })).toBe(3);

    const req = new NextRequest('http://localhost/api/mobile/v1/auth/logout-all', {
      method: 'POST',
      headers: { authorization: `Bearer ${third.accessToken}` },
    });
    const res = await logoutAllPOST(req);
    expect(res.status).toBe(204);

    expect(await prisma.session.count({ where: { userId } })).toBe(0);
  });

  test('POST /logout-all returns 401 without auth', async () => {
    const req = new NextRequest('http://localhost/api/mobile/v1/auth/logout-all', { method: 'POST' });
    const res = await logoutAllPOST(req);
    expect(res.status).toBe(401);
  });
});
