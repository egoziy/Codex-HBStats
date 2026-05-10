import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { signAccessToken } from '@/lib/jwt';
import { getCachedResponse, setCachedResponse } from '@/lib/refresh-cache';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import type { RefreshRequest, RefreshResponse } from '@shared/types/mobile-api';

const REFRESH_TTL_DAYS = 60;

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function createRawRefreshToken() {
  return crypto.randomBytes(32).toString('hex');
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: Partial<RefreshRequest>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const refreshToken = body?.refreshToken;
  if (!refreshToken || typeof refreshToken !== 'string') {
    return NextResponse.json({ error: 'refreshToken is required' }, { status: 400 });
  }

  // Per-IP rate limit on refresh
  const ip = getClientIp(request);
  if (!checkRateLimit(`refresh:ip:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many refresh attempts.' }, { status: 429 });
  }

  const tokenHash = sha256(refreshToken);

  // 1. Idempotency: same input within 30s → same output
  const cached = getCachedResponse(tokenHash);
  if (cached) {
    const payload: RefreshResponse = {
      accessToken: cached.accessToken,
      refreshToken: cached.refreshToken,
    };
    return NextResponse.json(payload, { status: 200 });
  }

  const session = await prisma.session.findUnique({ where: { tokenHash } });
  if (!session || session.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Invalid refresh token' }, { status: 401 });
  }

  // 2. Reuse detection: token already replaced → family compromised
  if (session.replacedAt) {
    await prisma.session.deleteMany({ where: { familyId: session.familyId } });
    return NextResponse.json({ error: 'Refresh token reuse detected' }, { status: 401 });
  }

  // 3. Rotate: create new session, mark old as replaced
  const newRaw = createRawRefreshToken();
  const newExpiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
  const newSession = await prisma.session.create({
    data: {
      userId: session.userId,
      tokenHash: sha256(newRaw),
      expiresAt: newExpiresAt,
      familyId: session.familyId,
    },
  });

  await prisma.session.update({
    where: { id: session.id },
    data: { replacedAt: new Date(), replacedBy: newSession.id },
  });

  const accessToken = signAccessToken(session.userId);
  setCachedResponse(tokenHash, accessToken, newRaw);

  const payload: RefreshResponse = { accessToken, refreshToken: newRaw };
  return NextResponse.json(payload, { status: 200 });
}
