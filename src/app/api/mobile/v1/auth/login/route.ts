import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth';
import { signAccessToken } from '@/lib/jwt';
import type { LoginRequest, LoginResponse } from '@shared/types/mobile-api';

const REFRESH_TTL_DAYS = 60;

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function createRawRefreshToken() {
  return crypto.randomBytes(32).toString('hex');
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: Partial<LoginRequest>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (
    !body.email ||
    !body.password ||
    typeof body.email !== 'string' ||
    typeof body.password !== 'string'
  ) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: body.email.toLowerCase() },
  });
  if (!user || !user.isActive) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const passwordValid = await verifyPassword(body.password, user.password);
  if (!passwordValid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  // Create refresh-token session
  const rawRefresh = createRawRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: sha256(rawRefresh),
      expiresAt,
      familyId: '__placeholder__',
    },
  });
  // Set familyId = session.id (single login = own family)
  await prisma.session.update({
    where: { id: session.id },
    data: { familyId: session.id },
  });

  const accessToken = signAccessToken(user.id);

  const payload: LoginResponse = {
    accessToken,
    refreshToken: rawRefresh,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as 'USER' | 'ADMIN',
      avatarUrl: user.avatarUrl,
    },
  };
  return NextResponse.json(payload, { status: 200 });
}
