import { describe, expect, it } from "vitest";
import {
  can,
  canDecideEditRequest,
  canEditReport,
  reportEditDecision,
  READ_PERMISSIONS,
  WRITE_PERMISSIONS,
  type Actor,
  type Permission,
} from "@/lib/authz";

const ambassador: Actor = { id: "amb-1", role: "AMBASSADOR", active: true };
const otherAmbassador: Actor = { id: "amb-2", role: "AMBASSADOR", active: true };
const manager: Actor = { id: "mgr-1", role: "MANAGER", active: true };
const disabledAmbassador: Actor = { id: "amb-3", role: "AMBASSADOR", active: false };

// جدول «المستخدمون والصلاحيات» بالمواصفات (بعد تصحيح علي 2026-11-13):
// السفير بيعمل كل شي، والمسؤول بيشوف كل شي للقراءة بس.
const SPEC: Array<[Permission, boolean, boolean]> = [
  // [الصلاحية, السفير, المسؤول]
  ["visits:view", true, true], // يشوف كل الزيارات ويبحث بالـ Line Code، ويشوف مين زار
  ["stats:view", true, true], // الخريطة والإحصائيات
  ["audit:view", true, true], // سجل التعديلات
  ["export", true, true], // PDF وExcel
  ["users:view", true, true], // قائمة الحسابات
  ["visits:mine", true, false], // صفحة «زياراتي»
  ["visits:create", true, false], // زيارة جديدة، VPN، بطاقة
  ["visits:editStatus", true, false], // يغيّر حالة أي زيارة
  ["visits:delete", true, false], // سلة المحذوفات
  ["users:manage", true, false], // يضيف حسابات ويوقفها
  ["lists:manage", true, false], // القوائم والأسئلة
  ["subscribers:import", true, false], // الملف الشهري والحساب الطارئ
  ["mikrotik:reveal", true, false], // كلمة سر المايكروتيك
  ["mikrotik:revealLog", true, false], // سجل عرض كلمات السر
];

describe("can()", () => {
  it.each(SPEC)("%s → سفير %s، مسؤول %s", (perm, amb, mgr) => {
    expect(can(ambassador, perm)).toBe(amb);
    expect(can(manager, perm)).toBe(mgr);
  });

  it("المسؤول ما عنده ولا صلاحية بتغيّر شي", () => {
    const writes = SPEC.filter(([, , mgr]) => !mgr).map(([p]) => p);
    expect(writes.length).toBeGreaterThan(5);
    for (const p of writes) expect(can(manager, p)).toBe(false);
  });

  it("كل صلاحية بالكود موجودة بجدول المواصفات (ما في صلاحية منسية)", () => {
    const inSpec = new Set(SPEC.map(([p]) => p));
    for (const p of [...READ_PERMISSIONS, ...WRITE_PERMISSIONS]) expect(inSpec.has(p), p).toBe(true);
    expect(inSpec.size).toBe(READ_PERMISSIONS.length + WRITE_PERMISSIONS.length);
  });

  it("الحساب الموقوف ما عنده ولا صلاحية", () => {
    for (const [perm] of SPEC) expect(can(disabledAmbassador, perm)).toBe(false);
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

  it("تقرير سفير تاني: بطلب يوافق عليه صاحبها", () => {
    expect(reportEditDecision(ambassador, othersVisit)).toBe("request");
    expect(canEditReport(ambassador, othersVisit)).toBe(false);
  });

  it("زيارة قديمة بدون صاحب: أي سفير بيعدّلها", () => {
    expect(reportEditDecision(ambassador, legacyVisit)).toBe("allowed");
  });

  it("المسؤول ما بيعدّل ولا بيطلب تعديل على أي تقرير", () => {
    expect(reportEditDecision(manager, othersVisit)).toBe("denied");
    expect(reportEditDecision(manager, legacyVisit)).toBe("denied");
    expect(reportEditDecision(manager, { ownerId: manager.id })).toBe("denied");
  });

  it("الحساب الموقوف ما بيعدّل ولا تقريره", () => {
    expect(reportEditDecision({ ...ambassador, active: false }, ownVisit)).toBe("denied");
  });

  it("صاحب الزيارة بس بيوافق على طلب التعديل", () => {
    expect(canDecideEditRequest(ambassador, ownVisit)).toBe(true);
    expect(canDecideEditRequest(otherAmbassador, ownVisit)).toBe(false);
    expect(canDecideEditRequest(manager, ownVisit)).toBe(false);
    expect(canDecideEditRequest(ambassador, legacyVisit)).toBe(false);
  });
});
