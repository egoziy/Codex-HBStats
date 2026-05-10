import { POST as refreshPOST } from '../refresh/route';
import { POST as loginPOST } from '../login/route';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import type { LoginResponse, RefreshResponse } from '@shared/types/mobile-api';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-at-least-32-bytes-long-xx';
});

function mkLoginReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/mobile/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mkRefreshReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/mobile/v1/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function loginAndGetTokens(email: string, password: string): Promise<LoginResponse> {
  const res = await loginPOST(mkLoginReq({ email, password }));
  return (await res.json()) as LoginResponse;
}

describe('POST /api/mobile/v1/auth/refresh', () => {
  let userId: string;
  const password = 'TestPass123';
  let email: string;

  beforeEach(async () => {
    email = `refresh-test-${Date.now()}-${Math.random()}@test.local`;
    const user = await prisma.user.create({
      data: {
        email,
        name: 'Refresh Tester',
        password: await hashPassword(password),
        isActive: true,
      },
    });
    userId = user.id;

    // Clear idempotency cache between tests
    const { _clearIdempotencyCacheForTests } = await import('@/lib/refresh-cache');
    _clearIdempotencyCacheForTests();

    // Reset rate limiter between tests
    const { _resetRateLimitForTests } = await import('@/lib/rate-limit');
    _resetRateLimitForTests();
  });

  afterEach(async () => {
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  test('returns new access + new refresh on valid refresh', async () => {
    const { refreshToken: oldRefresh } = await loginAndGetTokens(email, password);
    const res = await refreshPOST(mkRefreshReq({ refreshToken: oldRefresh }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as RefreshResponse;
    expect(body.accessToken.split('.')).toHaveLength(3);
    expect(body.refreshToken).not.toBe(oldRefresh);
    expect(body.refreshToken.length).toBeGreaterThanOrEqual(64);
  });

  test('marks the old session replaced and chains familyId', async () => {
    const { refreshToken: oldRefresh } = await loginAndGetTokens(email, password);
    const oldSessions = await prisma.session.findMany({ where: { userId } });
    const oldSession = oldSessions[0];

    await refreshPOST(mkRefreshReq({ refreshToken: oldRefresh }));

    const updated = await prisma.session.findUnique({ where: { id: oldSession.id } });
    expect(updated?.replacedAt).not.toBeNull();
    expect(updated?.replacedBy).not.toBeNull();

    const newSessionId = updated!.replacedBy!;
    const newSession = await prisma.session.findUnique({ where: { id: newSessionId } });
    expect(newSession?.familyId).toBe(oldSession.familyId);
  });

  test('reuse detection: using a replaced refresh token kills the entire family', async () => {
    const { refreshToken: oldRefresh } = await loginAndGetTokens(email, password);
    // Legit user rotates once
    await refreshPOST(mkRefreshReq({ refreshToken: oldRefresh }));

    // Clear idempotency cache so the next call hits the DB path, not cache
    const { _clearIdempotencyCacheForTests } = await import('@/lib/refresh-cache');
    _clearIdempotencyCacheForTests();

    // Attacker tries to use the replaced token
    const res = await refreshPOST(mkRefreshReq({ refreshToken: oldRefresh }));
    expect(res.status).toBe(401);

    // Family must be deleted
    const remaining = await prisma.session.findMany({ where: { userId } });
    expect(remaining).toHaveLength(0);
  });

  test('idempotency: same refresh token within 30s returns same response', async () => {
    const { refreshToken } = await loginAndGetTokens(email, password);
    const res1 = await refreshPOST(mkRefreshReq({ refreshToken }));
    const body1 = (await res1.json()) as RefreshResponse;

    const res2 = await refreshPOST(mkRefreshReq({ refreshToken }));
    const body2 = (await res2.json()) as RefreshResponse;

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(body2.refreshToken).toBe(body1.refreshToken); // cached, not re-rotated
  });

  test('returns 401 for unknown refresh token', async () => {
    const res = await refreshPOST(mkRefreshReq({ refreshToken: 'a'.repeat(64) }));
    expect(res.status).toBe(401);
  });

  test('returns 400 for missing refresh token', async () => {
    const res = await refreshPOST(mkRefreshReq({}));
    expect(res.status).toBe(400);
  });
});
