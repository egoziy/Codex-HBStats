import type { NextRequest } from 'next/server';

/**
 * Validates that the request Origin matches the expected host.
 * Blocks cross-origin POST/PUT/DELETE requests (CSRF protection).
 */
export function validateCsrf(request: NextRequest): { valid: boolean; error?: string } {
  const method = request.method.toUpperCase();

  // Only check mutating requests
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return { valid: true };
  }

  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  // If no Origin header, check Referer
  const source = origin || (referer ? new URL(referer).origin : null);

  // Allow requests with no Origin/Referer (same-origin requests from non-browser clients)
  if (!source) {
    return { valid: true };
  }

  // Get allowed origins
  const host = request.headers.get('host') || 'localhost';
  const allowedOrigins = [
    `http://${host}`,
    `https://${host}`,
    'http://localhost:8011',
    'http://127.0.0.1:8011',
    process.env.NEXT_PUBLIC_APP_URL,
  ].filter(Boolean);

  if (allowedOrigins.some((allowed) => source.startsWith(allowed!))) {
    return { valid: true };
  }

  return { valid: false, error: `CSRF: origin ${source} not allowed` };
}
