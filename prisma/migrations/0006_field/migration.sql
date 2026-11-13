-- المرحلة 4: الميدان (أوفلاين، GPS، صور، المايكروتيك، VPN، البطاقات)

-- الزيارة من الجوال: رقم فريد من الجوال، وقت التعبئة، الموقع، إجابات المايكروتيك
ALTER TABLE "visits"
    ADD COLUMN "clientUuid" UUID,
    ADD COLUMN "filledAt" TIMESTAMP(3),
    ADD COLUMN "lat" DOUBLE PRECISION,
    ADD COLUMN "lng" DOUBLE PRECISION,
    ADD COLUMN "gpsAccuracy" DOUBLE PRECISION,
    ADD COLUMN "mikrotik" JSONB;
CREATE UNIQUE INDEX "visits_clientUuid_key" ON "visits"("clientUuid");

-- صور (زيارات وبطاقات). الملف نفسه برّا مجلد الموقع
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "attachments_entity_entityId_idx" ON "attachments"("entity", "entityId");

-- أسئلة المايكروتيك. role بيحدد الأسئلة اللي بتبني قائمة «بحاجة access»
CREATE TABLE "mikrotik_questions" (
    "id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "options" TEXT[] NOT NULL,
    "role" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mikrotik_questions_pkey" PRIMARY KEY ("id")
);
INSERT INTO "mikrotik_questions" ("id", "text", "options", "role", "sortOrder") VALUES
    (gen_random_uuid(), 'كم جهاز مايكروتيك عند المشترك؟', ARRAY['لا يوجد','واحد','اتنين','أكتر من اتنين'], 'COUNT', 1),
    (gen_random_uuid(), 'هل اشترى المايكروتيك من طرفه؟', ARRAY['نعم','لا'], NULL, 2),
    (gen_random_uuid(), 'البرمجة من طرف مين؟', ARRAY['المشترك','الشركة'], NULL, 3),
    (gen_random_uuid(), 'هل عند الشركة access على المايكروتيك؟', ARRAY['نعم','لا'], 'ACCESS', 4),
    (gen_random_uuid(), '(لو لا) تم إنشاء يوزر للشركة؟', ARRAY['نعم','لسا'], 'USER_CREATED', 5);

-- بيانات دخول المايكروتيك: كلمة السر مشفّرة AES-256-GCM، والمفتاح بمتغير بيئة
CREATE TABLE "mikrotik_credentials" (
    "id" UUID NOT NULL,
    "lineCodeKey" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordCipher" TEXT NOT NULL,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mikrotik_credentials_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mikrotik_credentials_lineCodeKey_key" ON "mikrotik_credentials"("lineCodeKey");

-- سجل عرض كلمات السر: للسفراء بس
CREATE TABLE "mikrotik_reveals" (
    "id" BIGSERIAL NOT NULL,
    "credentialId" UUID NOT NULL,
    "lineCodeKey" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mikrotik_reveals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mikrotik_reveals_at_idx" ON "mikrotik_reveals"("at");
ALTER TABLE "mikrotik_reveals" ADD CONSTRAINT "mikrotik_reveals_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TRIGGER mikrotik_reveals_no_update_delete
    BEFORE UPDATE OR DELETE ON "mikrotik_reveals"
    FOR EACH ROW EXECUTE FUNCTION audit_log_block_changes();

CREATE TABLE "vpn_cases" (
    "id" UUID NOT NULL,
    "clientUuid" UUID,
    "filledAt" TIMESTAMP(3) NOT NULL,
    "ownerId" UUID NOT NULL,
    "networkName" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "gpsAccuracy" DOUBLE PRECISION,
    "placeText" TEXT,
    "suspects" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "vpn_cases_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vpn_cases_clientUuid_key" ON "vpn_cases"("clientUuid");
CREATE INDEX "vpn_cases_ip_idx" ON "vpn_cases"("ip");
ALTER TABLE "vpn_cases" ADD CONSTRAINT "vpn_cases_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TYPE "CardLink" AS ENUM ('VISIT', 'EXTERNAL', 'VPN', 'NONE');

CREATE TABLE "card_purchases" (
    "id" UUID NOT NULL,
    "clientUuid" UUID,
    "filledAt" TIMESTAMP(3) NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "ip" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "linkKind" "CardLink" NOT NULL DEFAULT 'NONE',
    "linkRef" UUID,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "card_purchases_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "card_purchases_clientUuid_key" ON "card_purchases"("clientUuid");
CREATE INDEX "card_purchases_filledAt_idx" ON "card_purchases"("filledAt");
ALTER TABLE "card_purchases" ADD CONSTRAINT "card_purchases_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
