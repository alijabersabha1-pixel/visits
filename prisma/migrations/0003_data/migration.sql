-- المرحلة 2: الخطوط، القوائم، استيراد ملف الشهر، سجل الإدارة، الزيارات القديمة

CREATE TABLE "lines" (
    "id" UUID NOT NULL,
    "codeKey" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "accountKey" TEXT NOT NULL,
    "accountName" TEXT,
    "speed" TEXT,
    "locality" TEXT,
    "region" TEXT,
    "accountManager" TEXT,
    "fixedIp" TEXT,
    "addrLocality" TEXT,
    "addrQuarter" TEXT,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "inLatestFile" BOOLEAN NOT NULL DEFAULT true,
    "lastImportId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "lines_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lines_codeKey_key" ON "lines"("codeKey");
CREATE INDEX "lines_accountKey_idx" ON "lines"("accountKey");

CREATE TYPE "ListKind" AS ENUM ('RECOMMENDATION', 'ACTION');

CREATE TABLE "list_items" (
    "id" UUID NOT NULL,
    "kind" "ListKind" NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "list_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "list_items_kind_label_key" ON "list_items"("kind", "label");

CREATE TABLE "imports" (
    "id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "importedById" UUID NOT NULL,
    "stats" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "imports_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "imports_month_idx" ON "imports"("month");

CREATE TABLE "month_targets" (
    "id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "lineId" UUID NOT NULL,
    "sheet" TEXT NOT NULL,
    "region" TEXT,
    "teamNote" TEXT,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "metrics" JSONB,
    "importId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "month_targets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "month_targets_month_lineId_key" ON "month_targets"("month", "lineId");
CREATE INDEX "month_targets_month_region_idx" ON "month_targets"("month", "region");
ALTER TABLE "month_targets" ADD CONSTRAINT "month_targets_lineId_fkey"
    FOREIGN KEY ("lineId") REFERENCES "lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "manager_log" (
    "id" UUID NOT NULL,
    "rowKey" TEXT NOT NULL,
    "lineId" UUID NOT NULL,
    "visitDate" DATE,
    "teamNote" TEXT,
    "recommendation" TEXT,
    "finalAction" TEXT,
    "accountManager" TEXT,
    "lastImportId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "manager_log_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "manager_log_rowKey_key" ON "manager_log"("rowKey");
CREATE INDEX "manager_log_lineId_idx" ON "manager_log"("lineId");
ALTER TABLE "manager_log" ADD CONSTRAINT "manager_log_lineId_fkey"
    FOREIGN KEY ("lineId") REFERENCES "lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "VisitSource" AS ENUM ('LEGACY', 'APP');

CREATE TABLE "visits" (
    "id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "source" "VisitSource" NOT NULL,
    "legacyKey" TEXT,
    "visitedOn" DATE,
    "dateText" TEXT,
    "dateDoubtful" BOOLEAN NOT NULL DEFAULT false,
    "lineId" UUID,
    "lineCode" TEXT,
    "lineCodeKey" TEXT,
    "accountName" TEXT,
    "specialCase" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" UUID,
    "tests" TEXT,
    "result" TEXT,
    "recommendationId" UUID,
    "actionId" UUID,
    "revisitNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "visits_legacyKey_key" ON "visits"("legacyKey");
CREATE INDEX "visits_lineCodeKey_idx" ON "visits"("lineCodeKey");
CREATE INDEX "visits_visitedOn_idx" ON "visits"("visitedOn");
ALTER TABLE "visits" ADD CONSTRAINT "visits_lineId_fkey"
    FOREIGN KEY ("lineId") REFERENCES "lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "visits" ADD CONSTRAINT "visits_recommendationId_fkey"
    FOREIGN KEY ("recommendationId") REFERENCES "list_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "visits" ADD CONSTRAINT "visits_actionId_fkey"
    FOREIGN KEY ("actionId") REFERENCES "list_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- القوائم الابتدائية من المواصفات. الألوان لدبابيس الخريطة (المرحلة 5)
INSERT INTO "list_items" ("id", "kind", "label", "sortOrder", "active", "color") VALUES
    (gen_random_uuid(), 'RECOMMENDATION', 'يوجد تجاوز', 1, true, '#d92d20'),
    (gen_random_uuid(), 'RECOMMENDATION', 'لا يوجد تجاوز', 2, true, '#4f8f25'),
    (gen_random_uuid(), 'RECOMMENDATION', 'إعادة زيارة', 3, true, '#e07b00'),
    (gen_random_uuid(), 'RECOMMENDATION', 'زيارة غير ناجحة', 4, true, '#7a8693'),
    (gen_random_uuid(), 'RECOMMENDATION', 'فحص شبكة', 5, true, '#115d92'),
    (gen_random_uuid(), 'RECOMMENDATION', 'مفصول سابقاً بسبب التجاوز', 90, false, '#d92d20'),
    (gen_random_uuid(), 'RECOMMENDATION', 'تأجيل الزيارة', 91, false, '#e07b00'),
    (gen_random_uuid(), 'ACTION', 'تم تصويب الوضع', 1, true, NULL),
    (gen_random_uuid(), 'ACTION', 'تم تجميد الخدمة', 2, true, NULL),
    (gen_random_uuid(), 'ACTION', 'جاري تجميد الخدمة', 3, true, NULL),
    (gen_random_uuid(), 'ACTION', 'فصل الخدمة نهائياً', 4, true, NULL),
    (gen_random_uuid(), 'ACTION', 'تحذير + تعهد عدلي', 5, true, NULL),
    (gen_random_uuid(), 'ACTION', 'لا يوجد تجاوز بمعرفة مدير الحساب', 6, true, NULL),
    (gen_random_uuid(), 'ACTION', 'إعادة زيارة للتأكد', 7, true, NULL),
    (gen_random_uuid(), 'ACTION', 'إعادة خدمة', 8, true, NULL);
