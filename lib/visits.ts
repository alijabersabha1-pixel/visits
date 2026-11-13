/**
 * الزيارات: تسجيل، تعديل التقرير (لصاحبه)، تعديل الحالة (لأي سفير)، حذف ناعم واسترجاع.
 * كل دالة بتفحص الصلاحية بنفسها (lib/authz) وبتكتب السجل بنفس العملية (withAudit).
 */
import { z } from "zod";
import { prisma as defaultPrisma, type Db, type Tx } from "./db";
import { withAudit } from "./audit";
import { can, reportEditDecision, type Actor } from "./authz";
import { ApiError, forbidden, notFound } from "./errors";
import { displayLineCode, isValidLineCode, normalizeLineCode } from "./line-code";
import { formatDay, parseDay, todayLocal } from "./dates";
import type { ListKind } from "./lists";
import { openRevisitFor } from "./revisits";
import { storeImages, type DecodedImage } from "./attachments";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "النص طويل كتير")
    .nullish()
    .transform((v) => (v ? v : null));

const day = z.string().refine((s) => parseDay(s) !== null, "التاريخ لازم يكون بصيغة 2026-11-13");

const reportFields = {
  visitedOn: day,
  lineCode: text(40),
  specialCase: z.boolean().optional(),
  accountName: text(200),
  place: text(200),
  companionIds: z.array(z.uuid()).max(5).optional(),
  tests: text(4000),
  result: text(4000),
};

export const createVisitSchema = z.object({
  ...reportFields,
  recommendationId: z.uuid({ error: "اختار التوصية" }),
  actionId: z.uuid().nullish(),
  revisitDue: day.nullish(),
  revisitOfId: z.uuid().nullish(),
});

export const reportPatchSchema = z
  .object(reportFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, "ما في شي يتعدّل");

export const statusPatchSchema = z
  .object({ recommendationId: z.uuid(), actionId: z.uuid().nullable(), revisitDue: day.nullable() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "ما في شي يتعدّل");

type CreateInput = z.input<typeof createVisitSchema>;

/** إضافات الزيارة من الجوال (lib/sync.ts) */
export interface FieldExtras {
  clientUuid?: string;
  filledAt?: Date;
  gps?: { lat: number; lng: number; accuracy: number } | null;
  mikrotik?: Array<{ questionId: string; question: string; answer: string }> | null;
  photos?: DecodedImage[];
}

function checkDate(s: string): Date {
  const d = parseDay(s)!;
  if (s > todayLocal()) throw new ApiError(400, "تاريخ الزيارة ما بيصير يكون بالمستقبل");
  return d;
}

async function listItemFor(tx: Tx, kind: ListKind, id: string, currentId: string | null, label: string) {
  const item = await tx.listItem.findUnique({ where: { id } });
  // القيمة الموقوفة مسموحة بس إذا هي القيمة الحالية بالزيارة
  if (!item || item.kind !== kind || (!item.active && item.id !== currentId))
    throw new ApiError(400, `${label} مش من القائمة`);
  return item;
}

async function checkCompanions(tx: Tx, ownerId: string | null, ids: string[]) {
  if (!ids.length) return;
  const users = await tx.user.findMany({ where: { id: { in: ids }, role: "AMBASSADOR", active: true } });
  if (users.length !== new Set(ids).size || ids.includes(ownerId ?? "")) {
    throw new ApiError(400, "المرافق لازم يكون سفير فعّال غير صاحب الزيارة");
  }
}

/** الكود ← المفتاح والخط واسم الحساب. كود مش معروف مسموح مع تنبيه. */
async function resolveLine(tx: Tx, lineCode: string | null, specialCase: boolean, accountName: string | null) {
  if (specialCase) {
    if (!accountName) throw new ApiError(400, "اكتب الاسم للحالة الخاصة");
    return { lineCode: null, lineCodeKey: null, lineId: null, accountName, warning: null };
  }
  if (!isValidLineCode(lineCode)) throw new ApiError(400, "اكتب Line Code صالح، أو اختار «حالة خاصة»");
  const lineCodeKey = normalizeLineCode(lineCode);
  const line = await tx.line.findUnique({ where: { codeKey: lineCodeKey } });
  return {
    lineCode: line?.code ?? displayLineCode(lineCode),
    lineCodeKey,
    lineId: line?.id ?? null,
    accountName: accountName ?? line?.accountName ?? null,
    warning: line
      ? null
      : "الخط مش موجود بملف المشتركين. الزيارة انحفظت، وبتنربط لحالها لما يوصل الخط بالملف أو ينضاف يدوياً.",
  };
}

async function namesOf(tx: Tx, ids: string[]) {
  if (!ids.length) return "";
  const users = await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } });
  return ids.map((id) => users.find((u) => u.id === id)?.displayName ?? id).join("، ");
}

/** شكل الزيارة بالسجل: أسماء بدل أرقام داخلية */
export async function auditView(tx: Tx, v: { [k: string]: unknown }) {
  const label = async (id: unknown) =>
    id ? ((await tx.listItem.findUnique({ where: { id: id as string } }))?.label ?? null) : null;
  return {
    visitedOn: formatDay(v.visitedOn as Date | null),
    lineCode: v.lineCode,
    accountName: v.accountName,
    specialCase: v.specialCase,
    place: v.place,
    companions: await namesOf(tx, (v.companionIds as string[]) ?? []),
    tests: v.tests,
    result: v.result,
    recommendation: await label(v.recommendationId),
    action: await label(v.actionId),
    revisitDue: formatDay(v.revisitDue as Date | null),
  };
}

export async function loadVisit(tx: Tx, id: string) {
  const v = await tx.visit.findUnique({ where: { id } });
  if (!v || v.deletedAt) throw notFound();
  return v;
}

export async function createVisit(actor: Actor, raw: CreateInput, field: FieldExtras = {}, db: Db = defaultPrisma) {
  if (!can(actor, "visits:create")) throw forbidden();
  const input = createVisitSchema.parse(raw);
  const visitedOn = checkDate(input.visitedOn);
  let cleanup: (() => Promise<void>) | null = null;
  try {
    return await withAudit(
      actor.id,
      async (tx, audit) => {
        const line = await resolveLine(tx, input.lineCode, input.specialCase ?? false, input.accountName);
        await listItemFor(tx, "RECOMMENDATION", input.recommendationId, null, "التوصية");
        if (input.actionId) await listItemFor(tx, "ACTION", input.actionId, null, "الإجراء");
        const companionIds = [...new Set(input.companionIds ?? [])];
        await checkCompanions(tx, actor.id, companionIds);
        const [{ n }] = await tx.$queryRaw<[{ n: bigint }]>`SELECT nextval('visit_number_seq') AS n`;
        // زيارة جديدة لخط بانتظار إعادة زيارة: بتنربط بالأصلية وبتطلّعه من القائمة
        const revisitOfId = input.revisitOfId ?? (await openRevisitFor(tx, line.lineCodeKey));
        const visit = await tx.visit.create({
          data: {
            number: Number(n),
            source: "APP",
            ownerId: actor.id,
            visitedOn,
            specialCase: input.specialCase ?? false,
            place: input.place,
            companionIds,
            tests: input.tests,
            result: input.result,
            recommendationId: input.recommendationId,
            actionId: input.actionId ?? null,
            revisitDue: input.revisitDue ? parseDay(input.revisitDue) : null,
            revisitOfId,
            lineCode: line.lineCode,
            lineCodeKey: line.lineCodeKey,
            lineId: line.lineId,
            accountName: line.accountName,
            clientUuid: field.clientUuid,
            filledAt: field.filledAt,
            lat: field.gps?.lat,
            lng: field.gps?.lng,
            gpsAccuracy: field.gps?.accuracy,
            mikrotik: field.mikrotik ?? undefined,
          },
        });
        if (field.photos?.length) cleanup = await storeImages(tx, "Visit", visit.id, field.photos, actor.id);
        audit.created("Visit", visit.id, {
          number: visit.number,
          ...(await auditView(tx, visit)),
          ...(field.photos?.length ? { photos: field.photos.length } : {}),
          ...(field.gps
            ? { gps: `${field.gps.lat.toFixed(5)}, ${field.gps.lng.toFixed(5)} (±${Math.round(field.gps.accuracy)}م)` }
            : {}),
        });
        return { visit, warning: line.warning };
      },
      db,
    );
  } catch (err) {
    // الحفظ فشل بعد كتابة الصور: بنمسحها
    if (cleanup) await (cleanup as () => Promise<void>)();
    throw err;
  }
}

/** تعديل التقرير: لصاحب الزيارة، أو لأي سفير إذا الزيارة قديمة بدون صاحب */
export async function updateReport(
  actor: Actor,
  visitId: string,
  raw: z.input<typeof reportPatchSchema>,
  db: Db = defaultPrisma,
) {
  const patch = reportPatchSchema.parse(raw);
  return withAudit(
    actor.id,
    async (tx, audit) => {
      const before = await loadVisit(tx, visitId);
      if (reportEditDecision(actor, before) !== "allowed") throw forbidden();
      const after = await applyReportPatch(tx, before, patch);
      audit.updated("Visit", visitId, await auditView(tx, before), await auditView(tx, after));
      return after;
    },
    db,
  );
}

/** بيطبّق تعديل تقرير (مستعمل كمان بالموافقة على طلب تعديل) */
export async function applyReportPatch(
  tx: Tx,
  before: Awaited<ReturnType<typeof loadVisit>>,
  patch: z.output<typeof reportPatchSchema>,
) {
  const data: Record<string, unknown> = {};
  if (patch.visitedOn !== undefined) data.visitedOn = checkDate(patch.visitedOn);
  if (patch.tests !== undefined) data.tests = patch.tests;
  if (patch.result !== undefined) data.result = patch.result;
  if (patch.place !== undefined) data.place = patch.place;
  if (patch.companionIds !== undefined) {
    const ids = [...new Set(patch.companionIds)];
    await checkCompanions(tx, before.ownerId, ids);
    data.companionIds = ids;
  }
  const codeChanged = patch.lineCode !== undefined || patch.specialCase !== undefined;
  if (codeChanged || patch.accountName !== undefined) {
    const special = patch.specialCase ?? before.specialCase;
    const code = patch.lineCode !== undefined ? patch.lineCode : before.lineCode;
    // تغيير الكود بدون اسم جديد: الاسم بيجي من الخط الجديد
    const name =
      patch.accountName !== undefined ? patch.accountName : codeChanged && !special ? null : before.accountName;
    const line = await resolveLine(tx, code, special, name);
    Object.assign(data, {
      specialCase: special,
      lineCode: line.lineCode,
      lineCodeKey: line.lineCodeKey,
      lineId: line.lineId,
      accountName: line.accountName,
    });
  }
  return tx.visit.update({ where: { id: before.id }, data });
}

/** تعديل الحالة (التوصية، الإجراء، موعد إعادة الزيارة): لأي سفير على أي زيارة */
export async function updateStatus(
  actor: Actor,
  visitId: string,
  raw: z.input<typeof statusPatchSchema>,
  db: Db = defaultPrisma,
) {
  if (!can(actor, "visits:editStatus")) throw forbidden();
  const patch = statusPatchSchema.parse(raw);
  return withAudit(
    actor.id,
    async (tx, audit) => {
      const before = await loadVisit(tx, visitId);
      const data: Record<string, unknown> = {};
      if (patch.recommendationId !== undefined) {
        await listItemFor(tx, "RECOMMENDATION", patch.recommendationId, before.recommendationId, "التوصية");
        data.recommendationId = patch.recommendationId;
      }
      if (patch.actionId !== undefined) {
        if (patch.actionId) await listItemFor(tx, "ACTION", patch.actionId, before.actionId, "الإجراء");
        data.actionId = patch.actionId;
      }
      if (patch.revisitDue !== undefined) data.revisitDue = patch.revisitDue ? parseDay(patch.revisitDue) : null;
      const after = await tx.visit.update({ where: { id: visitId }, data });
      audit.updated("Visit", visitId, await auditView(tx, before), await auditView(tx, after), {
        fields: ["recommendation", "action", "revisitDue"],
      });
      return after;
    },
    db,
  );
}

export async function deleteVisit(actor: Actor, visitId: string, db: Db = defaultPrisma) {
  if (!can(actor, "visits:delete")) throw forbidden();
  return withAudit(
    actor.id,
    async (tx, audit) => {
      const v = await loadVisit(tx, visitId);
      await tx.visit.update({ where: { id: v.id }, data: { deletedAt: new Date() } });
      audit.deleted("Visit", v.id, `زيارة رقم ${v.number}`);
    },
    db,
  );
}

export async function restoreVisit(actor: Actor, visitId: string, db: Db = defaultPrisma) {
  if (!can(actor, "visits:delete")) throw forbidden();
  return withAudit(
    actor.id,
    async (tx, audit) => {
      const v = await tx.visit.findUnique({ where: { id: visitId } });
      if (!v || !v.deletedAt) throw notFound();
      await tx.visit.update({ where: { id: v.id }, data: { deletedAt: null } });
      audit.event("RESTORE", "Visit", v.id, `زيارة رقم ${v.number}`);
    },
    db,
  );
}
