import { beforeEach, describe, expect, it } from "vitest";
import { analyzeLegacyFile, applyLegacyImport } from "@/lib/import/legacy";
import { addManualLine } from "@/lib/lines";
import { buildLegacyFile, LEGACY_ROWS } from "./fixtures/legacy";
import { prisma, resetDb, makeUser } from "./helpers";

const TODAY = new Date("2026-11-13T00:00:00Z");

describe("نقل الزيارات القديمة: المعاينة", () => {
  beforeEach(resetDb);

  it("بيدمج الصفوف المكمّلة، بيصحح التواريخ، وبيوحد القيم", async () => {
    const plan = await analyzeLegacyFile(await buildLegacyFile(), { today: TODAY });
    expect(plan.summary).toMatchObject({ visits: 6, mergedRows: 1, specialCases: 2, doubtfulDates: 0 });

    const v1 = plan.visits[0];
    expect(v1).toMatchObject({
      number: 1,
      lineCodeKey: "G1000001",
      recommendation: "يوجد تجاوز",
      action: "تم تصويب الوضع",
    });
    expect(v1.tests).toBe("فحص حالة الخدمة\nفحص مكونات الشبكة");
    expect(v1.result).toBe("يوجد إعادة بيع\nتم فصل صندوق التوزيع");
    expect(v1.revisitNote).toBe("يجب اعادة الزيارة");

    const v3 = plan.visits[2];
    expect(v3.visitedOn?.toISOString().slice(0, 10)).toBe("2026-05-11");
    expect(v3.dateMethod).toBe("swapped");
    expect(v3.recommendation).toBe("زيارة غير ناجحة");

    expect(plan.visits[1]).toMatchObject({ lineCodeKey: "G2000001", action: "لا يوجد تجاوز بمعرفة مدير الحساب" });
    expect(plan.visits[3]).toMatchObject({
      specialCase: true,
      lineCodeKey: null,
      accountName: "زيارة لدمج خطوط شبكة",
      recommendation: "فحص شبكة",
    });
    expect(plan.visits[4]).toMatchObject({
      specialCase: true,
      recommendation: "إعادة زيارة",
      revisitNote: "لم يظهر في تقرير شهر 9",
    });
  });

  it("بيطلّع بالتقرير الأرقام المكررة والقيم المش معروفة وعدد كل توصية", async () => {
    const plan = await analyzeLegacyFile(await buildLegacyFile(), { today: TODAY });
    expect(plan.duplicateNumbers).toEqual([{ number: 5, rows: [8, 9] }]);
    expect(plan.unknownValues).toEqual([{ kind: "ACTION", label: "تم اعاده زيارة", count: 1 }]);
    expect(plan.recommendationCounts).toEqual({
      "يوجد تجاوز": 1,
      "لا يوجد تجاوز": 2,
      "زيارة غير ناجحة": 1,
      "فحص شبكة": 1,
      "إعادة زيارة": 1,
    });
  });

  it("التوصية والإجراء بالصف المكمّل بيعبّوا الزيارة إذا كانت فاضية", async () => {
    const rows = [
      [1, "4/20/2026", "مقهى", "G-1000-001", "فحص", null, null, null, null],
      [null, null, null, null, null, "نتيجة", "يوجد تجاوز", "تم تصويب الوضع", null],
    ];
    const plan = await analyzeLegacyFile(await buildLegacyFile(rows), { today: TODAY });
    expect(plan.visits[0]).toMatchObject({ recommendation: "يوجد تجاوز", action: "تم تصويب الوضع", result: "نتيجة" });
  });

  it("تاريخ مشكوك فيه بيطلع بالمراجعة مع سببه", async () => {
    const rows = [
      ...LEGACY_ROWS,
      [6, new Date(Date.UTC(2026, 4, 20)), "مكتب د", "G-6000-001", "فحص", null, "لا يوجد تجاوز", null, null],
    ];
    const plan = await analyzeLegacyFile(await buildLegacyFile(rows), { today: TODAY });
    expect(plan.summary.doubtfulDates).toBe(1);
    expect(plan.doubtful[0]).toMatchObject({ number: 6, row: 10, reason: expect.stringContaining("12") });
  });
});

describe("نقل الزيارات القديمة: الحفظ", () => {
  beforeEach(resetDb);

  it("بيحفظ الزيارات بدون صاحب، وبيربطها بالخط إذا موجود", async () => {
    const amb = await makeUser("amb");
    const line = await addManualLine(amb.id, { code: "G-1000-001", accountName: "مقهى أ" });
    const result = await applyLegacyImport(await buildLegacyFile(), { today: TODAY, fileName: "visits.xlsx" });
    expect(result).toMatchObject({ created: 6, updated: 0, unchanged: 0 });

    const visits = await prisma.visit.findMany({
      orderBy: [{ number: "asc" }, { visitedOn: "asc" }],
      include: { recommendation: true, action: true },
    });
    expect(visits).toHaveLength(6);
    expect(visits.every((v) => v.source === "LEGACY" && v.ownerId === null)).toBe(true);
    expect(visits[0]).toMatchObject({ lineId: line.id, lineCode: "G-1000-001", dateText: "4/20/2026" });
    expect(visits[0].recommendation?.label).toBe("يوجد تجاوز");
    expect(visits.filter((v) => v.lineId === line.id)).toHaveLength(2);

    // القيمة المش معروفة صارت قيمة موقوفة بالقائمة، وبتظهر بالزيارة
    const unknown = await prisma.listItem.findFirstOrThrow({ where: { label: "تم اعاده زيارة" } });
    expect(unknown).toMatchObject({ kind: "ACTION", active: false });
    expect(visits.find((v) => v.number === 3)?.action?.label).toBe("تم اعاده زيارة");

    expect(await prisma.auditLog.count({ where: { action: "IMPORT", entity: "Visit" } })).toBe(1);
  });

  it("تشغيله مرتين ما بيكرر شي، وتعديل بالإكسل بيتحدّث", async () => {
    const file = await buildLegacyFile();
    await applyLegacyImport(file, { today: TODAY, fileName: "visits.xlsx" });
    const again = await applyLegacyImport(file, { today: TODAY, fileName: "visits.xlsx" });
    expect(again).toMatchObject({ created: 0, updated: 0, unchanged: 6 });
    expect(await prisma.visit.count()).toBe(6);
    expect(await prisma.listItem.count({ where: { label: "تم اعاده زيارة" } })).toBe(1);

    const fixed = LEGACY_ROWS.map((r) => (r[0] === 2 ? [...r.slice(0, 5), "نتيجة مصححة", ...r.slice(6)] : r));
    const third = await applyLegacyImport(await buildLegacyFile(fixed), { today: TODAY, fileName: "visits.xlsx" });
    expect(third).toMatchObject({ created: 0, updated: 1, unchanged: 5 });
    expect((await prisma.visit.findFirstOrThrow({ where: { number: 2 } })).result).toBe("نتيجة مصححة");
  });

  it("الزيارات الجديدة بالنظام بتكمل أرقامها بعد أكبر رقم بالإكسل", async () => {
    await applyLegacyImport(await buildLegacyFile(), { today: TODAY, fileName: "visits.xlsx" });
    const [{ nextval }] = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('visit_number_seq')`;
    expect(Number(nextval)).toBe(6);
  });
});
