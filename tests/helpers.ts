import { prisma } from "@/lib/db";
import { createUser } from "@/lib/users";

/** تفريغ الجداول بين الاختبارات. محفّز السجل بينطفى هون بس، بقاعدة الاختبار. */
export async function resetDb() {
  await prisma.$transaction([
    prisma.$executeRawUnsafe(`ALTER TABLE "audit_log" DISABLE TRIGGER USER`),
    prisma.$executeRawUnsafe(
      `TRUNCATE "audit_log", "sessions", "users", "visits", "manager_log", "month_targets", "lines", "imports", "settings", "list_items" RESTART IDENTITY CASCADE`,
    ),
    prisma.$executeRawUnsafe(`INSERT INTO "list_items" SELECT * FROM "_seed_list_items"`),
    prisma.$executeRawUnsafe(`ALTER TABLE "audit_log" ENABLE TRIGGER USER`),
  ]);
}

export async function makeUser(
  username: string,
  role: "MANAGER" | "AMBASSADOR" = "AMBASSADOR",
  password = "correct-horse-1",
) {
  const { user } = await createUser(null, { username, displayName: username, role, password });
  return user;
}

export { prisma };
