# نظام زيارات فريق السفراء — جوال

موقع وتطبيق أندرويد (لاحقاً) بيحلّوا محل ملف الإكسل. المواصفات:
[مستند المواصفات](https://claude.ai/artifact/Bm17wivmGKuNL1KPbjBsR5) · الخطة: `tasks/plan.md` · المهام: `tasks/todo.md`.

**الحالة:** المرحلة 1 (الأساس) والمرحلة 2 (البيانات) خلصوا: الدخول والأدوار وسجل التعديلات، وخطوط المشتركين واستيراد ملف الشهر والقوائم ونقل الزيارات القديمة.

**الأدوار:** السفير بيعمل كل شي، والمسؤول بيشوف كل شي للقراءة بس.

## التشغيل على سيرفر (Docker)

```bash
cp .env.example .env          # واضبط DB_PASSWORD (إجباري) وAPP_ORIGIN
docker compose up -d --build  # قاعدة البيانات + الموقع، والـ migrations بتنطبق لحالها
docker compose run --rm tools npm run create-user -- --username ali --name "علي جبر"
```

على أي سيرفر عليه HTTPS لازم `COOKIE_SECURE=true` و`APP_ORIGIN=https://…`.

## التطوير

يحتاج Node 22 وPostgreSQL 16.

```bash
npm ci
cp .env.example .env
npm run db:migrate
npm run create-user -- --username ali --name "علي جبر"                      # سفير
npm run create-user -- --username boss --name "المسؤول" --role MANAGER    # مسؤول للقراءة
npm run dev                   # http://localhost:3000
```

## البيانات

- **ملف الشهر:** من الموقع، صفحة «ملف الشهر». معاينة كاملة قبل الحفظ.
- **الزيارات القديمة:**

```bash
npm run import:legacy -- visits.xlsx           # معاينة + تقرير بـ legacy-review/ (ما بيحفظ)
npm run import:legacy -- visits.xlsx --apply   # الحفظ الفعلي، آمن تشغيله أكتر من مرة
```

## الفحوصات

```bash
npm run lint && npm run typecheck
npm test                      # اختبارات الوحدات (قاعدة visits_test منفصلة)
npm run test:coverage         # نفسها مع التغطية (الحد الأدنى 80% بـ lib/)
npm run build
npm run test:e2e              # اختبارات المتصفح (قاعدة visits_e2e_test منفصلة)
```

إذا ما بتقدر تنزّل متصفح Playwright: `CHROME_PATH=/usr/bin/google-chrome npm run test:e2e`.

## هيكل المشروع

| المجلد | شو فيه |
| --- | --- |
| `app/` | الصفحات (`(app)/` للصفحات اللي بدها دخول) والـ API (`app/api/`) |
| `lib/authz.ts` | **كل** قواعد الصلاحيات بمكان واحد |
| `lib/auth.ts` | الدخول، الجلسات، القفل المؤقت |
| `lib/audit.ts` | `withAudit`: الحفظ والسجل بعملية وحدة |
| `lib/users.ts` | إدارة المستخدمين |
| `lib/line-code.ts` | تنظيف الـ Line Code والمنطقة |
| `lib/import/` | قراءة الإكسل، ملف الشهر، نقل الزيارات القديمة |
| `prisma/` | تعريف قاعدة البيانات والـ migrations (SQL) |
| `scripts/` | الـ migrations وإنشاء أول حساب |
| `tests/` · `e2e/` | اختبارات الوحدات واختبارات المتصفح |
| `docs/decisions.md` | القرارات اللي اتخذناها أثناء البناء |
