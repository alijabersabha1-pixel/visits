import { beforeEach, describe, expect, it } from "vitest";
import { dashboardStats } from "@/lib/stats";
import { createVisit, updateStatus } from "@/lib/visits";
import { createCard } from "@/lib/cards";
import { postponeRevisit } from "@/lib/revisits";
import { prisma, resetDb, sessionActor, listId } from "./helpers";

// «اليوم» بالاختبار: الأربعاء 2026-11-11 (الأسبوع بيبلّش السبت 2026-11-07)
const TODAY = "2026-11-11";

async function setup() {
  const ali = await sessionActor("ali");
  const sami = await sessionActor("sami");
  const rec = {
    violation: await listId("RECOMMENDATION", "يوجد تجاوز"),
    fine: await listId("RECOMMENDATION", "لا يوجد تجاوز"),
    revisit: await listId("RECOMMENDATION", "إعادة زيارة"),
  };
  const fixed = await listId("ACTION", "تم تصويب الوضع");
  const v = (actor: typeof ali, day: string, code: string, recommendationId: string, actionId?: string) =>
    createVisit(actor, { visitedOn: day, lineCode: code, recommendationId, actionId }).then((r) => r.visit);
  return { ali, sami, rec, fixed, v };
}

describe("أرقام الرئيسية (المهمة 24)", () => {
  beforeEach(resetDb);

  it("كل رقم بيطابق عدّ مستقل على نفس البيانات", async () => {
    const { ali, sami, rec, fixed, v } = await setup();
    await v(ali, "2026-11-11", "G-0001-001", rec.violation); // اليوم، تجاوز بدون إجراء
    await v(ali, "2026-11-11", "G-0002-001", rec.fine); // اليوم
    await v(sami, "2026-11-08", "G-0003-001", rec.violation, fixed); // هالأسبوع
    await v(sami, "2026-11-06", "G-0004-001", rec.revisit); // هالشهر، قبل هالأسبوع
    await v(ali, "2026-10-20", "G-0005-001", rec.violation, fixed); // الشهر الماضي
    const deleted = await v(ali, "2026-11-10", "G-0006-001", rec.violation);
    await prisma.visit.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });

    const s = await dashboardStats({ today: TODAY, userId: ali.id });
    expect(s.visits).toEqual({ today: 2, week: 3, month: 4, total: 5 });
    // نسبة التجاوز هالشهر: 2 من 4
    expect(s.violations).toEqual({ month: 2, monthRate: 50, total: 3, totalRate: 60 });
    expect(s.openRevisits).toBe(1);

    // مستقل: عدّ مباشر من قاعدة البيانات
    expect(s.visits.total).toBe(await prisma.visit.count({ where: { deletedAt: null } }));

    const nov = s.monthly.find((m) => m.month === "2026-11")!;
    expect(nov.total).toBe(4);
    expect(Object.fromEntries(nov.parts.map((p) => [p.label, p.count]))).toEqual({
      "يوجد تجاوز": 2,
      "لا يوجد تجاوز": 1,
      "إعادة زيارة": 1,
    });
    expect(s.monthly.find((m) => m.month === "2026-10")!.total).toBe(1);
    expect(s.monthly).toHaveLength(12);
    expect(s.monthly.at(-1)!.month).toBe("2026-11");

    expect(s.actions).toEqual([
      { label: "تم تصويب الوضع", count: 2 },
      { label: "بدون إجراء", count: 3 },
    ]);
    expect(s.byAmbassador).toEqual([
      { name: "ali", month: 2, total: 3 },
      { name: "sami", month: 2, total: 2 },
    ]);
    // تجاوز بدون إجراء: G-0001 بس (المحذوفة ما بتنحسب)
    expect(s.alerts.violationsNoAction.map((x) => x.lineCode)).toEqual(["G-0001-001"]);
  });

  it("مصروف البطاقات هالشهر، وإعادات الزيارة المتأجلة أكتر من مرة", async () => {
    const { ali, rec, v } = await setup();
    await createCard(ali, { name: "شبكة أ", price: 5 }, { filledAt: new Date("2026-11-03T09:00:00Z") });
    await createCard(ali, { name: "شبكة ب", price: 7.5 }, { filledAt: new Date("2026-11-10T09:00:00Z") });
    await createCard(ali, { name: "شبكة قديمة", price: 100 }, { filledAt: new Date("2026-10-10T09:00:00Z") });
    const r = await v(ali, "2026-11-02", "G-0009-001", rec.revisit);
    await postponeRevisit(ali, r.id, "السيارة مش متاحة");
    let s = await dashboardStats({ today: TODAY, userId: ali.id });
    expect(s.cards).toEqual({ monthCount: 2, monthTotal: 12.5 });
    expect(s.alerts.postponedTwice).toEqual([]);
    await postponeRevisit(ali, r.id, "المشترك مسافر");
    s = await dashboardStats({ today: TODAY, userId: ali.id });
    expect(s.alerts.postponedTwice.map((x) => [x.lineCode, x.postponeCount])).toEqual([["G-0009-001", 2]]);
  });

  it("تغيير التوصية بيغيّر الأرقام فوراً", async () => {
    const { ali, rec, fixed, v } = await setup();
    const visit = await v(ali, TODAY, "G-0001-001", rec.violation);
    expect((await dashboardStats({ today: TODAY, userId: ali.id })).alerts.violationsNoAction).toHaveLength(1);
    await updateStatus(ali, visit.id, { actionId: fixed });
    const s = await dashboardStats({ today: TODAY, userId: ali.id });
    expect(s.alerts.violationsNoAction).toHaveLength(0);
    expect(s.violations.month).toBe(1);
  });

  it("بدون بيانات: أصفار مش أخطاء", async () => {
    const ali = await sessionActor("ali");
    const s = await dashboardStats({ today: TODAY, userId: ali.id });
    expect(s.visits).toEqual({ today: 0, week: 0, month: 0, total: 0 });
    expect(s.violations.monthRate).toBe(0);
    expect(s.monthly.every((m) => m.total === 0)).toBe(true);
  });
});
