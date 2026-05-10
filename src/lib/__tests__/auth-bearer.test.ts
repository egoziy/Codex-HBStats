import { NextRequest } from 'next/server';
import { getRequestUser } from '../auth';
import { signAccessToken } from '../jwt';
import prisma from '../prisma';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-at-least-32-bytes-long-xx';
});

describe('getRequestUser with Bearer header', () => {
  let userId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `bearer-test-${Date.now()}@test.local`,
        name: 'Bearer Tester',
        password: 'unused',
        isActive: true,
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
  });

  test('returns user when Authorization: Bearer <jwt> is valid', async () => {
    const token = signAccessToken(userId);
    const req = new NextRequest('http://localhost/test', {
      headers: { authorization: `Bearer ${token}` },
    });
    const user = await getRequestUser(req);
    expect(user?.id).toBe(userId);
  });

  test('returns null when Authorization header is missing', async () => {
    const req = new NextRequest('http://localhost/test');
    const user = await getRequestUser(req);
    expect(user).toBeNull();
  });

  test('returns null when Bearer token is malformed', async () => {
    const req = new NextRequest('http://localhost/test', {
      headers: { authorization: 'Bearer not-a-jwt' },
    });
    const user = await getRequestUser(req);
    expect(user).toBeNull();
  });

  test('returns null when Bearer token is for a non-existent user', async () => {
    const token = signAccessToken('non-existent-user-id');
    const req = new NextRequest('http://localhost/test', {
      headers: { authorization: `Bearer ${token}` },
    });
    const user = await getRequestUser(req);
    expect(user).toBeNull();
  });
});
