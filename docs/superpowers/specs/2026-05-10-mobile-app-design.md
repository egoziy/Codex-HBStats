# HBStats Mobile App — Design Spec

**Date:** 2026-05-10
**Author:** Yaniv (with Claude assistance)
**Status:** Approved design, ready for implementation plan
**Supersedes:** [docs/ios-native-plan.md](../../ios-native-plan.md) (kept for reference; this doc is authoritative)

## Goal

Build a cross-platform mobile app (iOS first, Android second) for HBStats, the existing Israeli soccer statistics platform. The app should feel native, mobile-first, and ship on both stores within ~5 calendar months at half-time effort.

## Decisions Summary

| Decision | Choice | Reason |
|---|---|---|
| Stack | React Native + Expo (managed) | iOS+Android from one codebase; user wants both platforms |
| Repo structure | Monorepo with `mobile/` + `shared/` folders | Single dev, type sharing with backend |
| Auth | Bearer tokens (JWT access + opaque refresh) | Native standard; cookies don't fit mobile |
| Security tier | Tier 1 in v1.0, Tier 2 incremental in v1.1 | Match the threat model (read-mostly stats) |
| Testing | Pragmatic (B) + backend API contract tests | Catches the highest-impact failure: silent API drift |
| v1.0 scope | 7 screens (Home, Live, Match, Team, Player-basic, Preferences, Login) | Trim Player to basic; defer Push to v1.1 |
| API versioning | `/api/mobile/v1/*` namespace | Insulates shipped apps from backend changes |
| Push notifications | Defer to v1.1 | Adds 3-4 days; let v1.0 inform topic choices |
| Offline | Stale-indicator caching via TanStack Query persister | Cheap, sufficient for read-only stats |
| Mobile registration | Login-only in v1.0; register stays on web | Saves a screen + rate-limit work |

---

## 1. Architecture

### 1.1 Stack

- **Mobile:** React Native via Expo SDK 52+ (managed workflow), TypeScript
- **Routing:** Expo Router (file-based, mirrors Next.js)
- **State / data:** TanStack Query (React Query) — caching, refetch, stale-while-revalidate
- **HTTP:** native `fetch` wrapped in a thin `apiClient` (auth header injection + 401-refresh-retry)
- **Styling:** NativeWind (Tailwind for RN) — consistent with web
- **Storage:** `expo-secure-store` for tokens, `expo-sqlite` (via TanStack Query persister) for cached responses
- **Build/distribute:** EAS Build + EAS Submit (Expo cloud) — no Mac required for builds
- **Push (v1.1):** Expo Notifications API — abstracts APNS + FCM

### 1.2 Repository Layout

```
SoocerStats/
  src/                          # Next.js (existing, unchanged)
  prisma/                       # (existing)
  scripts/                      # (existing)
  shared/                       # NEW — shared types between web + mobile
    types/
      mobile-api.ts             # JSON contracts: HomePayload, LivePayload, etc.
      common.ts                 # Team, Player, Match domain types
  mobile/                       # NEW — Expo app
    app/                        # Expo Router screens
      (tabs)/
        index.tsx               # Home
        live.tsx                # Live
        preferences.tsx
      teams/[id].tsx
      games/[id].tsx
      players/[id].tsx
      login.tsx
    components/                 # MatchRow, TeamHeader, StatCard, etc.
    lib/
      apiClient.ts              # fetch wrapper + auth + refresh
      auth.ts                   # token storage, login/logout/refresh
      queryClient.ts            # TanStack Query config + persister
    hooks/                      # useHome(), useLiveMatches(), etc.
    design-system/              # Button, Card, primitive RTL components
    app.json                    # Expo config
    eas.json                    # EAS Build profiles (dev, preview, production)
    package.json                # mobile-only deps
    tsconfig.json               # extends root, paths to ../shared
  package.json                  # web deps (existing, unchanged)
```

### 1.3 Type Sharing

- `shared/types/mobile-api.ts` is the single source of truth for mobile API JSON shapes
- Backend `src/lib/mobile-extra-api.ts` returns those types (TypeScript enforces it)
- Mobile hooks consume the same types — change a field, both sides fail to compile until both update
- Backend Jest contract tests assert runtime JSON shape matches the type declarations

### 1.4 Build Independence

- `npm run build` for web ignores `mobile/`
- EAS builds for mobile ignore `src/`
- Backend deploy to Hetzner is unchanged: `git pull && npm run build && pm2 restart hbstats`
- Mobile deploys via EAS to App Store / Play Store, never to Hetzner

---

## 2. v1.0 Scope & API Contracts

### 2.1 Screen Inventory

| # | Screen | Route | Endpoint | Status |
|---|---|---|---|---|
| 1 | Login | `/login` | `POST /api/mobile/v1/auth/login` | NEW |
| 2 | Home | `/(tabs)/` | `GET /api/mobile/v1/home` | exists, refit |
| 3 | Live | `/(tabs)/live` | `GET /api/mobile/v1/live` | exists, refit |
| 4 | Match | `/games/[id]` | `GET /api/mobile/v1/games/:id` | exists, refit |
| 5 | Team | `/teams/[id]` | `GET /api/mobile/v1/teams/:id` | exists, refit |
| 6 | Player (basic) | `/players/[id]` | `GET /api/mobile/v1/players/:id` | exists, trim to basic |
| 7 | Preferences | `/(tabs)/preferences` | `GET/PUT /api/mobile/v1/preferences` | exists, refit |
| — | News strip on Home | (component) | merged into `/home` payload | data exists in `/news` |

Plus 3 new auth endpoints: `POST /v1/auth/login`, `POST /v1/auth/refresh`, `POST /v1/auth/logout`.

### 2.2 API Versioning

- All mobile endpoints move from `/api/mobile/*` to `/api/mobile/v1/*`
- Mechanical folder rename in Sprint 0; handlers stay identical
- Future breaking changes get `/v2/` while `/v1/` keeps serving frozen apps
- Deprecation: when telemetry shows <1% traffic on v1, remove

### 2.3 Auth Endpoints

#### `POST /api/mobile/v1/auth/login`
**Request:** `{ email, password }`
**Response 200:** `{ accessToken, refreshToken, user: { id, name, email, avatarUrl } }`
**Errors:** 401 invalid creds, 429 rate-limited, 423 account locked

Access token is a signed JWT (HS256, `JWT_SECRET`, 15 min TTL) with `userId` claim. Refresh token is opaque random hex (32 bytes), stored hashed in existing `Session.tokenHash`, 60-day TTL.

#### `POST /api/mobile/v1/auth/refresh`
**Request:** `{ refreshToken }`
**Response 200:** `{ accessToken, refreshToken }` (refresh **rotated**)

Rotation: old token marked replaced; reuse triggers session-family revocation (see §3.4).

#### `POST /api/mobile/v1/auth/logout`
**Headers:** `Authorization: Bearer <accessToken>`
**Response:** 204
**Effect:** deletes the current session row only (other devices unaffected).

#### `POST /api/mobile/v1/auth/logout-all` (endpoint v1.0, UI v1.1)
Same as logout but deletes every session for the user.

### 2.4 Screen Payload Shapes

```ts
// HomePayload
{
  user: { id, name, avatarUrl } | null,
  favoriteTeam: TeamSummary | null,
  nextMatch: MatchCard | null,
  lastMatch: MatchCard | null,
  compactStandings: { rank, team, played, points }[],
  liveStrip: LiveMatchCompact[],
  newsStrip: NewsCard[],
}

// LivePayload
{
  groups: {
    league: { id, nameHe, nameEn, logo },
    matches: LiveMatchExpanded[],
  }[],
  lastUpdated: string,
}

// MatchPayload
{
  match: { id, status, minute, score, halfTime, dates, venue, referee },
  homeTeam: TeamHeader,
  awayTeam: TeamHeader,
  events: MatchEvent[],
  lineups: { home: Lineup, away: Lineup },
  matchStats: { possession, shots, ... } | null,
  h2h: { lastN: MatchCard[], wins: { home, away, draw } } | null,
}

// TeamPayload
{
  team: TeamHeader,
  coach: { name, since } | null,
  standingsContext: { rank, points, around: StandingRow[] } | null,
  nextMatch: MatchCard | null,
  lastMatch: MatchCard | null,
  recentForm: ('W'|'D'|'L')[],
  squad: { position, players: PlayerSummary[] }[],
  seasonStats: { goalsScored, goalsAgainst, cleanSheets, ... },
}

// PlayerPayload (basic, v1.0)
{
  player: { id, nameHe, nameEn, photo, dateOfBirth, nationality, position },
  currentTeam: TeamSummary | null,
  currentSeasonStats: {
    appearances, starts, minutes, goals, assists,
    yellowCards, redCards, subbedIn, subbedOut,
  } | null,
  recentMatches: { matchId, opponent, date, role, contribution }[], // last 5
}
// v1.1 will add: career, season switcher, charts, achievements

// PreferencesPayload
GET → { favoriteTeamApiIds: number[], favoriteCompetitionApiIds: number[] }
PUT body: same shape, returns updated
```

Exact TypeScript interfaces live in `shared/types/mobile-api.ts`.

---

## 3. Auth Flow & Token Lifecycle

### 3.1 Token Anatomy

| Token | Type | Lifetime | Storage | Sent as |
|---|---|---|---|---|
| Access | Signed JWT (HS256) | 15 min | RAM only | `Authorization: Bearer <token>` |
| Refresh | Opaque random hex (32 bytes) | 60 days | `expo-secure-store` (Keychain/Keystore) | request body of `/auth/refresh` only |

iOS Keychain accessibility: `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (no iCloud sync of refresh token).

### 3.2 Login Flow

1. User → `POST /auth/login {email, password}`
2. Server verifies password (existing `bcrypt` 12 rounds), creates Session row, signs JWT
3. App stores refresh in SecureStore, holds access in RAM, populates user state
4. Navigate to Home

### 3.3 Authenticated Request + Transparent Refresh

1. Request fires with `Authorization: Bearer <access>` header
2. If 401 → `apiClient` catches, calls `/auth/refresh`, retries original request once
3. Singleflight: concurrent 401s wait on a single in-flight refresh promise (prevents thundering-herd refresh storms)
4. Max 1 retry per request (no infinite loops)

### 3.4 Refresh Token Rotation + Reuse Detection

Schema additions to `Session`:
```prisma
model Session {
  // existing fields
  replacedAt    DateTime?
  replacedBy    String?    // next session id in the rotation chain
  familyId      String     // shared by all rotations of the original login
}
```

On every refresh:
- New session created, old session marked `replacedAt = now()`, `replacedBy = newId`
- `familyId` carried forward
- If a refresh request arrives for an already-replaced session → reuse detected → `DELETE FROM session WHERE familyId = X` (kills the entire chain on all devices)

Idempotency: refresh responses cached for 30s by `refreshTokenHash` to absorb network retries without false-positive reuse.

### 3.5 Edge Cases

| Case | Handling |
|---|---|
| Concurrent 401s from multiple hooks | Singleflight refresh, all retry after one rotation |
| Network failure mid-refresh | 30s idempotency window absorbs retries |
| Clock skew between device and server | Server validates JWT, client trusts 401; no client-side expiry check |
| App backgrounded for hours | First authenticated request → 401 → refresh → retry; transparent |
| Refresh token expired (60+ days) | App clears state, navigates to login |
| User changes password (web) | Existing logic invalidates all sessions; mobile next refresh fails → forced re-login |

### 3.6 Backend Tasks

1. Extend `getRequestUser()` in [src/lib/auth.ts](../../../src/lib/auth.ts) to accept `Authorization: Bearer <jwt>` in addition to cookie
2. Add `signAccessToken(userId)` / `verifyAccessToken(token)` helpers (use `jsonwebtoken` already in deps)
3. New routes: `src/app/api/mobile/v1/auth/{login,refresh,logout,logout-all}/route.ts`
4. Schema migration: add `replacedAt`, `replacedBy`, `familyId` to `Session`; backfill `familyId = id` for existing rows; `npx prisma db push`
5. Rate limits: 5/min/IP login; 10/min/IP and 30/hr/familyId refresh; 60/min/userId on authenticated GETs

### 3.7 Mobile Tasks

1. `mobile/lib/apiClient.ts` — fetch wrapper with header injection, singleflight refresh, retry-once
2. `mobile/lib/auth.ts` — login/logout/loadStoredRefresh, SecureStore wrappers
3. `mobile/contexts/AuthContext.tsx` — exposes `user`, `login`, `logout`, hydrates from SecureStore on launch
4. `mobile/app/login.tsx` — email + password form, error states
5. Auth gate: redirect to `/login` if no user

---

## 4. Security

### 4.1 Tier 1 (v1.0 — required)

#### Network
- iOS ATS on by default (no exceptions)
- Android: `usesCleartextTraffic: false` + `network_security_config.xml` allowing only HTTPS to production domain
- Server sends `Strict-Transport-Security: max-age=31536000; includeSubDomains` on all `/api/mobile/*` responses

#### Token storage
- Refresh: `expo-secure-store` with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`
- Access: RAM only
- ESLint rule: ban logging strings matching `/Bearer\s|accessToken|refreshToken/`

#### Token rotation + reuse detection
Per §3.4.

#### Rate limiting (extends current [src/middleware.ts](../../../src/middleware.ts))
| Endpoint | Limit |
|---|---|
| `POST /auth/login` | 5/min/IP and 10/hour/email |
| `POST /auth/refresh` | 10/min/IP and 30/hour/familyId |
| `GET /v1/*` (authenticated) | 60/min/userId |
| `GET /v1/live` | 30/min/IP |

In-memory map fine for single-instance Hetzner. Move to Redis if scaling out.

#### Password policy (server-side, applies to web register)
- Min 10 chars, no other complexity rules (NIST guidance)
- HaveIBeenPwned k-anonymity check at register only (block if password seen >100 times in breaches)
- bcrypt at 12 rounds (already correct)

#### Sign-out everywhere
- Existing: password change invalidates all sessions
- New endpoint: `POST /auth/logout-all` (UI in v1.1, endpoint exposed in v1.0)

#### Bundle hygiene
- No secrets in mobile bundle (RN bundles are unpackable)
- Audit confirms: `API_FOOTBALL_KEY`, `JWT_SECRET`, `DATABASE_URL` are server-only
- CI check: grep mobile bundle for `/sk_/`, `/api_key_[a-f0-9]{32}/` patterns

#### Sensitive surfaces
- Login: `secureTextEntry` on password field (prevents iOS keyboard cache)
- Crash reports: strip `Authorization` headers + auth endpoint bodies before sending

#### App Store Privacy disclosures
- Privacy nutrition label entries: email, password, favorites
- Privacy policy URL: new `/privacy` page on existing web

### 4.2 Tier 2 (v1.1 — incremental)

| Item | Effort |
|---|---|
| Certificate pinning (SPKI hash, current + offline backup key) | 2 days |
| Biometric unlock (Face ID / fingerprint) via `expo-local-authentication` | 1 day |
| Jailbreak / root detection (warn, not block) | 1 day |
| Screenshot prevention on auth screens (`expo-screen-capture`) | 0.5 day |
| `/auth/logout-all` UI in Preferences | 0.5 day |

### 4.3 Tier 3 (v1.2+ — only if abuse detected)

- Apple App Attest + Play Integrity API (~3 days) — strongest anti-scraping
- Mobile RASP — overkill for read-only stats, not planned

### 4.4 Account & Distribution Prerequisites

| Requirement | Cost | Lead time |
|---|---|---|
| Apple Developer Program | $99/year | 1-7 days |
| App Store Connect record | included | immediate |
| Google Play Console | $25 once | 2-3 days |

**Action: enroll in Apple Developer Program on Sprint 0 day 1** (verification is async).

---

## 5. Testing

### 5.1 Test Pyramid

```
                  Manual on real device (weekly)
                  TestFlight beta (10-20 users, 2 weeks pre-launch)
              Integration tests (mobile, critical paths only)
            API contract tests (backend, every endpoint)
        Unit + design-system snapshot tests (fast, plentiful)
```

### 5.2 Frameworks

- **Backend:** Jest + supertest, co-located in `__tests__/` next to route handlers
- **Mobile:** Jest + @testing-library/react-native + MSW (mock service worker)
- **No E2E framework** in v1.0 (no Detox, no Maestro)

### 5.3 What Gets Tested

**Unit (mobile):** `apiClient` (singleflight refresh, retry), `auth.ts` (state transitions), formatters (RTL date, mixed-direction strings, minute `90+3'`), non-trivial hook logic.

**Component snapshots (mobile):** Design-system primitives only (`Button`, `Card`, `MatchRow`, `StatPill`). NOT screens.

**Integration (mobile):** 5 named happy paths:
1. Login → 200 → Home navigation
2. Login → 401 → error displayed, no navigation
3. Home renders from valid `HomePayload`
4. Token refresh transparency (401 → refresh → retry, user sees no error)
5. Logout → state cleared → `/login`

**API contract (backend):** every mobile endpoint has at least one test asserting status, JSON shape matches the `shared/types/mobile-api.ts` interface, required fields present, 401 returned without bearer. CI fails if a `/v1/*` endpoint exists without a contract test.

**Manual device checklist** (`mobile/docs/manual-test-checklist.md`): cold-start time, RTL correctness, mixed RTL+LTR strings, tap targets, pull-to-refresh, background/foreground token refresh, airplane-mode caching, Live polling cadence, deep links, no crashes after 10 min.

**TestFlight beta:** 2 weeks, 10-20 external testers recruited from existing Telegram audience.

### 5.4 CI

On every PR:
- Backend lint + type-check + Jest
- Mobile lint + type-check + Jest
- `expo-doctor`
- Bundle secret-grep

Targets: total CI <5 min.

NOT on every PR: EAS Build, TestFlight upload (manual triggers).

### 5.5 Coverage Targets

- Unit: hit critical files, no enforced threshold
- Integration: 5 named paths covered
- Contract: 100% of mobile endpoints (enforced)

### 5.6 Out of Scope

Detox/Maestro E2E, Percy visual regression, BrowserStack device farm, Reassure performance benchmarks, mutation/fuzz testing.

---

## 6. Sprint Plan

Estimates assume single developer at half-time. Full-time → ~12 weeks for iOS v1.0 instead of ~10.

### Phase A: iOS v1.0 (~10 weeks)

#### Sprint 0 — Foundation (1 week)
- Apple Developer enrollment (parallel, async)
- Bundle id + App Store name reservation
- Backend: rename `src/app/api/mobile/*` → `src/app/api/mobile/v1/*`
- Backend: add Jest + supertest, `shared/types/mobile-api.ts` skeleton
- Mobile: `npx create-expo-app`, install deps, configure NativeWind + Expo Router + RTL
- Mobile: empty 3-tab shell (Home / Live / Preferences) running on iOS simulator
- EAS dev/preview/production profiles
- **Exit:** empty Expo app boots; backend `/v1/*` endpoints respond; Apple Developer account approved

#### Sprint 1 — Auth End-to-End (2 weeks)
- Backend: Session schema migration, JWT helpers, 3 new auth endpoints, `getRequestUser` extended for Bearer, rate limits, contract tests for auth
- Mobile: `apiClient`, `auth.ts`, `AuthContext`, login screen, auth gate, unit tests, integration tests for login + refresh
- **Exit:** log in → kill app → reopen → still logged in; background 30 min → foreground → transparent refresh; logout clears state

#### Sprint 2 — Home + Live (2 weeks)
- Backend: refit `/v1/home` (with news strip data) and `/v1/live` payloads, contract tests
- Mobile: TanStack Query + `expo-sqlite` persister; design-system primitives; Home screen; Live screen with 30s auto-refresh; loading skeletons; empty states
- **Exit:** Home renders <2s warm cache; airplane mode shows cached + timestamp; Live updates every 30s

#### Sprint 3 — Match + Team (2 weeks)
- Backend: refit `/v1/games/:id` and `/v1/teams/:id`, contract tests
- Mobile: Match screen (events, lineups, stats, h2h); Team screen (header, squad, form, stats); deep linking (`hbstats://`) + universal links
- **Exit:** Home → Match → Team navigation works; deep link from Telegram opens correct screen; RTL renders correctly

#### Sprint 4 — Player + Preferences (1.5 weeks)
- Backend: trim `/v1/players/:id` to basic shape; verify `/v1/preferences` works with Bearer; contract tests
- Mobile: Player screen (basic — profile, current season stats, last 5 matches); Preferences screen (favorites multi-select, save, logout); empty states
- **Exit:** all 5 screens navigate; Preferences persists across restart

#### Sprint 5 — Polish + Internal Beta (1 week)
- Error states, retry buttons, offline banner across all screens
- App icon, splash screen, App Store screenshots (Hebrew + English)
- App Store metadata draft, privacy policy page on web at `/privacy`
- App Store Connect record, first build uploaded, internal TestFlight 2-3 days
- Bundle secret-grep CI check enabled
- **Exit:** Build #1 passes Apple's automated scans; all v1.0 screens function in TestFlight; privacy policy live

#### Sprint 6 — External Beta (2 weeks)
- Week 1: invite 10-20 external testers, daily crash-report review, bug fixes only
- Week 2: final fixes, App Store submission (1-2 day review), launch announcement
- **Exit:** 0 unresolved P0/P1 bugs; App Store approval; v1.0 live

### Phase B: iOS v1.1 (~5 weeks, post-launch)

Triggered after ~2 weeks of v1.0 telemetry.

| Item | Effort |
|---|---|
| Player career + season switcher + charts | 1.5 weeks |
| Full News screen with filters | 1 week |
| Push notifications (goal alerts, match start, lineup) | 1 week |
| Tier 2 security (cert pinning + biometric + jailbreak warn + screenshot block) | 1 week |
| `/auth/logout-all` UI in Preferences | 0.5 day |

### Phase C: Android v1.0 (~5 weeks, after iOS v1.1)

Most code shared. Android-specific:

| Task | Effort |
|---|---|
| Google Play Console enrollment | 0.5 day + verification |
| Configure FCM for push | 1 day |
| Material Design tweaks (ripple, status bar, navigation bar) | 2 days |
| Android back-button handling | 1 day |
| Notification permission flow (Android 13+) | 0.5 day |
| RTL fix-ups (historically more bugs than iOS) | 1 day |
| Adaptive icons | 0.5 day |
| Internal testing track | 1 week |
| Closed beta | 2 weeks |
| Production release | 1 day |

### Total

| Phase | Calendar weeks |
|---|---|
| iOS v1.0 | ~10 |
| iOS v1.1 | ~5 |
| Android v1.0 | ~5 |
| **Total** | **~20 weeks (5 months)** |

---

## 7. Risks & Open Questions

### 7.1 Risk Register

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Hebrew RTL bugs in mobile components | High | High | `<RtlText>`/`<NumericText>` primitives day 1; mixed-string test cases in manual checklist; first manual test on every screen |
| R2 | App Store rejection on first submission | High | Medium | Privacy policy live; demo account in submission notes; pre-flight Apple's automated checks |
| R3 | Sign in with Apple requirement (Guideline 4.8) | Low (we don't offer 3rd-party sign-in) | High if applies | Confirm in Sprint 0; add SIWA in Sprint 1 if needed (~3 days) |
| R4 | API contract drift between web release and frozen mobile build | High | High | `/v1/` namespace; backend contract tests; CI check that PRs to `/v1/*` handlers also update `shared/types/` |
| R5 | Apple Developer enrollment delays | Medium | High | Enroll Sprint 0 day 1; individual account (faster than org) |
| R6 | Hetzner cert renewal breaks cert pinning (v1.1+) | Medium | Catastrophic | Pin SPKI hash, not full cert; pin two keys (current + offline backup); document rotation procedure |
| R7 | Refresh token reuse false positives | Medium | High | 30s idempotency window on refresh; monitor reuse-detection events; widen window if false-positive rate >0.1% |
| R8 | TestFlight low engagement | High | Medium | Recruit 30+ to net 10; weekly nudges; clear weekly test prompts |
| R9 | RN performance on older iPhones | Medium | Medium | `FlatList` not `ScrollView`; memo'd rows; test on iPhone X-class device by Sprint 3 |
| R10 | Telegram news rate limits | Low | Low | News strip uses cached `/home` payload; backend caches Telegram for 5 min |
| R11 | DB hot-spot from auth load | Low | Medium | Monitor `/auth/refresh` p95; add Redis cache if >100ms |
| R12 | Reverse-engineered API → scraping | Medium | Medium | Per-userId rate limits; App Attest in v1.2 if abuse detected |
| R13 | Credential stuffing attacks | Medium | High | HIBP at register; per-email rate limit; lockout after 10 failures/hour |

### 7.2 Open Questions

| # | Question | Resolve by |
|---|---|---|
| Q1 | Does Sign in with Apple requirement apply to us? | Sprint 0 |
| Q2 | App Store name "HBStats" available, or alternative? | Sprint 0 |
| Q3 | Privacy policy template or write from scratch? | Sprint 5 |
| Q4 | Bundle identifier (`il.hbstats.app` or other)? | Sprint 0 |
| Q5 | TestFlight tester recruitment plan? | Sprint 5 |
| Q6 | Analytics in v1.0 (Sentry yes; usage analytics?) | Sprint 4 |
| Q7 | App icon design — DIY in Figma or commission? | Sprint 5 |
| Q8 | Hebrew + English app name same or different? | Sprint 5 |
| Q9 | Pricing — confirm free with no IAP | Sprint 5 |
| Q10 | Universal links domain config (existing hbstats domain?) | Sprint 3 |

### 7.3 Out of Scope (explicit non-goals)

- User-generated content (comments, ratings)
- Social features (follow other users, share predictions)
- Live commentary / match audio
- Payment / IAP / subscriptions
- Web ↔ mobile session sharing (separate auth)
- Tablet / iPad-optimized layout
- Apple Watch companion
- Widgets (defer to v1.2+)
- Offline write (queueing preference changes when offline)

---

## Next Step

After user review of this spec, invoke `writing-plans` skill to produce a detailed, actionable implementation plan starting with Sprint 0.
