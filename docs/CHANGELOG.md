# Changelog

## [Unreleased] — עיצוב מחדש + תיקוני נתונים

### עיצוב (UI/UX)

#### מערכת עיצוב חדשה — Modern Design System
- **CSS custom properties**: `--accent`, `--accent-soft`, `--accent-deep`, `--accent-glow`, `--accent-text`, `--theme-hue`, `--theme-sat` לצבעי ערכת עיצוב דינמיים
- **`data-color` attribute** על `<html>`: תמיכה ב-4 ערכות צבע — red / yellow / green / blue
- **`modern-card` CSS class**: `border-radius: 12px; border: 1px solid rgba(0,0,0,0.07); box-shadow: 0 1px 4px rgba(0,0,0,0.05)`
- **`hero-featured-match` CSS class**: כותרת gradient דינמית שמשתנה לפי ערכת הצבע
- **Accent title bars**: `border-r-[3px] border-[var(--accent)] pr-3` לכותרות כרטיסים

#### דפים שעוצבו מחדש
כל הדפים עברו מ-"בלוקים גדולים עם gradient צבעוני" לעיצוב נקי ומודרני:

| דף | שינויים עיקריים |
|---|---|
| `/standings` | ביטול gradient סגול, position badges עם ניצחון/אירופה/ירידה, logos קבוצות, form chips |
| `/games` | header אחיד modern-card, score badge, status badge לחי |
| `/players` | header אחיד, כרטיסי שחקנים מעודכנים, 4 metrics בלבד |
| `/players/[id]` | hero `hero-featured-match` במקום gradient אדום קשיח, tabs בצבע accent |
| `/statistics` | ביטול gradient סגול, StatsCard אחיד, leaderboard cards |
| `/teams/[id]` | hero `hero-featured-match`, tabs בצבע accent, highlight שורת טבלה |
| `/venues` | header אחיד, venue hero cards |

#### Navbar
- עיצוב מחדש מלא: לוגו HBS עם ערכת צבע, תפריט RTL, burger menu במובייל
- הוספת "אצטדיונים" לניווט

#### Account / Settings
- הגדרת ערכת צבע (4 אפשרויות) נשמרת ב-DB לכל משתמש
- `ThemeProvider` component חדש — טוען ערכת צבע מה-DB ב-Server Component, מחיל על `<html>`

---

### תיקוני נתונים

#### סטטיסטיקות — שמות שחקנים ונתונים חלקיים
**בעיה**: ב-`/statistics`, `CompetitionLeaderboardEntry.playerNameHe` ריק לרוב → שמות מוצגים באנגלית מקוצרת (כמו "D. Biton").  
**פתרון**: בנייה נוספת של `playerById` map מ-`leaderPlayers` — כשה-`playerId` מקושר, משתמשים ב-`formatPlayerName(player)` לשם המלא בעברית.

**בעיה**: ערכי ה-leaderboard מה-DB (מסריקת Walla) ישנים/חלקיים, מוחלפים לחלוטין עם ספירת אירועי משחק.  
**פתרון**: עבור TOP_SCORERS ו-TOP_ASSISTS: `Math.max(e.value, countScoringEventsForPlayer(leaderGames, e.playerId))`.

**קובץ**: `src/app/statistics/page.tsx`

#### RSSSF — טבלאות היסטוריות חלקיות
**בעיה**: טבלאות RSSSF לשנים לפני 2000 הציגו רק חצי מהקבוצות.  
**סיבה**: regex ב-`extractStandingRows` לא תמך בהפרשי שערים חד-ספרתיים עם רווח (כמו `+ 4`, `- 6`).  
`[+\-]?\d+` נכשל כשיש רווח בין הסימן לספרה בפורמט RSSSF המיושר בעמודות.  
**תיקון**: `[+\-]?\s*\d+` — הוספת `\s*` לאפשר רווח אופציונלי.

**קובץ**: `scripts/scrape-rsssf.js`

#### RSSSF — לוגואים לקבוצות היסטוריות
**בעיה**: קבוצות מעונות לפני 2001 נוצרו ללא `logoUrl`.  
**פתרון**: הוספת שני מנגנונים ב-`merge-rsssf.js`:
1. **בזמן יצירה** (`getOrCreateTeam`): מחפש קבוצה קיימת עם אותו `nameHe` ולוגו → מעתיק.
2. **`backfillTeamLogos()`**: פונקציה חדשה שרצה לאחר ה-merge — מעדכנת קבוצות היסטוריות ללא לוגו. כולל `NAME_ALIASES` למיפוי שמות שהשתנו לאורך השנים (כמו "בני יהודה תל אביב" → "בני יהודה").

**תוצאה**: 301 קבוצות היסטוריות קיבלו לוגו.

**קובץ**: `scripts/merge-rsssf.js`

---

### שינויי DB / Prisma

- הוספת `UserPreference` model (או שדה בטבלת Users) לשמירת ערכת צבע (`colorScheme`)
- `CompetitionSeason` — קישור competition לעונה גם בסריקת RSSSF

---

### תיקוני קוד נוספים

- `src/app/players/[id]/page.tsx`: nav tabs משתמשים ב-`var(--accent)`, ביטול צבעי purple קשיחים
- `src/components/Navbar.tsx`: ניווט RTL מלא, תמיכה במובייל
- TypeScript — כל השינויים עברו `tsc --noEmit` ללא שגיאות חדשות
