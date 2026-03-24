# HBStats

פלטפורמת סטטיסטיקות כדורגל בעברית המבוססת על `Next.js`, `PostgreSQL` ו־`Prisma`.

המערכת מיועדת לשני סוגי שימוש עיקריים:

- אזור ציבורי לצפייה, חיפוש, השוואה וניתוח נתוני ליגות, קבוצות, שחקנים ומשחקים
- אזור אדמין מאובטח למשיכת נתונים מ־`API-Football`, תרגום לעברית, ועריכה ידנית של תוכן

## מה יש במערכת כרגע

- `Next.js 14` עם `App Router`
- `PostgreSQL` עם `Prisma ORM`
- הרשמה, התחברות, סשנים והרשאות `ADMIN` / `USER`
- הגנה על דפי אדמין
- שמירת נתונים דו־לשונית: מקור באנגלית + תצוגה בעברית
- דפי בית, טבלה, סטטיסטיקות, השוואת עונות, קבוצה, שחקן ומשחק
- חיפוש גלובלי לקבוצות, שחקנים ומשחקים
- עמוד אדמין למשיכת נתונים מ־`API-Football`
- עריכת פרטי קבוצה ושחקנים בעברית מתוך האדמין
- שמירה מקומית של לוגואים ותמונות שחקנים בזמן משיכה
- `ActivityLog` ו־`FetchJob` למעקב אחרי פעולות מערכת

## טכנולוגיות

- `Next.js`
- `React`
- `TypeScript`
- `Prisma`
- `PostgreSQL`
- `Tailwind CSS`
- `Recharts`
- `jsPDF`
- `html2canvas`

## דרישות מקדימות

- `Node.js 18+`
- `npm`
- `PostgreSQL`
- מפתח פעיל של `API-Football`

## התקנה מקומית

1. התקן חבילות:

```bash
npm install
```

2. צור קובץ `.env` בפרויקט.

דוגמה לערכים הנדרשים:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/hbs"
API_FOOTBALL_KEY="your_api_key"
JWT_SECRET="replace-with-a-long-random-secret"
NEXT_PUBLIC_APP_URL="http://127.0.0.1:8011"
```

3. סנכרן את הסכמה למסד:

```bash
npx prisma generate
npx prisma db push
```

4. הפעל את שרת הפיתוח על פורט `8011`:

```bash
npm run dev -- --hostname 127.0.0.1 --port 8011
```

5. פתח בדפדפן:

[`http://127.0.0.1:8011`](http://127.0.0.1:8011)

## משתמש ראשון

המשתמש הראשון שנרשם מקבל תפקיד `ADMIN`, כדי לאפשר כניסה ראשונית לאזור הניהול.

## אזור האדמין

אזור האדמין נגיש רק למשתמשי `ADMIN` וכולל:

- משיכת נתונים לפי עונה ומסגרת
- בחירת סוגי נתונים למשיכה
- צפייה ברשימת קבוצות
- כניסה למיני־סייט של כל קבוצה
- עריכת שמות בעברית, הערות, תמונות ופרטים משלימים

## מדיה מקומית

בזמן משיכה המערכת מנסה לשמור מדיה גם לוקלית:

- לוגואים: `public/uploads/teams/...`
- תמונות שחקנים: `public/uploads/players/...`

## מבנה עיקרי

```text
prisma/
  schema.prisma
src/
  app/
    admin/
    api/
    compare/
    games/
    players/
    standings/
    statistics/
    teams/
  components/
  lib/
public/
  banner.png
```

## פקודות שימושיות

```bash
npm run dev
npm run build
npm run lint
npx prisma generate
npx prisma db push
npx prisma studio
```

## Git Workflow מומלץ

כדי לשמור על היסטוריה נקייה:

1. `main` נשאר תמיד יציב.
2. לכל שינוי חדש פותחים branch חדש עם prefix של `codex/`.
3. עובדים, עושים commits קטנים וברורים.
4. דוחפים את ה־branch.
5. רק אחרי בדיקה ממזגים ל־`main`.

דוגמה:

```bash
git checkout main
git pull
git checkout -b codex/add-pdf-export
git add .
git commit -m "Add PDF export for standings and player pages"
git push -u origin codex/add-pdf-export
```

## שחרור גרסאות

מומלץ לסמן נקודות יציבות עם tags.

דוגמה:

```bash
git tag -a v0.1.0 -m "Initial stable HBStats baseline"
git push origin v0.1.0
```

## מה לא נשמר ב־Git

הקבצים הבאים מוחרגים דרך `.gitignore`:

- `.env`
- `.next/`
- `node_modules/`
- לוגים
- cache זמני
- קבצי uploads שנמשכו אוטומטית

## הערות

- המערכת עדיין בתהליך בנייה, ויש אזורים שדורשים הרחבה נוספת, במיוחד בכיסוי המלא של כל יכולות `API-Football`.
- אם `Next.js` מתחיל לזרוק שגיאות של chunk חסר, בדרך כלל צריך למחוק `.next` ולהעלות מחדש את שרת הפיתוח.
