import { prisma } from "@/lib/db";
import { createUser } from "@/lib/users";

/** تفريغ الجداول بين الاختبارات. محفّز السجل بينطفى هون بس، بقاعدة الاختبار. */
export async function resetDb() {
  await prisma.$transaction([
    prisma.$executeRawUnsafe(`ALTER TABLE "audit_log" DISABLE TRIGGER USER`),
    prisma.$executeRawUnsafe(`ALTER TABLE "mikrotik_reveals" DISABLE TRIGGER USER`),
    prisma.$executeRawUnsafe(
      `TRUNCATE "audit_log", "mikrotik_reveals", "mikrotik_credentials", "attachments", "vpn_cases", "card_purchases", "sessions", "edit_requests", "revisit_postponements", "users", "visits", "manager_log", "month_targets", "lines", "imports", "settings", "list_items", "mikrotik_questions" RESTART IDENTITY CASCADE`,
    ),
    prisma.$executeRawUnsafe(`ALTER SEQUENCE "visit_number_seq" RESTART WITH 1`),
    prisma.$executeRawUnsafe(`INSERT INTO "list_items" SELECT * FROM "_seed_list_items"`),
    prisma.$executeRawUnsafe(`INSERT INTO "mikrotik_questions" SELECT * FROM "_seed_mikrotik_questions"`),
    prisma.$executeRawUnsafe(`ALTER TABLE "audit_log" ENABLE TRIGGER USER`),
    prisma.$executeRawUnsafe(`ALTER TABLE "mikrotik_reveals" ENABLE TRIGGER USER`),
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

export async function sessionActor(username: string, role: "MANAGER" | "AMBASSADOR" = "AMBASSADOR") {
  const u = await makeUser(username, role);
  return { id: u.id, role: u.role, active: u.active, displayName: u.displayName };
}

export async function listId(kind: "RECOMMENDATION" | "ACTION", label: string) {
  return (await prisma.listItem.findFirstOrThrow({ where: { kind, label } })).id;
}
