// In-memory idempotency cache for /auth/refresh.
// Keyed by sha256(refreshToken), stores { accessToken, refreshToken, expiresAt }.
// TTL: 30 seconds. Survives concurrent retries from network failures
// without triggering reuse detection.

interface CachedResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

const cache = new Map<string, CachedResponse>();
const TTL_MS = 30_000;

export function getCachedResponse(tokenHash: string): CachedResponse | null {
  const entry = cache.get(tokenHash);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(tokenHash);
    return null;
  }
  return entry;
}

export function setCachedResponse(tokenHash: string, accessToken: string, refreshToken: string) {
  cache.set(tokenHash, { accessToken, refreshToken, expiresAt: Date.now() + TTL_MS });
}

// Test-only hook
export function _clearIdempotencyCacheForTests() {
  cache.clear();
}
