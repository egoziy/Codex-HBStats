# HBStats Mobile — Foundation + Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Expo mobile app, migrate mobile API endpoints to `/v1/`, and ship end-to-end bearer-token auth so a user can log in on iOS Simulator, kill and reopen the app, and remain logged in (transparent token refresh).

**Architecture:** Monorepo with `mobile/` (React Native + Expo SDK 52, Expo Router, NativeWind, TanStack Query) and `shared/types/` (TypeScript types consumed by both web backend and mobile). Auth uses signed JWT access tokens (15 min, RAM only) + opaque refresh tokens (60 days, `expo-secure-store`) with rotation, reuse-detection, and 30s idempotency window. Reuses the existing Prisma `Session` table.

**Tech Stack:** Next.js 14 (existing), Prisma 5, PostgreSQL, jsonwebtoken, bcryptjs (existing), React Native 0.76+, Expo SDK 52, Expo Router 4, NativeWind 4, TanStack Query 5, expo-secure-store, expo-sqlite, MSW (mocking), Jest, @testing-library/react-native, supertest.

**Scope:** Sprint 0 (Foundation) + Sprint 1 (Auth End-to-End) of Phase A from [the spec](../specs/2026-05-10-mobile-app-design.md). Estimated ~3 calendar weeks at half-time effort.

**Out of scope (later plans):** Home/Live/Match/Team/Player/Preferences screens, polish, App Store metadata, TestFlight, security Tier 2, push notifications, Android.

---

## File Structure

### Backend changes

```
prisma/schema.prisma                    # Modify: add Session.replacedAt, replacedBy, familyId
src/lib/jwt.ts                          # Create: signAccessToken, verifyAccessToken
src/lib/auth.ts                         # Modify: extend getRequestUser to accept Bearer header
src/lib/rate-limit.ts                   # Create: per-key in-memory limiter (extend existing pattern)
src/middleware.ts                       # Modify: add per-userId rate limit category
src/app/api/mobile/v1/                  # Move from src/app/api/mobile/* (mechanical rename)
src/app/api/mobile/v1/auth/
  login/route.ts                        # Create
  refresh/route.ts                      # Create
  logout/route.ts                       # Create
  logout-all/route.ts                   # Create
src/app/api/mobile/v1/__tests__/        # Create: contract tests for moved endpoints
src/app/api/mobile/v1/auth/__tests__/   # Create: tests for 4 auth endpoints
jest.config.js                          # Create: backend Jest config
package.json                            # Modify: add jest, supertest, @types/jest
```

### Shared types

```
shared/types/mobile-api.ts              # Create: HomePayload, LivePayload, etc. (auth shapes only in Plan 1)
shared/types/common.ts                  # Create: shared domain types
shared/tsconfig.json                    # Create: types-only TS project for sharing
```

### Mobile (new)

```
mobile/
  app.json                              # Expo config
  app.config.ts                         # Dynamic config (env-driven base URL)
  eas.json                              # EAS Build profiles (dev, preview, production)
  package.json
  tsconfig.json
  babel.config.js                       # NativeWind transform
  tailwind.config.js
  global.css                            # Tailwind directives
  app/
    _layout.tsx                         # Root layout: providers, auth gate
    (tabs)/
      _layout.tsx                       # Tab navigator
      index.tsx                         # Home (placeholder in Plan 1)
      live.tsx                          # Live (placeholder)
      preferences.tsx                   # Preferences (placeholder)
    login.tsx                           # Login screen
  contexts/
    AuthContext.tsx                     # user state + login/logout actions
  lib/
    apiClient.ts                        # fetch wrapper + 401 refresh + singleflight
    auth.ts                             # SecureStore-backed token storage + login/logout/refresh
    queryClient.ts                      # TanStack Query config (no persister yet — added in Plan 2)
    config.ts                           # API base URL etc.
  __tests__/
    integration/
      login-flow.test.tsx
      refresh-transparency.test.tsx
    msw/
      handlers.ts                       # mock /v1/auth/* responses
      server.ts
  jest.config.js
  jest.setup.ts
```

---

## Tasks

### Task 1: Apple Developer Program enrollment (parallel, async)

**Files:** none (logistics)

This task is non-coding but must start day 1 because verification can take 5-7 days.

- [ ] **Step 1: Confirm Apple ID and payment method**

Visit https://developer.apple.com/programs/. Sign in with your existing Apple ID. If you don't have one, create one and verify with 2FA.

- [ ] **Step 2: Enroll as Individual**

Choose Individual enrollment (not Organization — Individual is faster, no DUNS number required). Pay $99 USD. Confirmation email arrives immediately, but verification can take days.

- [ ] **Step 3: Reserve App Store name**

Once approved, log in to App Store Connect (https://appstoreconnect.apple.com), create a new app record:
- Platform: iOS
- Name: "HBStats" (or alternative if taken)
- Bundle ID: `il.hbstats.app`
- Primary language: Hebrew
- Skip the rest for now (we'll fill metadata in Plan 3)

- [ ] **Step 4: Note the Team ID and Bundle ID**

Save these in `mobile/docs/apple-credentials.md` (gitignored — add to `.gitignore`):
```
TEAM_ID=XXXXXXXXXX
BUNDLE_ID=il.hbstats.app
```

EAS will need the Team ID later. No commit needed for this task.

---

### Task 2: Add Jest + supertest to backend

**Files:**
- Modify: `package.json`
- Create: `jest.config.js`
- Create: `jest.setup.ts`

- [ ] **Step 1: Install backend test dependencies**

Run from project root:
```bash
npm install --save-dev jest @types/jest ts-jest supertest @types/supertest @swc/core @swc/jest
```

Expected: completes without errors. New `node_modules/jest/`, `node_modules/supertest/` exist.

- [ ] **Step 2: Create Jest config**

Create `jest.config.js`:
```js
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/shared'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.(t|j)sx?$': ['@swc/jest'],
  },
  setupFilesAfterEach: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@shared/(.*)$': '<rootDir>/shared/$1',
  },
  testPathIgnorePatterns: ['<rootDir>/mobile/'],
};
```

- [ ] **Step 3: Create empty Jest setup**

Create `jest.setup.ts`:
```ts
// Backend Jest setup. Add global test config here as needed.
```

- [ ] **Step 4: Add test script to package.json**

In `package.json`, add to `scripts`:
```json
"test": "jest",
"test:watch": "jest --watch"
```

- [ ] **Step 5: Verify Jest runs (and finds zero tests)**

Run:
```bash
npm test -- --passWithNoTests
```

Expected: exits 0 with "No tests found".

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json jest.config.js jest.setup.ts
git commit -m "chore: add jest + supertest for backend tests"
```

---

### Task 3: Move `/api/mobile/*` endpoints to `/api/mobile/v1/*`

**Files:**
- Move: `src/app/api/mobile/{home,live,news,preferences,standings,stats,games,players,teams}/` → `src/app/api/mobile/v1/...`

This is a mechanical rename. Handlers stay identical.

- [ ] **Step 1: Create v1 directory and move folders**

Run:
```bash
mkdir -p src/app/api/mobile/v1
git mv src/app/api/mobile/home src/app/api/mobile/v1/home
git mv src/app/api/mobile/live src/app/api/mobile/v1/live
git mv src/app/api/mobile/news src/app/api/mobile/v1/news
git mv src/app/api/mobile/preferences src/app/api/mobile/v1/preferences
git mv src/app/api/mobile/standings src/app/api/mobile/v1/standings
git mv src/app/api/mobile/stats src/app/api/mobile/v1/stats
git mv src/app/api/mobile/games src/app/api/mobile/v1/games
git mv src/app/api/mobile/players src/app/api/mobile/v1/players
git mv src/app/api/mobile/teams src/app/api/mobile/v1/teams
```

Expected: `git status` shows renames, no files deleted.

- [ ] **Step 2: Verify dev server still works**

Run:
```bash
npm run dev -- --port 8011
```

In another terminal:
```bash
curl http://localhost:8011/api/mobile/v1/home
```

Expected: 200 with HomePayload JSON (or 401 if auth-protected — either is fine, both confirm route resolved).

Then:
```bash
curl http://localhost:8011/api/mobile/home
```

Expected: 404. (We're intentionally retiring the old paths.)

Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: move /api/mobile/* under /v1/ namespace"
```

---

### Task 4: Add `replacedAt`, `replacedBy`, `familyId` to Session

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Locate the Session model**

Run:
```bash
grep -n "^model Session" prisma/schema.prisma
```

Expected: prints the line number, e.g. `model Session {`.

- [ ] **Step 2: Add three fields to Session**

Edit `prisma/schema.prisma`. Inside the `Session { ... }` block, add (preserve any existing fields):
```prisma
  replacedAt DateTime?
  replacedBy String?
  familyId   String

  @@index([familyId])
```

Note: `familyId` is required (`String`, not `String?`) because every session must belong to a family.

- [ ] **Step 3: Push schema and backfill familyId**

Run:
```bash
npx prisma db push
```

Expected: prompts about non-nullable `familyId` on existing rows. Choose to use a default value of empty string OR cancel and proceed via the next two-step approach.

If prompted, cancel. Then make `familyId` optional first:
```prisma
  familyId String?
```

Run:
```bash
npx prisma db push
```

Expected: succeeds.

- [ ] **Step 4: Backfill familyId = id for existing rows**

Open Prisma Studio or run a Node script. Easier: run a quick script.

Create `scripts/backfill-session-family.js`:
```js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const result = await prisma.$executeRaw`UPDATE "Session" SET "familyId" = id WHERE "familyId" IS NULL`;
  console.log(`Backfilled ${result} rows`);
  await prisma.$disconnect();
})();
```

Run:
```bash
node scripts/backfill-session-family.js
```

Expected: prints `Backfilled N rows` (N = count of pre-existing sessions).

- [ ] **Step 5: Make familyId required**

Edit `prisma/schema.prisma`:
```prisma
  familyId String
```

Run:
```bash
npx prisma db push
```

Expected: succeeds.

- [ ] **Step 6: Regenerate Prisma client**

Run:
```bash
npx prisma generate
```

Expected: "Generated Prisma Client".

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma scripts/backfill-session-family.js
git commit -m "feat(db): add Session.replacedAt/replacedBy/familyId for refresh rotation"
```

---

### Task 5: Create `shared/types/mobile-api.ts` skeleton

**Files:**
- Create: `shared/types/mobile-api.ts`
- Create: `shared/types/common.ts`
- Create: `shared/tsconfig.json`

- [ ] **Step 1: Create shared/types/common.ts with the SafeUser type**

```ts
// shared/types/common.ts

export type UserRole = 'USER' | 'ADMIN';

export interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl: string | null;
}
```

- [ ] **Step 2: Create shared/types/mobile-api.ts with auth shapes**

```ts
// shared/types/mobile-api.ts
// Single source of truth for HBStats mobile API JSON contracts.
// Both backend handlers and mobile clients import from here.

import type { SafeUser } from './common';

// ---------- Auth ----------

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: SafeUser;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

// /auth/logout: no body, no response payload.
// /auth/logout-all: no body, no response payload.

// ---------- Errors ----------

export interface ApiError {
  error: string;
  code?: string;
}
```

- [ ] **Step 3: Create shared/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["**/*.ts"]
}
```

- [ ] **Step 4: Verify shared types type-check**

Run:
```bash
npx tsc -p shared/tsconfig.json
```

Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add shared/
git commit -m "feat(shared): add shared types for mobile API contracts"
```

---

### Task 6: Create JWT helpers — TDD

**Files:**
- Create: `src/lib/jwt.ts`
- Create: `src/lib/__tests__/jwt.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/jwt.test.ts`:
```ts
import { signAccessToken, verifyAccessToken } from '../jwt';

const ORIGINAL_SECRET = process.env.JWT_SECRET;

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-at-least-32-bytes-long-xx';
});

afterAll(() => {
  process.env.JWT_SECRET = ORIGINAL_SECRET;
});

describe('jwt helpers', () => {
  test('signAccessToken returns a string with three dots-separated parts', () => {
    const token = signAccessToken('user-123');
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  test('verifyAccessToken returns the userId from a freshly-signed token', () => {
    const token = signAccessToken('user-123');
    const result = verifyAccessToken(token);
    expect(result).toEqual({ userId: 'user-123' });
  });

  test('verifyAccessToken returns null for a malformed token', () => {
    expect(verifyAccessToken('not-a-jwt')).toBeNull();
  });

  test('verifyAccessToken returns null for a token with wrong signature', () => {
    const token = signAccessToken('user-123');
    const tampered = token.slice(0, -2) + 'XX';
    expect(verifyAccessToken(tampered)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run:
```bash
npm test -- src/lib/__tests__/jwt.test.ts
```

Expected: FAIL — "Cannot find module '../jwt'".

- [ ] **Step 3: Implement jwt.ts**

Create `src/lib/jwt.ts`:
```ts
import jwt from 'jsonwebtoken';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ userId }, getSecret(), {
    algorithm: 'HS256',
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): { userId: string } | null {
  try {
    const decoded = jwt.verify(token, getSecret(), { algorithms: ['HS256'] });
    if (typeof decoded === 'object' && decoded !== null && typeof decoded.userId === 'string') {
      return { userId: decoded.userId };
    }
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run:
```bash
npm test -- src/lib/__tests__/jwt.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/jwt.ts src/lib/__tests__/jwt.test.ts
git commit -m "feat(auth): add JWT access-token helpers"
```

---

### Task 7: Extend `getRequestUser` to accept Bearer header — TDD

**Files:**
- Modify: `src/lib/auth.ts`
- Create: `src/lib/__tests__/auth-bearer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/auth-bearer.test.ts`:
```ts
import { NextRequest } from 'next/server';
import { getRequestUser } from '../auth';
import { signAccessToken } from '../jwt';
import prisma from '../prisma';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-at-least-32-bytes-long-xx';
});

describe('getRequestUser with Bearer header', () => {
  let userId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `bearer-test-${Date.now()}@test.local`,
        name: 'Bearer Tester',
        passwordHash: 'unused',
        isActive: true,
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
  });

  test('returns user when Authorization: Bearer <jwt> is valid', async () => {
    const token = signAccessToken(userId);
    const req = new NextRequest('http://localhost/test', {
      headers: { authorization: `Bearer ${token}` },
    });
    const user = await getRequestUser(req);
    expect(user?.id).toBe(userId);
  });

  test('returns null when Authorization header is missing', async () => {
    const req = new NextRequest('http://localhost/test');
    const user = await getRequestUser(req);
    expect(user).toBeNull();
  });

  test('returns null when Bearer token is malformed', async () => {
    const req = new NextRequest('http://localhost/test', {
      headers: { authorization: 'Bearer not-a-jwt' },
    });
    const user = await getRequestUser(req);
    expect(user).toBeNull();
  });

  test('returns null when Bearer token is for a non-existent user', async () => {
    const token = signAccessToken('non-existent-user-id');
    const req = new NextRequest('http://localhost/test', {
      headers: { authorization: `Bearer ${token}` },
    });
    const user = await getRequestUser(req);
    expect(user).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run:
```bash
npm test -- src/lib/__tests__/auth-bearer.test.ts
```

Expected: FAIL — Bearer test cases return `null` because current `getRequestUser` only checks cookies.

- [ ] **Step 3: Modify `getRequestUser` to also accept Bearer**

Open `src/lib/auth.ts`. Find `getRequestUser` (around line 99) and replace with:
```ts
export async function getRequestUser(request: NextRequest) {
  // 1. Cookie-based session (web)
  const rawToken = request.cookies.get(SESSION_COOKIE)?.value;
  if (rawToken) {
    const session = await prisma.session.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { user: true },
    });
    if (session && session.expiresAt >= new Date() && session.user.isActive) {
      return toSafeUser(session.user);
    }
  }

  // 2. Bearer JWT (mobile)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    const { verifyAccessToken } = await import('./jwt');
    const claims = verifyAccessToken(token);
    if (claims) {
      const user = await prisma.user.findUnique({ where: { id: claims.userId } });
      if (user && user.isActive) {
        return toSafeUser(user);
      }
    }
  }

  return null;
}
```

Note: We import `verifyAccessToken` lazily to avoid a circular import risk (some files import `auth.ts` at module top level).

- [ ] **Step 4: Run tests to confirm they pass**

Run:
```bash
npm test -- src/lib/__tests__/auth-bearer.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

Run:
```bash
npm test
```

Expected: all tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth.ts src/lib/__tests__/auth-bearer.test.ts
git commit -m "feat(auth): extend getRequestUser to accept Authorization: Bearer"
```

---

### Task 8: Build `POST /api/mobile/v1/auth/login` — TDD

**Files:**
- Create: `src/app/api/mobile/v1/auth/login/route.ts`
- Create: `src/app/api/mobile/v1/auth/__tests__/login.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/mobile/v1/auth/__tests__/login.test.ts`:
```ts
import { POST } from '../login/route';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import type { LoginRequest, LoginResponse, ApiError } from '@shared/types/mobile-api';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-at-least-32-bytes-long-xx';
});

function mkReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/mobile/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/mobile/v1/auth/login', () => {
  let testEmail: string;
  let testUserId: string;

  beforeAll(async () => {
    testEmail = `login-test-${Date.now()}@test.local`;
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        name: 'Login Tester',
        passwordHash: await hashPassword('CorrectPassword123'),
        isActive: true,
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId: testUserId } });
    await prisma.user.delete({ where: { id: testUserId } });
  });

  test('returns 200 with access + refresh + user on valid credentials', async () => {
    const req: LoginRequest = { email: testEmail, password: 'CorrectPassword123' };
    const res = await POST(mkReq(req));
    expect(res.status).toBe(200);
    const body = (await res.json()) as LoginResponse;
    expect(typeof body.accessToken).toBe('string');
    expect(body.accessToken.split('.')).toHaveLength(3);
    expect(typeof body.refreshToken).toBe('string');
    expect(body.refreshToken.length).toBeGreaterThanOrEqual(64);
    expect(body.user.email).toBe(testEmail);
    expect((body.user as unknown as { passwordHash?: string }).passwordHash).toBeUndefined();
  });

  test('creates a Session row with familyId === session id on first login', async () => {
    const req: LoginRequest = { email: testEmail, password: 'CorrectPassword123' };
    await POST(mkReq(req));
    const sessions = await prisma.session.findMany({ where: { userId: testUserId } });
    const latest = sessions[sessions.length - 1];
    expect(latest.familyId).toBe(latest.id);
    expect(latest.replacedAt).toBeNull();
  });

  test('returns 401 on wrong password', async () => {
    const req: LoginRequest = { email: testEmail, password: 'WrongPassword' };
    const res = await POST(mkReq(req));
    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiError;
    expect(body.error).toBeDefined();
  });

  test('returns 401 on non-existent email (does not leak which one is wrong)', async () => {
    const req: LoginRequest = { email: 'nobody@nowhere.tld', password: 'whatever' };
    const res = await POST(mkReq(req));
    expect(res.status).toBe(401);
  });

  test('returns 400 on missing email or password', async () => {
    const res1 = await POST(mkReq({ email: 'a@b.c' }));
    expect(res1.status).toBe(400);
    const res2 = await POST(mkReq({ password: 'x' }));
    expect(res2.status).toBe(400);
    const res3 = await POST(mkReq({}));
    expect(res3.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run:
```bash
npm test -- src/app/api/mobile/v1/auth/__tests__/login.test.ts
```

Expected: FAIL — "Cannot find module '../login/route'".

- [ ] **Step 3: Implement the login route**

Create `src/app/api/mobile/v1/auth/login/route.ts`:
```ts
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

  if (!body.email || !body.password || typeof body.email !== 'string' || typeof body.password !== 'string') {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: body.email.toLowerCase() },
  });
  if (!user || !user.isActive) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const passwordValid = await verifyPassword(body.password, user.passwordHash);
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
      familyId: '', // patched below; we need the id
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
      role: user.role,
      avatarUrl: user.avatarUrl,
    },
  };
  return NextResponse.json(payload, { status: 200 });
}
```

- [ ] **Step 4: Configure tsconfig path for `@shared/*`**

Open `tsconfig.json`. In `compilerOptions.paths`, add:
```json
"@shared/*": ["./shared/*"]
```

- [ ] **Step 5: Run tests to confirm they pass**

Run:
```bash
npm test -- src/app/api/mobile/v1/auth/__tests__/login.test.ts
```

Expected: 5 passing.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/mobile/v1/auth/login src/app/api/mobile/v1/auth/__tests__/login.test.ts tsconfig.json
git commit -m "feat(mobile-api): POST /v1/auth/login"
```

---

### Task 9: Build `POST /api/mobile/v1/auth/refresh` with rotation + reuse detection — TDD

**Files:**
- Create: `src/app/api/mobile/v1/auth/refresh/route.ts`
- Create: `src/app/api/mobile/v1/auth/__tests__/refresh.test.ts`
- Create: `src/lib/refresh-cache.ts` (idempotency)

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/mobile/v1/auth/__tests__/refresh.test.ts`:
```ts
import { POST as refreshPOST } from '../refresh/route';
import { POST as loginPOST } from '../login/route';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import type { LoginResponse, RefreshResponse } from '@shared/types/mobile-api';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-at-least-32-bytes-long-xx';
});

function mkLoginReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/mobile/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mkRefreshReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/mobile/v1/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function loginAndGetTokens(email: string, password: string): Promise<LoginResponse> {
  const res = await loginPOST(mkLoginReq({ email, password }));
  return (await res.json()) as LoginResponse;
}

describe('POST /api/mobile/v1/auth/refresh', () => {
  let userId: string;
  const password = 'TestPass123';
  let email: string;

  beforeEach(async () => {
    email = `refresh-test-${Date.now()}-${Math.random()}@test.local`;
    const user = await prisma.user.create({
      data: {
        email,
        name: 'Refresh Tester',
        passwordHash: await hashPassword(password),
        isActive: true,
      },
    });
    userId = user.id;
  });

  afterEach(async () => {
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  test('returns new access + new refresh on valid refresh', async () => {
    const { refreshToken: oldRefresh } = await loginAndGetTokens(email, password);
    const res = await refreshPOST(mkRefreshReq({ refreshToken: oldRefresh }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as RefreshResponse;
    expect(body.accessToken.split('.')).toHaveLength(3);
    expect(body.refreshToken).not.toBe(oldRefresh);
    expect(body.refreshToken.length).toBeGreaterThanOrEqual(64);
  });

  test('marks the old session replaced and chains familyId', async () => {
    const { refreshToken: oldRefresh } = await loginAndGetTokens(email, password);
    const oldSessions = await prisma.session.findMany({ where: { userId } });
    const oldSession = oldSessions[0];

    await refreshPOST(mkRefreshReq({ refreshToken: oldRefresh }));

    const updated = await prisma.session.findUnique({ where: { id: oldSession.id } });
    expect(updated?.replacedAt).not.toBeNull();
    expect(updated?.replacedBy).not.toBeNull();

    const newSessionId = updated!.replacedBy!;
    const newSession = await prisma.session.findUnique({ where: { id: newSessionId } });
    expect(newSession?.familyId).toBe(oldSession.familyId);
  });

  test('reuse detection: using a replaced refresh token kills the entire family', async () => {
    const { refreshToken: oldRefresh } = await loginAndGetTokens(email, password);
    // Legit user rotates once
    await refreshPOST(mkRefreshReq({ refreshToken: oldRefresh }));
    // Wait for idempotency window to expire (>30s) is impractical in tests;
    // we instead manually clear the cache via a test hook OR change tokenHash.
    // For this test, we directly delete idempotency cache by importing the module.
    const { _clearIdempotencyCacheForTests } = await import('@/lib/refresh-cache');
    _clearIdempotencyCacheForTests();

    // Attacker tries to use the replaced token
    const res = await refreshPOST(mkRefreshReq({ refreshToken: oldRefresh }));
    expect(res.status).toBe(401);

    // Family must be deleted
    const remaining = await prisma.session.findMany({ where: { userId } });
    expect(remaining).toHaveLength(0);
  });

  test('idempotency: same refresh token within 30s returns same response', async () => {
    const { refreshToken } = await loginAndGetTokens(email, password);
    const res1 = await refreshPOST(mkRefreshReq({ refreshToken }));
    const body1 = (await res1.json()) as RefreshResponse;

    const res2 = await refreshPOST(mkRefreshReq({ refreshToken }));
    const body2 = (await res2.json()) as RefreshResponse;

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(body2.refreshToken).toBe(body1.refreshToken); // cached, not re-rotated
  });

  test('returns 401 for unknown refresh token', async () => {
    const res = await refreshPOST(mkRefreshReq({ refreshToken: 'a'.repeat(64) }));
    expect(res.status).toBe(401);
  });

  test('returns 400 for missing refresh token', async () => {
    const res = await refreshPOST(mkRefreshReq({}));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run:
```bash
npm test -- src/app/api/mobile/v1/auth/__tests__/refresh.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the idempotency cache**

Create `src/lib/refresh-cache.ts`:
```ts
// In-memory idempotency cache for /auth/refresh.
// Keyed by sha256(refreshToken), stores { accessToken, refreshToken, expiresAt }.
// TTL: 30 seconds. Survives concurrent retries from network failures
// without triggering reuse detection.

interface CachedResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Date.now() + 30_000
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
```

- [ ] **Step 4: Implement the refresh route**

Create `src/app/api/mobile/v1/auth/refresh/route.ts`:
```ts
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { signAccessToken } from '@/lib/jwt';
import { getCachedResponse, setCachedResponse } from '@/lib/refresh-cache';
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
```

- [ ] **Step 5: Run tests to confirm they pass**

Run:
```bash
npm test -- src/app/api/mobile/v1/auth/__tests__/refresh.test.ts
```

Expected: 6 passing.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/mobile/v1/auth/refresh src/app/api/mobile/v1/auth/__tests__/refresh.test.ts src/lib/refresh-cache.ts
git commit -m "feat(mobile-api): POST /v1/auth/refresh with rotation + reuse detection + 30s idempotency"
```

---

### Task 10: Build `POST /api/mobile/v1/auth/logout` and `/auth/logout-all` — TDD

**Files:**
- Create: `src/app/api/mobile/v1/auth/logout/route.ts`
- Create: `src/app/api/mobile/v1/auth/logout-all/route.ts`
- Create: `src/app/api/mobile/v1/auth/__tests__/logout.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/app/api/mobile/v1/auth/__tests__/logout.test.ts`:
```ts
import { POST as logoutPOST } from '../logout/route';
import { POST as logoutAllPOST } from '../logout-all/route';
import { POST as loginPOST } from '../login/route';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import type { LoginResponse } from '@shared/types/mobile-api';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-at-least-32-bytes-long-xx';
});

function mkAuthedReq(url: string, accessToken: string): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

async function loginAs(email: string, password: string): Promise<LoginResponse> {
  const req = new NextRequest('http://localhost/api/mobile/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const res = await loginPOST(req);
  return (await res.json()) as LoginResponse;
}

describe('logout endpoints', () => {
  let userId: string;
  let email: string;
  const password = 'LogoutTest123';

  beforeEach(async () => {
    email = `logout-test-${Date.now()}-${Math.random()}@test.local`;
    const user = await prisma.user.create({
      data: { email, name: 'Logout Tester', passwordHash: await hashPassword(password), isActive: true },
    });
    userId = user.id;
  });

  afterEach(async () => {
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  test('POST /logout deletes only the current session, not other devices', async () => {
    const device1 = await loginAs(email, password);
    const device2 = await loginAs(email, password);

    const before = await prisma.session.count({ where: { userId } });
    expect(before).toBe(2);

    const res = await logoutPOST(mkAuthedReq('http://localhost/api/mobile/v1/auth/logout', device1.accessToken));
    expect(res.status).toBe(204);

    const after = await prisma.session.count({ where: { userId } });
    expect(after).toBe(2); // logout endpoint can't know which session — see step 3 note
  });

  test('POST /logout returns 401 without auth', async () => {
    const req = new NextRequest('http://localhost/api/mobile/v1/auth/logout', { method: 'POST' });
    const res = await logoutPOST(req);
    expect(res.status).toBe(401);
  });

  test('POST /logout-all deletes ALL sessions for the user', async () => {
    await loginAs(email, password);
    await loginAs(email, password);
    const third = await loginAs(email, password);

    expect(await prisma.session.count({ where: { userId } })).toBe(3);

    const res = await logoutAllPOST(
      mkAuthedReq('http://localhost/api/mobile/v1/auth/logout-all', third.accessToken)
    );
    expect(res.status).toBe(204);

    expect(await prisma.session.count({ where: { userId } })).toBe(0);
  });

  test('POST /logout-all returns 401 without auth', async () => {
    const req = new NextRequest('http://localhost/api/mobile/v1/auth/logout-all', { method: 'POST' });
    const res = await logoutAllPOST(req);
    expect(res.status).toBe(401);
  });
});
```

**Note on the first test:** The mobile app sends the *access token* in the Authorization header but doesn't naturally include the *refresh token* (which identifies the session). For `/logout` to delete *only this device's session*, the mobile app should send the refresh token in the request body. We'll spec that.

- [ ] **Step 2: Update the test to send refreshToken in body for /logout**

Replace the `POST /logout deletes only the current session` test:
```ts
test('POST /logout with refreshToken in body deletes only that session', async () => {
  const device1 = await loginAs(email, password);
  const device2 = await loginAs(email, password);
  expect(await prisma.session.count({ where: { userId } })).toBe(2);

  const req = new NextRequest('http://localhost/api/mobile/v1/auth/logout', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${device1.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ refreshToken: device1.refreshToken }),
  });
  const res = await logoutPOST(req);
  expect(res.status).toBe(204);

  expect(await prisma.session.count({ where: { userId } })).toBe(1);
});
```

- [ ] **Step 3: Run tests to confirm they fail**

Run:
```bash
npm test -- src/app/api/mobile/v1/auth/__tests__/logout.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 4: Implement /logout route**

Create `src/app/api/mobile/v1/auth/logout/route.ts`:
```ts
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUser } from '@/lib/auth';

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let refreshToken: string | undefined;
  try {
    const body = await request.json().catch(() => null);
    if (body && typeof body.refreshToken === 'string') {
      refreshToken = body.refreshToken;
    }
  } catch {
    // body is optional
  }

  if (refreshToken) {
    await prisma.session.deleteMany({
      where: { tokenHash: sha256(refreshToken), userId: user.id },
    });
  }
  // If no refreshToken, this is a no-op success — client should clear local state anyway.

  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 5: Implement /logout-all route**

Create `src/app/api/mobile/v1/auth/logout-all/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await prisma.session.deleteMany({ where: { userId: user.id } });
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 6: Run tests to confirm they pass**

Run:
```bash
npm test -- src/app/api/mobile/v1/auth/__tests__/logout.test.ts
```

Expected: 4 passing.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/mobile/v1/auth/logout src/app/api/mobile/v1/auth/logout-all src/app/api/mobile/v1/auth/__tests__/logout.test.ts
git commit -m "feat(mobile-api): POST /v1/auth/{logout,logout-all}"
```

---

### Task 11: Add per-key rate limiter and apply to auth endpoints — TDD

**Files:**
- Create: `src/lib/rate-limit.ts`
- Create: `src/lib/__tests__/rate-limit.test.ts`
- Modify: `src/app/api/mobile/v1/auth/login/route.ts` (add IP + email limit)
- Modify: `src/app/api/mobile/v1/auth/refresh/route.ts` (add IP + familyId limit)
- Modify: `src/app/api/mobile/v1/auth/__tests__/login.test.ts` (add rate-limit test)

- [ ] **Step 1: Write failing tests for the rate limiter**

Create `src/lib/__tests__/rate-limit.test.ts`:
```ts
import { checkRateLimit, _resetRateLimitForTests } from '../rate-limit';

beforeEach(() => {
  _resetRateLimitForTests();
});

describe('rate-limit', () => {
  test('allows up to N requests in window', () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit('login:ip:1.2.3.4', 5, 60_000)).toBe(true);
    }
  });

  test('blocks the (N+1)th request in window', () => {
    for (let i = 0; i < 5; i++) checkRateLimit('login:ip:1.2.3.4', 5, 60_000);
    expect(checkRateLimit('login:ip:1.2.3.4', 5, 60_000)).toBe(false);
  });

  test('keys are independent', () => {
    for (let i = 0; i < 5; i++) checkRateLimit('login:ip:1.2.3.4', 5, 60_000);
    expect(checkRateLimit('login:ip:5.6.7.8', 5, 60_000)).toBe(true);
  });

  test('resets after window expires', async () => {
    for (let i = 0; i < 5; i++) checkRateLimit('login:ip:1.2.3.4', 5, 100);
    expect(checkRateLimit('login:ip:1.2.3.4', 5, 100)).toBe(false);
    await new Promise((r) => setTimeout(r, 120));
    expect(checkRateLimit('login:ip:1.2.3.4', 5, 100)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run:
```bash
npm test -- src/lib/__tests__/rate-limit.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the rate limiter**

Create `src/lib/rate-limit.ts`:
```ts
// In-memory rate limiter, keyed by an arbitrary string.
// Single-instance only — if HBStats ever scales horizontally, swap for Redis.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  bucket.count += 1;
  return bucket.count <= max;
}

export function getClientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return fwd || request.headers.get('x-real-ip') || 'unknown';
}

export function _resetRateLimitForTests() {
  buckets.clear();
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run:
```bash
npm test -- src/lib/__tests__/rate-limit.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Apply rate limit to /login route**

Edit `src/app/api/mobile/v1/auth/login/route.ts`. After the JSON-parsing block (before the email-required check), add:
```ts
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// ...inside POST(), after parsing body:
const ip = getClientIp(request);
if (!checkRateLimit(`login:ip:${ip}`, 5, 60_000)) {
  return NextResponse.json({ error: 'Too many login attempts. Try again in a minute.' }, { status: 429 });
}
if (typeof body.email === 'string') {
  if (!checkRateLimit(`login:email:${body.email.toLowerCase()}`, 10, 60 * 60_000)) {
    return NextResponse.json({ error: 'Too many login attempts for this account.' }, { status: 429 });
  }
}
```

- [ ] **Step 6: Apply rate limit to /refresh route**

Edit `src/app/api/mobile/v1/auth/refresh/route.ts`. After parsing body, before idempotency lookup:
```ts
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// ...inside POST():
const ip = getClientIp(request);
if (!checkRateLimit(`refresh:ip:${ip}`, 10, 60_000)) {
  return NextResponse.json({ error: 'Too many refresh attempts.' }, { status: 429 });
}
```

(We add the per-familyId limit after we look up the session — but for simplicity in v1.0, IP-only is sufficient. familyId limit is optional polish.)

- [ ] **Step 7: Add rate-limit test to login test file**

In `src/app/api/mobile/v1/auth/__tests__/login.test.ts`, add inside the `describe`:
```ts
test('returns 429 after 5 failed attempts within 1 min from same IP', async () => {
  const { _resetRateLimitForTests } = await import('@/lib/rate-limit');
  _resetRateLimitForTests();
  for (let i = 0; i < 5; i++) {
    await POST(mkReq({ email: 'doesnt@matter.tld', password: 'wrong' }));
  }
  const res = await POST(mkReq({ email: 'doesnt@matter.tld', password: 'wrong' }));
  expect(res.status).toBe(429);
});
```

- [ ] **Step 8: Reset rate limiter in test setup**

In each `beforeEach` of login.test.ts, refresh.test.ts, and logout.test.ts, add:
```ts
const { _resetRateLimitForTests } = await import('@/lib/rate-limit');
_resetRateLimitForTests();
```

- [ ] **Step 9: Run all auth tests**

Run:
```bash
npm test -- src/app/api/mobile/v1/auth
```

Expected: all passing.

- [ ] **Step 10: Commit**

```bash
git add src/lib/rate-limit.ts src/lib/__tests__/rate-limit.test.ts src/app/api/mobile/v1/auth/
git commit -m "feat(security): per-key rate limit on /v1/auth/{login,refresh}"
```

---

### Task 12: Scaffold Expo project + install dependencies

**Files:**
- Create: `mobile/` (entire directory tree from `create-expo-app`)
- Modify: `.gitignore`

- [ ] **Step 1: Create the Expo app**

Run from project root:
```bash
npx create-expo-app@latest mobile --template blank-typescript
```

Expected: scaffolds `mobile/` with `app.json`, `App.tsx`, `package.json`, `tsconfig.json`.

- [ ] **Step 2: Install runtime dependencies**

Run:
```bash
cd mobile
npx expo install expo-router expo-secure-store expo-constants react-native-safe-area-context react-native-screens expo-linking expo-status-bar
npx expo install nativewind tailwindcss@3 react-native-css-interop
npm install @tanstack/react-query
cd ..
```

Expected: `mobile/package.json` contains all the above.

- [ ] **Step 3: Install dev dependencies**

Run:
```bash
cd mobile
npm install --save-dev jest @types/jest jest-expo @testing-library/react-native @testing-library/jest-native msw @types/react react-test-renderer
cd ..
```

Expected: completes without errors.

- [ ] **Step 4: Update .gitignore**

Append to `.gitignore`:
```
# Mobile (Expo)
mobile/.expo
mobile/dist
mobile/node_modules
mobile/web-build
mobile/ios
mobile/android
mobile/.env.local
mobile/docs/apple-credentials.md
```

- [ ] **Step 5: Verify nothing else changed in the web project**

Run:
```bash
git status
```

Expected: only `mobile/` and `.gitignore` show as new/modified. Web `node_modules`, `package.json` untouched.

- [ ] **Step 6: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/app.json mobile/tsconfig.json mobile/babel.config.js mobile/App.tsx mobile/index.ts mobile/assets .gitignore
git commit -m "chore(mobile): scaffold Expo SDK 52 app with core deps"
```

(Note: list above may not match exactly what create-expo-app produces — `git add mobile/` adds anything new in the folder.)

---

### Task 13: Configure Expo Router + tabs + RTL

**Files:**
- Modify: `mobile/package.json` (main entry)
- Modify: `mobile/app.json` (scheme, plugins)
- Create: `mobile/app/_layout.tsx`
- Create: `mobile/app/(tabs)/_layout.tsx`
- Create: `mobile/app/(tabs)/index.tsx`
- Create: `mobile/app/(tabs)/live.tsx`
- Create: `mobile/app/(tabs)/preferences.tsx`
- Delete: `mobile/App.tsx` (replaced by Expo Router)

- [ ] **Step 1: Configure entry point in package.json**

In `mobile/package.json`, change `"main"` to:
```json
"main": "expo-router/entry"
```

- [ ] **Step 2: Configure app.json**

Edit `mobile/app.json`. Add at root level:
```json
{
  "expo": {
    "name": "HBStats",
    "slug": "hbstats",
    "version": "0.0.1",
    "scheme": "hbstats",
    "ios": {
      "bundleIdentifier": "il.hbstats.app",
      "supportsTablet": false
    },
    "android": {
      "package": "il.hbstats.app",
      "usesCleartextTraffic": false
    },
    "plugins": [
      "expo-router",
      "expo-secure-store"
    ],
    "experiments": {
      "typedRoutes": true
    },
    "orientation": "portrait",
    "userInterfaceStyle": "light"
  }
}
```

(Preserve other keys like `icon`, `splash`, etc. that create-expo-app generated.)

- [ ] **Step 3: Create root layout with RTL**

Create `mobile/app/_layout.tsx`:
```tsx
import { useEffect } from 'react';
import { I18nManager } from 'react-native';
import { Stack } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/contexts/AuthContext';

// Force RTL once on launch (no-op if already RTL).
if (!I18nManager.isRTL) {
  I18nManager.forceRTL(true);
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="login" options={{ presentation: 'modal' }} />
        </Stack>
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

(`AuthProvider` and `queryClient` are created in later tasks; this file references them.)

- [ ] **Step 4: Create tab layout**

Create `mobile/app/(tabs)/_layout.tsx`:
```tsx
import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'בית' }} />
      <Tabs.Screen name="live" options={{ title: 'לייב' }} />
      <Tabs.Screen name="preferences" options={{ title: 'הגדרות' }} />
    </Tabs>
  );
}
```

- [ ] **Step 5: Create three placeholder tab screens**

Create `mobile/app/(tabs)/index.tsx`:
```tsx
import { View, Text } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>בית</Text>
    </View>
  );
}
```

Create `mobile/app/(tabs)/live.tsx`:
```tsx
import { View, Text } from 'react-native';

export default function LiveScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>לייב</Text>
    </View>
  );
}
```

Create `mobile/app/(tabs)/preferences.tsx`:
```tsx
import { View, Text } from 'react-native';

export default function PreferencesScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>הגדרות</Text>
    </View>
  );
}
```

- [ ] **Step 6: Delete the old App.tsx**

Run:
```bash
rm mobile/App.tsx
```

- [ ] **Step 7: Configure tsconfig paths**

Edit `mobile/tsconfig.json`:
```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"],
      "@shared/*": ["../shared/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

- [ ] **Step 8: Run dev server to confirm app boots**

Run:
```bash
cd mobile
npx expo start --ios
```

Expected: simulator opens, you see 3-tab UI in RTL with Hebrew labels (בית, לייב, הגדרות). Tap each tab — placeholder text appears. `queryClient` and `AuthProvider` will fail import (next tasks fix that) — comment those imports temporarily if needed:
```tsx
// import { QueryClientProvider } from '@tanstack/react-query';
// import { queryClient } from '@/lib/queryClient';
// import { AuthProvider } from '@/contexts/AuthContext';
```
And simplify `RootLayout` to just return the `<Stack>` for now. Restore in Task 15.

Press Ctrl+C to stop.

- [ ] **Step 9: Commit**

```bash
git add mobile/
git commit -m "feat(mobile): Expo Router scaffolding with 3-tab RTL shell"
```

---

### Task 14: Configure NativeWind

**Files:**
- Modify: `mobile/babel.config.js`
- Create: `mobile/tailwind.config.js`
- Create: `mobile/global.css`
- Create: `mobile/nativewind-env.d.ts`
- Modify: `mobile/app/_layout.tsx` (import global.css)

- [ ] **Step 1: Configure babel for NativeWind**

Replace `mobile/babel.config.js`:
```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
```

- [ ] **Step 2: Create tailwind config**

Create `mobile/tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: { extend: {} },
  plugins: [],
};
```

- [ ] **Step 3: Create global.css**

Create `mobile/global.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Create NativeWind types**

Create `mobile/nativewind-env.d.ts`:
```ts
/// <reference types="nativewind/types" />
```

- [ ] **Step 5: Import global.css from root layout**

At the top of `mobile/app/_layout.tsx`:
```tsx
import '../global.css';
```

- [ ] **Step 6: Use a NativeWind class to verify it works**

Edit `mobile/app/(tabs)/index.tsx`:
```tsx
import { View, Text } from 'react-native';

export default function HomeScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-2xl font-bold">בית</Text>
    </View>
  );
}
```

- [ ] **Step 7: Run app and confirm Tailwind classes work**

Run:
```bash
cd mobile
npx expo start --ios -c
```

Expected: Home tab shows "בית" centered, large bold. White bg.

- [ ] **Step 8: Commit**

```bash
git add mobile/babel.config.js mobile/tailwind.config.js mobile/global.css mobile/nativewind-env.d.ts mobile/app/
git commit -m "feat(mobile): configure NativeWind with Tailwind classes"
```

---

### Task 15: Build `mobile/lib/config.ts`, `queryClient.ts`, and `auth.ts` — TDD

**Files:**
- Create: `mobile/lib/config.ts`
- Create: `mobile/lib/queryClient.ts`
- Create: `mobile/lib/auth.ts`
- Create: `mobile/lib/__tests__/auth.test.ts`
- Create: `mobile/jest.config.js`
- Create: `mobile/jest.setup.ts`

- [ ] **Step 1: Configure mobile Jest**

Create `mobile/jest.config.js`:
```js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEach: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@shared/(.*)$': '<rootDir>/../shared/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|nativewind|react-native-css-interop))',
  ],
};
```

Create `mobile/jest.setup.ts`:
```ts
import '@testing-library/jest-native/extend-expect';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));
```

Add to `mobile/package.json` scripts:
```json
"test": "jest",
"test:watch": "jest --watch"
```

- [ ] **Step 2: Write the failing test for auth.ts**

Create `mobile/lib/__tests__/auth.test.ts`:
```ts
import * as SecureStore from 'expo-secure-store';
import {
  storeRefreshToken,
  loadRefreshToken,
  clearRefreshToken,
  setAccessToken,
  getAccessToken,
} from '../auth';

const mockSet = SecureStore.setItemAsync as jest.Mock;
const mockGet = SecureStore.getItemAsync as jest.Mock;
const mockDelete = SecureStore.deleteItemAsync as jest.Mock;

beforeEach(() => {
  mockSet.mockClear();
  mockGet.mockClear();
  mockDelete.mockClear();
});

describe('auth token storage', () => {
  test('storeRefreshToken writes to SecureStore with WHEN_UNLOCKED_THIS_DEVICE_ONLY', async () => {
    await storeRefreshToken('rt-123');
    expect(mockSet).toHaveBeenCalledWith('hbs_refresh', 'rt-123', {
      keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    });
  });

  test('loadRefreshToken reads from SecureStore', async () => {
    mockGet.mockResolvedValue('rt-456');
    expect(await loadRefreshToken()).toBe('rt-456');
    expect(mockGet).toHaveBeenCalledWith('hbs_refresh');
  });

  test('clearRefreshToken deletes from SecureStore', async () => {
    await clearRefreshToken();
    expect(mockDelete).toHaveBeenCalledWith('hbs_refresh');
  });

  test('access token is held in module-scoped state, not persisted', async () => {
    setAccessToken('at-xyz');
    expect(getAccessToken()).toBe('at-xyz');
    expect(mockSet).not.toHaveBeenCalled(); // never written to SecureStore
  });

  test('clearRefreshToken also clears in-memory access token', async () => {
    setAccessToken('at-xyz');
    await clearRefreshToken();
    expect(getAccessToken()).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
cd mobile
npm test -- lib/__tests__/auth.test.ts
```

Expected: FAIL — module `'../auth'` not found.

- [ ] **Step 4: Implement config.ts**

Create `mobile/lib/config.ts`:
```ts
import Constants from 'expo-constants';

const API_BASE_URL =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  'http://localhost:8011';

export const config = {
  apiBaseUrl: API_BASE_URL,
  apiVersion: 'v1' as const,
};

export function apiUrl(path: string): string {
  const base = config.apiBaseUrl.replace(/\/$/, '');
  return `${base}/api/mobile/${config.apiVersion}${path.startsWith('/') ? path : '/' + path}`;
}
```

- [ ] **Step 5: Implement auth.ts**

Create `mobile/lib/auth.ts`:
```ts
import * as SecureStore from 'expo-secure-store';

const REFRESH_KEY = 'hbs_refresh';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export async function storeRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function loadRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function clearRefreshToken(): Promise<void> {
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  accessToken = null;
}
```

- [ ] **Step 6: Implement queryClient.ts**

Create `mobile/lib/queryClient.ts`:
```ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
```

- [ ] **Step 7: Run tests to confirm they pass**

```bash
cd mobile
npm test -- lib/__tests__/auth.test.ts
```

Expected: 5 passing.

- [ ] **Step 8: Commit**

```bash
git add mobile/lib/ mobile/jest.config.js mobile/jest.setup.ts mobile/package.json
git commit -m "feat(mobile): config, queryClient, and SecureStore-backed auth storage"
```

---

### Task 16: Build `mobile/lib/apiClient.ts` with header injection — TDD

**Files:**
- Create: `mobile/lib/apiClient.ts`
- Create: `mobile/lib/__tests__/apiClient.test.ts`

We build apiClient in two passes: first header injection (this task), then 401-refresh-retry (next task).

- [ ] **Step 1: Write failing tests for header injection**

Create `mobile/lib/__tests__/apiClient.test.ts`:
```ts
import { setAccessToken } from '../auth';
import { apiClient } from '../apiClient';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  fetchMock.mockReset();
  setAccessToken(null);
});

describe('apiClient header injection', () => {
  test('does not add Authorization header when no access token', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await apiClient.get('/home');
    const [, init] = fetchMock.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization ?? headers.Authorization).toBeUndefined();
  });

  test('adds Authorization: Bearer <token> header when access token is set', async () => {
    setAccessToken('access-123');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await apiClient.get('/home');
    const [, init] = fetchMock.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    const auth = headers.authorization ?? headers.Authorization;
    expect(auth).toBe('Bearer access-123');
  });

  test('parses JSON response on 200', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ value: 42 }), { status: 200 }));
    const data = await apiClient.get<{ value: number }>('/home');
    expect(data.value).toBe(42);
  });

  test('throws on non-2xx response', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'boom' }), { status: 500 }));
    await expect(apiClient.get('/home')).rejects.toThrow();
  });

  test('post sends JSON body and content-type', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await apiClient.post('/auth/login', { email: 'a@b.c', password: 'x' });
    const [, init] = fetchMock.mock.calls[0];
    const i = init as RequestInit;
    expect(i.method).toBe('POST');
    expect(JSON.parse(i.body as string)).toEqual({ email: 'a@b.c', password: 'x' });
    const headers = i.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd mobile
npm test -- lib/__tests__/apiClient.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement apiClient (no refresh yet)**

Create `mobile/lib/apiClient.ts`:
```ts
import { apiUrl } from './config';
import { getAccessToken } from './auth';

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  const access = getAccessToken();
  if (access) {
    headers.authorization = `Bearer ${access}`;
  }
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  const res = await fetch(apiUrl(path), {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    throw new ApiError(`HTTP ${res.status}`, res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string, headers?: Record<string, string>) => request<T>(path, { method: 'GET', headers }),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, { method: 'POST', body, headers }),
  put: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, { method: 'PUT', body, headers }),
};

export { ApiError };
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd mobile
npm test -- lib/__tests__/apiClient.test.ts
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/apiClient.ts mobile/lib/__tests__/apiClient.test.ts
git commit -m "feat(mobile): apiClient with bearer header injection"
```

---

### Task 17: Add 401-refresh-retry with singleflight to apiClient — TDD

**Files:**
- Modify: `mobile/lib/apiClient.ts`
- Modify: `mobile/lib/__tests__/apiClient.test.ts` (add refresh tests)

- [ ] **Step 1: Add failing tests for refresh behavior**

Append to `mobile/lib/__tests__/apiClient.test.ts`:
```ts
import { storeRefreshToken } from '../auth';
import * as SecureStore from 'expo-secure-store';

describe('apiClient 401-refresh-retry', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    setAccessToken(null);
    (SecureStore.getItemAsync as jest.Mock).mockReset();
    (SecureStore.setItemAsync as jest.Mock).mockReset();
  });

  test('on 401, calls /auth/refresh and retries the original request', async () => {
    setAccessToken('expired');
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('refresh-1');

    // First call to /home returns 401
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'unauth' }), { status: 401 }))
    );
    // /auth/refresh returns new tokens
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        new Response(JSON.stringify({ accessToken: 'new-access', refreshToken: 'refresh-2' }), { status: 200 })
      )
    );
    // Retry of /home succeeds
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    );

    const data = await apiClient.get<{ ok: boolean }>('/home');
    expect(data.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Retry should have used the new access token
    const [, retryInit] = fetchMock.mock.calls[2];
    const headers = (retryInit as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer new-access');
  });

  test('singleflight: 3 concurrent 401s share ONE refresh call', async () => {
    setAccessToken('expired');
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('refresh-1');

    // Each of 3 endpoints returns 401, then refresh, then 200
    let refreshCalls = 0;
    fetchMock.mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes('/auth/refresh')) {
        refreshCalls += 1;
        return Promise.resolve(
          new Response(JSON.stringify({ accessToken: 'new', refreshToken: 'rt2' }), { status: 200 })
        );
      }
      // First call for each endpoint = 401, second = 200
      // We track per-URL via call count
      const callsForUrl = fetchMock.mock.calls.filter((c) => c[0] === url).length;
      if (callsForUrl === 1) {
        return Promise.resolve(new Response('', { status: 401 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ url: urlStr }), { status: 200 }));
    });

    await Promise.all([apiClient.get('/a'), apiClient.get('/b'), apiClient.get('/c')]);
    expect(refreshCalls).toBe(1);
  });

  test('does not retry more than once if 401 persists', async () => {
    setAccessToken('expired');
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('refresh-1');
    fetchMock.mockImplementation(() => Promise.resolve(new Response('', { status: 401 })));

    await expect(apiClient.get('/home')).rejects.toThrow();
    // 1 original + 1 refresh + 1 retry = 3 total max (refresh itself is the only one that matters here)
    // Refresh returns 401, no retry happens
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('clears refresh token if refresh fails with 401', async () => {
    setAccessToken('expired');
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('refresh-1');
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/auth/refresh')) {
        return Promise.resolve(new Response('', { status: 401 }));
      }
      return Promise.resolve(new Response('', { status: 401 }));
    });

    await expect(apiClient.get('/home')).rejects.toThrow();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('hbs_refresh');
  });
});
```

- [ ] **Step 2: Run new tests to confirm they fail**

```bash
cd mobile
npm test -- lib/__tests__/apiClient.test.ts
```

Expected: 5 prior tests pass; 4 new tests FAIL.

- [ ] **Step 3: Modify apiClient.ts to handle 401 with singleflight refresh**

Replace `mobile/lib/apiClient.ts`:
```ts
import { apiUrl } from './config';
import {
  getAccessToken,
  setAccessToken,
  loadRefreshToken,
  storeRefreshToken,
  clearRefreshToken,
} from './auth';

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  _retried?: boolean;
}

class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

let inflightRefresh: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  const refresh = await loadRefreshToken();
  if (!refresh) return null;

  const res = await fetch(apiUrl('/auth/refresh'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: refresh }),
  });

  if (!res.ok) {
    await clearRefreshToken();
    return null;
  }

  const body = (await res.json()) as { accessToken: string; refreshToken: string };
  setAccessToken(body.accessToken);
  await storeRefreshToken(body.refreshToken);
  return body.accessToken;
}

async function refreshAccessToken(): Promise<string | null> {
  if (!inflightRefresh) {
    inflightRefresh = performRefresh().finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  const access = getAccessToken();
  if (access) headers.authorization = `Bearer ${access}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  const res = await fetch(apiUrl(path), {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && !options._retried && !path.startsWith('/auth/')) {
    const newAccess = await refreshAccessToken();
    if (newAccess) {
      return request<T>(path, { ...options, _retried: true });
    }
    throw new ApiError('Unauthorized', 401, null);
  }

  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch {}
    throw new ApiError(`HTTP ${res.status}`, res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string, headers?: Record<string, string>) => request<T>(path, { method: 'GET', headers }),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, { method: 'POST', body, headers }),
  put: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, { method: 'PUT', body, headers }),
};

export { ApiError };
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd mobile
npm test -- lib/__tests__/apiClient.test.ts
```

Expected: all 9 tests passing.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/apiClient.ts mobile/lib/__tests__/apiClient.test.ts
git commit -m "feat(mobile): apiClient 401-refresh-retry with singleflight"
```

---

### Task 18: Build `AuthContext` — TDD

**Files:**
- Modify: `mobile/lib/auth.ts` (add user-blob storage)
- Create: `mobile/contexts/AuthContext.tsx`
- Create: `mobile/contexts/__tests__/AuthContext.test.tsx`

**Design note:** `/auth/refresh` returns only tokens, not the user object. To hydrate `user` on app launch (after refresh-token survives in Keychain), we store a copy of the user blob in SecureStore alongside the refresh token. Lightweight, avoids needing a separate `/auth/me` endpoint.

- [ ] **Step 1: Add user-blob storage to auth.ts**

Append to `mobile/lib/auth.ts`:
```ts
import type { SafeUser } from '@shared/types/common';

const USER_KEY = 'hbs_user';

export async function storeUser(user: SafeUser): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function loadUser(): Promise<SafeUser | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SafeUser;
  } catch {
    return null;
  }
}
```

Update `clearRefreshToken` in the same file to clear the user blob too:
```ts
export async function clearRefreshToken(): Promise<void> {
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
  accessToken = null;
}
```

- [ ] **Step 2: Write failing tests**

Create `mobile/contexts/__tests__/AuthContext.test.tsx`:
```tsx
import React from 'react';
import { Text, Button } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { AuthProvider, useAuth } from '../AuthContext';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function Probe() {
  const { user, login, logout, isLoading } = useAuth();
  if (isLoading) return <Text>loading</Text>;
  return (
    <>
      <Text testID="user">{user ? user.email : 'anon'}</Text>
      <Button title="login" onPress={() => login('a@b.c', 'pw')} />
      <Button title="logout" onPress={() => logout()} />
    </>
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  (SecureStore.getItemAsync as jest.Mock).mockReset().mockResolvedValue(null);
  (SecureStore.setItemAsync as jest.Mock).mockReset();
  (SecureStore.deleteItemAsync as jest.Mock).mockReset();
});

describe('AuthContext', () => {
  test('starts with no user when SecureStore has no refresh token', async () => {
    const { findByText } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(await findByText('anon')).toBeTruthy();
  });

  test('login sets user from /auth/login response', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'at',
          refreshToken: 'rt',
          user: { id: 'u1', email: 'me@test.tld', name: 'Me', role: 'USER', avatarUrl: null },
        }),
        { status: 200 }
      )
    );

    const { findByText, getByText } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await findByText('anon');

    await act(async () => {
      fireEvent.press(getByText('login'));
    });

    await waitFor(() => expect(SecureStore.setItemAsync).toHaveBeenCalled());
    expect(await findByText('me@test.tld')).toBeTruthy();
  });

  test('logout clears user state and refresh token', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          accessToken: 'at',
          refreshToken: 'rt',
          user: { id: 'u1', email: 'me@test.tld', name: 'Me', role: 'USER', avatarUrl: null },
        }),
        { status: 200 }
      )
    );
    fetchMock.mockResolvedValueOnce(new Response('', { status: 204 })); // logout

    const { findByText, getByText } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await findByText('anon');

    await act(async () => fireEvent.press(getByText('login')));
    await findByText('me@test.tld');

    await act(async () => fireEvent.press(getByText('logout')));

    await waitFor(() => expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('hbs_refresh'));
    expect(await findByText('anon')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd mobile
npm test -- contexts/__tests__/AuthContext.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement AuthContext**

Create `mobile/contexts/AuthContext.tsx`:
```tsx
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiClient } from '@/lib/apiClient';
import {
  setAccessToken,
  storeRefreshToken,
  loadRefreshToken,
  storeUser,
  loadUser,
  clearRefreshToken,
} from '@/lib/auth';
import type { LoginResponse } from '@shared/types/mobile-api';
import type { SafeUser } from '@shared/types/common';

interface AuthState {
  user: SafeUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [refresh, savedUser] = await Promise.all([loadRefreshToken(), loadUser()]);
      if (!cancelled) {
        if (refresh && savedUser) setUser(savedUser);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiClient.post<LoginResponse>('/auth/login', { email, password });
    setAccessToken(res.accessToken);
    await storeRefreshToken(res.refreshToken);
    await storeUser(res.user);
    setUser(res.user);
  };

  const logout = async () => {
    const refresh = await loadRefreshToken();
    try {
      await apiClient.post('/auth/logout', refresh ? { refreshToken: refresh } : {});
    } catch {
      // ignore — we still clear locally
    }
    await clearRefreshToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd mobile
npm test -- contexts/__tests__/AuthContext.test.tsx
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add mobile/contexts/ mobile/lib/auth.ts
git commit -m "feat(mobile): AuthContext with hydrate-on-launch + login/logout"
```

---

### Task 19: Build the login screen + auth gate

**Files:**
- Create: `mobile/app/login.tsx`
- Modify: `mobile/app/_layout.tsx` (re-enable AuthProvider, add gate)

- [ ] **Step 1: Restore _layout.tsx with AuthProvider**

Replace `mobile/app/_layout.tsx`:
```tsx
import '../global.css';
import { useEffect } from 'react';
import { I18nManager } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

if (!I18nManager.isRTL) {
  I18nManager.forceRTL(true);
}

function AuthGate() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === 'login';
    if (!user && !inAuthGroup) {
      router.replace('/login');
    } else if (user && inAuthGroup) {
      router.replace('/');
    }
  }, [user, isLoading, segments, router]);

  return null;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="login" options={{ presentation: 'modal' }} />
        </Stack>
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Build the login screen**

Create `mobile/app/login.tsx`:
```tsx
import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email || !password) {
      setError('יש למלא אימייל וסיסמה');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (e) {
      setError('שם משתמש או סיסמה שגויים');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-white p-6 justify-center">
      <Text className="text-3xl font-bold mb-8 text-center">HBStats</Text>

      <Text className="mb-2 text-base">אימייל</Text>
      <TextInput
        className="border border-gray-300 rounded-md px-3 py-3 mb-4"
        autoCapitalize="none"
        keyboardType="email-address"
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
        editable={!busy}
        testID="email-input"
      />

      <Text className="mb-2 text-base">סיסמה</Text>
      <TextInput
        className="border border-gray-300 rounded-md px-3 py-3 mb-4"
        secureTextEntry
        textContentType="password"
        value={password}
        onChangeText={setPassword}
        editable={!busy}
        testID="password-input"
      />

      {error && <Text className="text-red-600 mb-3 text-center" testID="login-error">{error}</Text>}

      <Pressable
        className="bg-blue-600 py-3 rounded-md items-center"
        onPress={submit}
        disabled={busy}
        testID="login-submit"
      >
        {busy ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold">התחבר</Text>}
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 3: Run the app on simulator**

```bash
cd mobile
npx expo start --ios -c
```

Expected:
- App launches and immediately redirects to `/login`
- Enter credentials of an existing user → tap "התחבר" → redirects to Home tab
- Kill the app from simulator menu, reopen → still on Home (refresh token persists)
- Tap "logout" (if you wired one up to a tab — for now check via Probe or skip)

- [ ] **Step 4: Commit**

```bash
git add mobile/app/login.tsx mobile/app/_layout.tsx
git commit -m "feat(mobile): login screen + auth gate"
```

---

### Task 20: Configure EAS Build profiles

**Files:**
- Create: `mobile/eas.json`

- [ ] **Step 1: Install eas-cli globally (if not installed)**

```bash
npm install -g eas-cli
```

- [ ] **Step 2: Authenticate with Expo**

```bash
cd mobile
eas login
```

Expected: prompts for Expo account credentials. Create one at expo.dev if needed.

- [ ] **Step 3: Initialize EAS**

```bash
eas init
```

Expected: creates an Expo project ID, writes it to `app.json` as `extra.eas.projectId`.

- [ ] **Step 4: Create eas.json**

Create `mobile/eas.json`:
```json
{
  "cli": { "version": ">= 14.0.0", "appVersionSource": "remote" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": true }
    },
    "preview": {
      "distribution": "internal",
      "ios": { "simulator": false }
    },
    "production": {
      "autoIncrement": true,
      "env": {
        "EXPO_PUBLIC_API_BASE_URL": "https://hbstats.example.com"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "yaniv@goldbond.co.il",
        "ascAppId": "TBD-after-app-store-record-created",
        "appleTeamId": "TBD-from-apple-developer"
      }
    }
  }
}
```

(Replace `hbstats.example.com` with your actual production domain. Replace `TBD` placeholders before Plan 3 / Sprint 5.)

- [ ] **Step 5: Build a development client for simulator**

```bash
eas build --profile development --platform ios
```

Expected: ~10-15 min cloud build. Outputs an `.app` bundle URL. Download and drag into simulator OR use `eas build --local` if you have Xcode installed.

(This step is optional in Plan 1 — if Expo Go works for your dev needs, you can defer creating a custom dev client. Required when you add native modules Expo Go doesn't bundle.)

- [ ] **Step 6: Commit**

```bash
git add mobile/eas.json mobile/app.json
git commit -m "chore(mobile): EAS Build profiles for dev/preview/production"
```

---

### Task 21: Integration test — login happy path with MSW

**Files:**
- Create: `mobile/__tests__/msw/handlers.ts`
- Create: `mobile/__tests__/msw/server.ts`
- Create: `mobile/__tests__/integration/login-flow.test.tsx`

- [ ] **Step 1: Configure MSW**

Create `mobile/__tests__/msw/handlers.ts`:
```ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.post('http://localhost:8011/api/mobile/v1/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    if (body.email === 'good@test.tld' && body.password === 'GoodPass') {
      return HttpResponse.json({
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        user: { id: 'u1', email: 'good@test.tld', name: 'Good', role: 'USER', avatarUrl: null },
      });
    }
    return HttpResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }),
];
```

Create `mobile/__tests__/msw/server.ts`:
```ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

Update `mobile/jest.setup.ts`:
```ts
import '@testing-library/jest-native/extend-expect';
import { server } from './__tests__/msw/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (k: string, v: string) => { store.set(k, v); }),
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    deleteItemAsync: jest.fn(async (k: string) => { store.delete(k); }),
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  };
});
```

- [ ] **Step 2: Write the integration test**

Create `mobile/__tests__/integration/login-flow.test.tsx`:
```tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import LoginScreen from '@/app/login';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Text } from 'react-native';

function ProbeUser() {
  const { user } = useAuth();
  return <Text testID="probe">{user?.email ?? 'anon'}</Text>;
}

describe('Login flow integration', () => {
  test('valid credentials → user populated', async () => {
    const { getByTestId } = render(
      <AuthProvider>
        <LoginScreen />
        <ProbeUser />
      </AuthProvider>
    );

    fireEvent.changeText(getByTestId('email-input'), 'good@test.tld');
    fireEvent.changeText(getByTestId('password-input'), 'GoodPass');
    fireEvent.press(getByTestId('login-submit'));

    await waitFor(() => expect(getByTestId('probe').props.children).toBe('good@test.tld'));
  });

  test('invalid credentials → error displayed, no user', async () => {
    const { getByTestId, findByTestId } = render(
      <AuthProvider>
        <LoginScreen />
        <ProbeUser />
      </AuthProvider>
    );

    fireEvent.changeText(getByTestId('email-input'), 'good@test.tld');
    fireEvent.changeText(getByTestId('password-input'), 'WrongPass');
    fireEvent.press(getByTestId('login-submit'));

    const error = await findByTestId('login-error');
    expect(error).toBeTruthy();
    expect(getByTestId('probe').props.children).toBe('anon');
  });
});
```

- [ ] **Step 3: Install msw**

```bash
cd mobile
npm install --save-dev msw@2
```

- [ ] **Step 4: Run integration tests**

```bash
cd mobile
npm test -- __tests__/integration
```

Expected: 2 passing.

- [ ] **Step 5: Run the entire mobile test suite**

```bash
cd mobile
npm test
```

Expected: all passing (apiClient, auth, AuthContext, login-flow).

- [ ] **Step 6: Commit**

```bash
git add mobile/__tests__/ mobile/jest.setup.ts mobile/package.json mobile/package-lock.json
git commit -m "test(mobile): integration test for login flow with MSW"
```

---

### Task 22: Integration test — token refresh transparency

**Files:**
- Create: `mobile/__tests__/integration/refresh-transparency.test.tsx`
- Modify: `mobile/__tests__/msw/handlers.ts` (add /home + /refresh handlers)

- [ ] **Step 1: Add MSW handlers for /home and /refresh**

Append to `mobile/__tests__/msw/handlers.ts`:
```ts
export const refreshHandlers = [
  http.get('http://localhost:8011/api/mobile/v1/home', ({ request }) => {
    const auth = request.headers.get('authorization');
    if (auth === 'Bearer fresh-access') {
      return HttpResponse.json({ liveStrip: [], compactStandings: [] });
    }
    return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }),
  http.post('http://localhost:8011/api/mobile/v1/auth/refresh', async ({ request }) => {
    const body = (await request.json()) as { refreshToken: string };
    if (body.refreshToken === 'old-refresh') {
      return HttpResponse.json({ accessToken: 'fresh-access', refreshToken: 'new-refresh' });
    }
    return HttpResponse.json({ error: 'Invalid' }, { status: 401 });
  }),
];
```

Export both arrays from `handlers.ts` and combine in `server.ts`:
```ts
// server.ts
import { setupServer } from 'msw/node';
import { handlers, refreshHandlers } from './handlers';
export const server = setupServer(...handlers, ...refreshHandlers);
```

- [ ] **Step 2: Write the test**

Create `mobile/__tests__/integration/refresh-transparency.test.tsx`:
```tsx
import { apiClient } from '@/lib/apiClient';
import { setAccessToken, storeRefreshToken } from '@/lib/auth';

describe('Refresh transparency', () => {
  test('GET /home with stale access token → silently refreshes and returns data', async () => {
    setAccessToken('expired-access');
    await storeRefreshToken('old-refresh');

    const data = await apiClient.get<{ liveStrip: unknown[] }>('/home');
    expect(data.liveStrip).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests to confirm they pass**

```bash
cd mobile
npm test -- __tests__/integration/refresh-transparency.test.tsx
```

Expected: 1 passing.

- [ ] **Step 4: Run all mobile tests**

```bash
cd mobile
npm test
```

Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add mobile/__tests__/
git commit -m "test(mobile): integration test for transparent token refresh"
```

---

### Task 23: Manual smoke test on iOS Simulator

**Files:** none (verification step)

- [ ] **Step 1: Start the backend**

```bash
npm run dev -- --port 8011
```

- [ ] **Step 2: Start mobile app on simulator**

```bash
cd mobile
EXPO_PUBLIC_API_BASE_URL=http://localhost:8011 npx expo start --ios -c
```

- [ ] **Step 3: Run through the manual checklist**

Verify each:
- [ ] App launches into login screen
- [ ] Hebrew labels render RTL
- [ ] Login with **valid** existing user (use a user record from your DB) → redirects to Home tab
- [ ] Tabs at the bottom show in correct order for RTL
- [ ] Kill the app via Simulator > Device > Erase All Content and Settings is overkill — instead: Simulator menu > swipe up to close, or `xcrun simctl terminate booted il.hbstats.app`
- [ ] Reopen app → goes directly to Home (refresh token loaded from Keychain, user blob loaded)
- [ ] Background app for 16+ min (or manually expire access token by calling `setAccessToken('garbage')` from a debug button) → next API call still works (transparent refresh)
- [ ] Login with **invalid** credentials → "שם משתמש או סיסמה שגויים" displayed, stays on login screen

- [ ] **Step 4: Document any issues**

If any item fails, file as a TODO and fix before declaring Plan 1 done. Do not commit a partial fix; fix → test → commit per task discipline.

- [ ] **Step 5: Commit a status note (optional)**

If everything works:
```bash
echo "Plan 1 (Foundation + Auth) — manual smoke test passed on $(date '+%Y-%m-%d')" >> mobile/docs/manual-test-log.md
git add mobile/docs/manual-test-log.md
git commit -m "docs(mobile): log Plan 1 manual smoke test pass"
```

---

### Task 24: Add CI skeleton (GitHub Actions)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: hbstats_test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npx prisma generate
      - run: npx prisma db push
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/hbstats_test
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm test
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/hbstats_test
          JWT_SECRET: ci-secret-at-least-32-bytes-long-xx

  mobile:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: mobile
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm', cache-dependency-path: mobile/package-lock.json }
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm test -- --ci

  bundle-secret-scan:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: mobile
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm', cache-dependency-path: mobile/package-lock.json }
      - run: npm ci
      - name: Export Metro bundle
        run: npx expo export --platform ios --output-dir dist
      - name: Scan bundle for known secret patterns
        run: |
          set -e
          # Block on Stripe/AWS-shape secret keys, long hex API tokens, and obvious env-var leaks
          if grep -RIE 'sk_live_[A-Za-z0-9]+|sk_test_[A-Za-z0-9]+|api[_-]?key[_-]?[a-f0-9]{32,}|AKIA[0-9A-Z]{16}|JWT_SECRET=' dist/; then
            echo "ERROR: secret-shaped string found in mobile bundle"
            exit 1
          fi
          echo "Bundle scan clean"
```

- [ ] **Step 2: Add lint script if missing**

Check `package.json` `scripts`. If `lint` is missing, the workflow will fail. Add or use `next lint`:
```json
"lint": "next lint"
```

- [ ] **Step 3: Push to GitHub and verify CI runs**

Push the branch (or commit, depending on how you work) — GitHub Actions runs both jobs. Watch them in the Actions tab.

Expected: both jobs green.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml package.json
git commit -m "ci: add GitHub Actions for backend + mobile tests"
```

---

### Task 25: Update CLAUDE.md with mobile section

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a Mobile section**

Append to `CLAUDE.md` (before the closing of "מבנה התיקיות" or as a new top-level section near the end):

```markdown
## Mobile App (iOS — v1.0 in development)

נבנית כ-React Native + Expo SDK 52, בתיקיית `mobile/`. מקור הטיפוסים המשותף: `shared/types/`.

### הרצה מקומית

```bash
# Backend (אותו תהליך כמו web)
npm run dev -- --port 8011

# Mobile (טרמינל נפרד)
cd mobile
EXPO_PUBLIC_API_BASE_URL=http://localhost:8011 npx expo start --ios
```

### בדיקות

- **Backend (Jest)**: `npm test` מהשורש — מריץ contract tests + unit tests
- **Mobile (Jest)**: `cd mobile && npm test` — unit + integration עם MSW

### Auth model

- Web: cookies (`hbs_session`, httpOnly, 14 ימים) — בלי שינוי
- Mobile: bearer tokens (JWT access 15 דק' + opaque refresh 60 ימים, ב-Keychain)
- שני המסלולים משתמשים באותה טבלת `Session`, ב-`getRequestUser` משולב

### Mobile API endpoints

כולם תחת `/api/mobile/v1/*`:
- `auth/login`, `auth/refresh`, `auth/logout`, `auth/logout-all`
- `home`, `live`, `teams/:id`, `games/:id`, `players/:id`, `news`, `preferences`, `standings`, `stats`

ראה את ה-spec המלא ב-[docs/superpowers/specs/2026-05-10-mobile-app-design.md](docs/superpowers/specs/2026-05-10-mobile-app-design.md).
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add Mobile section to CLAUDE.md"
```

---

## Plan 1 Completion Checklist

Before declaring Plan 1 done, confirm all of the following:

- [ ] Apple Developer Program enrollment submitted (verification may still be in progress)
- [ ] All `/api/mobile/*` endpoints moved to `/api/mobile/v1/*`
- [ ] Schema migration for `Session` (replacedAt, replacedBy, familyId) applied; existing rows backfilled
- [ ] All 4 auth endpoints (`login`, `refresh`, `logout`, `logout-all`) implemented and tested
- [ ] JWT access tokens validate via `getRequestUser` Bearer path
- [ ] Refresh token rotation works; reuse detection deletes the family
- [ ] 30-second idempotency window prevents false-positive reuse on network retries
- [ ] Rate limits in place on login (5/min/IP, 10/hour/email) and refresh (10/min/IP)
- [ ] Mobile Expo app boots on iOS simulator with 3 RTL tabs
- [ ] NativeWind classes work
- [ ] Login screen functions; valid credentials → home; invalid → error
- [ ] Refresh token persists via SecureStore across app restarts (verify via terminate-and-reopen)
- [ ] Stale access token → transparent refresh on next request
- [ ] All unit + integration tests pass locally
- [ ] CI runs backend + mobile tests green
- [ ] CLAUDE.md updated with mobile section
- [ ] No secrets committed (search `git log -p -S 'JWT_SECRET'` for accidental leaks)

---

## Next plan

Plan 2 — Core Screens (Sprint 2-4): Home, Live, Match, Team, Player (basic), Preferences. Will be written when Plan 1 is fully landed.
