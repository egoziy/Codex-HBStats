import crypto from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import type { NextRequest } from 'next/server';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'hbs_session';
const SESSION_TTL_DAYS = 14;

export type SafeUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl: string | null;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function createRawSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

export async function createSession(userId: string) {
  const rawToken = createRawSessionToken();
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  cookies().set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    path: '/',
  });
}

export async function destroySession(rawToken?: string | null) {
  const token = rawToken || cookies().get(SESSION_COOKIE)?.value;

  if (token) {
    await prisma.session.deleteMany({
      where: {
        tokenHash: sha256(token),
      },
    });
  }

  cookies().delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const rawToken = cookies().get(SESSION_COOKIE)?.value;

  if (!rawToken) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: {
      tokenHash: sha256(rawToken),
    },
    include: {
      user: true,
    },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt < new Date() || !session.user.isActive) {
    return null;
  }

  return toSafeUser(session.user);
}

export async function getRequestUser(request: NextRequest) {
  const rawToken = request.cookies.get(SESSION_COOKIE)?.value;

  if (!rawToken) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: {
      tokenHash: sha256(rawToken),
    },
    include: {
      user: true,
    },
  });

  if (!session || session.expiresAt < new Date() || !session.user.isActive) {
    return null;
  }

  return toSafeUser(session.user);
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return user;
}

export async function requireAdminUser() {
  const user = await requireUser();

  if (user.role !== UserRole.ADMIN) {
    redirect('/');
  }

  return user;
}

export async function changeUserPassword(userId: string, nextPassword: string) {
  const password = await hashPassword(nextPassword);

  // Invalidate all existing sessions for this user
  await prisma.session.deleteMany({ where: { userId } });

  await prisma.user.update({
    where: { id: userId },
    data: {
      password,
      passwordChangedAt: new Date(),
    },
  });

  // Create a fresh session for the current user
  await createSession(userId);
}

export function toSafeUser(user: {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
  } satisfies SafeUser;
}
