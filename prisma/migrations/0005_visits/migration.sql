-- المرحلة 3: تسجيل الزيارات، إعادة الزيارة، طلبات تعديل التقرير

ALTER TABLE "visits"
    ADD COLUMN "place" TEXT,
    ADD COLUMN "companionIds" UUID[] NOT NULL DEFAULT '{}',
    ADD COLUMN "revisitDue" DATE,
    ADD COLUMN "revisitOfId" UUID;
ALTER TABLE "visits" ADD CONSTRAINT "visits_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "visits" ADD CONSTRAINT "visits_revisitOfId_fkey"
    FOREIGN KEY ("revisitOfId") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "visits_ownerId_idx" ON "visits"("ownerId");
CREATE INDEX "visits_recommendationId_idx" ON "visits"("recommendationId");
CREATE INDEX "visits_number_idx" ON "visits"("number");

CREATE TABLE "revisit_postponements" (
    "id" UUID NOT NULL,
    "visitId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "byId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "revisit_postponements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "revisit_postponements_visitId_idx" ON "revisit_postponements"("visitId");
ALTER TABLE "revisit_postponements" ADD CONSTRAINT "revisit_postponements_visitId_fkey"
    FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "revisit_postponements" ADD CONSTRAINT "revisit_postponements_byId_fkey"
    FOREIGN KEY ("byId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TYPE "EditRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "edit_requests" (
    "id" UUID NOT NULL,
    "visitId" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "changes" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "EditRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "edit_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "edit_requests_visitId_idx" ON "edit_requests"("visitId");
CREATE INDEX "edit_requests_status_idx" ON "edit_requests"("status");
ALTER TABLE "edit_requests" ADD CONSTRAINT "edit_requests_visitId_fkey"
    FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "edit_requests" ADD CONSTRAINT "edit_requests_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "edit_requests" ADD CONSTRAINT "edit_requests_decidedById_fkey"
    FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
