# HBStats — Architecture Document

## סקירה כללית

HBStats היא פלטפורמת סטטיסטיקות כדורגל ישראלי. המערכת מורכבת משלוש שכבות:

```
┌─────────────────────────────────────────────────────┐
│                    לקוחות (Clients)                   │
│  ┌──────────┐  ┌───────────┐  ┌───────────────────┐ │
│  │ דפדפן Web│  │ SwiftUI   │  │ אדמין (דפדפן)     │ │
│  │ (SSR+CSR)│  │ iOS App   │  │ Server Components │ │
│  └────┬─────┘  └─────┬─────┘  └────────┬──────────┘ │
└───────┼──────────────┼─────────────────┼────────────┘
        │              │                 │
┌───────┴──────────────┴─────────────────┴────────────┐
│              Next.js 14 App Router                   │
│  ┌────────────┐ ┌────────────┐ ┌──────────────────┐ │
│  │ Pages      │ │ API Routes │ │ Mobile API       │ │
│  │ (SSR)      │ │ (/api/*)   │ │ (/api/mobile/*)  │ │
│  └────┬───────┘ └─────┬──────┘ └────────┬─────────┘ │
│       │               │                 │            │
│  ┌────┴───────────────┴─────────────────┴─────────┐ │
│  │              src/lib/ (Business Logic)          │ │
│  │  deep-stats · standings · transliteration       │ │
│  │  auth · api-football · media-storage            │ │
│  └──────────────────────┬─────────────────────────┘ │
└─────────────────────────┼───────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────┐
│                  נתונים (Data Layer)                  │
│  ┌──────────────┐  ┌──────────┐  ┌────────────────┐ │
│  │ PostgreSQL   │  │ File     │  │ API-Football   │ │
│  │ (Prisma ORM) │  │ Storage  │  │ (External API) │ │
│  │ 39+ models   │  │ uploads/ │  │ v3 REST        │ │
│  └──────────────┘  └──────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## שכבות המערכת

### 1. שכבת התצוגה (Presentation Layer)

```
src/app/
├── layout.tsx              ← Root Layout: RTL, Navbar, global styles
├── page.tsx                ← דף בית
├── (public pages)          ← Server Components — SSR מלא
│   ├── games/[id]/
│   ├── players/[id]/
│   ├── teams/[id]/
│   ├── standings/
│   ├── venues/
│   └── ...
├── admin/                  ← דפי אדמין — בדיקת role בצד שרת
│   ├── page.tsx
│   ├── games/
│   ├── quick-edit/
│   ├── venues/
│   └── teams/[teamKey]/
└── api/                    ← API Routes (Route Handlers)
    ├── events/             ← CRUD אירועים
    ├── games/              ← CRUD משחקים
    ├── admin/fetch/        ← סנכרון API-Football
    └── mobile/             ← REST API למובייל
```

**עיקרון מרכזי:** דפים ציבוריים הם Server Components טהורים — הם מבצעים שאילתות Prisma ישירות ומחזירים HTML. Client Components (`'use client'`) משמשים רק כשנדרשת אינטראקציה (טפסים, accordions, תמונות עם fallback).

**דוגמה לזרימה:**
```
דף שחקן (Server Component)
  │
  ├─ Prisma query: linkedPlayers, games, transfers, trophies, sidelinedEntries
  ├─ Business logic: buildAggregatedStats(), derivePlayerDeepStats()
  ├─ Render: PremierPlayerView (Server Component with tabs)
  │    ├─ Overview section (static HTML)
  │    ├─ Stats section (static HTML)
  │    └─ Career table (static HTML)
  └─ Client islands: season dropdown (form submit), image fallbacks
```

### 2. שכבת הלוגיקה (Business Logic Layer)

```
src/lib/
├── auth.ts                  ← אימות: sessions, tokens, role check
├── prisma.ts                ← Prisma Client singleton
├── api-football.ts          ← HTTP client עם rate limiting
├── deep-stats.ts            ← חישוב סטטיסטיקות מאירועי משחק
├── standings.ts             ← חישוב ומיון טבלת ליגה
├── player-transliteration.ts← תעתיק פונטי לעברית
├── player-display.ts        ← פורמט שמות שחקנים
├── competition-display.ts   ← פורמט שמות מסגרות
├── event-display.ts         ← תוויות ואייקונים לאירועים
├── home-live.ts             ← נתוני לייב + תרגום לעברית
├── media-storage.ts         ← שמירת תמונות מ-API
├── telegram.ts              ← אינטגרציית חדשות טלגרם
├── competitions.ts          ← רשימת ליגות נתמכות
└── admin-data-coverage.ts   ← חישוב כיסוי נתונים + המלצות עדכון
```

**`deep-stats.ts`** — הלב של חישוב הסטטיסטיקות:
```
Input: playerId + Game[] (with events & lineups)
  │
  ├─ סריקת אירועים:
  │   event.playerId === playerId + GOAL → goals++
  │   event.relatedPlayerId === playerId + GOAL → assists++
  │   SUBSTITUTION_IN/OUT → minutesPlayed calculation
  │
  ├─ סריקת הרכבים:
  │   STARTER → starts++
  │   SUBSTITUTE + entered → substituteAppearances++
  │
  Output: { goals, assists, yellowCards, redCards, starts,
            gamesPlayed, minutesPlayed, benchAppearances,
            substituteAppearances, timesSubbedOff }
```

**`standings.ts`** — חישוב טבלה:
```
Input: Standing[] from DB (or derived from games)
  │
  ├─ מיון: points DESC → goalDifference DESC → goalsFor DESC
  ├─ חישוב: adjustedPoints = points + pointsAdjustment
  ├─ displayPosition: מיקום בטבלה הסופית
  │
  Output: StandingWithDerived[] (sorted, with computed fields)
```

### 3. שכבת הנתונים (Data Layer)

#### PostgreSQL — מבנה יחסים

```
                    ┌──────────┐
                    │  Season  │
                    └────┬─────┘
           ┌─────────────┼─────────────┐
           │             │             │
     ┌─────┴────┐  ┌────┴─────┐ ┌────┴──────┐
     │   Team   │  │   Game   │ │Competition│
     └────┬─────┘  └────┬─────┘ └───────────┘
          │             │
    ┌─────┴────┐  ┌─────┴──────────────────┐
    │  Player  │  │  GameEvent             │
    │          │  │  GameLineupEntry       │
    │          │  │  GameStatistics        │
    │          │  │  GamePrediction        │
    │          │  │  GameOddsValue         │
    │          │  │  GameHeadToHeadEntry   │
    └────┬─────┘  └────────────────────────┘
         │
   ┌─────┴──────────────────────────┐
   │  PlayerStatistics              │
   │  PlayerTransfer                │
   │  PlayerTrophy                  │
   │  PlayerSidelinedEntry          │
   │  PlayerInjury                  │
   │  CompetitionLeaderboardEntry   │
   └────────────────────────────────┘
```

**קשר מפתח — canonicalPlayerId:**
```
Player (Beer Sheva 2024) ─┐
Player (Beer Sheva 2025) ─┤── canonicalPlayerId ──→ Player (הראשון שנוצר)
Player (Ashdod 2023)     ─┘

שימוש: linkedPlayers = WHERE id = canonical OR canonicalPlayerId = canonical
→ מאפשר קריירה חוצת-עונות בדף שחקן אחד
```

#### File Storage

```
public/uploads/
├── teams/
│   ├── 2024/          ← לוגואים לפי שנת עונה
│   │   ├── hapoel-beer-sheva.png
│   │   └── ...
│   └── 2025/
├── players/
│   ├── 2024/          ← תמונות שחקנים לפי שנה
│   └── 2025/
└── media/             ← העלאות מדיה כלליות
```

#### API-Football (External)

```
v3.football.api-sports.io
├── /countries
├── /leagues?country=Israel
├── /teams?league={id}&season={year}
├── /players?team={id}&season={year}
├── /fixtures?league={id}&season={year}
├── /fixtures/events?fixture={id}
├── /fixtures/lineups?fixture={id}
├── /fixtures/statistics?fixture={id}
├── /standings?league={id}&season={year}
├── /players/topscorers?league={id}&season={year}
├── /predictions?fixture={id}
├── /odds?fixture={id}
└── /fixtures/headtohead?h2h={team1}-{team2}
```

## זרימות עיקריות

### A. סנכרון נתונים (Admin Fetch)

```
אדמין לוחץ "משוך נתונים"
        │
        ▼
POST /api/admin/fetch
  body: { seasonId, resources: [...], teamId? }
        │
        ▼
┌─ FetchJob נוצר (status: RUNNING) ─────────────────────────┐
│                                                             │
│  Step 1: countries → seasons → leagues                      │
│     apiFootballFetch('/leagues?country=Israel')              │
│     ↓ upsert Competition + CompetitionSeason                │
│                                                             │
│  Step 2: teams → venues → players                           │
│     apiFootballFetch('/teams?league=...&season=...')         │
│     ↓ upsert Team, Venue                                    │
│     apiFootballFetch('/players?team=...&season=...')         │
│     ↓ upsert Player + download photos                       │
│     ↓ transliterateSeasonPlayers() → nameHe                 │
│                                                             │
│  Step 3: fixtures → events → lineups → statistics           │
│     apiFootballFetch('/fixtures?league=...&season=...')      │
│     ↓ upsert Game                                           │
│     for each game:                                          │
│       apiFootballFetch('/fixtures/events?fixture=...')       │
│       ↓ delete old events, create new                       │
│       ↓ participantName stored as fallback                  │
│       apiFootballFetch('/fixtures/lineups?fixture=...')      │
│       ↓ upsert GameLineupEntry                              │
│                                                             │
│  Step 4: standings → leaderboards → predictions → odds      │
│     ↓ upsert Standing, LeaderboardEntry, Prediction, Odds   │
│                                                             │
│  Step 5: post-processing                                    │
│     ↓ derive PlayerStatistics from events                   │
│     ↓ derive TeamStatistics from games                      │
│                                                             │
│  FetchJob updated (status: COMPLETED, progress: 100%)       │
└─────────────────────────────────────────────────────────────┘

Rate limiting: min 250ms between requests
Retries: 4 attempts, exponential backoff
Stale check: resources re-fetched only if older than threshold
```

### B. בקשת דף ציבורי (SSR)

```
GET /players/{id}?view=premier&season={sid}&tab=career
        │
        ▼
Server Component: PlayerPage
        │
        ├─ Prisma: matchedPlayer (by id or canonicalPlayerId)
        ├─ Prisma: linkedPlayers (all season entries)
        ├─ Prisma: allGames (for selected season)
        ├─ Promise.all:
        │   ├─ transfers
        │   ├─ trophies
        │   └─ sidelinedEntries
        │
        ├─ Compute:
        │   ├─ buildAggregatedStats(seasonPlayers) → aggregatedStats
        │   ├─ buildAggregatedStats(linkedPlayers) → careerStats
        │   ├─ derivePlayerDeepStats() → derivedTotals
        │   └─ buildPlayerGameRow() → playerGameRows
        │
        ├─ Resolve Hebrew name:
        │   canonicalPlayer.firstNameHe || split(nameHe) || firstNameEn
        │
        ▼
HTML Response (streamed via React Server Components)
  ├─ Header card (photo, name, team, position, injury badge)
  ├─ Tab navigation (overview | stats | games | career | achievements)
  └─ Active tab content (rendered server-side)
```

### C. עריכת אירוע במשחק (Client + API)

```
אדמין בדף משחק (tab=events)
        │
        ▼
GameAdminQuickEditorClient (Client Component)
  ├─ מילוי טופס: דקה, סוג, קבוצה, שחקן
  ├─ לחיצה "הוסף אירוע"
        │
        ▼
POST /api/events
  body: { gameId, minute, type, teamId, playerId, relatedPlayerId, ... }
        │
        ▼
Transaction:
  ├─ gameEvent.create(...)
  ├─ applyStatDelta(playerId, type, +1)  ← עדכון PlayerStatistics
  └─ return event with player relations
        │
        ▼
Client: router.refresh() → Server re-renders page with new event
```

### D. ניתוח תחזיות ויחסים (Predictions Page)

```
GET /predictions?season={sid}
        │
        ▼
Server Component: PredictionsPage
        │
        ├─ Prisma: gamesWithOdds (COMPLETED + Match Winner odds)
        ├─ Prisma: gamesWithPredictions (COMPLETED + prediction)
        │
        ├─ Compute per game:
        │   ├─ Average odds per selection (Home/Draw/Away) across bookmakers
        │   ├─ Favorite = lowest average odd
        │   ├─ favoriteWon = favorite === actual result
        │   ├─ isUpset = favorite lost + result odd > 3.0
        │   └─ API prediction accuracy (percentHome/Draw/Away → predicted vs actual)
        │
        ├─ Summary:
        │   ├─ favoriteAccuracy = favoriteWins / totalGames × 100
        │   ├─ Result distribution (home/draw/away counts + %)
        │   └─ API prediction accuracy
        │
        ▼
HTML: summary cards + distribution bars + odds table + predictions table
```

**כיסוי נתונים:**
- Odds נמשכים עבור משחקים עתידיים/חיים וגם **משחקים שהסתיימו בלי odds**
- API-Football לא מכסה כל ליגה (למשל גביע המדינה — 0 odds)
- אחרי משיכה מוצלחת שלא החזירה תוצאות, הכיסוי לא מסמן שוב

### E. ניהול פציעות (Team Page)

```
אדמין בדף קבוצה (tab=squad)
        │
        ▼
TeamInjuryManager (Client Component)
  ├─ בחירת שחקן + הזנת סוג פציעה
  ├─ לחיצה "סמן כפצוע"
        │
        ▼
POST /api/players/sidelined
  body: { playerId, typeHe }
        │
        ▼
  ├─ playerSidelinedEntry.create({ endDate: null })
  └─ return entry
        │
        ▼
Client: router.refresh()
        │
        ▼
Server re-renders:
  ├─ query: sidelinedEntries WHERE endDate IS NULL OR endDate > now
  ├─ unavailablePlayers list populated
  ├─ Squad cards: injured players get red badge + dimmed photo
  └─ "שחקנים לא זמינים" panel shows at top of squad

החזרה לסגל:
  PUT /api/players/sidelined { id, endDate: now() }
  → endDate < now → player removed from unavailable list
```

### E. Mobile API

```
iOS App (SwiftUI)
        │
        ▼
GET /api/mobile/home
  ├─ Standings (current season)
  ├─ Live games (active snapshots)
  ├─ Upcoming games
  └─ News (Telegram)
        │
GET /api/mobile/players/{id}
  ├─ Player info + stats
  ├─ Recent games
  └─ Career summary
        │
GET /api/mobile/live
  ├─ Active game snapshots
  ├─ Scores + minute
  └─ Key events
```

## אבטחה

### אימות (Authentication)

```
Register → bcryptjs.hash(password, 10) → User.create
Login    → bcryptjs.compare(password, hash)
           → Session.create({ tokenHash: sha256(randomToken) })
           → Set cookie: hbs_session={token} (14 days)

Request  → cookies().get('hbs_session')
           → sha256(token) → Session.findUnique({ tokenHash })
           → return User with role
```

### הרשאות (Authorization)

```
Public pages     → no auth required
API mutations    → getRequestUser(req) → check role === 'ADMIN'
Admin pages      → getCurrentUser() → redirect to /login if not admin
Mobile API       → no auth (read-only public data)
```

### הגנות

- **CSRF:** Server Actions + cookie-based sessions
- **SQL Injection:** Prisma parameterized queries (no raw SQL)
- **XSS:** React auto-escaping + no dangerouslySetInnerHTML
- **Auth bypass:** Role check on every admin API route
- **Rate limiting:** API-Football client enforces 250ms minimum gap

## ביצועים

### אופטימיזציות

- **Server Components:** אפס JavaScript בצד לקוח לדפים סטטיים
- **Parallel queries:** `Promise.all` לשאילתות בלתי תלויות
- **Selective includes:** Prisma `select` / `include` ממוקד (לא SELECT *)
- **Image fallbacks:** Client Component `MediaImage` עם `onError` — לא שובר SSR
- **Deferred loading:** דאטה גולמי באדמין נטען רק כשה-accordion פתוח

### מגבלות ידועות

- **דף אדמין:** טוען כמות גדולה של נתונים עבור raw data viewer — שאילתת עונה שלמה
- **דף שחקן:** מבצע 6+ שאילתות Prisma — כולן ב-Promise.all אבל עדיין IO-intensive
- **No caching:** אין שכבת cache (Redis/ISR) — כל בקשה מגיעה ל-DB
- **No pagination:** רוב הרשימות מחזירות את כל התוצאות (limit ידני ב-take)

## מצבי תצוגה

```
?view=premier  →  עיצוב עשיר עם gradients, shadows, rounded-[30px]
?view=classic  →  עיצוב נקי עם stone tones, borders, rounded-[28px]

getDisplayMode(searchParams?.view):
  1. Check query param
  2. Check site setting (DB)
  3. Default: 'classic'

כל דף מרנדר את שני המצבים:
  if (displayMode === 'premier') return <PremierView ... />;
  return <ClassicView ... />;
```

## סריקת אתרים חיצוניים

### ארכיטקטורת סריקה

```
┌──────────────────────────────────────────────────────┐
│                 אתרים חיצוניים                        │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Walla    │  │ football.org │  │ Sport5         │  │
│  │ Sports   │  │ .il (IFA)    │  │ .co.il         │  │
│  │ HTTP     │  │ Puppeteer    │  │ HTTP           │  │
│  └────┬─────┘  └──────┬───────┘  └────────┬───────┘  │
└───────┼───────────────┼────────────────────┼─────────┘
        │               │                    │
        ▼               ▼                    ▼
┌─────────────────────────────────────────────────────┐
│              Scraped Tables (raw storage)             │
│  ScrapedStanding · ScrapedMatch · ScrapedLeaderboard │
│  ScrapedTeam · ScrapedPlayer · ScrapedPlayerSeason   │
└────────────────────────┬────────────────────────────┘
                         │
                    Preview → Approve
                         │
                    ┌────┴────┐
                    │ Execute │ ←→ Rollback (snapshot)
                    └────┬────┘
                         │
┌────────────────────────┴────────────────────────────┐
│                  Main DB Tables                       │
│  Season · Team · Player · Game · Standing            │
│  PlayerStatistics · CompetitionLeaderboardEntry      │
└─────────────────────────────────────────────────────┘
```

### מקורות וכיסוי

| מקור | עונות | טבלאות | משחקים | שחקנים | Leaderboards | שיטה |
|---|---|---|---|---|---|---|
| **Walla** | 2000-2026 | ✅ | ✅ | Top lists | ✅ 6 categories | HTTP + Puppeteer |
| **IFA** | 2006-2026 | ✅ | ❌ | ❌ | ❌ | Puppeteer |
| **Sport5** | 2022-2025 | ✅ | ❌ | ✅ per-player | ❌ | HTTP |
| **API-Football** | 2016-2026 | ✅ | ✅ | ✅ | ✅ | REST API |

### ייבוא מלא (`/admin/setup`)

```
Admin UI → POST /api/admin/setup { action: 'start', mode: 'full' }
  │
  ├─ Phase 1: Scraping (~60 min)
  │   ├─ Walla standings + leaderboards (HTTP, ~3 min)
  │   ├─ Walla player stats — full lists (HTTP, ~5 min)
  │   ├─ Walla games (Puppeteer, ~30 min)
  │   ├─ Walla advanced stats (Puppeteer, ~30 min)
  │   ├─ IFA standings — 2 leagues (Puppeteer, ~5 min)
  │   └─ Sport5 teams + players (HTTP, ~20 min)
  │
  ├─ Phase 2: Merging (~10 min)
  │   ├─ merge-walla-standings → Season + Team + Standing
  │   ├─ merge-walla-games → Game
  │   ├─ merge-walla-leaderboards → CompetitionLeaderboardEntry
  │   └─ build-rosters → Player + PlayerStatistics
  │
  └─ Phase 3: Normalization (~5 min)
      ├─ transliterate-players → Hebrew names
      └─ backfill-canonical → deduplicate players
```

## אבטחה

### אימות (Authentication)

```
Register → bcryptjs.hash(password, 12) → User.create (transaction)
         → REGISTRATION_DISABLED env check
         → Rate limit: 5/min per IP
Login    → bcryptjs.compare(password, hash)
         → Rate limit: 5/min per IP
         → createSession({ tokenHash: sha256(randomToken) })
         → Set cookie: hbs_session (httpOnly, sameSite, secure)
Password → deleteMany(sessions) → update(password) → createSession(fresh)
```

### CSRF + Rate Limiting (middleware.ts)

```
Every API request:
  │
  ├─ GET → Rate limit: 30 req/10s per IP (public endpoints)
  │
  └─ POST/PUT/DELETE → Validate Origin header
      ├─ Origin matches host → Allow
      ├─ No Origin → Allow (same-origin)
      └─ Foreign Origin → 403 CSRF
```

### הגנות
- **CSRF:** middleware validates Origin on all mutating requests
- **Rate Limiting:** login 5/min, public API 30/10s
- **SQL Injection:** Prisma parameterized queries
- **XSS:** React auto-escaping
- **Upload:** 5MB limit + path traversal validation
- **Headers:** X-Frame-Options DENY, X-Content-Type-Options nosniff
- **Sessions:** invalidated on password change
- **Registration:** toggle + transaction for first-user admin

## תלויות חיצוניות

| שירות | שימוש | fallback |
|--------|--------|----------|
| API-Football | נתוני ליגה 2016+, שחקנים, משחקים | נתונים מקומיים |
| Walla Sports | נתונים היסטוריים 2000+, leaderboards | ❌ |
| football.org.il | טבלאות ליגה (IFA רשמי) | Walla כחלופה |
| Sport5 | סגלים ושחקנים עדכניים | API-Football |
| Telegram | פיד חדשות | מוסתר |
| PostgreSQL | כל הנתונים | אין — קריטי |
| Google Chrome | Puppeteer scrapers | HTTP scrapers בלבד |

## Deployment

```
Build:     npm run build
DB:        npx prisma db push
Generate:  npx prisma generate
Setup:     node scripts/setup-all-data.js (or /admin/setup)
Uploads:   public/uploads/ — persistent storage
Port:      8011 (dev)
```

ראה `docs/DEPLOYMENT-GUIDE.md` למדריך מלא.
