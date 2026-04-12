# AI Chat Panel — עיצוב מפורט

## סקירה כללית

כפתור צף (FAB) בפינה השמאלית התחתונה של המסך. לחיצה פותחת חלונית צ'אט צפה.
משתמשים רשומים שואלים שאלות בעברית על נתוני כדורגל ישראלי, וה-AI מחזיר תשובות
מבוססות נתונים מהדאטאבייס דרך Function calling.

## ארכיטקטורה

```
User Question (Hebrew)
    ↓
/api/ai/chat (POST)
    ↓
Auth check (registered users only)
    ↓
AI Provider (Claude / GPT — configurable in admin)
    ↓ function calls
Internal data functions (Prisma queries)
    ↓ results
AI formats answer in Hebrew
    ↓
Response to client
```

## רכיבי UI

### AiChatFab
- כפתור צף, פינה שמאלית תחתונה (bottom-left for RTL)
- מוצג רק למשתמשים מחוברים
- אייקון: MessageCircle מ-Lucide React
- אנימציית פתיחה/סגירה

### AiChatPanel
חלונית צפה שנפתחת מעל הכפתור:
- **כותרת**: "עוזר סטטיסטיקות" + כפתור סגירה (X)
- **אזור הודעות**: שאלות (ימין) + תשובות (שמאל) עם גלילה אוטומטית
- **שדה קלט**: textarea + כפתור שליחה
- **אינדיקטור טעינה**: נקודות מהבהבות בזמן שה-AI מעבד
- **הודעת פתיחה**: "שאל אותי על כדורגל ישראלי — שחקנים, משחקים, טבלאות ועוד"
- **מימדים**: רוחב 380px, גובה 500px, max-height: 70vh
- **מיקום**: fixed, bottom-left, מעל ה-FAB

### State Management
- React useState בלבד (session-only)
- messages: Array<{ role: 'user' | 'assistant', content: string }>
- isLoading: boolean
- isOpen: boolean
- נמחק ברענון הדף

## API Endpoint

### `POST /api/ai/chat`

**Request:**
```json
{
  "messages": [
    { "role": "user", "content": "באיזה משחקים קיבל גיא מזרחי כרטיסים צהובים העונה?" }
  ]
}
```

**Response:**
```json
{
  "reply": "גיא מזרחי קיבל כרטיס צהוב ב-3 משחקים העונה: ..."
}
```

**Auth:** רק משתמשים רשומים (session check). מחזיר 401 אם לא מחובר.
**Rate Limit:** 10 שאלות לדקה per user.
**Error:** מחזיר `{ error: "..." }` עם status code מתאים.

### Flow בצד השרת
1. Validate auth + rate limit
2. Load AI settings from SiteSetting (provider, api key, enabled)
3. Return 503 if AI disabled or no API key configured
4. Build messages array with system prompt + user messages
5. Send to AI provider with tool definitions
6. If AI requests tool calls — execute them (Prisma queries)
7. Send tool results back to AI
8. Return final text response

## AI System Prompt

```
אתה עוזר סטטיסטיקות כדורגל ישראלי. התפקיד שלך לענות על שאלות
על שחקנים, קבוצות, משחקים, טבלאות וסטטיסטיקות מהכדורגל הישראלי.

כללים:
- ענה רק על שאלות הקשורות לנתוני כדורגל ישראלי
- השתמש ב-tools כדי לשלוף נתונים לפני שאתה עונה — אל תמציא מידע
- ענה בעברית תמיד
- אם אין נתונים מתאימים — אמור בכנות שאין מידע במערכת
- תן תשובות קצרות וברורות
- אם השאלה לא קשורה לכדורגל ישראלי, הסבר בנימוס שאתה יכול לעזור רק בנושאי כדורגל
```

## Functions (Tools)

### 1. searchPlayers
חיפוש שחקנים לפי שם.

**Parameters:**
- `name` (string, required) — שם השחקן בעברית או באנגלית
- `seasonYear` (number, optional) — סינון לפי עונה

**Implementation:** Prisma query על Player עם contains על nameHe/nameEn.
מחזיר: id, nameHe, nameEn, team, position, seasonYear.

### 2. getPlayerEvents
אירועי שחקן — שערים, כרטיסים, חילופים.

**Parameters:**
- `playerId` (number, required) — מזהה שחקן
- `seasonYear` (number, optional) — סינון לפי עונה
- `eventType` (string, optional) — GOAL, YELLOW_CARD, RED_CARD, SUBSTITUTION

**Implementation:** Prisma query על GameEvent עם relation ל-Game.
מחזיר: eventType, minute, game (teams, date, score).

### 3. searchGames
חיפוש משחקים לפי קבוצה, עונה, תאריכים.

**Parameters:**
- `teamName` (string, optional) — שם קבוצה
- `seasonYear` (number, optional) — עונה
- `dateFrom` (string, optional) — מתאריך (ISO)
- `dateTo` (string, optional) — עד תאריך (ISO)

**Implementation:** Prisma query על Game עם relations ל-homeTeam/awayTeam.
מחזיר: date, homeTeam, awayTeam, scoreHome, scoreAway, competition.

### 4. getStandings
טבלת ליגה לפי עונה.

**Parameters:**
- `seasonYear` (number, required) — עונה
- `competitionId` (number, optional) — מזהה ליגה (ברירת מחדל: ליגת העל)

**Implementation:** Prisma query על Standing עם relation ל-Team.
מחזיר: position, team, played, won, drawn, lost, goalsFor, goalsAgainst, points.

### 5. getLeaderboard
מלכי שערים, בישולים, כרטיסים.

**Parameters:**
- `category` (string, required) — TOP_SCORERS, TOP_ASSISTS, TOP_YELLOW_CARDS, TOP_RED_CARDS, TOP_SUBSTITUTED_IN, TOP_SUBSTITUTED_OUT
- `seasonYear` (number, optional) — עונה

**Implementation:** Prisma query על CompetitionLeaderboardEntry.
מחזיר: rank, playerName, teamName, value, seasonYear.

## הגדרות אדמין

מאוחסן ב-SiteSetting (מודל קיים), מפתחות:

| Key | Type | Description |
|---|---|---|
| `ai_enabled` | boolean | האם הפיצ'ר פעיל |
| `ai_provider` | string | "claude" / "openai" |
| `ai_api_key_claude` | string | מפתח API ל-Claude (מוצפן) |
| `ai_api_key_openai` | string | מפתח API ל-OpenAI (מוצפן) |

ממשק אדמין ב-`/admin` — סקשן הגדרות AI:
- Toggle פעיל/כבוי
- Dropdown לבחירת ספק
- שדות API key (מוצפנים, מוצגים כ-****)

## אבטחה

- **Auth:** רק משתמשים רשומים (session check)
- **Rate Limiting:** 10 שאלות לדקה per user
- **Read-only:** כל ה-functions מריצות Prisma queries לקריאה בלבד
- **API Keys:** מאוחסנים ב-SiteSetting, לא חשופים לקליינט
- **System Prompt:** מגביל את ה-AI לתחום הנתונים בלבד
- **Input sanitization:** ולידציה על אורך הודעה (מקסימום 500 תווים)
- **Response limit:** מקסימום 20 הודעות per session

## קבצים חדשים

```
src/
  components/
    AiChat.tsx              # Client component — FAB + Panel + state
  app/
    api/
      ai/
        chat/
          route.ts          # POST endpoint — auth, rate limit, AI call
  lib/
    ai-tools.ts             # 5 tool functions (Prisma queries)
    ai-providers.ts         # Claude + OpenAI provider abstraction
```

## Dependencies חדשים

- `@anthropic-ai/sdk` — Claude API client
- `openai` — OpenAI API client
