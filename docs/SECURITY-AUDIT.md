# HBStats — Security Audit Report

**Date:** 2026-04-08
**Auditor:** Claude Sonnet 4.6 (automated code review)
**Scope:** Full application code review — authentication, authorization, input validation, data exposure, DoS, configuration

---

## Summary

| Severity | Count | Key Findings |
|----------|-------|--------------|
| **CRITICAL** | 1 | First-user admin race condition |
| **HIGH** | 4 | No session invalidation on password change, No CSRF, No file upload limits, No login brute-force protection |
| **MEDIUM** | 7 | Open registration, Error exposure, No rate limiting, No security headers, Path traversal risk, Concurrent scrapes |
| **LOW** | 4 | No session cleanup, Unused dependencies, No auth middleware, Broad version ranges |
| **INFO** | 6 | Positive findings (strong tokens, no SQLi, no XSS, etc.) |

---

## CRITICAL

### 1. First-User Admin Registration Race Condition
- **Location:** `src/app/api/auth/route.ts` lines 41-48
- **Description:** Registration grants ADMIN role when `usersCount === 0`. After DB wipe or new deployment, first registrant becomes admin.
- **Impact:** Attacker gains full admin access after any reset.
- **Fix:**
  ```typescript
  // Add to .env
  REGISTRATION_ENABLED=false
  ADMIN_SETUP_TOKEN=your-secret-token
  
  // In registration handler
  if (!process.env.REGISTRATION_ENABLED && !body.setupToken === process.env.ADMIN_SETUP_TOKEN) {
    return NextResponse.json({ error: 'Registration disabled' }, { status: 403 });
  }
  ```

---

## HIGH

### 2. No Session Invalidation on Password Change
- **Location:** `src/lib/auth.ts` lines 142-152
- **Description:** `changeUserPassword()` updates password but does not delete existing sessions.
- **Impact:** Compromised sessions remain valid after password change.
- **Fix:**
  ```typescript
  async function changeUserPassword(userId, newPassword, currentSessionId) {
    await prisma.session.deleteMany({ 
      where: { userId, id: { not: currentSessionId } } 
    });
    // ... update password
  }
  ```

### 3. No CSRF Protection
- **Location:** All POST/PUT/DELETE API routes
- **Description:** No CSRF tokens or Origin header validation. `sameSite: 'lax'` provides partial protection but is not complete.
- **Impact:** Cross-site request forgery on admin operations.
- **Fix:**
  ```typescript
  // In API routes or middleware
  function validateOrigin(request: NextRequest) {
    const origin = request.headers.get('origin');
    const allowed = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:8011';
    if (origin && !origin.startsWith(allowed)) {
      throw new Error('CSRF: invalid origin');
    }
  }
  ```

### 4. No File Upload Size Limit
- **Location:** `src/app/api/media/route.ts`
- **Description:** No file size validation. MIME type check trusts client-provided Content-Type.
- **Impact:** DoS via large file uploads. Non-image files with spoofed MIME type.
- **Fix:**
  ```typescript
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large' }, { status: 413 });
  }
  // Validate magic bytes, not just MIME type
  ```

### 5. No Login Brute-Force Protection
- **Location:** `src/app/api/auth/route.ts` lines 63-75
- **Description:** Unlimited login attempts allowed.
- **Impact:** Password brute-forcing.
- **Fix:**
  ```typescript
  // Use in-memory rate limiter or Redis
  const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
  const MAX_ATTEMPTS = 5;
  const WINDOW_MS = 60000; // 1 minute
  
  function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const record = loginAttempts.get(ip);
    if (!record || now - record.lastAttempt > WINDOW_MS) {
      loginAttempts.set(ip, { count: 1, lastAttempt: now });
      return true;
    }
    record.count++;
    record.lastAttempt = now;
    return record.count <= MAX_ATTEMPTS;
  }
  ```

---

## MEDIUM

### 6. Open Registration With No Controls
- **Location:** `src/app/api/auth/route.ts` lines 24-60
- **Description:** Anyone can register unlimited accounts.
- **Fix:** Add registration toggle, email verification, or CAPTCHA.

### 7. Error Messages Expose Internal Details
- **Location:** Multiple API routes (`details: error.message`)
- **Description:** Prisma errors expose table names, column names, constraints.
- **Fix:**
  ```typescript
  // Replace in all catch blocks
  catch (error: any) {
    console.error('API Error:', error); // Server-side log
    return NextResponse.json(
      { error: 'Operation failed' }, // Generic client message
      { status: 500 }
    );
  }
  ```

### 8. No Rate Limiting on Public Endpoints
- **Location:** `/api/search`, `/api/home/live`, `/api/mobile/*`
- **Description:** Search runs 4 parallel DB queries per request.
- **Fix:** Add rate limiting middleware (e.g., `@upstash/ratelimit`).

### 9. No Security Headers
- **Location:** `next.config.js`
- **Fix:**
  ```javascript
  // next.config.js
  module.exports = {
    async headers() {
      return [{
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      }];
    },
  };
  ```

### 10. Potential Path Traversal in File Uploads
- **Location:** `src/lib/media-storage.ts`
- **Description:** File paths constructed from user input (team names) via `slugify()`.
- **Fix:** Validate resolved path starts with expected base directory.

### 11. Scrape Endpoint Concurrency
- **Location:** `src/app/api/admin/scrape/route.ts`
- **Description:** Multiple concurrent `scrape-all` operations possible.
- **Fix:** Add server-side lock/semaphore.

### 12. Mobile Preferences GET Without Explicit Auth
- **Location:** `src/app/api/mobile/preferences/route.ts`
- **Description:** GET handler returns data without verifying user auth.
- **Fix:** Verify no user-specific data is exposed.

---

## LOW

### 13. No Expired Session Cleanup
- **Fix:** Add periodic cleanup: `prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })`

### 14. Unused Dependencies
- **Location:** `package.json`
- **Packages:** `jsonwebtoken`, `next-auth`, `i18next` (4 packages)
- **Fix:** Remove unused dependencies.

### 15. No Next.js Auth Middleware
- **Fix:** Add `src/middleware.ts` to enforce auth on `/api/admin/*`.

### 16. Broad Version Ranges
- **Fix:** Commit `package-lock.json`, consider pinning critical deps.

---

## POSITIVE FINDINGS

| Area | Finding |
|------|---------|
| **Session Tokens** | `crypto.randomBytes(32)` + SHA-256 hash — excellent |
| **SQL Injection** | No raw SQL anywhere — Prisma parameterized queries only |
| **XSS** | No `dangerouslySetInnerHTML` — React auto-escaping |
| **Password Storage** | bcryptjs with cost factor 12 |
| **Password Exposure** | `toSafeUser()` strips password from all responses |
| **Environment** | `.env` properly gitignored |
| **API-Football** | Proper rate limiting with exponential backoff |

---

## TOP 5 PRIORITIES

1. **Add CSRF protection** — Origin header validation on all mutating endpoints
2. **Add login rate limiting** — IP-based throttling or account lockout
3. **Fix first-user admin race** — Registration toggle + transaction locking
4. **Invalidate sessions on password change** — Delete other sessions
5. **Add security headers** — CSP, HSTS, X-Frame-Options in next.config.js

---

## REMEDIATION PLAN

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| P0 | CSRF protection (Origin validation) | 1 hour | Prevents cross-site attacks |
| P0 | Login rate limiting | 2 hours | Prevents brute-force |
| P1 | First-user admin fix | 1 hour | Prevents privilege escalation |
| P1 | Session invalidation on password change | 30 min | Prevents session hijacking persistence |
| P1 | Security headers | 30 min | Defense in depth |
| P2 | File upload validation | 1 hour | Prevents DoS + upload abuse |
| P2 | Error message sanitization | 1 hour | Prevents information disclosure |
| P2 | Registration controls | 2 hours | Prevents account spam |
| P3 | Rate limiting middleware | 2 hours | Prevents API DoS |
| P3 | Session cleanup cron | 30 min | Database hygiene |
| P3 | Remove unused deps | 30 min | Reduced attack surface |
