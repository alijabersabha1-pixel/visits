import { beforeEach, describe, expect, it } from "vitest";
import { analyzeMonthlyFile, applyMonthlyImport, normHeader, parseDayFirstDate } from "@/lib/import/monthly";
import { addManualLine } from "@/lib/lines";
import { buildMonthlyFile, TARGET_ROWS } from "./fixtures/monthly";
import { prisma, resetDb, makeUser } from "./helpers";

const MONTH = "2026-11";

describe("قراءة الأعمدة والتواريخ", () => {
  it("توحيد اسم العمود (مسافات، _، همزات، تاء مربوطة)", () => {
    expect(normHeader("Line_Code")).toBe(normHeader("line code"));
    expect(normHeader("تاريخ الزياره")).toBe(normHeader("تاريخ الزيارة"));
    expect(normHeader("الإجراء النهائي")).toBe(normHeader("الاجراء النهائي"));
  });

  it("تواريخ ملف الشهر النصية يوم/شهر", () => {
    expect(parseDayFirstDate("14/09/2026")?.toISOString().slice(0, 10)).toBe("2026-09-14");
    expect(parseDayFirstDate("1/2/2026")?.toISOString().slice(0, 10)).toBe("2026-02-01");
    expect(parseDayFirstDate("31/02/2026")).toBeNull();
    expect(parseDayFirstDate("غير معروف")).toBeNull();
    expect(
      parseDayFirstDate(new Date(Date.UTC(2026, 8, 30)))
        ?.toISOString()
        .slice(0, 10),
    ).toBe("2026-09-30");
  });
});

describe("معاينة ملف الشهر", () => {
  beforeEach(resetDb);

  it("بتتعرف على الأوراق لحالها", async () => {
    const plan = await analyzeMonthlyFile(await buildMonthlyFile(), { month: MONTH });
    expect(plan.sheets.map((s) => [s.name, s.role])).toEqual([
      ["الزيارات الإجماليه", "LOG"],
      ["زيارات جديدة", "TARGETS"],
      ["استثناء من الزيارات", "EXCLUDED"],
      ["ملخص الزيارات", "IGNORED"],
    ]);
  });

  it("بتحسب الجديد والمتغير والمشاكل قبل الحفظ", async () => {
    const amb = await makeUser("amb");
    await addManualLine(amb.id, { code: "G-1000-001", accountName: "اسم قديم", locality: "خانيونس" });
    const plan = await analyzeMonthlyFile(await buildMonthlyFile(), { month: MONTH });

    expect(plan.summary).toMatchObject({
      newLines: 3, // G2000001, G3000002, G4000001
      changedLines: 1, // G1000001 تغير اسمه وانضاف IP
      targets: 3, // G1000001, G3000002 + المستثنى
      excludedTargets: 1,
      logRows: 3,
    });
    const changed = plan.lines.changed[0];
    expect(changed.codeKey).toBe("G1000001");
    expect(changed.changes.accountName).toEqual({ from: "اسم قديم", to: "مقهى الاختبار" });

    // المشاكل برقم الصف وسببها
    expect(plan.problems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sheet: "الزيارات الإجماليه", row: 5, reason: expect.stringContaining("Line Code") }),
        expect.objectContaining({ sheet: "زيارات جديدة", row: 4, reason: expect.stringContaining("مكرر") }),
      ]),
    );
  });

  it("بدون عمود Line_Code بتطلب تحديد العمود", async () => {
    const plan = await analyzeMonthlyFile(await buildMonthlyFile(), {
      month: MONTH,
      columnMap: { code: "عمود مش موجود" },
    });
    expect(plan.blocking.join(" ")).toContain("Line Code");
  });

  it("خريطة أعمدة محفوظة بتغلب الاكتشاف التلقائي", async () => {
    const plan = await analyzeMonthlyFile(await buildMonthlyFile(), {
      month: MONTH,
      columnMap: { accountName: "Account Manager" },
    });
    const created = plan.lines.new.find((l) => l.codeKey === "G3000002");
    expect(created?.accountName).toBe("AM.THREE");
  });
});

describe("حفظ ملف الشهر", () => {
  beforeEach(resetDb);

  it("الحفظ بيطابق المعاينة", async () => {
    const amb = await makeUser("amb");
    const file = await buildMonthlyFile();
    const plan = await analyzeMonthlyFile(file, { month: MONTH });
    const result = await applyMonthlyImport(amb.id, file, { month: MONTH, fileName: "visits-11.xlsx" });

    expect(result.summary).toEqual(plan.summary);
    expect(await prisma.line.count()).toBe(4); // G1000001, G2000001 (من السجل بس), G3000002, G4000001 (مستثنى)
    expect(await prisma.monthTarget.count({ where: { month: MONTH } })).toBe(plan.summary.targets);
    expect(await prisma.managerLogEntry.count()).toBe(plan.summary.logRows);

    const line = await prisma.line.findUniqueOrThrow({ where: { codeKey: "G1000001" } });
    expect(line).toMatchObject({
      code: "G-1000-001",
      accountName: "مقهى الاختبار",
      region: "الجنوب",
      accountManager: "AM.ONE",
      fixedIp: "213.6.237.181",
      inLatestFile: true,
    });
    const target = await prisma.monthTarget.findFirstOrThrow({ where: { lineId: line.id } });
    expect(target).toMatchObject({ sheet: "زيارات جديدة", region: "الجنوب", excluded: false, teamNote: null });
    expect(target.metrics).toMatchObject({ "Utilization Avg": 45.8, "Total Out": 15605.15 });

    const excluded = await prisma.monthTarget.findFirstOrThrow({ where: { excluded: true } });
    expect(excluded.teamNote).toBe("عدم الزيارة لاسباب خاصة");

    const log = await prisma.managerLogEntry.findMany({
      where: { line: { codeKey: "G2000001" } },
      orderBy: { rowKey: "asc" },
    });
    expect(log).toHaveLength(2);
    expect(log[0].visitDate?.toISOString().slice(0, 10)).toBe("2026-09-14");
    expect(log.map((l) => l.finalAction)).toContain("تم تصويب الوضع + تعهد عدلي");

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "IMPORT" } });
    expect(audit.actorId).toBe(amb.id);
    expect(audit.note).toContain(MONTH);
  });

  it("رفع نفس الملف مرتين ما بيعمل ولا تكرار", async () => {
    const amb = await makeUser("amb");
    const file = await buildMonthlyFile();
    await applyMonthlyImport(amb.id, file, { month: MONTH, fileName: "a.xlsx" });
    const counts = async () => [
      await prisma.line.count(),
      await prisma.monthTarget.count(),
      await prisma.managerLogEntry.count(),
    ];
    const first = await counts();
    const again = await analyzeMonthlyFile(file, { month: MONTH });
    expect(again.summary).toMatchObject({ newLines: 0, changedLines: 0 });
    expect(again.sameFileImportedBefore).toBe(true);
    await applyMonthlyImport(amb.id, file, { month: MONTH, fileName: "a.xlsx" });
    expect(await counts()).toEqual(first);
  });

  it("الملف التراكمي: الشهر الجاي بيحدّث الإجراء النهائي بدل ما يكرر السطر", async () => {
    const amb = await makeUser("amb");
    await applyMonthlyImport(amb.id, await buildMonthlyFile(), { month: "2026-10", fileName: "10.xlsx" });
    const { LOG_ROWS } = await import("./fixtures/monthly");
    const updated = LOG_ROWS.map((r) =>
      r.Line_Code === "G-1000-001" ? { ...r, "الاجراء النهائي لمدير المنطقة بقطاع الاعمال": "فصل نهائي" } : r,
    );
    await applyMonthlyImport(amb.id, await buildMonthlyFile({ log: updated }), { month: MONTH, fileName: "11.xlsx" });
    const rows = await prisma.managerLogEntry.findMany({ where: { line: { codeKey: "G1000001" } } });
    expect(rows).toHaveLength(1);
    expect(rows[0].finalAction).toBe("فصل نهائي");
  });

  it("الخط الغائب عن آخر ملف بيتعلّم وما بينمسح", async () => {
    const amb = await makeUser("amb");
    await applyMonthlyImport(amb.id, await buildMonthlyFile(), { month: "2026-10", fileName: "10.xlsx" });
    const withoutNew = TARGET_ROWS.filter((r) => r.Line_Code !== "G-3000-002");
    const plan = await analyzeMonthlyFile(await buildMonthlyFile({ targets: withoutNew }), { month: MONTH });
    expect(plan.summary.missingFromFile).toBe(1);
    await applyMonthlyImport(amb.id, await buildMonthlyFile({ targets: withoutNew }), {
      month: MONTH,
      fileName: "11.xlsx",
    });
    const line = await prisma.line.findUniqueOrThrow({ where: { codeKey: "G3000002" } });
    expect(line.inLatestFile).toBe(false);
  });

  it("الخط اليدوي لما يوصل بالملف بيصير رسمي وبتتحدث بياناته", async () => {
    const amb = await makeUser("amb");
    await addManualLine(amb.id, { code: "G-3000-002", accountName: "طارئ" });
    await applyMonthlyImport(amb.id, await buildMonthlyFile(), { month: MONTH, fileName: "11.xlsx" });
    const line = await prisma.line.findUniqueOrThrow({ where: { codeKey: "G3000002" } });
    expect(line).toMatchObject({ manual: false, accountName: "خط جديد", region: "غزة" });
  });

  it("خانة فاضية بالملف ما بتمسح قيمة محفوظة", async () => {
    const amb = await makeUser("amb");
    await applyMonthlyImport(amb.id, await buildMonthlyFile(), { month: "2026-10", fileName: "10.xlsx" });
    const withoutIp = TARGET_ROWS.map((r) => (r.Line_Code === "G-1000-001" ? { ...r, "Fixed Ip": null } : r));
    const plan = await analyzeMonthlyFile(await buildMonthlyFile({ targets: withoutIp }), { month: MONTH });
    expect(plan.lines.changed.find((c) => c.codeKey === "G1000001")).toBeUndefined();
    await applyMonthlyImport(amb.id, await buildMonthlyFile({ targets: withoutIp }), {
      month: MONTH,
      fileName: "11.xlsx",
    });
    expect((await prisma.line.findUniqueOrThrow({ where: { codeKey: "G1000001" } })).fixedIp).toBe("213.6.237.181");
  });

  it("خط يدوي بياناته نفس الملف بالضبط بيصير رسمي برضو", async () => {
    const amb = await makeUser("amb");
    await addManualLine(amb.id, { code: "G-5000-001", accountName: "نفس الاسم", locality: "غزة" });
    const file = await buildMonthlyFile({
      targets: [{ Line_Code: "G-5000-001", "account name": "نفس الاسم", Locality: "غزة" }],
      log: [],
      excluded: [],
    });
    const plan = await analyzeMonthlyFile(file, { month: MONTH });
    expect(plan.lines.changed).toEqual([
      {
        codeKey: "G5000001",
        code: "G-5000-001",
        changes: { manual: { from: true, to: false } },
      },
    ]);
    await applyMonthlyImport(amb.id, file, { month: MONTH, fileName: "11.xlsx" });
    expect((await prisma.line.findUniqueOrThrow({ where: { codeKey: "G5000001" } })).manual).toBe(false);
  });

  it("ورقة منطقة بتغلب «زيارات جديدة» باسم الورقة، وبدون تكرار", async () => {
    const amb = await makeUser("amb");
    const file = await buildMonthlyFile({ regionSheet: [TARGET_ROWS[0]] });
    await applyMonthlyImport(amb.id, file, { month: MONTH, fileName: "11.xlsx" });
    const t = await prisma.monthTarget.findMany({ where: { line: { codeKey: "G1000001" } } });
    expect(t).toHaveLength(1);
    expect(t[0].sheet).toBe("زيارات خانيونس");
  });

  it("الشهر لازم يكون بصيغة YYYY-MM", async () => {
    await expect(analyzeMonthlyFile(await buildMonthlyFile(), { month: "11-2026" })).rejects.toThrow("الشهر");
  });

  it("ملف مش إكسل بينرفض برسالة واضحة", async () => {
    await expect(analyzeMonthlyFile(Buffer.from("not an excel file"), { month: MONTH })).rejects.toThrow("إكسل");
  });
});
