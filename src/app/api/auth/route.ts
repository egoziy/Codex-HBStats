import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  changeUserPassword,
  createSession,
  destroySession,
  getRequestUser,
  hashPassword,
  toSafeUser,
  verifyPassword,
} from '@/lib/auth';
import { logActivity } from '@/lib/activity';

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  return NextResponse.json({ user });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const action = body?.action;

  if (action === 'register') {
    const email = String(body.email || '').trim().toLowerCase();
    const name = String(body.name || '').trim();
    const password = String(body.password || '');

    if (!email || !name || password.length < 8) {
      return NextResponse.json(
        { error: 'יש למלא שם, אימייל וסיסמה באורך 8 תווים לפחות.' },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'האימייל כבר רשום במערכת.' }, { status: 409 });
    }

    const usersCount = await prisma.user.count();

    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: await hashPassword(password),
        role: usersCount === 0 ? UserRole.ADMIN : UserRole.USER,
      },
    });

    await createSession(user.id);
    await logActivity({
      entityType: 'USER',
      entityId: user.id,
      actionHe: `משתמש חדש נרשם: ${user.name}${user.role === UserRole.ADMIN ? ' (אדמין ראשון)' : ''}`,
      userId: user.id,
    });

    return NextResponse.json({ user: toSafeUser(user) });
  }

  if (action === 'login') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.password))) {
      return NextResponse.json({ error: 'אימייל או סיסמה שגויים.' }, { status: 401 });
    }

    await createSession(user.id);

    return NextResponse.json({ user: toSafeUser(user) });
  }

  if (action === 'logout') {
    await destroySession();
    return NextResponse.json({ success: true });
  }

  if (action === 'change-password') {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'יש להתחבר כדי לשנות סיסמה.' }, { status: 401 });
    }

    const currentPassword = String(body.currentPassword || '');
    const nextPassword = String(body.nextPassword || '');

    if (nextPassword.length < 8) {
      return NextResponse.json(
        { error: 'הסיסמה החדשה חייבת להיות באורך 8 תווים לפחות.' },
        { status: 400 }
      );
    }

    const fullUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!fullUser || !(await verifyPassword(currentPassword, fullUser.password))) {
      return NextResponse.json({ error: 'הסיסמה הנוכחית אינה נכונה.' }, { status: 401 });
    }

    await changeUserPassword(user.id, nextPassword);
    await logActivity({
      entityType: 'USER',
      entityId: user.id,
      actionHe: `המשתמש ${user.name} שינה סיסמה`,
      userId: user.id,
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'פעולה לא נתמכת.' }, { status: 400 });
}
