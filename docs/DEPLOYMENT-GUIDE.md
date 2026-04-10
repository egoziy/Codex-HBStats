# HBStats — Deployment & Data Setup Guide

מדריך הקמת סביבה חדשה — DEV או PROD.

## דרישות מקדימות

```bash
# Node.js 18+
# PostgreSQL database
# Google Chrome (for Puppeteer scrapers)
# API-Football key (https://api-football.com)
```

## 1. Setup בסיסי

```bash
git clone https://github.com/egoziy/Codex-HBStats.git
cd Codex-HBStats
npm install

# Copy environment file
cp .env.example .env
# Edit .env with your DB connection and API keys

# Push schema to DB
npx prisma db push
npx prisma generate

# Start dev server
npm run dev -- --port 8011
```

## 2. סדר ייבוא נתונים — מלא

### שלב 1: API-Football (דרך Admin UI)

1. פתח `http://localhost:8011/admin`
2. לחץ "נתונים ומשיכה"
3. **עבור כל עונה (מ-2016 ואילך):**
   - בחר עונה + "כל הקבוצות"
   - Resources: competitions, teams, players, fixtures, standings, events, lineups, statistics, topScorers, topAssists
   - לחץ "משוך נתונים"
   - **הערה:** כל משיכה צורכת ~100-500 API calls. מכסה יומית: 7,500

### שלב 2: סריקת Walla (טרמינל) — נתונים היסטוריים

```bash
# טבלאות ליגה + leaderboards (2000-2026, ליגת העל + ליגה לאומית)
node scripts/scrape-walla.js

# סטטיסטיקות שחקנים מלאות (שערים, בישולים, כרטיסים, החלפות)
node scripts/scrape-walla-player-stats.js

# סטטיסטיקות מתקדמות (דורש Puppeteer/Chrome)
node scripts/scrape-walla-advanced-puppeteer.js

# תוצאות משחקים (דורש Puppeteer/Chrome, ~30 דקות)
node scripts/scrape-walla-games.js
```

### שלב 3: סריקת IFA (טרמינל, דורש Puppeteer)

```bash
# טבלאות ליגת העל + ליגה לאומית מ-football.org.il
node scripts/scrape-ifa.js --league 40 --from 2 --to 27
node scripts/scrape-ifa.js --league 45 --from 2 --to 27
```

### שלב 4: סריקת Sport5 (Admin UI או טרמינל)

```bash
# דרך Admin UI: /admin/scrape → "סרוק את כל Sport5" (~20 דקות)
# או דרך טרמינל:
node scripts/scrape-all-sport5.js
```

### שלב 5: מיזוג נתונים

```bash
# מיזוג טבלאות Walla → Standing + Team + Season
node scripts/merge-walla-standings.js

# מיזוג משחקים Walla → Game
node scripts/merge-walla-games.js

# מיזוג leaderboards → CompetitionLeaderboardEntry
node scripts/merge-walla-leaderboards.js

# בניית סגלים מ-leaderboards → Player + PlayerStatistics
node scripts/build-rosters-from-leaderboards.js
```

### שלב 6: נורמליזציה

```bash
# תעתיק שמות שחקנים לעברית
node scripts/transliterate-players.js --all --apply

# איחוד שחקנים כפולים
node scripts/backfill_canonical_players.js
```

### שלב 7: מיזוג דרך Admin UI (אופציונלי)

1. פתח `/admin/merge`
2. בחר מקור: Walla / IFA / Sport5
3. בחר סוג: טבלאות / שחקנים / הכל
4. תצוגה מקדימה → אשר → בצע

## 3. סדר ייבוא מהיר (מינימלי)

למי שרוצה רק נתונים בסיסיים:

```bash
# 1. API-Football — עונה נוכחית בלבד (דרך Admin UI)
# 2. Walla standings + leaderboards
node scripts/scrape-walla.js
node scripts/scrape-walla-player-stats.js
node scripts/merge-walla-standings.js
node scripts/merge-walla-leaderboards.js
node scripts/build-rosters-from-leaderboards.js
# 3. תעתיק
node scripts/transliterate-players.js --all --apply
```

## 4. תוצאות צפויות

| נתון | כמות צפויה |
|---|---|
| עונות | 26 (2000-2026) |
| קבוצות | ~1,350 |
| טבלאות | ~716 |
| משחקים | ~5,414 |
| שחקנים | ~15,368 |
| סטטיסטיקות | ~35,965 |
| Leaderboards | ~29,398 |

## 5. משתני סביבה

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/hbs
JWT_SECRET=your-secret-here
API_FOOTBALL_KEY=your-api-football-key
API_FOOTBALL_BASE_URL=https://v3.football.api-sports.io
REGISTRATION_DISABLED=false  # true to disable registration
```

## 6. זמני ריצה צפויים

| סקריפט | זמן | דורש |
|---|---|---|
| scrape-walla.js | ~3 דקות | HTTP בלבד |
| scrape-walla-player-stats.js | ~5 דקות | HTTP בלבד |
| scrape-walla-games.js | ~30 דקות | Puppeteer + Chrome |
| scrape-walla-advanced-puppeteer.js | ~30 דקות | Puppeteer + Chrome |
| scrape-ifa.js (both leagues) | ~5 דקות | Puppeteer + Chrome |
| scrape-all-sport5.js | ~20 דקות | HTTP בלבד |
| merge-walla-standings.js | ~1 דקה | DB בלבד |
| merge-walla-games.js | ~2 דקות | DB בלבד |
| merge-walla-leaderboards.js | ~5 דקות | DB בלבד |
| build-rosters-from-leaderboards.js | ~5 דקות | DB בלבד |
| transliterate-players.js | ~2 דקות | DB בלבד |
| backfill_canonical_players.js | ~3 דקות | DB בלבד |
| **סה"כ** | **~90 דקות** | |
