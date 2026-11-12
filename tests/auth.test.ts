import { beforeEach, describe, expect, it } from "vitest";
import { login, logout, userFromToken, hashToken, normalizeUsername } from "@/lib/auth";
import { prisma, resetDb, makeUser } from "./helpers";

const PASS = "correct-horse-1";

describe("الدخول", () => {
  beforeEach(resetDb);

  it("اسم الدخول بيتوحّد (مسافات وأحرف كبيرة)", async () => {
    expect(normalizeUsername("  Ali.J ")).toBe("ali.j");
    await makeUser("ali");
    const r = await login(" ALI ", PASS);
    expect(r.ok).toBe(true);
  });

  it("دخول صحيح بينشئ جلسة، والتوكن ما بينحفظ إلا بصمته", async () => {
    const u = await makeUser("amb");
    const r = await login("amb", PASS, { userAgent: "test" });
    if (!r.ok) throw new Error("expected ok");
    const sessions = await prisma.session.findMany({ where: { userId: u.id } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].tokenHash).toBe(hashToken(r.token));
    expect(sessions[0].tokenHash).not.toContain(r.token);
    const me = await userFromToken(r.token);
    expect(me?.id).toBe(u.id);
    expect(await prisma.auditLog.count({ where: { action: "LOGIN", actorId: u.id } })).toBe(1);
  });

  it("كلمة سر غلط أو مستخدم مش موجود: نفس الرد", async () => {
    await makeUser("amb");
    expect(await login("amb", "wrong-pass")).toEqual({ ok: false, reason: "invalid" });
    expect(await login("ghost", "wrong-pass")).toEqual({ ok: false, reason: "invalid" });
  });

  it("بعد 5 محاولات غلط الحساب بيتقفل 15 دقيقة حتى مع كلمة السر الصحيحة", async () => {
    const u = await makeUser("amb");
    const t0 = new Date();
    for (let i = 0; i < 4; i++) expect((await login("amb", "nope", { now: t0 })).ok).toBe(false);
    const fifth = await login("amb", "nope", { now: t0 });
    expect(fifth).toEqual({ ok: false, reason: "locked", minutes: 15 });
    expect(await login("amb", PASS, { now: new Date(t0.getTime() + 10 * 60_000) })).toMatchObject({ reason: "locked" });
    expect(await prisma.auditLog.count({ where: { action: "LOCKED", entityId: u.id } })).toBe(1);

    const after = await login("amb", PASS, { now: new Date(t0.getTime() + 15 * 60_000 + 1) });
    expect(after.ok).toBe(true);
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(fresh.failedLoginCount).toBe(0);
    expect(fresh.lockedUntil).toBeNull();
  });

  it("الحساب الموقوف ما بيدخل", async () => {
    const u = await makeUser("amb");
    await prisma.user.update({ where: { id: u.id }, data: { active: false } });
    expect(await login("amb", PASS)).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("الجلسات", () => {
  beforeEach(resetDb);

  it("الجلسة المنتهية ما بتشتغل", async () => {
    await makeUser("amb");
    const r = await login("amb", PASS);
    if (!r.ok) throw new Error();
    expect(await userFromToken(r.token, { now: new Date(Date.now() + 31 * 24 * 3600_000) })).toBeNull();
    expect(await prisma.session.count()).toBe(0);
  });

  it("إيقاف الحساب بيوقف الجلسة فوراً", async () => {
    const u = await makeUser("amb");
    const r = await login("amb", PASS);
    if (!r.ok) throw new Error();
    await prisma.user.update({ where: { id: u.id }, data: { active: false } });
    expect(await userFromToken(r.token)).toBeNull();
  });

  it("توكن مزيّف أو فاضي", async () => {
    expect(await userFromToken("not-a-real-token")).toBeNull();
    expect(await userFromToken("")).toBeNull();
    expect(await userFromToken(undefined)).toBeNull();
  });

  it("الخروج بيمسح الجلسة وبيسجّل", async () => {
    const u = await makeUser("amb");
    const r = await login("amb", PASS);
    if (!r.ok) throw new Error();
    await logout(r.token);
    expect(await userFromToken(r.token)).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "LOGOUT", actorId: u.id } })).toBe(1);
  });
});
