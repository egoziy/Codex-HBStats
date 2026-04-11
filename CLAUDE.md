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
| עונות | 26 | IFA + Walla | 2000-2026 |
| קבוצות | ~793 | IFA + Walla | 2000-2026 |
| טבלאות | ~729 | IFA + Walla | 2000-2026 |
| משחקים | ~13,064 | IFA (ליגה + גביע מדינה + טוטו) + Walla | 2000-2026 |
| אירועי משחק | ~122,360 | IFA (97% מקושרים לשחקנים) | 2006-2026 |
| הרכבים | ~208,673 | IFA (82% מקושרים לשחקנים) | 2006-2026 |
| שחקנים | ~19,994 | IFA (83% מקושרים cross-season) | 2006-2026 |
| סטטיסטיקות שחקנים | ~19,994 | IFA (10 שדות per player per season) | 2006-2026 |
| Leaderboards | ~29,299 | Walla (6 קטגוריות) | 2000-2026 |
| אצטדיונים | 248 | IFA | 2006-2026 |
| שופטים | 125 | IFA (ראשיים בלבד, בעברית) | 2006-2026 |
| תמונות שחקנים | ~20,890 | IFA (מקומיות) | 2006-2026 |

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
      admin/db-transfer/       # ייצוא/ייבוא DB (pg_dump/pg_restore)
      referees/                # CRUD + merge שופטים
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
  scrape-ifa-full.js           # IFA: טבלאות + משחקים + שחקנים + אירועים (HTTP, ללא Puppeteer)
  scrape-ifa-cups.js           # IFA: גביע מדינה + גביע טוטו (HTTP)
  scrape-ifa.js                # IFA: טבלאות (Puppeteer, ישן)
  download-ifa-photos.js       # הורדת תמונות שחקנים מ-IFA למקומי
  compare-sources.js           # השוואת IFA vs Walla
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

### football.org.il — IFA (2006-2026) — מקור ראשי
- טבלאות ליגה (ASMX: LeagueTable)
- משחקים מחזור-מחזור (ASMX: LeagueGamesList)
- גביע מדינה (ASMX: NatCupAllTables, national_cup_id=618)
- גביע טוטו ליגת העל (ASMX: TotoCup_AllTables, league_id=625)
- גביע טוטו ליגה לאומית (ASMX: TotoCup_AllTables, league_id=630)
- פרטי משחק: תוצאות, מחצית, הארכה, פנדלים, הרכבים, אירועים, שופטים (מפורסרים), מאמנים
- סטטיסטיקות שחקנים (ASMX: GetTeamPlayersStatisticsList) — 10 שדות
- פרטי שחקן: תמונה, תאריך לידה, אזרחות
- HTTP בלבד (curl) — ללא Puppeteer

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
- **ScrapedPlayer** — שחקן + קבוצה + תמונה + תאריך לידה + אזרחות
- **ScrapedPlayerSeason** — סטטיסטיקות per season per player (10 שדות + yellowCardsToto)
- **ScrapedMatch** — תוצאת משחק + מחצית + הארכה + פנדלים + שופטים מפורסרים (6 שדות)
- **ScrapedMatchEvent** — אירועי משחק: שערים, כרטיסים, חילופים + דקה + שחקנים
- **ScrapedMatchLineup** — הרכבים: פותח, מחליפים, ספסל + מספר חולצה + עמדה
- **ScrapedStanding** — שורת טבלה
- **ScrapedLeaderboard** — leaderboard entry (שערים, בישולים, כרטיסים, מתקדמים)
- **ScrapeJob** — מעקב עבודות סריקה
- **MergeOperation** — מעקב מיזוגים עם snapshot ל-rollback

## מיזוג נתונים

### עקרונות
- **לא מוחק** נתונים קיימים
- **לא דורס** שדות שכבר מלאים מ-API-Football
- **ממלא** רק שדות ריקים
- **Exact + abbreviation matching** להתאמת שמות קבוצות (IFA_TEAM_ABBREVS)
- **Name reversal + all-words matching** לשחקנים (שם פרטי/משפחה)
- **Competition-aware** — מזהה ליגה/גביע מדינה/טוטו לפי leagueNameHe + framework
- **Snapshot + Rollback** — כל מיזוג ניתן לביטול
- **Player linking** — מקשר אירועים והרכבים ל-playerId (97% הצלחה)

### סדר מיזוג נכון
1. **standings** — יוצר seasons + teams + standings
2. **games** — צריך seasons + teams, יוצר games + events + lineups
3. **players** — צריך seasons + teams, יוצר players + playerStatistics

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
- `/admin/merge` — מיזוג עם preview + rollback (standings/games/players/all)
- `/admin/games` — עורך משחקים
- `/admin/venues` — ניהול אצטדיונים
- `/admin/referees` — ניהול שופטים (עריכה inline, מיזוג כפולים, סינון מדינה/מסגרת)
- `/admin/db-transfer` — ייצוא/ייבוא DB מלא (DUMP דחוס + SQL קריא)
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
