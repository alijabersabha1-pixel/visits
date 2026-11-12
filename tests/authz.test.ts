import { describe, expect, it } from "vitest";
import { can, canDecideEditRequest, canEditReport, reportEditDecision, type Actor, type Permission } from "@/lib/authz";

const ambassador: Actor = { id: "amb-1", role: "AMBASSADOR", active: true };
const otherAmbassador: Actor = { id: "amb-2", role: "AMBASSADOR", active: true };
const admin: Actor = { id: "adm-1", role: "ADMIN", active: true };
const disabledAdmin: Actor = { id: "adm-2", role: "ADMIN", active: false };

// جدول «المستخدمون والصلاحيات» بالمواصفات، سطر بسطر
const SPEC: Array<[Permission, boolean, boolean]> = [
  // [الصلاحية, السفير, المسؤول]
  ["visits:view", true, true], // يشوف كل الزيارات ويبحث بالـ Line Code، ويشوف مين زار
  ["visits:create", true, true], // يسجل زيارة جديدة
  ["visits:editStatus", true, true], // يغيّر حالة أي زيارة
  ["visits:delete", false, true], // يحذف زيارة (سلة محذوفات)
  ["users:manage", false, true], // يضيف حسابات ويوقفها
  ["lists:manage", false, true], // يعدل القوائم والأسئلة
  ["subscribers:import", false, true], // يستورد ملف المشتركين
  ["audit:view", false, true], // سجل التعديلات الكامل
  ["mikrotik:reveal", true, false], // كلمة سر المايكروتيك: السفراء بس
  ["mikrotik:revealLog", true, false], // سجل عرض كلمات السر: السفراء بس
];

describe("can()", () => {
  it.each(SPEC)("%s → سفير %s، مسؤول %s", (perm, amb, adm) => {
    expect(can(ambassador, perm)).toBe(amb);
    expect(can(admin, perm)).toBe(adm);
  });

  it("الحساب الموقوف ما عنده ولا صلاحية", () => {
    for (const [perm] of SPEC) expect(can(disabledAdmin, perm)).toBe(false);
  });

  it("بدون مستخدم ما في صلاحية", () => {
    expect(can(null, "visits:view")).toBe(false);
    expect(can(undefined, "visits:view")).toBe(false);
  });
});

describe("تعديل تقرير الزيارة", () => {
  const ownVisit = { ownerId: ambassador.id };
  const othersVisit = { ownerId: otherAmbassador.id };
  const legacyVisit = { ownerId: null };

  it("صاحب الزيارة بيعدّل تقريره مباشرة", () => {
    expect(reportEditDecision(ambassador, ownVisit)).toBe("allowed");
    expect(canEditReport(ambassador, ownVisit)).toBe(true);
  });

  it("تقرير غيره: بطلب يوافق عليه صاحبها، للسفير والمسؤول", () => {
    expect(reportEditDecision(ambassador, othersVisit)).toBe("request");
    expect(reportEditDecision(admin, othersVisit)).toBe("request");
    expect(canEditReport(admin, othersVisit)).toBe(false);
  });

  it("زيارة قديمة بدون صاحب: المسؤول بس", () => {
    expect(reportEditDecision(admin, legacyVisit)).toBe("allowed");
    expect(reportEditDecision(ambassador, legacyVisit)).toBe("denied");
  });

  it("الحساب الموقوف ما بيعدّل ولا تقريره", () => {
    expect(reportEditDecision({ ...ambassador, active: false }, ownVisit)).toBe("denied");
  });

  it("صاحب الزيارة بس بيوافق على طلب التعديل", () => {
    expect(canDecideEditRequest(ambassador, ownVisit)).toBe(true);
    expect(canDecideEditRequest(otherAmbassador, ownVisit)).toBe(false);
    expect(canDecideEditRequest(admin, ownVisit)).toBe(false);
    expect(canDecideEditRequest(admin, legacyVisit)).toBe(false);
  });
});
