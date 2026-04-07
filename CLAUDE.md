# HBStats — Codex-HBStats

פלטפורמת סטטיסטיקות כדורגל ישראלי מבוססת Next.js 14, עם ממשק בעברית (RTL), ניהול אדמין מלא, וסנכרון נתונים מ-API-Football.

## טכנולוגיות

- **Framework:** Next.js 14 (App Router, Server Components)
- **Language:** TypeScript 5
- **Database:** PostgreSQL + Prisma ORM 5
- **Styling:** Tailwind CSS 3
- **Auth:** Sessions מותאמות עם bcryptjs + JWT
- **Charts:** Recharts 3.8
- **PDF:** jsPDF + html2canvas
- **Icons:** Lucide React
- **i18n:** i18next (עברית/אנגלית)
- **External API:** API-Football (v3.football.api-sports.io)
- **News:** Telegram channel integration

## הרצה

```bash
npm install
npx prisma db push        # סנכרון סכמה
npx prisma generate        # יצירת Prisma Client
npm run dev -- --port 8011 # שרת פיתוח
```

משתני סביבה נדרשים ב-`.env`:
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — סוד להצפנת sessions
- `API_FOOTBALL_KEY` — מפתח API-Football
- `API_FOOTBALL_BASE_URL` — (ברירת מחדל: https://v3.football.api-sports.io)

## מבנה התיקיות

```
prisma/schema.prisma          # סכמת DB — 39+ מודלים, 20+ enums
src/
  app/
    page.tsx                   # דף בית — טבלה, לייב, חדשות טלגרם
    login/, register/          # הרשמה והתחברות
    games/[id]/                # דף משחק — אירועים, הרכבים, סטטיסטיקה
    players/[id]/              # דף שחקן — סקירה, סטטיסטיקה, קריירה, הישגים
    players/[id]/charts/       # גרפים עונתיים לשחקן
    teams/[id]/                # דף קבוצה — סגל, משחקים, שופטים
    teams/[id]/charts/         # גרפים לקבוצה
    standings/                 # טבלת ליגה (מחושבת / API)
    statistics/                # מלכי שערים ובישולים
    venues/                    # אצטדיונים — סינון עונה/ליגה/עיר
    compare/                   # השוואות עונתיות
    live/                      # משחקים חיים
    admin/                     # אזור אדמין
      games/                   # עורך משחקים מלא
      quick-edit/              # עריכה מהירה
      venues/                  # ניהול אצטדיונים
      teams/[teamKey]/         # עורך קבוצה
    api/
      admin/fetch/             # סנכרון נתונים מ-API-Football
      admin/fetch-jobs/        # מעקב עבודות משיכה
      events/                  # CRUD אירועי משחק
      games/                   # CRUD משחקים
      players/sidelined/       # ניהול פציעות ידני
      mobile/                  # API למובייל (home, live, games, teams, players, news)
  components/                  # 24 קומפוננטות React
  lib/                         # 26 מודולי עזר
scripts/
  transliterate-players.js     # תעתיק שמות שחקנים לעברית
  backfill_canonical_players.js # איחוד שחקנים כפולים
```

## מודלים עיקריים (Prisma)

### ליבה
- **Season** — עונה (year, name, startDate, endDate)
- **Competition** — מסגרת/ליגה (nameEn/He, country, type: LEAGUE/CUP/EUROPE)
- **Team** — קבוצה (nameEn/He, logo, coach, venue, season)
- **Player** — שחקן (nameEn/He, firstName/lastName, position, nationality, photo, age, height)
  - `canonicalPlayerId` — מקשר אותו שחקן בין עונות שונות
- **Game** — משחק (dateTime, status, scores, homeTeam, awayTeam, competition, season)
- **Venue** — אצטדיון (nameEn/He, city, capacity, surface, image)
- **Referee** — שופט (nameEn/He)

### נתוני משחק
- **GameEvent** — אירוע (GOAL/ASSIST/YELLOW_CARD/RED_CARD/SUBSTITUTION/OWN_GOAL/PENALTY)
  - `playerId` = שחקן ראשי (כובש לשער)
  - `relatedPlayerId` = שחקן קשור (מבשל לשער)
  - `participantName` / `relatedParticipantName` = שם טקסטואלי כשהשחקן לא במערכת
- **GameLineupEntry** — הרכב (role: STARTER/SUBSTITUTE/COACH, formation, positionGrid)
- **GameStatistics** — סטטיסטיקות משחק (possession, shots, corners, fouls)

### סטטיסטיקות
- **PlayerStatistics** — goals, assists, cards, games, minutes (per season+competition)
- **TeamStatistics** — matches, goals, conceded, cleanSheets, points
- **Standing** — position, W/D/L, GF/GA, points, pointsAdjustment
- **CompetitionLeaderboardEntry** — מלכי שערים/בישולים

### שחקן מורחב
- **PlayerTransfer** — העברות (source/destination team, date, type)
- **PlayerTrophy** — גביעים והישגים (league, season, place)
- **PlayerSidelinedEntry** — פציעות/השעיות (type, startDate, endDate)
  - `endDate === null` → פצוע כרגע
  - `endDate > now` → עדיין לא זמין
  - `endDate < now` → חזר לסגל

### תחזיות ויחסים
- **GamePrediction** — ניחוש תוצאה (winner, advice, percentages)
- **GameOddsValue** — יחסי הימורים (bookmaker, market, selection, odd)
- **GameHeadToHeadEntry** — ראש בראש היסטורי

### מערכת
- **User** — role: ADMIN/USER/GUEST
- **Session** — טוקן מוצפן, תפוגה 14 יום
- **FetchJob** — עבודת משיכה (status, steps, progress%)
- **MediaAsset** — תמונות (logos, photos)
- **ActivityLog** — לוג פעולות

## זרימת נתונים

### סנכרון מ-API-Football
הטריגר: אדמין שולח בקשת fetch דרך `/api/admin/fetch`

סדר השלבים:
1. countries → seasons → leagues → competitions
2. teams → venues → players (+ שמירת תמונות ל-`public/uploads/`)
3. fixtures → events → lineups → statistics
4. standings → leaderboards → predictions → odds → h2h
5. **פוסט-עיבוד:** תעתיק שמות שחקנים לעברית, חישוב deep stats

Rate limiting: 250ms מינימום בין בקשות, 4 ניסיונות עם exponential backoff.

### חישוב סטטיסטיקות
`src/lib/deep-stats.ts` — מחשב שערים/בישולים/כרטיסים מתוך אירועי משחק:
- `event.playerId === playerId` + `GOAL` → שער
- `event.relatedPlayerId === playerId` + `GOAL` → בישול
- שימוש ב-leaderboard entries כ-fallback

### תעתיק שמות שחקנים
`src/lib/player-transliteration.ts` — מילון שמות פרטיים ומשפחה + תעתיק פונטי:
- דיגרפים: sh→ש, ch→ח, th→ת, tz→צ
- אותיות סופיות: נ→ן, מ→ם, כ→ך, פ→ף, צ→ץ
- משולב בתהליך ה-fetch (אחרי ייבוא שחקנים)

## תצוגה

### מצב Premier
רוב הדפים תומכים בשני מצבי תצוגה (`?view=premier`):
- **Classic** — עיצוב פשוט עם stone/warm tones
- **Premier** — עיצוב עשיר עם gradients ו-shadows

### הרכב על מגרש (Lineup Pitch)
`FootballPitch` ב-`games/[id]/page.tsx`:
1. אם יש `positionGrid` → סידור לפי grid (row:col)
2. אם יש `player.position` (≥70% מהשחקנים) → קיבוץ לפי G/D/M/F
3. fallback → חלוקה 1-4-3-3 לפי formation string
4. תמונות שחקנים בתוך עיגולים + מספר חולצה badge

### דף שחקן — טאבים
- **סקירה** — פרטים אישיים, הופעות, שערים, העברות אחרונות, פציעות
- **סטטיסטיקה** — התקפה, הגנה, החזקה, משמעת
- **משחקים** — רשימת הופעות עם סינון (פותח/ספסל/נכנס/הוחלף)
- **קריירה** — טבלת עונות × קבוצות × מסגרות
- **הישגים** — גביעים (deduplicated)

### דף קבוצה
- סקירה עם מאזן, שערים, מיקום בטבלה
- סגל עם סימון פצועים (אדום)
- ניהול פציעות ידני (אדמין)
- משחקים, שופטים, סטטיסטיקה

## אדמין

דף אדמין (`/admin`) מחולק לשני טאבים:
- **נתונים ומשיכה** — fetch מ-API, כיסוי נתונים, דאטה גולמי, קבוצות, עבודות
- **הגדרות** — מדינות לייב, הגבלת משחקי דף בית, תצוגת שחקנים, מקורות טלגרם

דפי עריכה נפרדים:
- `/admin/games` — עורך משחקים מלא
- `/admin/quick-edit` — עריכה מהירה
- `/admin/venues` — ניהול אצטדיונים
- `/admin/teams/[teamKey]` — עורך קבוצה

### עורך אירועים במשחק
`GameAdminQuickEditorClient` (בתוך דף משחק, tab=events):
- הוספת/עריכת/מחיקת אירועים
- שדות: דקה, סוג, קבוצה, שחקן (מקושר), שחקן קשור
- עדכון אוטומטי של סטטיסטיקות

## API מובייל

נקודות קצה ייעודיות ב-`/api/mobile/`:
- `home` — דף בית מובייל
- `live` — משחקים חיים
- `games/[id]` — פרטי משחק
- `teams/[id]` — פרטי קבוצה
- `players/[id]` — פרטי שחקן
- `news` — פיד חדשות

## קונבנציות קוד

- **RTL:** כל הדפים הציבוריים בעברית, `dir="rtl"` על ה-layout
- **שמות שדות:** תמיד `nameEn`/`nameHe` — עברית מועדפת בתצוגה
- **Server Components:** ברירת מחדל. Client components רק כשצריך interactivity (`'use client'`)
- **תמונות:** `public/uploads/teams/{year}/` ו-`public/uploads/players/{year}/`
- **Fallback:** `MediaImage.tsx` — `onError` handler עם initials placeholder
- **DB push:** לא migrations — `npx prisma db push` לסנכרון סכמה
