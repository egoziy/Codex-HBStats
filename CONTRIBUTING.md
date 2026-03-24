# Contributing

מסמך עבודה קצר לפרויקט `HBStats`.

## עקרונות עבודה

- `main` נשאר יציב וניתן להרצה
- כל שינוי חדש מתבצע ב־branch נפרד
- לא עובדים ישירות על `main` אלא אם מדובר בתיקון דוקומנטציה קטן ודחוף
- עושים commits קטנים, ממוקדים וקריאים
- לפני push מריצים בדיקות בסיסיות ככל האפשר

## שמות Branches

הפורמט המומלץ:

```bash
codex/<feature-name>
```

דוגמאות:

```bash
codex/add-pdf-export
codex/improve-admin-fetch
codex/mobile-navbar-fix
```

## תהליך עבודה מומלץ

1. לעדכן את `main`
2. לפתוח branch חדש
3. לבצע שינויים
4. להריץ בדיקות רלוונטיות
5. לעשות commit
6. לדחוף את ה־branch
7. למזג ל־`main` רק אחרי בדיקה

פקודות לדוגמה:

```bash
git checkout main
git pull
git checkout -b codex/my-feature
git add .
git commit -m "Add my feature"
git push -u origin codex/my-feature
```

## הודעות Commit

מומלץ להשתמש בהודעות קצרות וברורות:

```bash
feat: add team admin editor
fix: resolve player uniqueness conflict
docs: clean up setup instructions
style: improve mobile navbar layout
```

## בדיקות לפני Push

כשאפשר, להריץ:

```bash
npm run lint
npm run build
```

אם שינוי כולל מסד נתונים:

```bash
npx prisma generate
npx prisma db push
```

## קבצים שלא מעלים

אין להעלות:

- `.env`
- `.next/`
- `node_modules/`
- לוגים זמניים
- cache
- קבצי uploads זמניים שלא רוצים לנהל ב־Git

## Prisma ו־Database

- שינויי סכמה חייבים להיות מכוונים ומובנים
- אחרי שינוי ב־`prisma/schema.prisma` יש להריץ `generate`
- אם השינוי משפיע על נתונים קיימים, צריך לעצור ולוודא שלא שוברים את הסביבה

## Next.js Dev Cache

אם מופיעה שגיאת chunk חסר כמו:

```text
Cannot find module './276.js'
```

בדרך כלל צריך:

1. לעצור את שרת הפיתוח
2. למחוק את `.next`
3. להפעיל שוב את `npm run dev`

## שחרורים

נקודות יציבות מסמנים עם tag:

```bash
git tag -a v0.1.1 -m "Short release note"
git push origin v0.1.1
```
