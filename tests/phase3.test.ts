import { beforeEach, describe, expect, it } from "vitest";
import { createVisit, updateReport } from "@/lib/visits";
import { decideEditRequest, pendingRequestsFor, requestReportEdit } from "@/lib/edit-requests";
import { openRevisits, postponeRevisit } from "@/lib/revisits";
import { bulkLookup, lookupLine } from "@/lib/search";
import { listVisits } from "@/lib/visit-list";
import { addManualLine } from "@/lib/lines";
import { prisma, resetDb, sessionActor, listId } from "./helpers";

async function setup() {
  const ali = await sessionActor("ali");
  const sami = await sessionActor("sami");
  const boss = await sessionActor("boss", "MANAGER");
  await addManualLine(ali.id, { code: "G-7872-002", accountName: "مقهى أ", locality: "خانيونس" });
  await addManualLine(ali.id, { code: "G-7872-003", accountName: "مقهى أ فرع", locality: "خانيونس" });
  await addManualLine(ali.id, { code: "G-1000-001", accountName: "شركة ب", locality: "غزة" });
  const rec = {
    exceeds: await listId("RECOMMENDATION", "يوجد تجاوز"),
    fine: await listId("RECOMMENDATION", "لا يوجد تجاوز"),
    revisit: await listId("RECOMMENDATION", "إعادة زيارة"),
    failed: await listId("RECOMMENDATION", "زيارة غير ناجحة"),
  };
  return { ali, sami, boss, rec };
}

describe("طلبات تعديل التقرير (المهمة 11)", () => {
  beforeEach(resetDb);

  it("سامي بيطلب تعديل على تقرير علي، وعلي بيوافق: التعديل باسم سامي مع ذكر علي", async () => {
    const { ali, sami, rec } = await setup();
    const { visit } = await createVisit(ali, {
      lineCode: "G-7872-002",
      visitedOn: "2026-11-10",
      recommendationId: rec.exceeds,
      result: "قديم",
    });
    const req = await requestReportEdit(sami, visit.id, { changes: { result: "جديد" }, reason: "النتيجة ناقصة" });
    expect(req.changes).toEqual({ result: { from: "قديم", to: "جديد" } });
    expect(await pendingRequestsFor(ali.id)).toHaveLength(1);
    expect(await pendingRequestsFor(sami.id)).toHaveLength(0);

    await decideEditRequest(ali, req.id, true);
    expect((await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } })).result).toBe("جديد");
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: visit.id, action: "UPDATE", field: "result" },
    });
    expect(log.actorId).toBe(sami.id);
    expect(log.note).toContain("بموافقة ali");
    expect(await pendingRequestsFor(ali.id)).toHaveLength(0);
    expect((await prisma.editRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("APPROVED");
  });

  it("الرفض ما بيغيّر شي وبيتسجل", async () => {
    const { ali, sami, rec } = await setup();
    const { visit } = await createVisit(ali, {
      lineCode: "G-7872-002",
      visitedOn: "2026-11-10",
      recommendationId: rec.exceeds,
      result: "قديم",
    });
    const req = await requestReportEdit(sami, visit.id, { changes: { result: "جديد" }, reason: "سبب" });
    await decideEditRequest(ali, req.id, false);
    expect((await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } })).result).toBe("قديم");
    expect(await prisma.auditLog.count({ where: { entityId: visit.id, note: { contains: "رفض" } } })).toBe(1);
    await expect(decideEditRequest(ali, req.id, true)).rejects.toMatchObject({ status: 409 });
  });

  it("صاحب الزيارة بس بيقرر، وما في طلب على زيارتك أو من المسؤول", async () => {
    const { ali, sami, boss, rec } = await setup();
    const { visit } = await createVisit(ali, {
      lineCode: "G-7872-002",
      visitedOn: "2026-11-10",
      recommendationId: rec.exceeds,
    });
    const req = await requestReportEdit(sami, visit.id, { changes: { tests: "فحص" }, reason: "سبب" });
    await expect(decideEditRequest(sami, req.id, true)).rejects.toMatchObject({ status: 403 });
    await expect(decideEditRequest(boss, req.id, true)).rejects.toMatchObject({ status: 403 });
    await expect(requestReportEdit(ali, visit.id, { changes: { tests: "x" }, reason: "سبب" })).rejects.toMatchObject({
      status: 400,
    });
    await expect(requestReportEdit(boss, visit.id, { changes: { tests: "x" }, reason: "سبب" })).rejects.toMatchObject({
      status: 403,
    });
  });

  it("إذا التقرير تغيّر بعد الطلب، الموافقة بترفض بدل ما تمسح التعديل الجديد", async () => {
    const { ali, sami, rec } = await setup();
    const { visit } = await createVisit(ali, {
      lineCode: "G-7872-002",
      visitedOn: "2026-11-10",
      recommendationId: rec.exceeds,
      result: "أ",
    });
    const req = await requestReportEdit(sami, visit.id, { changes: { result: "ب" }, reason: "سبب" });
    await updateReport(ali, visit.id, { result: "ج" });
    await expect(decideEditRequest(ali, req.id, true)).rejects.toMatchObject({ status: 409 });
    expect((await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } })).result).toBe("ج");
  });
});

describe("إعادة الزيارة (المهمة 15)", () => {
  beforeEach(resetDb);

  it("الخط بيدخل القائمة، والزيارة الجديدة إله بتطلّعه وبتنربط بالأصلية", async () => {
    const { ali, sami, rec } = await setup();
    const a = await createVisit(ali, {
      lineCode: "G-7872-002",
      visitedOn: "2026-11-01",
      recommendationId: rec.revisit,
    });
    const b = await createVisit(ali, { lineCode: "G-1000-001", visitedOn: "2026-11-02", recommendationId: rec.failed });
    await createVisit(ali, { lineCode: "G-7872-003", visitedOn: "2026-11-02", recommendationId: rec.fine });
    let open = await openRevisits();
    expect(open.map((o) => o.lineCode)).toEqual(["G-1000-001", "G-7872-002"]); // غزة قبل الجنوب
    expect(open[0].region).toBe("غزة");

    const next = await createVisit(sami, { lineCode: "g7872002", visitedOn: "2026-11-05", recommendationId: rec.fine });
    expect(next.visit.revisitOfId).toBe(a.visit.id);
    open = await openRevisits();
    expect(open.map((o) => o.id)).toEqual([b.visit.id]);
  });

  it("التأجيل بسبب، وعدد مرات التأجيل والأسباب ظاهرة", async () => {
    const { ali, sami, rec } = await setup();
    const a = await createVisit(ali, {
      lineCode: "G-7872-002",
      visitedOn: "2026-11-01",
      recommendationId: rec.revisit,
    });
    await postponeRevisit(ali, a.visit.id, "السيارة مش متاحة");
    await postponeRevisit(sami, a.visit.id, "المحل مسكر");
    const [row] = await openRevisits();
    expect(row.postponeCount).toBe(2);
    expect(row.lastPostponeReason).toBe("المحل مسكر");
    await expect(postponeRevisit(ali, a.visit.id, "")).rejects.toThrow();
  });

  it("الحالة الخاصة بتطلع بس بزيارة مربوطة فيها", async () => {
    const { ali, rec } = await setup();
    const s = await createVisit(ali, {
      specialCase: true,
      accountName: "شبكة",
      visitedOn: "2026-11-01",
      recommendationId: rec.revisit,
    });
    expect((await openRevisits()).map((o) => o.id)).toEqual([s.visit.id]);
    await createVisit(ali, {
      specialCase: true,
      accountName: "شبكة",
      visitedOn: "2026-11-03",
      recommendationId: rec.fine,
      revisitOfId: s.visit.id,
    });
    expect(await openRevisits()).toHaveLength(0);
  });

  it("زيارتين بنفس اليوم: التانية (رقمها أكبر) بتسكّر الأولى", async () => {
    const { ali, rec } = await setup();
    await createVisit(ali, { lineCode: "G-7872-002", visitedOn: "2026-11-01", recommendationId: rec.revisit });
    const b = await createVisit(ali, { lineCode: "G-7872-002", visitedOn: "2026-11-01", recommendationId: rec.fine });
    // الزيارات القديمة من الإكسل ما إلها ربط: بنعتمد على التاريخ والرقم بس
    await prisma.visit.update({ where: { id: b.visit.id }, data: { revisitOfId: null } });
    expect(await openRevisits()).toHaveLength(0);
  });

  it("ما بيصير تأجيل زيارة مش بالقائمة", async () => {
    const { ali, rec } = await setup();
    const a = await createVisit(ali, { lineCode: "G-7872-002", visitedOn: "2026-11-01", recommendationId: rec.fine });
    await expect(postponeRevisit(ali, a.visit.id, "سبب")).rejects.toMatchObject({ status: 409 });
  });

  it("المسؤول ما بيأجل", async () => {
    const { ali, boss, rec } = await setup();
    const a = await createVisit(ali, {
      lineCode: "G-7872-002",
      visitedOn: "2026-11-01",
      recommendationId: rec.revisit,
    });
    await expect(postponeRevisit(boss, a.visit.id, "x")).rejects.toMatchObject({ status: 403 });
  });
});

describe("البحث بالـ Line Code (المهمة 12)", () => {
  beforeEach(resetDb);

  it("بطاقة الخط، زياراته الأحدث أول، وخطوط نفس الحساب", async () => {
    const { ali, rec } = await setup();
    await createVisit(ali, { lineCode: "G-7872-002", visitedOn: "2026-10-01", recommendationId: rec.exceeds });
    await createVisit(ali, { lineCode: "G-7872-002", visitedOn: "2026-11-01", recommendationId: rec.fine });
    const r = await lookupLine("g‑7872‑002");
    expect(r?.line?.accountName).toBe("مقهى أ");
    expect(r?.visits.map((v) => v.visitedOn?.toISOString().slice(0, 10))).toEqual(["2026-11-01", "2026-10-01"]);
    expect(r?.visits[0].recommendation?.label).toBe("لا يوجد تجاوز");
    expect(r?.siblings.map((s) => s.code)).toEqual(["G-7872-003"]);
    expect(await lookupLine("G-0000-000")).toMatchObject({ line: null, visits: [] });
  });

  it("زيارة لكود مش بالمشتركين بتطلع برضو", async () => {
    const { ali, rec } = await setup();
    await createVisit(ali, {
      lineCode: "G-5555-001",
      accountName: "مش بالملف",
      visitedOn: "2026-11-01",
      recommendationId: rec.fine,
    });
    const r = await lookupLine("G-5555-001");
    expect(r?.line).toBeNull();
    expect(r?.visits).toHaveLength(1);
  });
});

describe("البحث الجماعي (المهمة 13)", () => {
  beforeEach(resetDb);

  it("موجود، مش موجود، مكرر، ومش صالح، مع عدد الزيارات وآخر زيارة", async () => {
    const { ali, rec } = await setup();
    await createVisit(ali, { lineCode: "G-7872-002", visitedOn: "2026-10-01", recommendationId: rec.exceeds });
    await createVisit(ali, { lineCode: "G-7872-002", visitedOn: "2026-11-01", recommendationId: rec.fine });
    const rows = await bulkLookup("G-7872-002\ng 1000 001\nG-9999-001\ng7872002\n-\n\n");
    expect(rows.map((r) => [r.input, r.status, r.visits])).toEqual([
      ["G-7872-002", "FOUND", 2],
      ["g 1000 001", "FOUND", 0],
      ["G-9999-001", "NOT_FOUND", 0],
      ["g7872002", "DUPLICATE", 2],
      ["-", "INVALID", 0],
    ]);
    expect(rows[0]).toMatchObject({ accountName: "مقهى أ", lastRecommendation: "لا يوجد تجاوز" });
    expect(rows[0].lastVisit?.toISOString().slice(0, 10)).toBe("2026-11-01");
  });

  it("أكتر من 1000 كود بينرفض، و1000 بترجع بسرعة", async () => {
    await setup();
    const many = Array.from({ length: 1001 }, (_, i) => `G-${1000 + i}-001`).join("\n");
    await expect(bulkLookup(many)).rejects.toThrow("1000");
    const t = Date.now();
    const rows = await bulkLookup(many.split("\n").slice(0, 1000).join("\n"));
    expect(rows).toHaveLength(1000);
    expect(Date.now() - t).toBeLessThan(5000);
  });
});

describe("قائمة الزيارات وزياراتي (المهمة 14)", () => {
  beforeEach(resetDb);

  it("كل فلتر لحاله ومع بعض، و«زياراتي» بس اللي سجلها المستخدم", async () => {
    const { ali, sami, rec } = await setup();
    await createVisit(ali, { lineCode: "G-7872-002", visitedOn: "2026-10-01", recommendationId: rec.exceeds });
    await createVisit(ali, { lineCode: "G-1000-001", visitedOn: "2026-11-01", recommendationId: rec.fine });
    await createVisit(sami, { lineCode: "G-7872-003", visitedOn: "2026-11-02", recommendationId: rec.exceeds });
    await createVisit(sami, {
      specialCase: true,
      accountName: "شبكة",
      visitedOn: "2026-11-03",
      recommendationId: rec.revisit,
    });

    const count = async (f: Parameters<typeof listVisits>[0]) => (await listVisits(f)).total;
    expect(await count({})).toBe(4);
    expect(await count({ ownerId: ali.id })).toBe(2);
    expect(await count({ region: "الجنوب" })).toBe(2);
    expect(await count({ recommendationId: rec.exceeds })).toBe(2);
    expect(await count({ recommendationId: rec.exceeds, region: "الجنوب", ownerId: sami.id })).toBe(1);
    expect(await count({ from: "2026-11-01", to: "2026-11-02" })).toBe(2);
    expect(await count({ special: true })).toBe(1);
    expect(await count({ q: "7872" })).toBe(2);
    expect(await count({ q: "شبكة" })).toBe(1);

    // المحذوفة ما بتطلع بالقائمة، وبتطلع بسلة المحذوفات بس
    const del = await prisma.visit.findFirstOrThrow({ where: { specialCase: true } });
    await prisma.visit.update({ where: { id: del.id }, data: { deletedAt: new Date() } });
    expect(await count({})).toBe(3);
    expect((await listVisits({ deleted: true })).rows.map((r) => r.id)).toEqual([del.id]);
    await prisma.visit.update({ where: { id: del.id }, data: { deletedAt: null } });

    const page = await listVisits({}, { page: 1, pageSize: 3 });
    expect(page.rows).toHaveLength(3);
    expect(page.rows[0].visitedOn?.toISOString().slice(0, 10)).toBe("2026-11-03");
  });
});
