import { NextRequest, NextResponse } from 'next/server';

import { DISPLAY_MODE_COOKIE } from '@/lib/display-mode';

export async function POST(request: NextRequest) {
  await request.json().catch(() => ({}));
  const mode = 'premier';

  const response = NextResponse.json({ success: true, mode });
  response.cookies.set(DISPLAY_MODE_COOKIE, mode, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}
