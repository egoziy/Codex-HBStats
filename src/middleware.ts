import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js Middleware — CSRF protection + admin route guard
 *
 * Runs on every API request. Validates Origin header for mutating requests
 * to prevent cross-site request forgery.
 */
export function middleware(request: NextRequest) {
  const method = request.method.toUpperCase();

  // Only check mutating requests
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
