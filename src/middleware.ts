import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory rate limiter for public endpoints
const publicRateMap = new Map<string, { count: number; resetAt: number }>();
const PUBLIC_RATE_LIMIT = 30; // requests per window
const PUBLIC_RATE_WINDOW_MS = 10_000; // 10 seconds

function checkPublicRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = publicRateMap.get(ip);
  if (!record || now > record.resetAt) {
    publicRateMap.set(ip, { count: 1, resetAt: now + PUBLIC_RATE_WINDOW_MS });
    return true;
  }
  record.count++;
  return record.count <= PUBLIC_RATE_LIMIT;
}

/**
 * Next.js Middleware — CSRF protection + rate limiting
 */
export function middleware(request: NextRequest) {
  const method = request.method.toUpperCase();
  const pathname = request.nextUrl.pathname;

  // Rate limit public API endpoints (GET)
  if (method === 'GET' && pathname.startsWith('/api/') && !pathname.startsWith('/api/admin/')) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
    if (!checkPublicRateLimit(ip)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }
  }

  // CSRF: only check mutating requests
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return NextResponse.next();
  }

  // Validate CSRF via Origin/Referer
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const source = origin || (referer ? extractOrigin(referer) : null);

  // No origin = likely same-origin or server-side request
  if (!source) {
    return NextResponse.next();
  }

  const host = request.headers.get('host') || 'localhost';
  const allowedOrigins = [
    `http://${host}`,
    `https://${host}`,
    'http://localhost:8011',
    'http://127.0.0.1:8011',
    'http://localhost:3000',
    process.env.NEXT_PUBLIC_APP_URL,
  ].filter(Boolean);

  if (allowedOrigins.some((allowed) => source.startsWith(allowed!))) {
    return NextResponse.next();
  }

  return NextResponse.json(
    { error: 'CSRF validation failed' },
    { status: 403 }
  );
}

function extractOrigin(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return null;
  }
}

export const config = {
  matcher: ['/api/:path*'],
};
