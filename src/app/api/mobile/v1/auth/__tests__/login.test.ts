import { POST } from '../login/route';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import type { LoginRequest, LoginResponse, ApiError } from '@shared/types/mobile-api';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-at-least-32-bytes-long-xx';
});

function mkReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/mobile/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/mobile/v1/auth/login', () => {
  let testEmail: string;
  let testUserId: string;

  beforeAll(async () => {
    testEmail = `login-test-${Date.now()}@test.local`;
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        name: 'Login Tester',
        password: await hashPassword('CorrectPassword123'),
        isActive: true,
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId: testUserId } });
    await prisma.user.delete({ where: { id: testUserId } });
  });

  test('returns 200 with access + refresh + user on valid credentials', async () => {
    const req: LoginRequest = { email: testEmail, password: 'CorrectPassword123' };
    const res = await POST(mkReq(req));
    expect(res.status).toBe(200);
    const body = (await res.json()) as LoginResponse;
    expect(typeof body.accessToken).toBe('string');
    expect(body.accessToken.split('.')).toHaveLength(3);
    expect(typeof body.refreshToken).toBe('string');
    expect(body.refreshToken.length).toBeGreaterThanOrEqual(64);
    expect(body.user.email).toBe(testEmail);
    expect((body.user as unknown as { password?: string }).password).toBeUndefined();
  });

  test('creates a Session row with familyId === session id on first login', async () => {
    const req: LoginRequest = { email: testEmail, password: 'CorrectPassword123' };
    await POST(mkReq(req));
    const sessions = await prisma.session.findMany({ where: { userId: testUserId } });
    const latest = sessions[sessions.length - 1];
    expect(latest.familyId).toBe(latest.id);
    expect(latest.replacedAt).toBeNull();
  });

  test('returns 401 on wrong password', async () => {
    const req: LoginRequest = { email: testEmail, password: 'WrongPassword' };
    const res = await POST(mkReq(req));
    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiError;
    expect(body.error).toBeDefined();
  });

  test('returns 401 on non-existent email (does not leak which one is wrong)', async () => {
    const req: LoginRequest = { email: 'nobody@nowhere.tld', password: 'whatever' };
    const res = await POST(mkReq(req));
    expect(res.status).toBe(401);
  });

  test('returns 400 on missing email or password', async () => {
    const res1 = await POST(mkReq({ email: 'a@b.c' }));
    expect(res1.status).toBe(400);
    const res2 = await POST(mkReq({ password: 'x' }));
    expect(res2.status).toBe(400);
    const res3 = await POST(mkReq({}));
    expect(res3.status).toBe(400);
  });
});
