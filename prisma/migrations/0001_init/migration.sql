-- المرحلة 1: المستخدمون والجلسات وسجل التعديلات

CREATE TYPE "Role" AS ENUM ('AMBASSADOR', 'ADMIN');

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'AMBASSADOR',
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "note" TEXT,
    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_log_at_idx" ON "audit_log"("at");
CREATE INDEX "audit_log_actorId_at_idx" ON "audit_log"("actorId", "at");
CREATE INDEX "audit_log_entity_entityId_idx" ON "audit_log"("entity", "entityId");
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- السجل للإلحاق فقط: أي UPDATE أو DELETE أو TRUNCATE بينرفض من قاعدة البيانات نفسها،
-- حتى لو حدا وصل للسيرفر مباشرة من غير الواجهة.
CREATE FUNCTION audit_log_block_changes() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update_delete
    BEFORE UPDATE OR DELETE ON "audit_log"
    FOR EACH ROW EXECUTE FUNCTION audit_log_block_changes();

CREATE TRIGGER audit_log_no_truncate
    BEFORE TRUNCATE ON "audit_log"
    FOR EACH STATEMENT EXECUTE FUNCTION audit_log_block_changes();
