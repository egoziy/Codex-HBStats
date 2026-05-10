# HBStats Mobile — Core Screens Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 6 core mobile screens (Home, Live, Match, Team, Player basic, Preferences) on top of the Plan 1 foundation. Each screen has a typed payload contract enforced by backend contract tests and consumed by a TanStack Query hook on the mobile side.

**Architecture:** Backend handlers under `/api/mobile/v1/*` return payload shapes defined in `shared/types/mobile-api.ts`. The mobile app uses TanStack Query for data fetching with stale-while-revalidate semantics + offline persistence via `expo-sqlite`. Screens consume hooks that wrap `apiClient.get()`. Reusable design-system primitives (`MatchRow`, `TeamHeader`, etc.) live in `mobile/design-system/` and are snapshot-tested. Deep linking (`hbstats://teams/123`, universal links) lets external sources (Telegram messages) open specific screens.

**Tech Stack:** Continues Plan 1: Next.js 14 + Prisma 5 + PostgreSQL backend; Expo SDK 54 + Expo Router 6 + NativeWind 4 + TanStack Query 5 + MSW mobile. Adds `@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister` (or expo-sqlite-backed equivalent) for offline cache.

**Scope:** Sprint 2-4 of Phase A from [the spec](../specs/2026-05-10-mobile-app-design.md). ~5 calendar weeks at half-time effort, 18 tasks.

**Builds on:** [Plan 1 (Foundation + Auth)](2026-05-10-mobile-foundation-and-auth.md) — already shipped to main. Bearer auth, Expo scaffold, NativeWind, login screen are working with 51 tests passing.

**Out of scope (later plans):**
- Polish, App Store metadata, TestFlight beta (Plan 3)
- Push notifications (v1.1)
- Player career switcher, charts, achievements (v1.1)
- Full News screen with filters (v1.1 — Plan 2 includes only a news strip on Home)
- Tier 2 security: cert pinning, biometric, jailbreak warn (v1.1)

---

## File Structure

### New files
```
shared/types/mobile-api.ts                              # Extended with screen payload types
mobile/design-system/                                    # NEW — reusable primitives
  Card.tsx
  MatchRow.tsx
  TeamHeader.tsx
  StatPill.tsx
  LiveDot.tsx
  __tests__/Card.test.tsx
  __tests__/MatchRow.test.tsx
mobile/hooks/                                            # NEW — TanStack Query hooks
  useHome.ts
  useLive.ts
  useMatch.ts
  useTeam.ts
  usePlayer.ts
  usePreferences.ts
mobile/app/teams/[id].tsx                                # Team screen
mobile/app/games/[id].tsx                                # Match screen
mobile/app/players/[id].tsx                              # Player screen
src/app/api/mobile/v1/home/__tests__/route.test.ts       # Contract test
src/app/api/mobile/v1/live/__tests__/route.test.ts       # Contract test
src/app/api/mobile/v1/games/[id]/__tests__/route.test.ts # Contract test
src/app/api/mobile/v1/teams/[id]/__tests__/route.test.ts # Contract test
src/app/api/mobile/v1/players/[id]/__tests__/route.test.ts
src/app/api/mobile/v1/preferences/__tests__/route.test.ts
```

### Modified files
```
mobile/app/(tabs)/index.tsx                              # Replace placeholder with real Home
mobile/app/(tabs)/live.tsx                               # Replace placeholder with real Live
mobile/app/(tabs)/preferences.tsx                        # Replace placeholder with real Preferences
mobile/lib/queryClient.ts                                # Add persister
mobile/package.json                                      # Add persist-client + storage deps
src/app/api/mobile/v1/home/route.ts                      # Refit to HomePayload contract
src/app/api/mobile/v1/live/route.ts                      # Refit to LivePayload
src/app/api/mobile/v1/games/[id]/route.ts                # Refit to MatchPayload
src/app/api/mobile/v1/teams/[id]/route.ts                # Refit to TeamPayload
src/app/api/mobile/v1/players/[id]/route.ts              # Trim to basic PlayerPayload
src/app/api/mobile/v1/preferences/route.ts               # Confirm Bearer auth works
mobile/app.json                                          # Universal links domain
```

---

## Branching

Create the working branch off the merged `main`:
```bash
git checkout main
git pull origin main
git checkout -b feat/mobile-core-screens
```

All subsequent commits go on `feat/mobile-core-screens`. Open one PR at the end.

---

## Conventions (carried from Plan 1)

- **Staging discipline:** always `git add <explicit paths>` — never `git add -A` or `git add .`. There may be other modified files (e.g. `.claude/settings.local.json`) that should NOT be in our commits.
- **Commit messages:** HEREDOC format with Co-Authored-By trailer.
- **Tests first (TDD):** every task that creates code starts with the failing test.
- **Test discipline:** backend tests use the dev Postgres + manual user fixtures (per-test `Date.now()` emails to avoid collisions). Mobile tests use MSW for network mocking.
- **No mass refactors:** if a handler needs more than a payload refit, stop and report DONE_WITH_CONCERNS.

---

## Tasks

### Task 1: Add screen payload types to shared/

**Files:**
- Modify: `shared/types/mobile-api.ts`
- Modify: `shared/types/common.ts`

This task is type-only. It defines every payload contract used by Sprint 2-4. No runtime code, no tests; TypeScript itself is the validation when later tasks compile against these types.

- [ ] **Step 1: Add domain primitives to `shared/types/common.ts`**

Open `shared/types/common.ts`. Add at the bottom (preserve the existing `UserRole` + `SafeUser`):
```ts
// ---------- Domain primitives ----------

export interface TeamSummary {
  id: string;
  apiId: number | null;
  nameEn: string;
  nameHe: string;
  logoUrl: string | null;
}

export interface TeamHeader extends TeamSummary {
  founded: number | null;
  venueName: string | null;
  city: string | null;
}

export interface PlayerSummary {
  id: string;
  apiId: number | null;
  nameEn: string;
  nameHe: string;
  photoUrl: string | null;
  position: string | null;
  jerseyNumber: number | null;
}

export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';

export interface MatchCard {
  id: string;
  apiId: number | null;
  date: string;          // ISO timestamp
  status: MatchStatus;
  minute: number | null; // null if not live
  home: { team: TeamSummary; score: number | null };
  away: { team: TeamSummary; score: number | null };
  leagueId: string;
  leagueName: string;
}

export interface NewsCard {
  id: string;
  source: string;        // 'telegram', 'walla', etc.
  team: string | null;
  imageUrl: string | null;
  preview: string;
  publishedAt: string;
  url: string | null;
}

export interface StandingRow {
  rank: number;
  team: TeamSummary;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}
```

- [ ] **Step 2: Add screen payload types to `shared/types/mobile-api.ts`**

Open `shared/types/mobile-api.ts`. Add at the bottom (preserve existing auth types):
```ts
import type {
  TeamSummary,
  TeamHeader,
  PlayerSummary,
  MatchCard,
  MatchStatus,
  NewsCard,
  StandingRow,
} from './common';

// ---------- Home ----------

export interface LiveMatchCompact {
  id: string;
  minute: number | null;
  home: { name: string; score: number | null };
  away: { name: string; score: number | null };
}

export interface CompactStandingRow {
  rank: number;
  teamName: string;
  played: number;
  points: number;
}

export interface HomePayload {
  user: { id: string; name: string; avatarUrl: string | null } | null;
  favoriteTeam: TeamSummary | null;
  nextMatch: MatchCard | null;
  lastMatch: MatchCard | null;
  compactStandings: CompactStandingRow[];
  liveStrip: LiveMatchCompact[];
  newsStrip: NewsCard[];
}

// ---------- Live ----------

export interface LiveMatchEvent {
  minute: number;
  type: 'goal' | 'yellow' | 'red' | 'sub' | 'penalty';
  player: string | null;
  team: 'home' | 'away';
}

export interface LiveMatchExpanded {
  id: string;
  minute: number | null;
  status: MatchStatus;
  home: { team: TeamSummary; score: number | null };
  away: { team: TeamSummary; score: number | null };
  eventCount: number;
  recentEvents: LiveMatchEvent[]; // last 3
}

export interface LiveLeagueGroup {
  league: { id: string; nameHe: string; nameEn: string; logo: string | null };
  matches: LiveMatchExpanded[];
}

export interface LivePayload {
  groups: LiveLeagueGroup[];
  lastUpdated: string; // ISO
}

// ---------- Match ----------

export interface MatchEvent extends LiveMatchEvent {
  id: string;
  assistPlayer: string | null;
}

export interface LineupPlayer {
  player: PlayerSummary;
  isStarting: boolean;
  position: string | null;
}

export interface Lineup {
  formation: string | null;
  players: LineupPlayer[];
}

export interface MatchStats {
  possession: { home: number; away: number } | null;
  shots: { home: number; away: number } | null;
  shotsOnTarget: { home: number; away: number } | null;
  corners: { home: number; away: number } | null;
  fouls: { home: number; away: number } | null;
}

export interface H2H {
  lastN: MatchCard[];
  wins: { home: number; away: number; draw: number };
}

export interface MatchPayload {
  match: {
    id: string;
    status: MatchStatus;
    minute: number | null;
    score: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null } | null;
    dates: { kickoff: string; finished: string | null };
    venue: { name: string; city: string | null } | null;
    referee: string | null;
  };
  homeTeam: TeamHeader;
  awayTeam: TeamHeader;
  events: MatchEvent[];
  lineups: { home: Lineup; away: Lineup };
  matchStats: MatchStats | null;
  h2h: H2H | null;
}

// ---------- Team ----------

export interface TeamSeasonStats {
  goalsScored: number;
  goalsAgainst: number;
  cleanSheets: number;
  averageGoalsScored: number;
  averageGoalsAgainst: number;
  topScorer: { player: PlayerSummary; goals: number } | null;
}

export interface TeamPayload {
  team: TeamHeader;
  coach: { name: string; since: string | null } | null;
  standingsContext: { rank: number; points: number; around: StandingRow[] } | null;
  nextMatch: MatchCard | null;
  lastMatch: MatchCard | null;
  recentForm: ('W' | 'D' | 'L')[]; // last 5
  squad: { position: string; players: PlayerSummary[] }[];
  seasonStats: TeamSeasonStats;
}

// ---------- Player (basic, v1.0) ----------

export interface PlayerSeasonStats {
  appearances: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  subbedIn: number;
  subbedOut: number;
}

export interface PlayerRecentMatch {
  matchId: string;
  opponent: string;
  date: string;
  role: 'started' | 'subbed_in' | 'unused' | 'subbed_out';
  contribution: { goals: number; assists: number; minutes: number };
}

export interface PlayerPayload {
  player: {
    id: string;
    nameHe: string;
    nameEn: string;
    photoUrl: string | null;
    dateOfBirth: string | null;
    nationality: string | null;
    position: string | null;
  };
  currentTeam: TeamSummary | null;
  currentSeasonStats: PlayerSeasonStats | null;
  recentMatches: PlayerRecentMatch[]; // last 5
}

// ---------- Preferences ----------

export interface PreferencesPayload {
  favoriteTeamApiIds: number[];
  favoriteCompetitionApiIds: number[];
}
```

- [ ] **Step 3: Verify types compile**

```bash
cd /Users/yaniv/Documents/AI/SoocerStats
npx tsc -p shared/tsconfig.json
```
Expected: no output, exit 0.

- [ ] **Step 4: Verify backend type-check still passes**

```bash
npx tsc --noEmit
```
Expected: no output (the new types are unused for now; existing code unaffected).

- [ ] **Step 5: Commit**

```bash
git add shared/types/common.ts shared/types/mobile-api.ts
git commit -m "$(cat <<'EOF'
feat(shared): add mobile API payload types for core screens

Types for HomePayload, LivePayload, MatchPayload, TeamPayload,
PlayerPayload (basic v1.0 shape), and PreferencesPayload.
Plus domain primitives (TeamSummary, MatchCard, etc.) in common.ts.

These types are the source of truth — backend handlers (Tasks 2-3,
9-10, 15-16) cast their return values to them, and mobile hooks
(Tasks 6-7, 11-13, 17-18) consume them. TypeScript enforces the
contract on both sides.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Backend — refit `GET /v1/home` to `HomePayload` + contract test

**Files:**
- Modify: `src/app/api/mobile/v1/home/route.ts`
- Create: `src/app/api/mobile/v1/home/__tests__/route.test.ts`

- [ ] **Step 1: Read the existing handler**

Read `src/app/api/mobile/v1/home/route.ts` to understand what it currently returns. Likely uses `getMobileHomePayload()` from `src/lib/mobile-extra-api.ts` or similar. Don't rewrite the data-fetching logic — only the response shape needs to match `HomePayload`.

- [ ] **Step 2: Write the failing contract test**

Create `src/app/api/mobile/v1/home/__tests__/route.test.ts`:
```ts
import { GET } from '../route';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { signAccessToken } from '@/lib/jwt';
import type { HomePayload } from '@shared/types/mobile-api';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-at-least-32-bytes-long-xx';
});

function mkReq(token?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest('http://localhost/api/mobile/v1/home', { headers });
}

describe('GET /api/mobile/v1/home — HomePayload contract', () => {
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `home-test-${Date.now()}@test.local`,
        name: 'Home Tester',
        password: await hashPassword('x'),
        isActive: true,
      },
    });
    userId = user.id;
    accessToken = signAccessToken(userId);
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  test('anonymous request returns 200 with user=null', async () => {
    const res = await GET(mkReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as HomePayload;
    expect(body.user).toBeNull();
  });

  test('authenticated request returns 200 with user populated', async () => {
    const res = await GET(mkReq(accessToken));
    expect(res.status).toBe(200);
    const body = (await res.json()) as HomePayload;
    expect(body.user?.id).toBe(userId);
  });

  test('response shape matches HomePayload contract', async () => {
    const res = await GET(mkReq(accessToken));
    const body = (await res.json()) as HomePayload;

    // Required keys present (TypeScript can't enforce at runtime, so we check)
    expect(body).toHaveProperty('user');
    expect(body).toHaveProperty('favoriteTeam');
    expect(body).toHaveProperty('nextMatch');
    expect(body).toHaveProperty('lastMatch');
    expect(body).toHaveProperty('compactStandings');
    expect(body).toHaveProperty('liveStrip');
    expect(body).toHaveProperty('newsStrip');

    // Array fields are arrays
    expect(Array.isArray(body.compactStandings)).toBe(true);
    expect(Array.isArray(body.liveStrip)).toBe(true);
    expect(Array.isArray(body.newsStrip)).toBe(true);

    // newsStrip cap at 4
    expect(body.newsStrip.length).toBeLessThanOrEqual(4);
  });
});
```

- [ ] **Step 3: Run test, expect failure (or partial pass)**

```bash
npm test -- src/app/api/mobile/v1/home/__tests__/route.test.ts
```
The test may FAIL with shape mismatches if the existing handler returns a different structure. Note which specific assertion fails — that's what Step 4 fixes.

- [ ] **Step 4: Modify the handler to return `HomePayload`**

Open `src/app/api/mobile/v1/home/route.ts`. The handler should:
1. Call `getRequestUser(request)` (already supports Bearer per Plan 1 Task 7) to determine the user (or null if anonymous)
2. Fetch favorite team / next match / last match / compact standings / live strip / news strip from existing service layer
3. Cap newsStrip at 4 items (slice if longer)
4. Return `NextResponse.json(payload satisfies HomePayload)` to enforce the type at compile time

Concrete change — adjust the existing handler so the response satisfies `HomePayload`. Don't rewrite the data-fetching logic; only shape the output. If the existing service returns a different shape, build the response object inline in the route handler:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { getMobileHomePayload } from '@/lib/mobile-extra-api'; // or whatever the existing fn is
import type { HomePayload } from '@shared/types/mobile-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  const raw = await getMobileHomePayload({ userId: user?.id ?? null });

  const payload: HomePayload = {
    user: user ? { id: user.id, name: user.name, avatarUrl: user.avatarUrl } : null,
    favoriteTeam: raw.favoriteTeam ?? null,
    nextMatch: raw.nextMatch ?? null,
    lastMatch: raw.lastMatch ?? null,
    compactStandings: raw.compactStandings ?? [],
    liveStrip: raw.liveStrip ?? [],
    newsStrip: (raw.newsStrip ?? []).slice(0, 4),
  };

  return NextResponse.json(payload);
}
```

The exact field names from `raw.*` depend on what `getMobileHomePayload` actually returns. Read it first; if fields don't exist on the service layer, **stop and report** which fields are missing rather than inventing data. Add `mobile-extra-api.ts` changes only if absolutely necessary.

- [ ] **Step 5: Run test until 3 passing**

```bash
npm test -- src/app/api/mobile/v1/home/__tests__/route.test.ts
```
Expected: 3 passing. If shape mismatches persist, iterate on the handler (not the test — the test is the contract).

- [ ] **Step 6: Run full backend suite**

```bash
npm test
```
Expected: 31 passing (28 prior + 3 new).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/mobile/v1/home/route.ts src/app/api/mobile/v1/home/__tests__/route.test.ts
git commit -m "$(cat <<'EOF'
feat(mobile-api): refit /v1/home to HomePayload contract + tests

Handler now returns the v1.0 HomePayload shape (user, favoriteTeam,
nextMatch, lastMatch, compactStandings, liveStrip, newsStrip). News
strip capped at 4 items. Three contract tests assert anonymous + auth
flows and required keys.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Backend — refit `GET /v1/live` to `LivePayload` + contract test

**Files:**
- Modify: `src/app/api/mobile/v1/live/route.ts`
- Create: `src/app/api/mobile/v1/live/__tests__/route.test.ts`

- [ ] **Step 1: Read the existing handler** (`src/app/api/mobile/v1/live/route.ts`)

- [ ] **Step 2: Write the contract test**

Create `src/app/api/mobile/v1/live/__tests__/route.test.ts`:
```ts
import { GET } from '../route';
import { NextRequest } from 'next/server';
import type { LivePayload } from '@shared/types/mobile-api';

function mkReq(): NextRequest {
  return new NextRequest('http://localhost/api/mobile/v1/live');
}

describe('GET /api/mobile/v1/live — LivePayload contract', () => {
  test('returns 200 with groups + lastUpdated', async () => {
    const res = await GET(mkReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as LivePayload;
    expect(body).toHaveProperty('groups');
    expect(body).toHaveProperty('lastUpdated');
    expect(Array.isArray(body.groups)).toBe(true);
    expect(typeof body.lastUpdated).toBe('string');
    // lastUpdated should parse as ISO date
    expect(new Date(body.lastUpdated).toString()).not.toBe('Invalid Date');
  });

  test('each group has league + matches array', async () => {
    const res = await GET(mkReq());
    const body = (await res.json()) as LivePayload;
    for (const group of body.groups) {
      expect(group.league).toHaveProperty('id');
      expect(group.league).toHaveProperty('nameHe');
      expect(group.league).toHaveProperty('nameEn');
      expect(Array.isArray(group.matches)).toBe(true);
      // Each match has recentEvents capped at 3
      for (const match of group.matches) {
        expect(match.recentEvents.length).toBeLessThanOrEqual(3);
      }
    }
  });
});
```

- [ ] **Step 3: Run test, observe failure**

```bash
npm test -- src/app/api/mobile/v1/live/__tests__/route.test.ts
```

- [ ] **Step 4: Modify handler to return `LivePayload`**

Edit `src/app/api/mobile/v1/live/route.ts`. The shape is:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { getMobileLivePayload } from '@/lib/mobile-extra-api';
import type { LivePayload, LiveMatchExpanded } from '@shared/types/mobile-api';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  const raw = await getMobileLivePayload();
  const payload: LivePayload = {
    groups: (raw.groups ?? []).map((g) => ({
      league: g.league,
      matches: g.matches.map((m: LiveMatchExpanded) => ({
        ...m,
        recentEvents: (m.recentEvents ?? []).slice(0, 3),
      })),
    })),
    lastUpdated: raw.lastUpdated ?? new Date().toISOString(),
  };
  return NextResponse.json(payload);
}
```

Same caveat as Task 2: if `getMobileLivePayload` returns differently-named fields, read its actual return type and adapt. Don't invent fields.

- [ ] **Step 5: Tests pass**

```bash
npm test -- src/app/api/mobile/v1/live/__tests__/route.test.ts
```
Expected: 2 passing.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/mobile/v1/live/route.ts src/app/api/mobile/v1/live/__tests__/route.test.ts
git commit -m "$(cat <<'EOF'
feat(mobile-api): refit /v1/live to LivePayload contract + tests

Groups by league with each match's recentEvents capped at 3.
lastUpdated returns server ISO timestamp.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Mobile — design system primitives

**Files:**
- Create: `mobile/design-system/Card.tsx`
- Create: `mobile/design-system/MatchRow.tsx`
- Create: `mobile/design-system/TeamHeader.tsx`
- Create: `mobile/design-system/StatPill.tsx`
- Create: `mobile/design-system/LiveDot.tsx`
- Create: `mobile/design-system/__tests__/Card.test.tsx`
- Create: `mobile/design-system/__tests__/MatchRow.test.tsx`

This task builds the reusable visual primitives screens will compose. Snapshot tests cover only these primitives (not screens — too noisy, per the testing strategy).

- [ ] **Step 1: Write the failing snapshot test for `Card`**

Create `mobile/design-system/__tests__/Card.test.tsx`:
```tsx
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Card } from '../Card';

describe('Card', () => {
  test('renders children with default styling', () => {
    const { toJSON } = render(<Card><Text>Hello</Text></Card>);
    expect(toJSON()).toMatchSnapshot();
  });

  test('accepts className override', () => {
    const { toJSON } = render(
      <Card className="bg-blue-50"><Text>Custom</Text></Card>
    );
    expect(toJSON()).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
cd mobile
npm test -- design-system/__tests__/Card.test.tsx
```
Expected: module not found.

- [ ] **Step 3: Implement `Card.tsx`**

Create `mobile/design-system/Card.tsx`:
```tsx
import { View, ViewProps } from 'react-native';
import { ReactNode } from 'react';

interface CardProps extends ViewProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '', ...rest }: CardProps) {
  return (
    <View
      className={`bg-white rounded-lg p-4 shadow-sm border border-gray-100 ${className}`}
      {...rest}
    >
      {children}
    </View>
  );
}
```

- [ ] **Step 4: Run test, snapshot creates on first run**

```bash
npm test -- design-system/__tests__/Card.test.tsx
```
Expected: 2 passing (snapshots written on first run).

- [ ] **Step 5: Implement `LiveDot.tsx`**

Create `mobile/design-system/LiveDot.tsx`:
```tsx
import { View, Text } from 'react-native';

export function LiveDot() {
  return (
    <View className="flex-row items-center gap-1">
      <View className="w-2 h-2 rounded-full bg-red-500" />
      <Text className="text-xs text-red-600 font-bold">LIVE</Text>
    </View>
  );
}
```

(No test for LiveDot — too small. Component-level snapshot tests are reserved for Card and MatchRow.)

- [ ] **Step 6: Implement `StatPill.tsx`**

Create `mobile/design-system/StatPill.tsx`:
```tsx
import { View, Text } from 'react-native';

interface StatPillProps {
  label: string;
  value: string | number;
  className?: string;
}

export function StatPill({ label, value, className = '' }: StatPillProps) {
  return (
    <View className={`bg-gray-100 rounded-full px-3 py-1 flex-row items-center gap-2 ${className}`}>
      <Text className="text-xs text-gray-600">{label}</Text>
      <Text className="text-sm font-semibold text-gray-900">{value}</Text>
    </View>
  );
}
```

- [ ] **Step 7: Implement `TeamHeader.tsx`**

Create `mobile/design-system/TeamHeader.tsx`:
```tsx
import { View, Text, Image } from 'react-native';
import type { TeamHeader as TeamHeaderData } from '@shared/types/common';

interface TeamHeaderProps {
  team: TeamHeaderData;
}

export function TeamHeader({ team }: TeamHeaderProps) {
  return (
    <View className="flex-row items-center gap-3 py-4">
      {team.logoUrl ? (
        <Image source={{ uri: team.logoUrl }} className="w-16 h-16 rounded-md" />
      ) : (
        <View className="w-16 h-16 rounded-md bg-gray-200 items-center justify-center">
          <Text className="text-2xl font-bold text-gray-600">
            {team.nameHe.slice(0, 1)}
          </Text>
        </View>
      )}
      <View className="flex-1">
        <Text className="text-xl font-bold">{team.nameHe}</Text>
        {team.city && <Text className="text-sm text-gray-500">{team.city}</Text>}
      </View>
    </View>
  );
}
```

- [ ] **Step 8: Write the failing snapshot test for `MatchRow`**

Create `mobile/design-system/__tests__/MatchRow.test.tsx`:
```tsx
import { render } from '@testing-library/react-native';
import { MatchRow } from '../MatchRow';
import type { MatchCard } from '@shared/types/common';

const fixture: MatchCard = {
  id: 'm1',
  apiId: null,
  date: '2026-05-15T19:00:00Z',
  status: 'scheduled',
  minute: null,
  home: {
    team: { id: 't1', apiId: null, nameEn: 'Home', nameHe: 'בית', logoUrl: null },
    score: null,
  },
  away: {
    team: { id: 't2', apiId: null, nameEn: 'Away', nameHe: 'חוץ', logoUrl: null },
    score: null,
  },
  leagueId: 'l1',
  leagueName: 'ליגת העל',
};

describe('MatchRow', () => {
  test('renders scheduled match (no scores)', () => {
    const { toJSON } = render(<MatchRow match={fixture} />);
    expect(toJSON()).toMatchSnapshot();
  });

  test('renders finished match with scores', () => {
    const finished: MatchCard = {
      ...fixture,
      status: 'finished',
      home: { ...fixture.home, score: 2 },
      away: { ...fixture.away, score: 1 },
    };
    const { toJSON } = render(<MatchRow match={finished} />);
    expect(toJSON()).toMatchSnapshot();
  });

  test('renders live match with minute', () => {
    const live: MatchCard = {
      ...fixture,
      status: 'live',
      minute: 67,
      home: { ...fixture.home, score: 1 },
      away: { ...fixture.away, score: 1 },
    };
    const { toJSON } = render(<MatchRow match={live} />);
    expect(toJSON()).toMatchSnapshot();
  });
});
```

- [ ] **Step 9: Implement `MatchRow.tsx`**

Create `mobile/design-system/MatchRow.tsx`:
```tsx
import { View, Text } from 'react-native';
import type { MatchCard } from '@shared/types/common';
import { LiveDot } from './LiveDot';

interface MatchRowProps {
  match: MatchCard;
}

function formatScore(home: number | null, away: number | null): string {
  if (home === null || away === null) return '-';
  return `${home} - ${away}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function MatchRow({ match }: MatchRowProps) {
  const isLive = match.status === 'live';
  const isFinished = match.status === 'finished';

  return (
    <View className="flex-row items-center justify-between py-3 px-2 border-b border-gray-100">
      <View className="flex-1">
        <Text className="text-base">{match.home.team.nameHe}</Text>
        <Text className="text-base">{match.away.team.nameHe}</Text>
      </View>
      <View className="px-3 items-center">
        {isLive ? (
          <>
            <LiveDot />
            <Text className="text-xs text-gray-500 mt-1">{match.minute}'</Text>
          </>
        ) : isFinished ? (
          <Text className="text-base font-semibold">
            {formatScore(match.home.score, match.away.score)}
          </Text>
        ) : (
          <Text className="text-sm text-gray-500">{formatTime(match.date)}</Text>
        )}
      </View>
    </View>
  );
}
```

- [ ] **Step 10: Run all design-system tests**

```bash
cd mobile
npm test -- design-system
```
Expected: 5 snapshot tests passing (Card x2, MatchRow x3). Snapshots saved on first run.

- [ ] **Step 11: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
cd /Users/yaniv/Documents/AI/SoocerStats
git add mobile/design-system
git commit -m "$(cat <<'EOF'
feat(mobile): design-system primitives (Card, MatchRow, TeamHeader, StatPill, LiveDot)

Reusable presentation primitives for the core screens. Card and MatchRow
have snapshot tests covering scheduled/finished/live states. Others are
small enough to skip dedicated tests (verified visually via screens).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Mobile — TanStack Query persister (offline caching)

**Files:**
- Modify: `mobile/lib/queryClient.ts`
- Modify: `mobile/package.json` (add persister deps)
- Create: `mobile/lib/__tests__/queryClient.test.ts`

- [ ] **Step 1: Install persister packages**

```bash
cd mobile
npx expo install @tanstack/react-query-persist-client @tanstack/query-async-storage-persister @react-native-async-storage/async-storage -- --legacy-peer-deps
```

`@react-native-async-storage/async-storage` is used as the backing store for the persister. (Could use `expo-sqlite` but AsyncStorage is simpler and sufficient for query cache.)

- [ ] **Step 2: Write the failing test**

Create `mobile/lib/__tests__/queryClient.test.ts`:
```ts
import { queryClient, persister } from '../queryClient';

describe('queryClient persister', () => {
  test('persister is configured', () => {
    expect(persister).toBeDefined();
  });

  test('queryClient has 60s staleTime default', () => {
    const opts = queryClient.getDefaultOptions();
    expect(opts.queries?.staleTime).toBe(60_000);
  });
});
```

- [ ] **Step 3: Run, expect failure**

```bash
npm test -- lib/__tests__/queryClient.test.ts
```
Expected: `persister` export not found.

- [ ] **Step 4: Update `queryClient.ts`**

Replace `mobile/lib/queryClient.ts`:
```ts
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
      gcTime: 24 * 60 * 60 * 1000, // keep 24 hours
    },
  },
});

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'hbs-react-query-cache',
  throttleTime: 1000,
});
```

- [ ] **Step 5: Wire persister into root layout**

Open `mobile/app/_layout.tsx`. Replace the `QueryClientProvider` with `PersistQueryClientProvider`:
```tsx
import '../global.css';
import { useEffect } from 'react';
import { I18nManager } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, persister } from '@/lib/queryClient';
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
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        buster: 'v1', // bump to invalidate all cached queries
      }}
    >
      <AuthProvider>
        <AuthGate />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="login" />
        </Stack>
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}
```

- [ ] **Step 6: Mock AsyncStorage in jest.setup.ts**

Open `mobile/jest.setup.ts`. Add the AsyncStorage mock (preserve existing setup):
```ts
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(async () => {}),
  getItem: jest.fn(async () => null),
  removeItem: jest.fn(async () => {}),
}));
```

- [ ] **Step 7: Run tests**

```bash
cd mobile
npm test
```
Expected: all 23 prior tests still passing + 2 new queryClient tests = 25 passing.

- [ ] **Step 8: Commit**

```bash
cd /Users/yaniv/Documents/AI/SoocerStats
git add mobile/lib/queryClient.ts mobile/lib/__tests__/queryClient.test.ts mobile/app/_layout.tsx mobile/jest.setup.ts mobile/package.json mobile/package-lock.json
git commit -m "$(cat <<'EOF'
feat(mobile): TanStack Query persister for offline caching

AsyncStorage-backed persister with 24h gcTime and a 'v1' buster
key for invalidating the entire cache on breaking changes. Wraps
the app in PersistQueryClientProvider so queries hydrate from cache
on cold start and stale data is shown immediately while a network
refetch runs in background.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Mobile — Home screen

**Files:**
- Create: `mobile/hooks/useHome.ts`
- Modify: `mobile/app/(tabs)/index.tsx`
- Create: `mobile/app/(tabs)/__tests__/home.test.tsx`

- [ ] **Step 1: Write the failing hook test**

Create `mobile/hooks/__tests__/useHome.test.ts`:
```ts
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { ReactNode } from 'react';
import { useHome } from '../useHome';

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
};

describe('useHome', () => {
  test('returns loading state initially', () => {
    const { result } = renderHook(() => useHome(), { wrapper });
    expect(result.current.isLoading).toBe(true);
  });
});
```

- [ ] **Step 2: Create `mobile/hooks/useHome.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { HomePayload } from '@shared/types/mobile-api';

export function useHome() {
  return useQuery<HomePayload>({
    queryKey: ['home'],
    queryFn: () => apiClient.get<HomePayload>('/home'),
  });
}
```

- [ ] **Step 3: Test passes**

```bash
cd mobile
npm test -- hooks/__tests__/useHome.test.ts
```
Expected: 1 passing.

- [ ] **Step 4: Implement the Home screen**

Replace `mobile/app/(tabs)/index.tsx`:
```tsx
import { ScrollView, View, Text, RefreshControl, ActivityIndicator, Pressable, Image } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useHome } from '@/hooks/useHome';
import { Card } from '@/design-system/Card';
import { MatchRow } from '@/design-system/MatchRow';
import { LiveDot } from '@/design-system/LiveDot';

export default function HomeScreen() {
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching } = useHome();
  const [_] = useState(0);

  if (isLoading && !data) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  if (!data) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-6">
        <Text className="text-base text-gray-600 text-center">
          לא הצלחנו לטעון את הדף. נסה שוב מאוחר יותר.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      {/* Favorite team */}
      {data.favoriteTeam && (
        <Pressable onPress={() => router.push(`/teams/${data.favoriteTeam!.id}`)}>
          <Card>
            <View className="flex-row items-center gap-3">
              {data.favoriteTeam.logoUrl && (
                <Image source={{ uri: data.favoriteTeam.logoUrl }} className="w-12 h-12 rounded" />
              )}
              <Text className="text-lg font-bold">{data.favoriteTeam.nameHe}</Text>
            </View>
          </Card>
        </Pressable>
      )}

      {/* Live strip */}
      {data.liveStrip.length > 0 && (
        <Card>
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-base font-semibold">משחקים חיים</Text>
            <LiveDot />
          </View>
          {data.liveStrip.map((m) => (
            <Pressable key={m.id} onPress={() => router.push(`/games/${m.id}`)}>
              <View className="py-2 border-b border-gray-100">
                <Text className="text-sm">{m.home.name} - {m.away.name}</Text>
                <Text className="text-xs text-gray-500">
                  {m.home.score ?? '-'}:{m.away.score ?? '-'} ({m.minute}')
                </Text>
              </View>
            </Pressable>
          ))}
        </Card>
      )}

      {/* Next match */}
      {data.nextMatch && (
        <Card>
          <Text className="text-base font-semibold mb-2">המשחק הבא</Text>
          <Pressable onPress={() => router.push(`/games/${data.nextMatch!.id}`)}>
            <MatchRow match={data.nextMatch} />
          </Pressable>
        </Card>
      )}

      {/* Last match */}
      {data.lastMatch && (
        <Card>
          <Text className="text-base font-semibold mb-2">המשחק האחרון</Text>
          <Pressable onPress={() => router.push(`/games/${data.lastMatch!.id}`)}>
            <MatchRow match={data.lastMatch} />
          </Pressable>
        </Card>
      )}

      {/* Compact standings */}
      {data.compactStandings.length > 0 && (
        <Card>
          <Text className="text-base font-semibold mb-2">טבלה</Text>
          {data.compactStandings.map((row) => (
            <View key={row.rank} className="flex-row justify-between py-1">
              <Text className="text-sm">{row.rank}. {row.teamName}</Text>
              <Text className="text-sm font-semibold">{row.points} ({row.played})</Text>
            </View>
          ))}
        </Card>
      )}

      {/* News strip */}
      {data.newsStrip.length > 0 && (
        <Card>
          <Text className="text-base font-semibold mb-2">חדשות</Text>
          {data.newsStrip.map((n) => (
            <View key={n.id} className="py-2 border-b border-gray-100">
              <Text className="text-sm" numberOfLines={2}>{n.preview}</Text>
              <Text className="text-xs text-gray-500 mt-1">{n.source}</Text>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}
```

- [ ] **Step 5: Type-check**

```bash
cd mobile
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: All tests pass**

```bash
npm test
```
Expected: 26 total (was 25, +1 useHome).

- [ ] **Step 7: Commit**

```bash
cd /Users/yaniv/Documents/AI/SoocerStats
git add mobile/hooks/useHome.ts mobile/hooks/__tests__/useHome.test.ts mobile/app/\(tabs\)/index.tsx
git commit -m "$(cat <<'EOF'
feat(mobile): Home screen with useHome hook

Renders favorite team, live strip, next/last match, compact standings,
and news strip from /v1/home. Pull-to-refresh wired to TanStack Query
refetch. Each card has a tap target that navigates to the relevant
detail screen (teams, games — those screens come in later tasks).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Mobile — Live screen with auto-refresh

**Files:**
- Create: `mobile/hooks/useLive.ts`
- Modify: `mobile/app/(tabs)/live.tsx`

- [ ] **Step 1: Create `mobile/hooks/useLive.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { LivePayload } from '@shared/types/mobile-api';

export function useLive() {
  return useQuery<LivePayload>({
    queryKey: ['live'],
    queryFn: () => apiClient.get<LivePayload>('/live'),
    refetchInterval: 30_000, // poll every 30s while screen is foregrounded
    refetchIntervalInBackground: false,
  });
}
```

- [ ] **Step 2: Implement Live screen**

Replace `mobile/app/(tabs)/live.tsx`:
```tsx
import { ScrollView, View, Text, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useLive } from '@/hooks/useLive';
import { Card } from '@/design-system/Card';
import { LiveDot } from '@/design-system/LiveDot';

function formatLastUpdated(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

export default function LiveScreen() {
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching } = useLive();

  if (isLoading && !data) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  if (!data || data.groups.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-6">
        <Text className="text-base text-gray-600 text-center">
          אין משחקים חיים כרגע.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      <View className="flex-row justify-between items-center mb-2">
        <LiveDot />
        <Text className="text-xs text-gray-500">עודכן {formatLastUpdated(data.lastUpdated)}</Text>
      </View>
      {data.groups.map((group) => (
        <Card key={group.league.id}>
          <Text className="text-base font-bold mb-2">{group.league.nameHe}</Text>
          {group.matches.map((m) => (
            <Pressable key={m.id} onPress={() => router.push(`/games/${m.id}`)}>
              <View className="flex-row justify-between py-2 border-b border-gray-100">
                <View className="flex-1">
                  <Text className="text-sm">{m.home.team.nameHe}</Text>
                  <Text className="text-sm">{m.away.team.nameHe}</Text>
                </View>
                <View className="items-center px-3">
                  <Text className="text-sm font-semibold">{m.home.score ?? '-'} - {m.away.score ?? '-'}</Text>
                  <Text className="text-xs text-gray-500">{m.minute}'</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </Card>
      ))}
    </ScrollView>
  );
}
```

- [ ] **Step 3: Type-check + tests**

```bash
cd mobile
npx tsc --noEmit
npm test
```
Expected: all passing.

- [ ] **Step 4: Commit**

```bash
cd /Users/yaniv/Documents/AI/SoocerStats
git add mobile/hooks/useLive.ts mobile/app/\(tabs\)/live.tsx
git commit -m "$(cat <<'EOF'
feat(mobile): Live screen grouped by league with 30s auto-refresh

useLive polls /v1/live every 30s while foregrounded. Live screen
shows grouped matches, each row tap-able to navigate to the match
detail (Task 11). Empty state handled.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Add Match + Team payload types — already done in Task 1

Task 1 added all payload types at once. **This task slot intentionally short** — proceed to Task 9.

(No work; serves as a checkpoint marker between Sprints.)

---

### Task 9: Backend — refit `GET /v1/games/:id` to `MatchPayload` + contract test

**Files:**
- Modify: `src/app/api/mobile/v1/games/[id]/route.ts`
- Create: `src/app/api/mobile/v1/games/[id]/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing contract test**

Create `src/app/api/mobile/v1/games/[id]/__tests__/route.test.ts`:
```ts
import { GET } from '../route';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import type { MatchPayload } from '@shared/types/mobile-api';

function mkReq(id: string): { req: NextRequest; params: { id: string } } {
  return {
    req: new NextRequest(`http://localhost/api/mobile/v1/games/${id}`),
    params: { id },
  };
}

describe('GET /api/mobile/v1/games/:id — MatchPayload contract', () => {
  test('returns 404 for non-existent match', async () => {
    const { req, params } = mkReq('non-existent-id');
    const res = await GET(req, { params: Promise.resolve(params) });
    expect(res.status).toBe(404);
  });

  test('returns 200 with MatchPayload shape for a real game', async () => {
    // Find any existing game in the DB
    const game = await prisma.match.findFirst({ select: { id: true } });
    if (!game) {
      console.warn('No matches in dev DB — skipping');
      return;
    }
    const { req, params } = mkReq(game.id);
    const res = await GET(req, { params: Promise.resolve(params) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as MatchPayload;
    expect(body.match.id).toBe(game.id);
    expect(body).toHaveProperty('homeTeam');
    expect(body).toHaveProperty('awayTeam');
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.lineups).toHaveProperty('home');
    expect(body.lineups).toHaveProperty('away');
  });
});
```

- [ ] **Step 2: Run, observe failure**

```bash
npm test -- src/app/api/mobile/v1/games/\\[id\\]/__tests__/route.test.ts
```

- [ ] **Step 3: Modify the route handler to return `MatchPayload`**

Read `src/app/api/mobile/v1/games/[id]/route.ts` to understand the current return shape. Then refit:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { getMobileGamePayload } from '@/lib/mobile-extra-api';
import type { MatchPayload } from '@shared/types/mobile-api';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const raw = await getMobileGamePayload(id);
  if (!raw) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const payload: MatchPayload = {
    match: raw.match,
    homeTeam: raw.homeTeam,
    awayTeam: raw.awayTeam,
    events: raw.events ?? [],
    lineups: {
      home: raw.lineups?.home ?? { formation: null, players: [] },
      away: raw.lineups?.away ?? { formation: null, players: [] },
    },
    matchStats: raw.matchStats ?? null,
    h2h: raw.h2h ?? null,
  };
  return NextResponse.json(payload);
}
```

Same caveat as Tasks 2-3 — if the service layer doesn't have these fields, read its actual return and adapt.

- [ ] **Step 4: Tests pass**

```bash
npm test -- src/app/api/mobile/v1/games
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/mobile/v1/games/\[id\]/route.ts src/app/api/mobile/v1/games/\[id\]/__tests__/route.test.ts
git commit -m "$(cat <<'EOF'
feat(mobile-api): refit /v1/games/:id to MatchPayload contract + tests

Returns match metadata, home/away team headers, events timeline,
lineups, match stats, and h2h. 404 on unknown id.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Backend — refit `GET /v1/teams/:id` to `TeamPayload` + contract test

**Files:**
- Modify: `src/app/api/mobile/v1/teams/[id]/route.ts`
- Create: `src/app/api/mobile/v1/teams/[id]/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing contract test**

Create `src/app/api/mobile/v1/teams/[id]/__tests__/route.test.ts`:
```ts
import { GET } from '../route';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import type { TeamPayload } from '@shared/types/mobile-api';

describe('GET /api/mobile/v1/teams/:id — TeamPayload contract', () => {
  test('returns 404 for non-existent team', async () => {
    const req = new NextRequest('http://localhost/api/mobile/v1/teams/bogus');
    const res = await GET(req, { params: Promise.resolve({ id: 'bogus' }) });
    expect(res.status).toBe(404);
  });

  test('returns 200 with TeamPayload shape', async () => {
    const team = await prisma.team.findFirst({ select: { id: true } });
    if (!team) return;
    const req = new NextRequest(`http://localhost/api/mobile/v1/teams/${team.id}`);
    const res = await GET(req, { params: Promise.resolve({ id: team.id }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as TeamPayload;
    expect(body.team.id).toBe(team.id);
    expect(Array.isArray(body.recentForm)).toBe(true);
    expect(Array.isArray(body.squad)).toBe(true);
    expect(body).toHaveProperty('seasonStats');
  });
});
```

- [ ] **Step 2: Run, observe failure**

```bash
npm test -- src/app/api/mobile/v1/teams/\\[id\\]
```

- [ ] **Step 3: Modify the handler**

Refit `src/app/api/mobile/v1/teams/[id]/route.ts` to return `TeamPayload`. Same pattern as Task 9 — read the existing service layer, build the response object, return.

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getMobileTeamPayload } from '@/lib/mobile-extra-api';
import type { TeamPayload } from '@shared/types/mobile-api';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const raw = await getMobileTeamPayload(id);
  if (!raw) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const payload: TeamPayload = {
    team: raw.team,
    coach: raw.coach ?? null,
    standingsContext: raw.standingsContext ?? null,
    nextMatch: raw.nextMatch ?? null,
    lastMatch: raw.lastMatch ?? null,
    recentForm: raw.recentForm ?? [],
    squad: raw.squad ?? [],
    seasonStats: raw.seasonStats,
  };
  return NextResponse.json(payload);
}
```

- [ ] **Step 4: Tests pass**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/mobile/v1/teams/\[id\]/route.ts src/app/api/mobile/v1/teams/\[id\]/__tests__/route.test.ts
git commit -m "$(cat <<'EOF'
feat(mobile-api): refit /v1/teams/:id to TeamPayload contract + tests

Returns team header, coach, standings context, next/last match,
recent form, squad grouped by position, and season stats.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Mobile — Match screen (header + events timeline)

**Files:**
- Create: `mobile/hooks/useMatch.ts`
- Create: `mobile/app/games/[id].tsx`

- [ ] **Step 1: Create hook**

`mobile/hooks/useMatch.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { MatchPayload } from '@shared/types/mobile-api';

export function useMatch(id: string) {
  return useQuery<MatchPayload>({
    queryKey: ['match', id],
    queryFn: () => apiClient.get<MatchPayload>(`/games/${id}`),
    enabled: !!id,
  });
}
```

- [ ] **Step 2: Implement Match screen (header + events; lineups + stats in Task 12)**

Create `mobile/app/games/[id].tsx`:
```tsx
import { ScrollView, View, Text, ActivityIndicator, Image } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMatch } from '@/hooks/useMatch';
import { Card } from '@/design-system/Card';
import { LiveDot } from '@/design-system/LiveDot';
import type { MatchEvent } from '@shared/types/mobile-api';

function EventRow({ event }: { event: MatchEvent }) {
  const icon = {
    goal: '⚽',
    yellow: '🟨',
    red: '🟥',
    sub: '🔄',
    penalty: '🎯',
  }[event.type];
  const align = event.team === 'home' ? 'flex-row' : 'flex-row-reverse';
  return (
    <View className={`${align} items-center gap-2 py-1`}>
      <Text className="text-sm w-8 text-gray-500">{event.minute}'</Text>
      <Text className="text-base">{icon}</Text>
      <Text className="flex-1 text-sm">{event.player ?? '—'}</Text>
    </View>
  );
}

export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useMatch(id);

  if (isLoading || !data) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  const { match, homeTeam, awayTeam, events } = data;
  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, gap: 12 }}>
      {/* Header */}
      <Card>
        <View className="flex-row items-center justify-between">
          <View className="items-center flex-1">
            {homeTeam.logoUrl && <Image source={{ uri: homeTeam.logoUrl }} className="w-16 h-16 rounded" />}
            <Text className="text-sm mt-2 text-center">{homeTeam.nameHe}</Text>
          </View>
          <View className="items-center px-4">
            {match.status === 'live' && <LiveDot />}
            <Text className="text-3xl font-bold">
              {match.score.home ?? '-'} - {match.score.away ?? '-'}
            </Text>
            <Text className="text-xs text-gray-500 mt-1">
              {match.status === 'live' ? `${match.minute}'` : match.status}
            </Text>
          </View>
          <View className="items-center flex-1">
            {awayTeam.logoUrl && <Image source={{ uri: awayTeam.logoUrl }} className="w-16 h-16 rounded" />}
            <Text className="text-sm mt-2 text-center">{awayTeam.nameHe}</Text>
          </View>
        </View>
        {match.venue && (
          <Text className="text-xs text-gray-500 text-center mt-3">
            {match.venue.name}{match.venue.city ? `, ${match.venue.city}` : ''}
          </Text>
        )}
      </Card>

      {/* Events */}
      {events.length > 0 && (
        <Card>
          <Text className="text-base font-bold mb-2">אירועים</Text>
          {events.map((e) => <EventRow key={e.id} event={e} />)}
        </Card>
      )}
    </ScrollView>
  );
}
```

- [ ] **Step 3: Type-check + tests**

```bash
cd mobile
npx tsc --noEmit
npm test
```

- [ ] **Step 4: Commit**

```bash
cd /Users/yaniv/Documents/AI/SoocerStats
git add mobile/hooks/useMatch.ts mobile/app/games
git commit -m "$(cat <<'EOF'
feat(mobile): Match screen — header + events timeline

useMatch hook fetches /v1/games/:id. Header shows team logos, score,
status (live dot for live games), and venue. Events timeline renders
goals/cards/subs with icon + minute, mirrored by team side.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Mobile — Match screen (lineups + stats + h2h)

**Files:**
- Modify: `mobile/app/games/[id].tsx`

- [ ] **Step 1: Extend Match screen with lineups, stats, h2h**

Open `mobile/app/games/[id].tsx`. After the `Events` Card, add:

```tsx
{/* Lineups */}
{(data.lineups.home.players.length > 0 || data.lineups.away.players.length > 0) && (
  <Card>
    <Text className="text-base font-bold mb-2">הרכבים</Text>
    <View className="flex-row gap-3">
      <View className="flex-1">
        <Text className="text-sm font-semibold mb-1">{homeTeam.nameHe}</Text>
        {data.lineups.home.formation && (
          <Text className="text-xs text-gray-500 mb-2">{data.lineups.home.formation}</Text>
        )}
        {data.lineups.home.players.filter((p) => p.isStarting).map((p) => (
          <Text key={p.player.id} className="text-sm py-1">
            {p.player.jerseyNumber ?? '—'} · {p.player.nameHe}
          </Text>
        ))}
      </View>
      <View className="flex-1">
        <Text className="text-sm font-semibold mb-1">{awayTeam.nameHe}</Text>
        {data.lineups.away.formation && (
          <Text className="text-xs text-gray-500 mb-2">{data.lineups.away.formation}</Text>
        )}
        {data.lineups.away.players.filter((p) => p.isStarting).map((p) => (
          <Text key={p.player.id} className="text-sm py-1">
            {p.player.jerseyNumber ?? '—'} · {p.player.nameHe}
          </Text>
        ))}
      </View>
    </View>
  </Card>
)}

{/* Match stats */}
{data.matchStats && (
  <Card>
    <Text className="text-base font-bold mb-2">סטטיסטיקה</Text>
    {data.matchStats.possession && (
      <View className="flex-row justify-between py-1">
        <Text className="text-sm">{data.matchStats.possession.home}%</Text>
        <Text className="text-sm text-gray-500">החזקה</Text>
        <Text className="text-sm">{data.matchStats.possession.away}%</Text>
      </View>
    )}
    {data.matchStats.shots && (
      <View className="flex-row justify-between py-1">
        <Text className="text-sm">{data.matchStats.shots.home}</Text>
        <Text className="text-sm text-gray-500">בעיטות</Text>
        <Text className="text-sm">{data.matchStats.shots.away}</Text>
      </View>
    )}
    {data.matchStats.corners && (
      <View className="flex-row justify-between py-1">
        <Text className="text-sm">{data.matchStats.corners.home}</Text>
        <Text className="text-sm text-gray-500">קרנות</Text>
        <Text className="text-sm">{data.matchStats.corners.away}</Text>
      </View>
    )}
  </Card>
)}

{/* H2H */}
{data.h2h && data.h2h.lastN.length > 0 && (
  <Card>
    <Text className="text-base font-bold mb-2">היסטוריה ישירה</Text>
    <View className="flex-row justify-around py-2">
      <View className="items-center">
        <Text className="text-xl font-bold">{data.h2h.wins.home}</Text>
        <Text className="text-xs text-gray-500">{homeTeam.nameHe}</Text>
      </View>
      <View className="items-center">
        <Text className="text-xl font-bold">{data.h2h.wins.draw}</Text>
        <Text className="text-xs text-gray-500">תיקו</Text>
      </View>
      <View className="items-center">
        <Text className="text-xl font-bold">{data.h2h.wins.away}</Text>
        <Text className="text-xs text-gray-500">{awayTeam.nameHe}</Text>
      </View>
    </View>
  </Card>
)}
```

- [ ] **Step 2: Type-check + tests**

```bash
cd mobile
npx tsc --noEmit
npm test
```

- [ ] **Step 3: Commit**

```bash
cd /Users/yaniv/Documents/AI/SoocerStats
git add mobile/app/games
git commit -m "$(cat <<'EOF'
feat(mobile): Match screen — lineups, stats, h2h

Adds three more sections to the Match screen. Lineups split by side
(starting XI only — subs deferred to v1.1). Match stats show possession,
shots, corners as paired numbers per team. H2H section shows W/D/L
counts from last N meetings.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Mobile — Team screen

**Files:**
- Create: `mobile/hooks/useTeam.ts`
- Create: `mobile/app/teams/[id].tsx`

- [ ] **Step 1: Hook**

`mobile/hooks/useTeam.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { TeamPayload } from '@shared/types/mobile-api';

export function useTeam(id: string) {
  return useQuery<TeamPayload>({
    queryKey: ['team', id],
    queryFn: () => apiClient.get<TeamPayload>(`/teams/${id}`),
    enabled: !!id,
  });
}
```

- [ ] **Step 2: Team screen**

Create `mobile/app/teams/[id].tsx`:
```tsx
import { ScrollView, View, Text, ActivityIndicator, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTeam } from '@/hooks/useTeam';
import { Card } from '@/design-system/Card';
import { TeamHeader } from '@/design-system/TeamHeader';
import { MatchRow } from '@/design-system/MatchRow';

const formColors: Record<'W' | 'D' | 'L', string> = {
  W: 'bg-green-500',
  D: 'bg-yellow-500',
  L: 'bg-red-500',
};

export default function TeamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading } = useTeam(id);

  if (isLoading || !data) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card>
        <TeamHeader team={data.team} />
        {data.coach && (
          <Text className="text-sm text-gray-600 mt-2">מאמן: {data.coach.name}</Text>
        )}
      </Card>

      {/* Recent form */}
      {data.recentForm.length > 0 && (
        <Card>
          <Text className="text-base font-bold mb-2">צורה אחרונה</Text>
          <View className="flex-row gap-2">
            {data.recentForm.map((r, i) => (
              <View key={i} className={`w-8 h-8 rounded items-center justify-center ${formColors[r]}`}>
                <Text className="text-white font-bold">{r}</Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      {/* Standings context */}
      {data.standingsContext && (
        <Card>
          <Text className="text-base font-bold mb-2">
            מקום {data.standingsContext.rank} · {data.standingsContext.points} נקודות
          </Text>
          {data.standingsContext.around.map((row) => (
            <View key={row.rank} className="flex-row justify-between py-1">
              <Text className="text-sm">{row.rank}. {row.team.nameHe}</Text>
              <Text className="text-sm">{row.points}</Text>
            </View>
          ))}
        </Card>
      )}

      {/* Next + last match */}
      {data.nextMatch && (
        <Card>
          <Text className="text-base font-semibold mb-2">המשחק הבא</Text>
          <Pressable onPress={() => router.push(`/games/${data.nextMatch!.id}`)}>
            <MatchRow match={data.nextMatch} />
          </Pressable>
        </Card>
      )}
      {data.lastMatch && (
        <Card>
          <Text className="text-base font-semibold mb-2">המשחק האחרון</Text>
          <Pressable onPress={() => router.push(`/games/${data.lastMatch!.id}`)}>
            <MatchRow match={data.lastMatch} />
          </Pressable>
        </Card>
      )}

      {/* Squad */}
      {data.squad.length > 0 && (
        <Card>
          <Text className="text-base font-bold mb-2">סגל</Text>
          {data.squad.map((group) => (
            <View key={group.position} className="mb-3">
              <Text className="text-sm font-semibold text-gray-600 mb-1">{group.position}</Text>
              {group.players.map((p) => (
                <Pressable key={p.id} onPress={() => router.push(`/players/${p.id}`)}>
                  <View className="py-1 flex-row justify-between">
                    <Text className="text-sm">{p.nameHe}</Text>
                    <Text className="text-xs text-gray-500">{p.jerseyNumber ?? '—'}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ))}
        </Card>
      )}

      {/* Season stats */}
      <Card>
        <Text className="text-base font-bold mb-2">סטטיסטיקות עונה</Text>
        <View className="flex-row justify-around">
          <View className="items-center">
            <Text className="text-2xl font-bold">{data.seasonStats.goalsScored}</Text>
            <Text className="text-xs text-gray-500">שערים בעד</Text>
          </View>
          <View className="items-center">
            <Text className="text-2xl font-bold">{data.seasonStats.goalsAgainst}</Text>
            <Text className="text-xs text-gray-500">שערים נגד</Text>
          </View>
          <View className="items-center">
            <Text className="text-2xl font-bold">{data.seasonStats.cleanSheets}</Text>
            <Text className="text-xs text-gray-500">רשת נקייה</Text>
          </View>
        </View>
      </Card>
    </ScrollView>
  );
}
```

- [ ] **Step 3: Type-check + tests**

```bash
cd mobile
npx tsc --noEmit
npm test
```

- [ ] **Step 4: Commit**

```bash
cd /Users/yaniv/Documents/AI/SoocerStats
git add mobile/hooks/useTeam.ts mobile/app/teams
git commit -m "$(cat <<'EOF'
feat(mobile): Team screen

useTeam fetches /v1/teams/:id. Renders header (with coach), recent form
pills, standings context, next/last match, squad grouped by position
(each player tap-able), and a season stats summary.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Mobile — deep linking config

**Files:**
- Modify: `mobile/app.json`

Adds universal links + custom scheme so a tap on `hbstats://teams/123` or `https://hbstats.example.com/teams/123` opens the team screen.

- [ ] **Step 1: Add `associatedDomains` to ios config**

Open `mobile/app.json`. Inside `expo.ios`, add:
```json
"associatedDomains": ["applinks:hbstats.example.com"]
```

(Replace `hbstats.example.com` with the actual production domain once known. For dev testing, leave the placeholder — the custom `hbstats://` scheme works without server-side AASA configuration.)

The existing `scheme: "hbstats"` already handles the custom URI scheme; nothing more to add for that.

- [ ] **Step 2: Verify Expo Router auto-resolves deep links**

Expo Router 6 maps URL paths to file routes automatically:
- `hbstats://teams/123` → `app/teams/[id].tsx`
- `hbstats://games/456` → `app/games/[id].tsx`
- `hbstats://players/789` → `app/players/[id].tsx`

No additional routing config needed — file-based routing handles it.

- [ ] **Step 3: Type-check**

```bash
cd mobile
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd /Users/yaniv/Documents/AI/SoocerStats
git add mobile/app.json
git commit -m "$(cat <<'EOF'
feat(mobile): deep linking config — associated domains + custom scheme

iOS associatedDomains placeholder for universal links (production
domain TBD until DNS is finalized). The hbstats:// custom scheme is
already configured from Plan 1. Expo Router 6 maps URL paths to file
routes automatically — no routing code changes needed.

Server-side AASA (apple-app-site-association) JSON will be deployed
in Plan 3 alongside App Store metadata.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Backend — trim `GET /v1/players/:id` to basic `PlayerPayload`

**Files:**
- Modify: `src/app/api/mobile/v1/players/[id]/route.ts`
- Create: `src/app/api/mobile/v1/players/[id]/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing contract test**

```ts
import { GET } from '../route';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import type { PlayerPayload } from '@shared/types/mobile-api';

describe('GET /api/mobile/v1/players/:id — basic PlayerPayload', () => {
  test('returns 404 for unknown id', async () => {
    const req = new NextRequest('http://localhost/api/mobile/v1/players/bogus');
    const res = await GET(req, { params: Promise.resolve({ id: 'bogus' }) });
    expect(res.status).toBe(404);
  });

  test('returns basic shape (no career, no charts)', async () => {
    const player = await prisma.player.findFirst({ select: { id: true } });
    if (!player) return;
    const req = new NextRequest(`http://localhost/api/mobile/v1/players/${player.id}`);
    const res = await GET(req, { params: Promise.resolve({ id: player.id }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as PlayerPayload;
    expect(body.player.id).toBe(player.id);
    // v1.0 omits these fields:
    expect(body).not.toHaveProperty('careerHistory');
    expect(body).not.toHaveProperty('seasonSwitcher');
    expect(body).not.toHaveProperty('charts');
    // v1.0 includes:
    expect(body).toHaveProperty('currentSeasonStats');
    expect(Array.isArray(body.recentMatches)).toBe(true);
    expect(body.recentMatches.length).toBeLessThanOrEqual(5);
  });
});
```

- [ ] **Step 2: Run, observe failure**

```bash
npm test -- src/app/api/mobile/v1/players
```

- [ ] **Step 3: Trim the handler**

Edit `src/app/api/mobile/v1/players/[id]/route.ts`. The handler may currently return more fields than the basic v1.0 shape needs. Strip it:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getMobilePlayerPayload } from '@/lib/mobile-extra-api';
import type { PlayerPayload } from '@shared/types/mobile-api';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const raw = await getMobilePlayerPayload(id);
  if (!raw) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const payload: PlayerPayload = {
    player: {
      id: raw.player.id,
      nameHe: raw.player.nameHe,
      nameEn: raw.player.nameEn,
      photoUrl: raw.player.photoUrl ?? null,
      dateOfBirth: raw.player.dateOfBirth ?? null,
      nationality: raw.player.nationality ?? null,
      position: raw.player.position ?? null,
    },
    currentTeam: raw.currentTeam ?? null,
    currentSeasonStats: raw.currentSeasonStats ?? null,
    recentMatches: (raw.recentMatches ?? []).slice(0, 5),
  };
  return NextResponse.json(payload);
}
```

- [ ] **Step 4: Tests pass**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/mobile/v1/players/\[id\]/route.ts src/app/api/mobile/v1/players/\[id\]/__tests__/route.test.ts
git commit -m "$(cat <<'EOF'
feat(mobile-api): trim /v1/players/:id to basic PlayerPayload (v1.0)

Drops career history, season switcher, charts — those land in v1.1.
v1.0 returns profile, current team, current-season stats, and last 5
matches.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Backend — `/v1/preferences` Bearer-aware GET + contract test

**Files:**
- Modify: `src/app/api/mobile/v1/preferences/route.ts`
- Create: `src/app/api/mobile/v1/preferences/__tests__/route.test.ts`

The current GET handler is `export async function GET()` — no arg — and uses `getMobilePreferencesPayload()` which reads from `cookies()` internally. Mobile sends no cookie, only a Bearer header. This task makes GET request-aware via `getRequestUser()` so bearer-auth works.

- [ ] **Step 1: Make GET request-aware**

Read `src/app/api/mobile/v1/preferences/route.ts`. Modify GET to accept a NextRequest and use `getRequestUser`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { getMobilePreferencesPayload, updateMobilePreferencesPayload } from '@/lib/mobile-extra-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const payload = await getMobilePreferencesPayload({ userId: user.id });
  return NextResponse.json(payload);
}

export async function PUT(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const payload = await updateMobilePreferencesPayload({
    userId: user.id,
    favoriteTeamApiIds: body?.favoriteTeamApiIds,
    favoriteCompetitionApiIds: body?.favoriteCompetitionApiIds,
  });
  return NextResponse.json(payload);
}
```

Note: this assumes `getMobilePreferencesPayload({ userId })` exists in `mobile-extra-api.ts`. The current code calls it with no args (relying on cookies). If the function signature doesn't accept `userId`, modify it accordingly — read `src/lib/mobile-extra-api.ts` first.

- [ ] **Step 2: Write the contract test**

Create `src/app/api/mobile/v1/preferences/__tests__/route.test.ts`:
```ts
import { GET, PUT } from '../route';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { signAccessToken } from '@/lib/jwt';
import type { PreferencesPayload } from '@shared/types/mobile-api';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-at-least-32-bytes-long-xx';
});

describe('/api/mobile/v1/preferences contract', () => {
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `prefs-test-${Date.now()}@test.local`,
        name: 'Prefs Tester',
        password: await hashPassword('x'),
        isActive: true,
      },
    });
    userId = user.id;
    accessToken = signAccessToken(userId);
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  test('GET returns 401 without Bearer', async () => {
    const req = new NextRequest('http://localhost/api/mobile/v1/preferences');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  test('GET with Bearer returns PreferencesPayload', async () => {
    const req = new NextRequest('http://localhost/api/mobile/v1/preferences', {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as PreferencesPayload;
    expect(Array.isArray(body.favoriteTeamApiIds)).toBe(true);
    expect(Array.isArray(body.favoriteCompetitionApiIds)).toBe(true);
  });

  test('PUT with Bearer updates preferences', async () => {
    const req = new NextRequest('http://localhost/api/mobile/v1/preferences', {
      method: 'PUT',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ favoriteTeamApiIds: [1, 2], favoriteCompetitionApiIds: [10] }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as PreferencesPayload;
    expect(body.favoriteTeamApiIds).toContain(1);
    expect(body.favoriteCompetitionApiIds).toContain(10);
  });
});
```

- [ ] **Step 3: Run tests until 3 passing**

```bash
npm test -- src/app/api/mobile/v1/preferences
```

If the test fails because `getMobilePreferencesPayload` doesn't accept a `userId` arg, modify that function in `src/lib/mobile-extra-api.ts` to take an explicit user id parameter (this is a small refactor — read the current implementation first, the change is mechanical).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/mobile/v1/preferences src/lib/mobile-extra-api.ts
git commit -m "$(cat <<'EOF'
feat(mobile-api): /v1/preferences GET accepts Bearer auth + contract tests

Previous GET used cookies()-based auth and returned 401 for mobile
requests that only carry a Bearer token. Now both GET and PUT use
getRequestUser(request) — same pattern as other /v1/* routes.

Three contract tests cover: 401 without Bearer, 200 with Bearer
(read), 200 with Bearer (update).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: Mobile — Player screen (basic)

**Files:**
- Create: `mobile/hooks/usePlayer.ts`
- Create: `mobile/app/players/[id].tsx`

- [ ] **Step 1: Hook**

`mobile/hooks/usePlayer.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { PlayerPayload } from '@shared/types/mobile-api';

export function usePlayer(id: string) {
  return useQuery<PlayerPayload>({
    queryKey: ['player', id],
    queryFn: () => apiClient.get<PlayerPayload>(`/players/${id}`),
    enabled: !!id,
  });
}
```

- [ ] **Step 2: Player screen**

Create `mobile/app/players/[id].tsx`:
```tsx
import { ScrollView, View, Text, ActivityIndicator, Image, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePlayer } from '@/hooks/usePlayer';
import { Card } from '@/design-system/Card';

const roleLabel: Record<'started' | 'subbed_in' | 'unused' | 'subbed_out', string> = {
  started: 'התחיל',
  subbed_in: 'נכנס',
  unused: 'ספסל',
  subbed_out: 'הוחלף',
};

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading } = usePlayer(id);

  if (isLoading || !data) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  const stats = data.currentSeasonStats;
  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card>
        <View className="flex-row items-center gap-3">
          {data.player.photoUrl ? (
            <Image source={{ uri: data.player.photoUrl }} className="w-20 h-20 rounded-full" />
          ) : (
            <View className="w-20 h-20 rounded-full bg-gray-200 items-center justify-center">
              <Text className="text-2xl text-gray-600 font-bold">
                {data.player.nameHe.slice(0, 1)}
              </Text>
            </View>
          )}
          <View className="flex-1">
            <Text className="text-xl font-bold">{data.player.nameHe}</Text>
            {data.player.position && <Text className="text-sm text-gray-500">{data.player.position}</Text>}
            {data.player.nationality && (
              <Text className="text-sm text-gray-500">{data.player.nationality}</Text>
            )}
          </View>
        </View>
        {data.currentTeam && (
          <Pressable onPress={() => router.push(`/teams/${data.currentTeam!.id}`)}>
            <Text className="text-sm text-blue-600 mt-2">
              קבוצה: {data.currentTeam.nameHe}
            </Text>
          </Pressable>
        )}
      </Card>

      {/* Current season stats */}
      {stats && (
        <Card>
          <Text className="text-base font-bold mb-2">סטטיסטיקות עונה</Text>
          <View className="flex-row flex-wrap gap-3 justify-around">
            <View className="items-center"><Text className="text-2xl font-bold">{stats.appearances}</Text><Text className="text-xs text-gray-500">משחקים</Text></View>
            <View className="items-center"><Text className="text-2xl font-bold">{stats.goals}</Text><Text className="text-xs text-gray-500">שערים</Text></View>
            <View className="items-center"><Text className="text-2xl font-bold">{stats.assists}</Text><Text className="text-xs text-gray-500">בישולים</Text></View>
            <View className="items-center"><Text className="text-2xl font-bold">{stats.yellowCards}</Text><Text className="text-xs text-gray-500">צהובים</Text></View>
            <View className="items-center"><Text className="text-2xl font-bold">{stats.redCards}</Text><Text className="text-xs text-gray-500">אדומים</Text></View>
            <View className="items-center"><Text className="text-2xl font-bold">{Math.round(stats.minutes / 60)}h</Text><Text className="text-xs text-gray-500">דקות</Text></View>
          </View>
        </Card>
      )}

      {/* Recent matches */}
      {data.recentMatches.length > 0 && (
        <Card>
          <Text className="text-base font-bold mb-2">5 משחקים אחרונים</Text>
          {data.recentMatches.map((m) => (
            <Pressable key={m.matchId} onPress={() => router.push(`/games/${m.matchId}`)}>
              <View className="py-2 border-b border-gray-100">
                <View className="flex-row justify-between">
                  <Text className="text-sm">{m.opponent}</Text>
                  <Text className="text-xs text-gray-500">{roleLabel[m.role]}</Text>
                </View>
                {m.contribution.goals > 0 || m.contribution.assists > 0 ? (
                  <Text className="text-xs text-gray-500 mt-1">
                    {m.contribution.goals > 0 && `⚽ ${m.contribution.goals} `}
                    {m.contribution.assists > 0 && `🅰 ${m.contribution.assists}`}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}
```

- [ ] **Step 3: Type-check + tests**

```bash
cd mobile
npx tsc --noEmit
npm test
```

- [ ] **Step 4: Commit**

```bash
cd /Users/yaniv/Documents/AI/SoocerStats
git add mobile/hooks/usePlayer.ts mobile/app/players
git commit -m "$(cat <<'EOF'
feat(mobile): Player screen (basic v1.0)

usePlayer fetches /v1/players/:id. Renders profile, position,
nationality, current team (tap to team screen), current season
stats (apps/goals/assists/cards/minutes), and last 5 matches with
role badges.

Career history, season switcher, charts deferred to v1.1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 18: Mobile — Preferences screen

**Files:**
- Create: `mobile/hooks/usePreferences.ts`
- Modify: `mobile/app/(tabs)/preferences.tsx`

- [ ] **Step 1: Hook with optimistic mutation**

`mobile/hooks/usePreferences.ts`:
```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { PreferencesPayload } from '@shared/types/mobile-api';

export function usePreferences() {
  return useQuery<PreferencesPayload>({
    queryKey: ['preferences'],
    queryFn: () => apiClient.get<PreferencesPayload>('/preferences'),
  });
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation<PreferencesPayload, Error, PreferencesPayload>({
    mutationFn: (body) => apiClient.put<PreferencesPayload>('/preferences', body),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: ['preferences'] });
      const prev = qc.getQueryData<PreferencesPayload>(['preferences']);
      qc.setQueryData(['preferences'], next);
      return { prev };
    },
    onError: (_err, _vars, context) => {
      const c = context as { prev: PreferencesPayload | undefined } | undefined;
      if (c?.prev) qc.setQueryData(['preferences'], c.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['preferences'] });
    },
  });
}
```

- [ ] **Step 2: Replace preferences screen**

Replace `mobile/app/(tabs)/preferences.tsx`:
```tsx
import { ScrollView, View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/hooks/usePreferences';
import { Card } from '@/design-system/Card';

export default function PreferencesScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { data, isLoading } = usePreferences();

  const onLogout = () => {
    Alert.alert('יציאה', 'האם להתנתק?', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'התנתק',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  if (isLoading || !data) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, gap: 12 }}>
      {/* User identity */}
      <Card>
        <Text className="text-sm text-gray-500">משתמש</Text>
        <Text className="text-lg font-semibold">{user?.name ?? '—'}</Text>
        <Text className="text-sm text-gray-500">{user?.email ?? '—'}</Text>
      </Card>

      {/* Favorites — v1.0 displays only; multi-select UI in v1.1 */}
      <Card>
        <Text className="text-base font-bold mb-2">קבוצות מועדפות</Text>
        {data.favoriteTeamApiIds.length === 0 ? (
          <Text className="text-sm text-gray-500">לא נבחרו עדיין</Text>
        ) : (
          <Text className="text-sm">
            {data.favoriteTeamApiIds.length} קבוצות נבחרו
          </Text>
        )}
        <Text className="text-xs text-gray-400 mt-2">
          עריכת המועדפים תתווסף בקרוב
        </Text>
      </Card>

      <Card>
        <Text className="text-base font-bold mb-2">ליגות מועדפות</Text>
        {data.favoriteCompetitionApiIds.length === 0 ? (
          <Text className="text-sm text-gray-500">לא נבחרו עדיין</Text>
        ) : (
          <Text className="text-sm">
            {data.favoriteCompetitionApiIds.length} ליגות נבחרו
          </Text>
        )}
      </Card>

      {/* Logout */}
      <Pressable onPress={onLogout}>
        <View className="bg-red-50 border border-red-200 rounded-md py-3 items-center mt-4">
          <Text className="text-red-700 font-semibold">התנתק</Text>
        </View>
      </Pressable>
    </ScrollView>
  );
}
```

Note: full multi-select editing UI is deferred. v1.0 ships a read-only view + working logout. v1.1 adds the editor + connects `useUpdatePreferences`.

- [ ] **Step 3: Type-check + tests**

```bash
cd mobile
npx tsc --noEmit
npm test
```

- [ ] **Step 4: Commit**

```bash
cd /Users/yaniv/Documents/AI/SoocerStats
git add mobile/hooks/usePreferences.ts mobile/app/\(tabs\)/preferences.tsx
git commit -m "$(cat <<'EOF'
feat(mobile): Preferences screen with logout

Read-only display of user identity + counts of favorite teams/leagues
from /v1/preferences. Logout button with confirmation Alert.

Multi-select editing UI deferred to v1.1; useUpdatePreferences hook
is built and ready, just not wired to UI yet.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Plan 2 Completion Checklist

Before declaring Plan 2 done, confirm all of the following:

- [ ] Branch `feat/mobile-core-screens` created off main, pushed to GitHub
- [ ] All payload types in `shared/types/mobile-api.ts` for Home, Live, Match, Team, Player (basic), Preferences
- [ ] 6 backend handlers refit to match their type contracts
- [ ] 6 contract tests added (one per endpoint) — backend test count now ~34
- [ ] 5 design-system primitives built; Card + MatchRow snapshot-tested
- [ ] TanStack Query persister wired with AsyncStorage backing
- [ ] 6 mobile hooks built (useHome, useLive, useMatch, useTeam, usePlayer, usePreferences)
- [ ] 6 screens implemented (Home, Live, Match, Team, Player, Preferences)
- [ ] Deep linking config added to `app.json`
- [ ] All tests pass locally: `npm test` (backend) + `cd mobile && npm test`
- [ ] CI green on PR
- [ ] Manual smoke test on iOS Simulator: navigate Home → Match → Team → Player; pull-to-refresh works on Home and Live; logout works

## Next plan

Plan 3 — Polish + Launch (Sprint 5-6): app icon, splash, App Store screenshots, privacy policy page, TestFlight beta, App Store submission. ~3 weeks.
