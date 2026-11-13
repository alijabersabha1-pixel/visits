import { beforeEach, describe, expect, it } from "vitest";
import {
  createUser,
  createUserSchema,
  updateUser,
  resetPassword,
  revokeSessions,
  changeOwnPassword,
} from "@/lib/users";
import { login, userFromToken } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { prisma, resetDb, makeUser } from "./helpers";

const PASS = "correct-horse-1";

async function sessionFor(username: string, password = PASS) {
  const r = await login(username, password);
  if (!r.ok) throw new Error(`login failed for ${username}`);
  return r.token;
}

describe("إضافة مستخدم", () => {
  beforeEach(resetDb);

  it("السفير بيضيف سفير بكلمة سر مؤقتة، والسفير بيدخل فوراً وبينطلب منه تغييرها", async () => {
    const admin = await makeUser("admin");
    const input = createUserSchema.parse({ username: "Ahmad.S", displayName: "أحمد", role: "AMBASSADOR" });
    const { user, tempPassword } = await createUser(admin.id, input);
    expect(user.username).toBe("ahmad.s");
    expect(tempPassword).toMatch(/^[A-Za-z2-9]{10}$/);
    const r = await login("ahmad.s", tempPassword!);
    expect(r.ok && r.user.mustChangePassword).toBe(true);

    const logs = await prisma.auditLog.findMany({ where: { entityId: user.id, action: "CREATE" } });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe(admin.id);
    expect(JSON.parse(logs[0].newValue!)).toEqual({
      username: "ahmad.s",
      displayName: "أحمد",
      role: "AMBASSADOR",
      active: "true",
    });
    expect(JSON.stringify(logs.map(({ id, ...l }) => ({ ...l, id: String(id) })))).not.toContain(tempPassword);
  });

  it("اسم دخول مكرر أو غير صالح بينرفض", async () => {
    await makeUser("amb");
    await expect(makeUser("amb")).rejects.toThrow("اسم الدخول مستخدم");
    expect(createUserSchema.safeParse({ username: "علي", displayName: "علي", role: "AMBASSADOR" }).success).toBe(false);
    expect(createUserSchema.safeParse({ username: "ab", displayName: "x y", role: "AMBASSADOR" }).success).toBe(false);
  });
});

describe("تعديل وإيقاف", () => {
  beforeEach(resetDb);

  it("الإيقاف بيطرد من كل الأجهزة وبيسجّل", async () => {
    const admin = await makeUser("admin");
    const amb = await makeUser("amb");
    const t1 = await sessionFor("amb");
    const t2 = await sessionFor("amb");
    await updateUser(admin.id, amb.id, { active: false });
    expect(await userFromToken(t1)).toBeNull();
    expect(await userFromToken(t2)).toBeNull();
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: amb.id, action: "UPDATE" } });
    expect(log).toMatchObject({ actorId: admin.id, field: "active", oldValue: "true", newValue: "false" });
  });

  it("تغيير الدور بيتسجل بالقيمة القديمة والجديدة", async () => {
    const admin = await makeUser("admin");
    const amb = await makeUser("amb");
    await updateUser(admin.id, amb.id, { role: "MANAGER", displayName: "سفير صار مسؤول" });
    const logs = await prisma.auditLog.findMany({
      where: { entityId: amb.id, action: "UPDATE" },
      orderBy: { field: "asc" },
    });
    expect(logs.map((l) => [l.field, l.oldValue, l.newValue])).toEqual([
      ["displayName", "amb", "سفير صار مسؤول"],
      ["role", "AMBASSADOR", "MANAGER"],
    ]);
  });

  it("ما بيصير يضل النظام بدون سفير فعّال (السفراء بس بيديروا الحسابات)", async () => {
    const a1 = await makeUser("amb1");
    const a2 = await makeUser("amb2");
    await makeUser("boss", "MANAGER");
    await updateUser(a1.id, a2.id, { active: false });
    // a1 آخر سفير فعّال: ما بيقدر يوقف حاله ولا يتحوّل لمسؤول
    await expect(updateUser(a1.id, a1.id, { active: false })).rejects.toThrow();
    await expect(updateUser(a1.id, a1.id, { role: "MANAGER" })).rejects.toThrow();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a1.id } })).active).toBe(true);
  });

  it("السفير ما بيقدر يوقف حاله أو يغيّر دوره حتى لو في غيره", async () => {
    const a1 = await makeUser("amb1");
    await makeUser("amb2");
    await expect(updateUser(a1.id, a1.id, { active: false })).rejects.toThrow("حسابك");
    await expect(updateUser(a1.id, a1.id, { role: "MANAGER" })).rejects.toThrow("حسابك");
  });

  it("الإيقاف ثم إعادة التفعيل ما بترجّع الجلسات القديمة (الجوال الضايع ما بيرجع يدخل)", async () => {
    const a1 = await makeUser("amb1");
    const a2 = await makeUser("amb2");
    const oldToken = await sessionFor("amb2");
    await updateUser(a1.id, a2.id, { active: false });
    await updateUser(a1.id, a2.id, { active: true });
    expect(await userFromToken(oldToken)).toBeNull();
    expect(await prisma.session.count({ where: { userId: a2.id } })).toBe(0);
  });

  it("حماية آخر سفير فعّال على مستوى المنطق نفسه (مش بس بالواجهة)", async () => {
    const amb = await makeUser("amb1");
    const boss = await makeUser("boss", "MANAGER");
    // استدعاء مباشر للمنطق بفاعل غير السفير نفسه، متل سكربت أو مسار مستقبلي
    await expect(updateUser(boss.id, amb.id, { active: false })).rejects.toThrow("سفير فعّال");
    await expect(updateUser(boss.id, amb.id, { role: "MANAGER" })).rejects.toThrow("سفير فعّال");
  });

  it("سفير بيوقف سفير تاني (مش بس المسؤول)", async () => {
    const a1 = await makeUser("amb1");
    const a2 = await makeUser("amb2");
    const updated = await updateUser(a1.id, a2.id, { active: false });
    expect(updated.active).toBe(false);
  });
});

describe("كلمات السر والجلسات", () => {
  beforeEach(resetDb);

  it("كلمة سر مؤقتة: القديمة بتبطل، والجلسات بتنلغي، والقفل بيروح", async () => {
    const admin = await makeUser("admin");
    const amb = await makeUser("amb");
    const token = await sessionFor("amb");
    await prisma.user.update({
      where: { id: amb.id },
      data: { failedLoginCount: 5, lockedUntil: new Date(Date.now() + 600_000) },
    });

    const { tempPassword } = await resetPassword(admin.id, amb.id);
    expect(await userFromToken(token)).toBeNull();
    expect((await login("amb", PASS)).ok).toBe(false);
    const r = await login("amb", tempPassword);
    expect(r.ok && r.user.mustChangePassword).toBe(true);
    expect(
      await prisma.auditLog.count({ where: { action: "PASSWORD_RESET", entityId: amb.id, actorId: admin.id } }),
    ).toBe(1);
  });

  it("طرد من كل الأجهزة", async () => {
    const admin = await makeUser("admin");
    await makeUser("amb");
    const amb = await prisma.user.findUniqueOrThrow({ where: { username: "amb" } });
    const t1 = await sessionFor("amb");
    const t2 = await sessionFor("amb");
    expect(await revokeSessions(admin.id, amb.id)).toEqual({ revoked: 2 });
    expect(await userFromToken(t1)).toBeNull();
    expect(await userFromToken(t2)).toBeNull();
    // كلمة السر ما تغيّرت، فبيقدر يدخل من جديد
    expect((await login("amb", PASS)).ok).toBe(true);
  });

  it("تغيير كلمة السر: بيلغي الجلسات التانية وبيخلي الحالية", async () => {
    await makeUser("amb");
    const current = await sessionFor("amb");
    const other = await sessionFor("amb");
    const me = (await userFromToken(current))!;

    await expect(
      changeOwnPassword(me.id, me.sessionId, { currentPassword: "wrong-one", newPassword: "new-password-9" }),
    ).rejects.toThrow("كلمة السر الحالية غلط");

    await changeOwnPassword(me.id, me.sessionId, { currentPassword: PASS, newPassword: "new-password-9" });
    expect(await userFromToken(current)).not.toBeNull();
    expect(await userFromToken(other)).toBeNull();
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(await verifyPassword(fresh.passwordHash, "new-password-9")).toBe(true);
    expect(fresh.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(fresh.mustChangePassword).toBe(false);
  });
});
