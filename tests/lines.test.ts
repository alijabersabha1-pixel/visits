import { beforeEach, describe, expect, it } from "vitest";
import { addManualLine, findLineByCode } from "@/lib/lines";
import { prisma, resetDb, makeUser } from "./helpers";

describe("الحساب الطارئ (إضافة خط يدوياً)", () => {
  beforeEach(resetDb);

  it("السفير بيضيف خط، وبيلاقيه البحث بأي شكل كتابة", async () => {
    const amb = await makeUser("amb");
    const line = await addManualLine(amb.id, {
      code: "g 7872 002",
      accountName: "كفي تويكس",
      locality: "خانيونس",
      speed: "Filine 200 Mbps",
    });
    expect(line).toMatchObject({
      codeKey: "G7872002",
      code: "G7872002",
      accountKey: "G7872",
      region: "الجنوب",
      manual: true,
    });
    expect((await findLineByCode("G‑7872‑002"))?.id).toBe(line.id);
    expect((await findLineByCode("G-7872-002"))?.id).toBe(line.id);

    const log = await prisma.auditLog.findFirstOrThrow({ where: { entity: "Line", entityId: line.id } });
    expect(log).toMatchObject({ action: "CREATE", actorId: amb.id });
    expect(JSON.parse(log.newValue!)).toMatchObject({ code: "G7872002", accountName: "كفي تويكس", manual: "true" });
  });

  it("الكود بيتخزن بشكله المرتب لو انكتب بشرطات", async () => {
    const amb = await makeUser("amb");
    const line = await addManualLine(amb.id, { code: " G-7935-001 ", accountName: "حساب" });
    expect(line.code).toBe("G-7935-001");
  });

  it("خط موجود (بأي شكل كتابة) بينرفض", async () => {
    const amb = await makeUser("amb");
    await addManualLine(amb.id, { code: "G-7872-002", accountName: "حساب أ" });
    await expect(addManualLine(amb.id, { code: "g7872002", accountName: "حساب ب" })).rejects.toThrow("موجود");
    expect(await prisma.line.count()).toBe(1);
  });

  it("كود مش صالح بينرفض", async () => {
    const amb = await makeUser("amb");
    await expect(addManualLine(amb.id, { code: "-", accountName: "شبكة الهدى" })).rejects.toThrow();
    await expect(addManualLine(amb.id, { code: "شبكة", accountName: "x" })).rejects.toThrow();
  });
});
