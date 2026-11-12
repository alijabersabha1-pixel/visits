/**
 * كل قواعد الصلاحيات بمكان واحد. السيرفر بيسأل هون قبل أي عملية،
 * والواجهة بتسأل نفس الدوال بس عشان تخفي الأزرار — مش عشان الحماية.
 *
 * المرجع: جدول «المستخدمون والصلاحيات» بالمواصفات.
 */

export type Role = "AMBASSADOR" | "ADMIN";

export interface Actor {
  id: string;
  role: Role;
  active: boolean;
}

/** صلاحيات ما بتعتمد على سجل معيّن */
export type Permission =
  | "visits:view" // يشوف كل الزيارات ويبحث بالـ Line Code
  | "visits:create" // يسجل زيارة جديدة
  | "visits:editStatus" // يغيّر التوصية والإجراء وإعادة الزيارة لأي زيارة
  | "visits:delete" // حذف ناعم لسلة المحذوفات
  | "users:manage" // يضيف حسابات ويوقفها
  | "lists:manage" // يعدّل القوائم وأسئلة المايكروتيك
  | "subscribers:import" // يستورد ملف المشتركين الشهري
  | "audit:view" // يشوف سجل التعديلات الكامل للنظام
  | "mikrotik:reveal" // يشوف كلمة سر مايكروتيك (السفراء بس)
  | "mikrotik:revealLog"; // يشوف سجل عرض كلمات السر (السفراء بس)

const MATRIX: Record<Permission, readonly Role[]> = {
  "visits:view": ["AMBASSADOR", "ADMIN"],
  "visits:create": ["AMBASSADOR", "ADMIN"],
  "visits:editStatus": ["AMBASSADOR", "ADMIN"],
  "visits:delete": ["ADMIN"],
  "users:manage": ["ADMIN"],
  "lists:manage": ["ADMIN"],
  "subscribers:import": ["ADMIN"],
  "audit:view": ["ADMIN"],
  "mikrotik:reveal": ["AMBASSADOR"],
  "mikrotik:revealLog": ["AMBASSADOR"],
};

export function can(actor: Actor | null | undefined, permission: Permission): boolean {
  if (!actor || !actor.active) return false;
  return MATRIX[permission].includes(actor.role);
}

/** تقرير الزيارة: ملك السفير اللي كتبه */
export interface VisitReportOwner {
  ownerId: string | null; // null = زيارة قديمة منقولة بدون صاحب
}

export type ReportEditDecision = "allowed" | "request" | "denied";

/**
 * مين بيعدّل تقرير زيارة؟
 * - صاحبها: مباشرة
 * - زيارة قديمة بدون صاحب: المسؤول مباشرة، والسفير لا
 * - تقرير غيره: بطلب تعديل يوافق عليه صاحبها (للسفير والمسؤول)
 */
export function reportEditDecision(actor: Actor | null | undefined, visit: VisitReportOwner): ReportEditDecision {
  if (!actor || !actor.active) return "denied";
  if (visit.ownerId === null) return actor.role === "ADMIN" ? "allowed" : "denied";
  if (visit.ownerId === actor.id) return "allowed";
  return "request";
}

export function canEditReport(actor: Actor | null | undefined, visit: VisitReportOwner): boolean {
  return reportEditDecision(actor, visit) === "allowed";
}

/** صاحب الزيارة بس بيوافق أو يرفض طلب تعديل على تقريره */
export function canDecideEditRequest(actor: Actor | null | undefined, visit: VisitReportOwner): boolean {
  if (!actor || !actor.active || visit.ownerId === null) return false;
  return visit.ownerId === actor.id;
}
