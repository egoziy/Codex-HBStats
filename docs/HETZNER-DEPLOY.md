# Hetzner Deployment Guide — HBStats

מדריך שלב-אחר-שלב להקמת האתר על שרת Hetzner.

---

## שלב 1 — יצירת שרת ב-Hetzner

1. היכנס ל-[hetzner.com](https://hetzner.com) → **Cloud Console**
2. לחץ **New Project** → שם: `hbstats`
3. לחץ **Add Server**:
   - **Location**: EU (Frankfurt / Nuremberg)
   - **Image**: Ubuntu 24.04
   - **Type**: CX22 (2 vCPU, 4GB RAM) — מינימום. CX32 מומלץ לנוחות.
   - **SSH Key**: הדבק את המפתח הציבורי (`cat ~/.ssh/id_ed25519.pub`)
   - **Firewall**: צור חדש עם הכללים האלה:
     - Inbound TCP 22 (SSH)
     - Inbound TCP 80 (HTTP)
     - Inbound TCP 443 (HTTPS)
4. לחץ **Create & Buy**
5. שמור את כתובת ה-IP של השרת

---

## שלב 2 — כניסה ראשונה לשרת

```bash
ssh root@<SERVER_IP>
```

עדכן חבילות:

```bash
apt update && apt upgrade -y
```

---

## שלב 3 — יצירת משתמש (לא לעבוד כ-root)

```bash
adduser hbs
usermod -aG sudo hbs

# העתק את מפתח ה-SSH למשתמש החדש
mkdir -p /home/hbs/.ssh
cp /root/.ssh/authorized_keys /home/hbs/.ssh/
chown -R hbs:hbs /home/hbs/.ssh
chmod 700 /home/hbs/.ssh
chmod 600 /home/hbs/.ssh/authorized_keys
```

מעכשיו התחבר כ-`hbs`:

```bash
ssh hbs@<SERVER_IP>
```

---

## שלב 4 — התקנת Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # צריך להציג v20.x.x
npm -v
```

---

## שלב 5 — התקנת PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib

# הפעלה אוטומטית
sudo systemctl enable postgresql
sudo systemctl start postgresql

# יצירת DB ומשתמש
sudo -u postgres psql <<EOF
CREATE USER hbs WITH PASSWORD 'CHOOSE_STRONG_PASSWORD';
CREATE DATABASE hbstats OWNER hbs;
GRANT ALL PRIVILEGES ON DATABASE hbstats TO hbs;
EOF
```

---

## שלב 6 — התקנת Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## שלב 7 — שכפול הקוד

```bash
cd ~
git clone https://github.com/egoziy/Codex-HBStats.git hbstats
cd hbstats
npm install
```

---

## שלב 8 — קובץ סביבה (.env)

```bash
nano .env
```

הכנס את התוכן הבא (החלף את הערכים):

```env
DATABASE_URL=postgresql://hbs:CHOOSE_STRONG_PASSWORD@localhost:5432/hbstats
JWT_SECRET=GENERATE_RANDOM_64_CHARS
API_FOOTBALL_KEY=your-api-football-key
API_FOOTBALL_BASE_URL=https://v3.football.api-sports.io
REGISTRATION_DISABLED=false
NODE_ENV=production
```

**ליצירת JWT_SECRET אקראי:**

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## שלב 9 — הקמת DB ובניית האפליקציה

```bash
cd ~/hbstats

# סנכרון סכמה
npx prisma db push
npx prisma generate

# בנייה לפרודקשן
npm run build
```

---

## שלב 10 — PM2 (ניהול תהליך)

```bash
sudo npm install -g pm2

# הפעלת האפליקציה
pm2 start npm --name hbstats -- start

# הפעלה אוטומטית עם אתחול שרת
pm2 startup
pm2 save
```

בדיקה שהאפליקציה רצה:

```bash
pm2 status
pm2 logs hbstats
```

האפליקציה רצה על פורט **3000** locally.

---

## שלב 11 — Nginx Reverse Proxy

```bash
sudo nano /etc/nginx/sites-available/hbstats
```

הכנס:

```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN.com www.YOUR_DOMAIN.com;

    # העלאת קבצים (תמונות שחקנים/קבוצות)
    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

הפעל:

```bash
sudo ln -s /etc/nginx/sites-available/hbstats /etc/nginx/sites-enabled/
sudo nginx -t          # בדיקת תקינות
sudo systemctl reload nginx
```

---

## שלב 12 — דומיין + SSL (Let's Encrypt)

**קודם**: ב-DNS שלך (Cloudflare / Namecheap וכו') הפנה A record של הדומיין לכתובת ה-IP של השרת. המתן 5-10 דקות.

```bash
sudo apt install -y certbot python3-certbot-nginx

sudo certbot --nginx -d YOUR_DOMAIN.com -d www.YOUR_DOMAIN.com
```

Certbot יעדכן את Nginx אוטומטית עם HTTPS ו-redirect מ-80 ל-443.

חידוש אוטומטי (כבר מוגדר, רק בדוק):

```bash
sudo certbot renew --dry-run
```

---

## שלב 13 — העלאת נתונים קיימים (אם יש)

אם יש לך dump של ה-DB מהמחשב המקומי:

**על המחשב המקומי:**

```bash
pg_dump -U postgres hbstats > hbstats_backup.sql
scp hbstats_backup.sql hbs@<SERVER_IP>:~/
```

**על השרת:**

```bash
psql -U hbs -d hbstats < ~/hbstats_backup.sql
```

לחלופין, השתמש ב-`/admin/db-transfer` מממשק האדמין לייצוא ויבוא.

---

## שלב 14 — העלאת תמונות שמורות

תמונות שחקנים וקבוצות נשמרות ב-`public/uploads/`:

```bash
# מהמחשב המקומי (החלף את הנתיב)
scp -r /path/to/local/Codex-HBStats/public/uploads hbs@<SERVER_IP>:~/hbstats/public/
```

---

## עדכון קוד בעתיד

כשיש שינויים חדשים ב-GitHub:

```bash
cd ~/hbstats
git pull origin main
npm install           # אם יש packages חדשים
npm run build
pm2 restart hbstats
```

---

## פקודות שימושיות

```bash
# מצב האפליקציה
pm2 status

# לוגים בזמן אמת
pm2 logs hbstats --lines 50

# הפעלה מחדש
pm2 restart hbstats

# מצב Nginx
sudo systemctl status nginx

# בדיקת DB
psql -U hbs -d hbstats -c "\dt"    # רשימת טבלאות

# שימוש בדיסק
df -h

# שימוש בזיכרון
free -h
```

---

## פתרון בעיות נפוצות

| בעיה | פתרון |
|---|---|
| האתר לא נטען | `pm2 logs hbstats` לראות שגיאות |
| 502 Bad Gateway | האפליקציה לא רצה — `pm2 restart hbstats` |
| שגיאת DB | בדוק `DATABASE_URL` ב-.env |
| תמונות לא מוצגות | בדוק הרשאות: `chmod -R 755 ~/hbstats/public/uploads` |
| SSL לא מחודש | `sudo certbot renew` |
