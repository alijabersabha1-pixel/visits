import { beforeEach, describe, expect, it } from "vitest";
import { createVisit, deleteVisit, restoreVisit, updateReport, updateStatus } from "@/lib/visits";
import { addManualLine } from "@/lib/lines";
import { prisma, resetDb, sessionActor, listId } from "./helpers";

async function setup() {
  const ali = await sessionActor("ali");
  const sami = await sessionActor("sami");
  const boss = await sessionActor("boss", "MANAGER");
  await addManualLine(ali.id, { code: "G-7872-002", accountName: "مقهى الاختبار", locality: "خانيونس" });
  const exceeds = await listId("RECOMMENDATION", "يوجد تجاوز");
  const fine = await listId("RECOMMENDATION", "لا يوجد تجاوز");
  const fixed = await listId("ACTION", "تم تصويب الوضع");
  return { ali, sami, boss, exceeds, fine, fixed };
}

describe("تسجيل زيارة (المهمة 9)", () => {
  beforeEach(resetDb);

  it("كود معروف بيعبّي اسم الحساب لحاله وبيربط الخط، والرقم بيكمل التسلسل", async () => {
    const { ali, sami, exceeds } = await setup();
    const { visit, warning } = await createVisit(ali, {
      lineCode: "g 7872 002",
      visitedOn: "2026-11-12",
      companionIds: [sami.id],
      tests: "فحص الراوتر",
      result: "إعادة بيع",
      recommendationId: exceeds,
    });
    expect(warning).toBeNull();
    expect(visit).toMatchObject({
      number: 1,
      source: "APP",
      ownerId: ali.id,
      accountName: "مقهى الاختبار",
      lineCode: "G-7872-002",
      lineCodeKey: "G7872002",
      companionIds: [sami.id],
      specialCase: false,
    });
    expect(visit.lineId).not.toBeNull();
    expect(visit.visitedOn?.toISOString().slice(0, 10)).toBe("2026-11-12");
    const second = await createVisit(ali, {
      lineCode: "G-7872-002",
      visitedOn: "2026-11-12",
      recommendationId: exceeds,
    });
    expect(second.visit.number).toBe(2);
    expect(await prisma.auditLog.count({ where: { entity: "Visit", action: "CREATE" } })).toBe(2);
  });

  it("كود مش معروف بينحفظ مع تنبيه", async () => {
    const { ali, fine } = await setup();
    const r = await createVisit(ali, {
      lineCode: "G-9999-001",
      accountName: "حساب جديد",
      visitedOn: "2026-11-12",
      recommendationId: fine,
    });
    expect(r.warning).toContain("مش موجود");
    expect(r.visit).toMatchObject({ lineId: null, lineCodeKey: "G9999001", accountName: "حساب جديد" });
  });

  it("حالة خاصة بدون كود: الاسم والمكان", async () => {
    const { ali, fine } = await setup();
    const r = await createVisit(ali, {
      specialCase: true,
      accountName: "دمج خطوط شبكة الشاطئ",
      place: "مخيم الشاطئ",
      visitedOn: "2026-11-12",
      recommendationId: fine,
    });
    expect(r.visit).toMatchObject({ specialCase: true, lineCode: null, lineCodeKey: null, place: "مخيم الشاطئ" });
  });

  it("الحقول الإلزامية بتنفحص على السيرفر", async () => {
    const { ali, fine } = await setup();
    await expect(createVisit(ali, { visitedOn: "2026-11-12", recommendationId: fine })).rejects.toThrow("Line Code");
    await expect(createVisit(ali, { lineCode: "-", visitedOn: "2026-11-12", recommendationId: fine })).rejects.toThrow(
      "Line Code",
    );
    await expect(
      createVisit(ali, { specialCase: true, visitedOn: "2026-11-12", recommendationId: fine }),
    ).rejects.toThrow("الاسم");
    await expect(createVisit(ali, { lineCode: "G-7872-002", visitedOn: "2026-11-12" } as never)).rejects.toThrow(
      "التوصية",
    );
    await expect(
      createVisit(ali, { lineCode: "G-7872-002", visitedOn: "12/11/2026", recommendationId: fine }),
    ).rejects.toThrow("التاريخ");
    await expect(
      createVisit(ali, { lineCode: "G-7872-002", visitedOn: "2099-01-01", recommendationId: fine }),
    ).rejects.toThrow("المستقبل");
  });

  it("قيمة موقوفة أو من القائمة الغلط بترفض بالزيارة الجديدة", async () => {
    const { ali, fixed } = await setup();
    const old = await listId("RECOMMENDATION", "تأجيل الزيارة");
    await expect(
      createVisit(ali, { lineCode: "G-7872-002", visitedOn: "2026-11-12", recommendationId: old }),
    ).rejects.toThrow("التوصية");
    await expect(
      createVisit(ali, { lineCode: "G-7872-002", visitedOn: "2026-11-12", recommendationId: fixed }),
    ).rejects.toThrow("التوصية");
  });

  it("المرافق لازم يكون سفير فعّال وغير صاحب الزيارة", async () => {
    const { ali, boss, fine } = await setup();
    await expect(
      createVisit(ali, {
        lineCode: "G-7872-002",
        visitedOn: "2026-11-12",
        recommendationId: fine,
        companionIds: [boss.id],
      }),
    ).rejects.toThrow("المرافق");
    await expect(
      createVisit(ali, {
        lineCode: "G-7872-002",
        visitedOn: "2026-11-12",
        recommendationId: fine,
        companionIds: [ali.id],
      }),
    ).rejects.toThrow("المرافق");
  });

  it("المسؤول ما بيسجل زيارة", async () => {
    const { boss, fine } = await setup();
    await expect(
      createVisit(boss, { lineCode: "G-7872-002", visitedOn: "2026-11-12", recommendationId: fine }),
    ).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe("تعديل الزيارة (المهمة 10)", () => {
  beforeEach(resetDb);

  async function aliVisit() {
    const s = await setup();
    const { visit } = await createVisit(s.ali, {
      lineCode: "G-7872-002",
      visitedOn: "2026-11-12",
      recommendationId: s.exceeds,
      result: "أ",
    });
    return { ...s, visit };
  }

  it("سفير بيغيّر حالة زيارة غيره، والتعديل بالسجل", async () => {
    const { sami, visit, fixed, fine } = await aliVisit();
    await updateStatus(sami, visit.id, { actionId: fixed, recommendationId: fine, revisitDue: "2026-11-20" });
    const after = await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } });
    expect(after.actionId).toBe(fixed);
    const logs = await prisma.auditLog.findMany({
      where: { entityId: visit.id, action: "UPDATE" },
      orderBy: { field: "asc" },
    });
    expect(logs.map((l) => [l.field, l.actorId])).toEqual([
      ["action", sami.id],
      ["recommendation", sami.id],
      ["revisitDue", sami.id],
    ]);
  });

  it("صاحب الزيارة بيعدّل تقريره، وغيره بياخد 403", async () => {
    const { ali, sami, visit } = await aliVisit();
    await updateReport(ali, visit.id, { result: "ب", tests: "فحص جديد" });
    expect((await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } })).result).toBe("ب");
    await expect(updateReport(sami, visit.id, { result: "ج" })).rejects.toMatchObject({ status: 403 });
    expect((await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } })).result).toBe("ب");
  });

  it("تقرير زيارة قديمة بدون صاحب: أي سفير بيعدّله", async () => {
    const { sami, visit } = await aliVisit();
    await prisma.visit.update({ where: { id: visit.id }, data: { ownerId: null, source: "LEGACY" } });
    await updateReport(sami, visit.id, { result: "تصحيح" });
    expect((await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } })).result).toBe("تصحيح");
  });

  it("المسؤول ما بيعدّل لا التقرير ولا الحالة ولا بيحذف", async () => {
    const { boss, visit, fine } = await aliVisit();
    await expect(updateReport(boss, visit.id, { result: "x" })).rejects.toMatchObject({ status: 403 });
    await expect(updateStatus(boss, visit.id, { recommendationId: fine })).rejects.toMatchObject({ status: 403 });
    await expect(deleteVisit(boss, visit.id)).rejects.toMatchObject({ status: 403 });
  });

  it("تعديل الكود بيحدّث الخط والحساب", async () => {
    const { ali, visit } = await aliVisit();
    await addManualLine(ali.id, { code: "G-1111-001", accountName: "حساب تاني" });
    await updateReport(ali, visit.id, { lineCode: "G-1111-001" });
    const v = await prisma.visit.findUniqueOrThrow({ where: { id: visit.id }, include: { line: true } });
    expect(v).toMatchObject({ lineCodeKey: "G1111001", accountName: "حساب تاني" });
    expect(v.line?.code).toBe("G-1111-001");
  });

  it("الحذف ناعم: بتختفي وبترجع، وما بتتعدّل وهي محذوفة", async () => {
    const { ali, sami, visit, fine } = await aliVisit();
    await deleteVisit(sami, visit.id);
    expect((await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } })).deletedAt).not.toBeNull();
    await expect(updateStatus(ali, visit.id, { recommendationId: fine })).rejects.toMatchObject({ status: 404 });
    await restoreVisit(sami, visit.id);
    expect((await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } })).deletedAt).toBeNull();
    expect(await prisma.auditLog.count({ where: { entityId: visit.id, action: { in: ["DELETE", "RESTORE"] } } })).toBe(
      2,
    );
  });

  it("الحالة بتقبل القيمة الموقوفة إذا هي القيمة الحالية بس", async () => {
    const { ali, visit } = await aliVisit();
    const old = await listId("RECOMMENDATION", "تأجيل الزيارة");
    await prisma.visit.update({ where: { id: visit.id }, data: { recommendationId: old } });
    await updateStatus(ali, visit.id, { recommendationId: old, revisitDue: null }); // نفس القيمة: مسموح
    const other = await listId("RECOMMENDATION", "مفصول سابقاً بسبب التجاوز");
    await expect(updateStatus(ali, visit.id, { recommendationId: other })).rejects.toThrow("التوصية");
  });
});
