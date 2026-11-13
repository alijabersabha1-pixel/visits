# دليل التنصيب على سيرفرات الشركة

لقسم IT. النظام حزمة Docker وحدة: قاعدة بيانات PostgreSQL 16، والموقع (Next.js)، وخدمتين للأدوات والنسخ الاحتياطي. ما بيحتاج أي خدمة برّا الشركة، ما عدا صور الخريطة من OpenStreetMap (بتنزل من متصفح المستخدم، مش من السيرفر).

## المتطلبات

| | |
| --- | --- |
| السيرفر | Linux، 2 معالج، 4 GB ذاكرة، 20 GB مساحة (الصور والنسخ بتزيد مع الوقت) |
| البرامج | Docker 24 أو أحدث مع Docker Compose |
| الشبكة | رابط HTTPS داخلي أو خارجي (متل `https://visits.jawwal.ps`). بدون HTTPS تطبيق الجوال ما بيشتغل بدون نت ولا بياخد GPS |
| البناء | أول بناء بيحتاج نت لتنزيل الصور والمكتبات. بعدها السيرفر بيشتغل بدون نت |

## 1) التنصيب أول مرة

```bash
git clone <المستودع> visits && cd visits
cp .env.example .env
```

عبّي `.env`. ولّد كل قيمة سرية بأمر لحالها:

```bash
openssl rand -base64 24   # DB_PASSWORD
openssl rand -base64 24   # APP_DB_PASSWORD
openssl rand -base64 32   # MIKROTIK_KEY  (لازم 32 بايت بالضبط)
openssl rand -base64 24   # BACKUP_PASSPHRASE
```

| المتغير | القيمة |
| --- | --- |
| `APP_ORIGIN` | الرابط الكامل، متل `https://visits.jawwal.ps` |
| `COOKIE_SECURE` | `true` |
| `TRUST_PROXY` | `true` إذا الموقع ورا nginx أو موازن حِمل |
| `BACKUP_HOST_DIR` | مجلد النسخ الاحتياطية، الأفضل قرص تاني أو مجلد شبكة |

⚠️ **احفظ نسخة من `MIKROTIK_KEY` و`BACKUP_PASSPHRASE` برّا السيرفر** (خزنة كلمات سر القسم). بدون الأول كلمات سر المايكروتيك ما بتنفك، وبدون التاني النسخ الاحتياطية ما بتنفتح.

```bash
docker compose up -d --build
docker compose ps                     # db وapp لازم يكونوا healthy / running
docker compose logs app | tail        # لازم يطلع: applied 0001_init … و permissions granted to visits_app
```

أول حساب (سفير، لأن السفراء بيديروا الحسابات). كلمة السر بتنطلب من الشاشة:

```bash
docker compose run --rm tools npm run create-user -- --username ali --name "علي جبر"
```

باقي الحسابات بيضيفها علي من صفحة «المستخدمون». حساب المسؤول (للقراءة بس) بنفس الصفحة، بدور «مسؤول».

## 2) HTTPS (مثال nginx)

```nginx
server {
  listen 443 ssl http2;
  server_name visits.jawwal.ps;
  ssl_certificate     /etc/ssl/visits.crt;
  ssl_certificate_key /etc/ssl/visits.key;
  client_max_body_size 20m;            # صور الزيارات
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;   # مش $proxy_add_x_forwarded_for
    proxy_set_header X-Forwarded-Proto https;
  }
}
```

خلّي المنفذ 3000 مفتوح لـ nginx بس (جدار حماية، أو `APP_PORT=127.0.0.1:3000`).

## 3) نقل البيانات القديمة

**الزيارات القديمة (949 زيارة من الإكسل):** حط الملف بمجلد `import/` جنب المشروع، وبعدين:

```bash
docker compose run --rm tools npm run import:legacy -- /import/visits.xlsx --out /import/review          # معاينة بس + تقرير
docker compose run --rm tools npm run import:legacy -- /import/visits.xlsx --out /import/review --apply  # الحفظ، بعد موافقة علي
```

التقرير بيطلع بـ `import/review/` (review.md وملفات CSV للمراجعة). التشغيل أكتر من مرة آمن: ما بيكرر.

**ملف الشهر:** من الموقع نفسه، صفحة «ملف الشهر»: رفع ← معاينة ← حفظ.

## 4) النسخ الاحتياطي

نسخة وحدة = قاعدة البيانات + الصور، بملف مشفّر (AES-256). بيضل آخر `BACKUP_KEEP` نسخة (افتراضي 30).

```bash
docker compose run --rm backup          # نسخة هلأ
```

**يومياً الساعة 2 بالليل** (crontab على السيرفر، `crontab -e`):

```
0 2 * * * cd /opt/visits && docker compose run --rm backup >> /var/log/visits-backup.log 2>&1
```

انسخ مجلد `BACKUP_HOST_DIR` لمكان تاني كمان (سيرفر نسخ القسم). نسخة على نفس القرص ما بتحمي من عطل القرص.

## 5) الاسترجاع

⚠️ بيمسح البيانات الحالية ويحط محلها محتوى النسخة.

```bash
docker compose stop app
docker compose run --rm backup sh /scripts/restore.sh /backups/visits-YYYYMMDD-HHMMSS.tar.enc --yes
docker compose up -d app                # بيرجع صلاحيات مستخدم الموقع لحاله
```

**على سيرفر فاضي** (بعد عطل كامل): خطوة 1 بنفس `.env` القديم (نفس `MIKROTIK_KEY` و`BACKUP_PASSPHRASE`)، بعدين انسخ ملف النسخة لمجلد `BACKUP_HOST_DIR`، وبعدين الأوامر فوق.

**جرّب الاسترجاع قبل التسليم، ومرة كل 3 شهور**، على قاعدة تجربة:

```bash
docker compose exec db createdb -U visits visits_check
docker compose run --rm -e DATABASE_URL=postgresql://visits:$DB_PASSWORD@db:5432/visits_check -e UPLOAD_DIR= \
  backup sh /scripts/restore.sh /backups/<آخر ملف> --yes
docker compose exec db psql -U visits -d visits_check -c "select count(*) from visits"
docker compose exec db dropdb -U visits visits_check
```

## 6) التحديثات

```bash
git pull
docker compose up -d --build            # الـ migrations الجديدة بتنطبق لحالها
```

خذ نسخة احتياطية قبل أي تحديث. التطبيق على الجوالات بيتحدث لحاله.

## 7) قبل التشغيل الفعلي: فحص الأمان

حسب `docs/security-report.md`:

```bash
CHECK_USER=<حساب تجربة> CHECK_PASS=<كلمة السر> node scripts/security-check.mjs https://visits.jawwal.ps
docker run --rm -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t https://visits.jawwal.ps
```

## مشاكل وحلول

| المشكلة | الحل |
| --- | --- |
| `role "visits_app" does not exist` | قاعدة البيانات كانت موجودة قبل `deploy/initdb`. أنشئه مرة وحدة: `docker compose exec db psql -U visits -c "CREATE ROLE visits_app LOGIN PASSWORD '<APP_DB_PASSWORD>'"` وبعدين `docker compose restart app` |
| «مفتاح التشفير MIKROTIK_KEY مش مضبوط» | `MIKROTIK_KEY` فاضي أو مش 32 بايت. ولّده بـ `openssl rand -base64 32` |
| الـ PDF ما بيطلع | `docker compose logs app \| grep pdf`. الصورة فيها Chromium؛ إذا السيرفر قليل الذاكرة زيد الذاكرة أو اطبع من صفحة الطباعة بالمتصفح |
| التطبيق ما بينزل على الجوال / ما في GPS | لازم HTTPS، و`APP_ORIGIN` لازم يطابق الرابط بالضبط |
| «مصدر الطلب غير مسموح» | `APP_ORIGIN` مش مطابق للرابط اللي المستخدمين بيفتحوه |
| الدخول بيرجع «محاولات كتير» للكل | الموقع ورا بروكسي و`TRUST_PROXY=false`. خليه `true` |
