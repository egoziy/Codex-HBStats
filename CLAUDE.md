# HBStats — Codex-HBStats

פלטפורמת סטטיסטיקות כדורגל ישראלי מבוססת Next.js 14, עם ממשק בעברית (RTL), ניהול אדמין מלא, וסנכרון נתונים מ-API-Football ומאתרי ספורט ישראליים.

## טכנולוגיות

- **Framework:** Next.js 14 (App Router, Server Components)
- **Language:** TypeScript 5
- **Database:** PostgreSQL + Prisma ORM 5
- **Styling:** Tailwind CSS 3
- **Auth:** Sessions מותאמות עם bcryptjs (CSRF, rate limiting, security headers)
- **Charts:** Recharts 3.8
- **PDF:** jsPDF + html2canvas
- **Icons:** Lucide React
- **Scraping:** Puppeteer (Chrome headless) + HTTP scraping
- **External API:** API-Football (v3.football.api-sports.io)
- **External Scraping:** Walla Sports, football.org.il (IFA), Sport5
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
- `REGISTRATION_DISABLED` — `true` לנעילת הרשמה

## נתונים — 26 שנות כדורגל ישראלי

| נתון | כמות | מקור | עונות |
|---|---|---|---|
| עונות | 26 | Walla + API-Football | 2000-2026 |
| קבוצות | ~1,350 | Walla + API-Football | 2000-2026 |
| טבלאות | ~716 | Walla + IFA | 2000-2026 |
| משחקים | ~5,414 | Walla + API-Football | 2000-2026 |
| שחקנים | ~15,368 | Walla leaderboards + API-Football | 2000-2026 |
| סטטיסטיקות שחקנים | ~35,965 | Walla + API-Football | 2000-2026 |
| Leaderboards | ~29,398 | Walla (6 categories) | 2000-2026 |

## מבנה התיקיות

```
prisma/schema.prisma          # סכמת DB — 45+ מודלים
src/
  app/
    page.tsx                   # דף בית — טבלה, לייב, חדשות טלגרם
    login/, register/          # הרשמה והתחברות
    games/[id]/                # דף משחק — אירועים, הרכבים, סטטיסטיקה
    players/[id]/              # דף שחקן — סקירה, סטטיסטיקה, קריירה, הישגים
    players/[id]/charts/       # גרפים עונתיים לשחקן
    teams/[id]/                # דף קבוצה — סגל, משחקים, שופטים
    teams/[id]/charts/         # גרפים לקבוצה
    standings/                 # טבלת ליגה (26 עונות)
    statistics/                # מלכי שערים/בישולים/כרטיסים (6 קטגוריות)
    predictions/               # ניתוח תחזיות ויחסים מול תוצאות
    venues/                    # אצטדיונים — סינון עונה/ליגה/עיר
    compare/                   # השוואות עונתיות
    live/                      # משחקים חיים
    admin/                     # אזור אדמין
      setup/                   # ייבוא מלא מה-UI (scrape + merge + normalize)
      scrape/                  # ניהול סריקות חיצוניות
      merge/                   # מיזוג נתונים עם preview + rollback
      games/                   # עורך משחקים מלא
      quick-edit/              # עריכה מהירה
      venues/                  # ניהול אצטדיונים
      teams/[teamKey]/         # עורך קבוצה
    api/
      admin/fetch/             # סנכרון נתונים מ-API-Football
      admin/setup/             # ייבוא מלא ברקע
      admin/scrape/            # סריקת אתרים חיצוניים
      admin/merge/             # מיזוג עם preview + rollback
      events/                  # CRUD אירועי משחק
      games/                   # CRUD משחקים
      players/sidelined/       # ניהול פציעות ידני
      mobile/                  # API למובייל
  components/                  # 30+ קומפוננטות React
  lib/                         # 30+ מודולי עזר
  middleware.ts                # CSRF + rate limiting
scripts/
  setup-all-data.js            # Master setup — מריץ הכל בסדר הנכון
  scrape-walla.js              # Walla: טבלאות + leaderboards
  scrape-walla-games.js        # Walla: תוצאות משחקים (Puppeteer)
  scrape-walla-player-stats.js # Walla: סטטיסטיקות שחקנים מלאות
  scrape-walla-advanced-puppeteer.js # Walla: סטטיסטיקות מתקדמות
  scrape-ifa.js                # IFA: טבלאות (Puppeteer)
  scrape-all-sport5.js         # Sport5: קבוצות + שחקנים
  merge-walla-standings.js     # מיזוג טבלאות → DB
  merge-walla-games.js         # מיזוג משחקים → DB
  merge-walla-leaderboards.js  # מיזוג leaderboards → DB
  build-rosters-from-leaderboards.js # בניית סגלים מ-leaderboards
  transliterate-players.js     # תעתיק שמות שחקנים לעברית
  backfill_canonical_players.js # איחוד שחקנים כפולים
docs/
  ARCHITECTURE.md              # ארכיטקטורת המערכת
  SECURITY-AUDIT.md            # דוח אבטחה + תיקונים
  DEPLOYMENT-GUIDE.md          # מדריך הקמת סביבה
```

## מקורות נתונים חיצוניים

### API-Football (2016+)
- teams, players, fixtures, events, lineups, statistics, standings
- predictions, odds, head-to-head, live scores
- Rate limiting: 250ms, 4 retries, 7,500 calls/day

### Walla Sports (2000-2026)
- טבלאות ליגה (ליגת העל + ליגה לאומית)
- מלכי שערים, בישולים, כרטיסים צהובים/אדומים, החלפות (רשימות מלאות)
- תוצאות משחקים עם תוצאות מחצית
- סטטיסטיקות מתקדמות (19 קטגוריות per season)

### football.org.il — IFA (2006-2026)
- טבלאות ליגת העל + ליגה לאומית
- דורש Puppeteer (ASP.NET דינמי)

### Sport5 (2022-2025)
- סגלי שחקנים עם סטטיסטיקות פרטניות
- 3 עונות אחורה per player

## סטטיסטיקות — 6 קטגוריות Leaderboard

| קטגוריה | כמות | enum |
|---|---|---|
| מלכי שערים | 4,122 | TOP_SCORERS |
| מלכי בישולים | 3,812 | TOP_ASSISTS |
| כרטיסים צהובים | 6,630 | TOP_YELLOW_CARDS |
| כרטיסים אדומים | 1,437 | TOP_RED_CARDS |
| נכנס כמחליף | 6,699 | TOP_SUBSTITUTED_IN |
| הוחלף | 6,698 | TOP_SUBSTITUTED_OUT |

## מודלים — Scraped Data (אחסון גולמי)

נתונים סרוקים נשמרים בנפרד לפני מיזוג:
- **ScrapedTeam** — קבוצה + עונה + מקור
- **ScrapedPlayer** — שחקן + קבוצה
- **ScrapedPlayerSeason** — סטטיסטיקות per season per player
- **ScrapedMatch** — תוצאת משחק עם מחצית
- **ScrapedStanding** — שורת טבלה
- **ScrapedLeaderboard** — leaderboard entry (שערים, בישולים, כרטיסים, מתקדמים)
- **ScrapeJob** — מעקב עבודות סריקה
- **MergeOperation** — מעקב מיזוגים עם snapshot ל-rollback

## מיזוג נתונים

### עקרונות
- **לא מוחק** נתונים קיימים
- **לא דורס** שדות שכבר מלאים מ-API-Football
- **ממלא** רק שדות ריקים
- **Levenshtein fuzzy matching** להתאמת שמות שחקנים
- **Snapshot + Rollback** — כל מיזוג ניתן לביטול

### זרימה
```
סריקה → ScrapedX tables → Preview → Approve → Execute → Main DB
                                                ↕
                                            Rollback
```

## אדמין

### דפים
- `/admin` — לוח בקרה ראשי (נתונים + הגדרות)
- `/admin/setup` — **ייבוא מלא** מה-UI (3 מצבים: full/quick/merge-only)
- `/admin/scrape` — סריקות חיצוניות (Sport5, Walla, IFA)
- `/admin/merge` — מיזוג עם preview + rollback
- `/admin/games` — עורך משחקים
- `/admin/venues` — ניהול אצטדיונים
- `/admin/teams/[key]` — עורך קבוצה

### ייבוא מלא (`/admin/setup`)
3 מצבים:
- **Full** (~90 דק') — scrape all + merge + normalize
- **Quick** (~15 דק') — Walla standings + players + merge
- **Merge Only** (~10 דק') — merge existing scraped data

Progress tracking בזמן אמת עם progress bar ושלבים.

## אבטחה

### תיקונים שבוצעו (ראה docs/SECURITY-AUDIT.md)
- **CSRF** — middleware validates Origin header on all mutating API requests
- **Rate Limiting** — 5 attempts/min on login/register, 30 req/10s on public APIs
- **Registration** — toggle via REGISTRATION_DISABLED env, transaction for first-user
- **Session** — invalidate all sessions on password change
- **Upload** — 5MB limit, path traversal validation
- **Headers** — X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- **Error Messages** — sanitized, no internal details exposed

## קונבנציות קוד

- **RTL:** כל הדפים הציבוריים בעברית, `dir="rtl"` על ה-layout
- **שמות שדות:** תמיד `nameEn`/`nameHe` — עברית מועדפת בתצוגה
- **Server Components:** ברירת מחדל. Client components רק כשצריך interactivity
- **תמונות:** `public/uploads/teams/{year}/` ו-`public/uploads/players/{year}/`
- **Fallback:** `MediaImage.tsx` — `onError` handler עם initials placeholder
- **DB push:** לא migrations — `npx prisma db push` לסנכרון סכמה
- **Scraping:** נתונים נשמרים ב-Scraped* tables, מוזגים אחרי review
