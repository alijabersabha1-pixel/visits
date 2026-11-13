import { beforeEach, describe, expect, it } from "vitest";
import { diffFields, withAudit, auditValue } from "@/lib/audit";
import { prisma, resetDb, makeUser } from "./helpers";

describe("diffFields", () => {
  it("سطر لكل حقل تغيّر بس", () => {
    const rows = diffFields({ a: "1", b: true, c: null }, { a: "1", b: false, c: "x" });
    expect(rows).toEqual([
      { field: "b", oldValue: "true", newValue: "false" },
      { field: "c", oldValue: null, newValue: "x" },
    ]);
  });

  it("كلمات السر ما بتنكتب قيمتها", () => {
    const rows = diffFields({ passwordHash: "old" }, { passwordHash: "new" });
    expect(rows).toEqual([{ field: "passwordHash", oldValue: "••••", newValue: "••••" }]);
  });

  it("الحقول التقنية بتنتجاهل", () => {
    expect(diffFields({ updatedAt: new Date(1) }, { updatedAt: new Date(2) })).toEqual([]);
  });

  it("تحويل القيم لنص", () => {
    expect(auditValue(new Date("2026-01-02T03:04:05Z"))).toBe("2026-01-02T03:04:05.000Z");
    expect(auditValue(3)).toBe("3");
    expect(auditValue({ a: 1 })).toBe('{"a":1}');
    expect(auditValue(undefined)).toBeNull();
  });
});

describe("withAudit", () => {
  beforeEach(resetDb);

  it("التعديل بينتج سطر سجل بالقيم الصحيحة", async () => {
    const admin = await makeUser("admin");
    const amb = await makeUser("amb");
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_log" DISABLE TRIGGER USER`);
    await prisma.$executeRawUnsafe(`DELETE FROM "audit_log"`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_log" ENABLE TRIGGER USER`);

    await withAudit(admin.id, async (tx, audit) => {
      const before = await tx.user.findUniqueOrThrow({ where: { id: amb.id } });
      const after = await tx.user.update({ where: { id: amb.id }, data: { displayName: "سفير ١" } });
      audit.updated("User", amb.id, before, after);
    });

    const rows = await prisma.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: admin.id,
      action: "UPDATE",
      entity: "User",
      entityId: amb.id,
      field: "displayName",
      oldValue: "amb",
      newValue: "سفير ١",
    });
  });

  it("إذا فشل الحفظ ما بينكتب سجل", async () => {
    const admin = await makeUser("admin");
    const before = await prisma.auditLog.count();
    await expect(
      withAudit(admin.id, async (tx, audit) => {
        audit.event("UPDATE", "User", admin.id, "قبل الفشل");
        await tx.user.update({ where: { id: admin.id }, data: { displayName: "x" } });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await prisma.auditLog.count()).toBe(before);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).displayName).toBe("admin");
  });

  it("إذا فشل السجل ما بينحفظ التعديل", async () => {
    const amb = await makeUser("amb");
    const before = await prisma.auditLog.count();
    // actorId غير موجود ← كتابة السجل بتفشل (مفتاح خارجي)
    await expect(
      withAudit("00000000-0000-4000-8000-000000000000", async (tx, audit) => {
        const b = await tx.user.findUniqueOrThrow({ where: { id: amb.id } });
        const a = await tx.user.update({ where: { id: amb.id }, data: { displayName: "changed" } });
        audit.updated("User", amb.id, b, a);
      }),
    ).rejects.toThrow();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: amb.id } })).displayName).toBe("amb");
    expect(await prisma.auditLog.count()).toBe(before);
  });

  it("تعديل بدون تغيير فعلي ما بيكتب شي", async () => {
    const amb = await makeUser("amb");
    const before = await prisma.auditLog.count();
    await withAudit(null, async (tx, audit) => {
      const b = await tx.user.findUniqueOrThrow({ where: { id: amb.id } });
      const a = await tx.user.update({ where: { id: amb.id }, data: { displayName: "amb" } });
      expect(audit.updated("User", amb.id, b, a)).toBe(0);
    });
    expect(await prisma.auditLog.count()).toBe(before);
  });
});

describe("السجل للإلحاق فقط (من قاعدة البيانات نفسها)", () => {
  beforeEach(resetDb);

  it("UPDATE وDELETE وTRUNCATE بينرفضوا", async () => {
    await makeUser("amb");
    const row = await prisma.auditLog.findFirstOrThrow();
    await expect(prisma.auditLog.update({ where: { id: row.id }, data: { note: "تلاعب" } })).rejects.toThrow(
      /append-only/,
    );
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.deleteMany({})).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe(`TRUNCATE "audit_log"`)).rejects.toThrow(/append-only/);
    expect(await prisma.auditLog.count()).toBeGreaterThan(0);
  });
});
