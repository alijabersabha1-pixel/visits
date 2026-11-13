import { beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { exportVisits, visitsWorkbook, cardsWorkbook, MAX_EXPORT, VISIT_COLUMNS } from "@/lib/export/visits";
import { createVisit } from "@/lib/visits";
import { createCard } from "@/lib/cards";
import { prisma, resetDb, sessionActor, listId } from "./helpers";

async function readBack(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  const rows: unknown[][] = [];
  ws.eachRow((r) => rows.push((r.values as unknown[]).slice(1)));
  return { ws, rows };
}

describe("تصدير الزيارات (المهمة 25)", () => {
  beforeEach(resetDb);

  async function seed() {
    const ali = await sessionActor("ali");
    const sami = await sessionActor("sami");
    const violation = await listId("RECOMMENDATION", "يوجد تجاوز");
    const fine = await listId("RECOMMENDATION", "لا يوجد تجاوز");
    const fixed = await listId("ACTION", "تم تصويب الوضع");
    await prisma.line.create({
      data: { codeKey: "G1234001", code: "G-1234-001", accountKey: "G1234", accountName: "محل التصدير", region: "غزة" },
    });
    const a = (
      await createVisit(
        ali,
        { visitedOn: "2026-11-02", lineCode: "g 1234 001", recommendationId: violation, actionId: fixed, tests: "فحص", result: "تجاوز", companionIds: [sami.id] },
        { gps: { lat: 31.5, lng: 34.45, accuracy: 9 } },
      )
    ).visit;
    const b = (await createVisit(sami, { visitedOn: "2026-11-05", lineCode: "G-9999-001", recommendationId: fine })).visit;
    const c = (
      await createVisit(ali, { visitedOn: "2026-10-20", specialCase: true, accountName: "حالة خاصة", place: "الميناء", recommendationId: fine })
    ).visit;
    return { ali, sami, a, b, c, violation };
  }

  it("المحددة بس، أو كل نتيجة الفلتر، والمحذوفة ما بتطلع", async () => {
    const { a, b, c, violation, ali } = await seed();
    expect((await exportVisits({ ids: [b.id, a.id] })).map((v) => v.id)).toEqual([b.id, a.id]); // الأحدث أول
    expect((await exportVisits({ filters: { recommendationId: violation } })).map((v) => v.id)).toEqual([a.id]);
    expect((await exportVisits({ filters: { ownerId: ali.id } })).map((v) => v.id)).toEqual([a.id, c.id]);
    await prisma.visit.update({ where: { id: b.id }, data: { deletedAt: new Date() } });
    expect((await exportVisits({ ids: [a.id, b.id] })).map((v) => v.id)).toEqual([a.id]);
    expect((await exportVisits({ filters: {} })).length).toBe(2);
  });

  it("ملف Excel: نفس أعمدة الملف الحالي مع الجديدة، من اليمين لليسار", async () => {
    const { a, c } = await seed();
    const rows = await exportVisits({ ids: [a.id, c.id] });
    const { ws, rows: out } = await readBack(await visitsWorkbook(rows));
    expect(ws.views[0]?.rightToLeft).toBe(true);
    expect(out[0]).toEqual(VISIT_COLUMNS.map((col) => col.header));
    // الأعمدة القديمة بنفس ترتيب الإكسل الحالي أول
    expect(VISIT_COLUMNS.slice(0, 9).map((col) => col.header)).toEqual([
      "م.",
      "التاريخ",
      "الحساب",
      "الكود",
      "الفحوصات",
      "النتيجة",
      "التوصية",
      "الإجراء",
      "إعادة الزيارة",
    ]);
    const row = Object.fromEntries(VISIT_COLUMNS.map((col, i) => [col.header, out[1][i]]));
    expect(row).toMatchObject({
      "م.": a.number,
      الحساب: "محل التصدير",
      الكود: "G-1234-001",
      الفحوصات: "فحص",
      النتيجة: "تجاوز",
      التوصية: "يوجد تجاوز",
      الإجراء: "تم تصويب الوضع",
      السفير: "ali",
      المرافقين: "sami",
      المنطقة: "غزة",
      الموقع: "31.50000, 34.45000",
    });
    expect(row["التاريخ"]).toBeInstanceOf(Date);
    const special = Object.fromEntries(VISIT_COLUMNS.map((col, i) => [col.header, out[2][i]]));
    expect(special["الكود"]).toBe("حالة خاصة");
    expect(special["الحساب"]).toBe("حالة خاصة");
  });

  it("حد أعلى للتصدير", () => {
    expect(MAX_EXPORT).toBeGreaterThanOrEqual(5000);
  });
});

describe("تقرير البطاقات بالإكسل", () => {
  beforeEach(resetDb);

  it("كل بطاقة بتفاصيلها والمجموع مطابق", async () => {
    const ali = await sessionActor("ali");
    await createCard(ali, { name: "شبكة أ", price: 5, ip: "10.0.0.1" }, { filledAt: new Date("2026-11-03T09:00:00Z") });
    await createCard(ali, { name: "شبكة ب", price: 7.5 }, { filledAt: new Date("2026-11-10T09:00:00Z") });
    await createCard(ali, { name: "شهر تاني", price: 100 }, { filledAt: new Date("2026-10-10T09:00:00Z") });
    const { rows } = await readBack(await cardsWorkbook({ month: "2026-11" }));
    const names = rows.map((r) => r[2]);
    expect(names).toContain("شبكة أ");
    expect(names).not.toContain("شهر تاني");
    const total = rows.at(-1)!;
    expect(total).toContain("المجموع");
    expect(total).toContain(12.5);
  });
});
