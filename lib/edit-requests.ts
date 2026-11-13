/**
 * طلب تعديل تقرير زيارة سفير تاني. صاحب الزيارة بيشوف القديم والجديد جنب بعض وبيوافق أو بيرفض.
 * الموافقة بتطبّق التعديل باسم مقدم الطلب، والسجل بيذكر مين وافق.
 */
import { z } from "zod";
import { prisma as defaultPrisma, type Db } from "./db";
import { withAudit } from "./audit";
import { can, canDecideEditRequest, reportEditDecision, type Actor } from "./authz";
import { ApiError, forbidden, notFound } from "./errors";
import { formatDay } from "./dates";
import { applyReportPatch, auditView, loadVisit, reportPatchSchema } from "./visits";

export const editRequestSchema = z.object({
  changes: reportPatchSchema,
  reason: z.string().trim().min(2, "اكتب سبب التعديل").max(500),
});

type Change = { from: unknown; to: unknown };

/** القيمة الحالية بالتقرير، بنفس شكل التعديل المقترح */
function currentValue(v: Record<string, unknown>, field: string): unknown {
  if (field === "visitedOn") return formatDay(v.visitedOn as Date | null);
  return v[field] ?? null;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export async function requestReportEdit(
  actor: Actor,
  visitId: string,
  raw: z.input<typeof editRequestSchema>,
  db: Db = defaultPrisma,
) {
  if (!can(actor, "visits:create")) throw forbidden();
  const input = editRequestSchema.parse(raw);
  return withAudit(
    actor.id,
    async (tx, audit) => {
      const v = await loadVisit(tx, visitId);
      const decision = reportEditDecision(actor, v);
      if (decision === "allowed") throw new ApiError(400, "بتقدر تعدّل هالتقرير مباشرة");
      if (decision !== "request") throw forbidden();
      const changes: Record<string, Change> = {};
      for (const [field, to] of Object.entries(input.changes)) {
        const from = currentValue(v, field);
        if (!same(from, to)) changes[field] = { from, to };
      }
      if (!Object.keys(changes).length) throw new ApiError(400, "التعديل المقترح نفس الموجود");
      const req = await tx.editRequest.create({
        data: { visitId, requesterId: actor.id, changes: changes as object, reason: input.reason },
      });
      audit.event("CREATE", "EditRequest", req.id, `طلب تعديل على زيارة رقم ${v.number}: ${input.reason}`);
      return { ...req, changes };
    },
    db,
  );
}

export async function decideEditRequest(actor: Actor, requestId: string, approve: boolean, db: Db = defaultPrisma) {
  const req = await db.editRequest.findUnique({ where: { id: requestId }, include: { visit: true } });
  if (!req) throw notFound();
  if (!canDecideEditRequest(actor, req.visit)) throw forbidden();
  if (req.status !== "PENDING") throw new ApiError(409, "الطلب انقرر قبل");
  const decider = await db.user.findUniqueOrThrow({ where: { id: actor.id }, select: { displayName: true } });

  if (!approve) {
    return withAudit(
      actor.id,
      async (tx, audit) => {
        await tx.editRequest.update({
          where: { id: req.id },
          data: { status: "REJECTED", decidedById: actor.id, decidedAt: new Date() },
        });
        audit.event("UPDATE", "Visit", req.visitId, `رفض طلب تعديل: ${req.reason}`);
      },
      db,
    );
  }

  // التعديل بينكتب باسم مقدم الطلب
  return withAudit(
    req.requesterId,
    async (tx, audit) => {
      const before = await loadVisit(tx, req.visitId);
      const changes = req.changes as Record<string, Change>;
      for (const [field, c] of Object.entries(changes)) {
        if (!same(currentValue(before, field), c.from)) {
          throw new ApiError(409, "التقرير تغيّر من وقت الطلب. ارفض الطلب واطلب من صاحبه يقدّمه من جديد");
        }
      }
      const patch = reportPatchSchema.parse(Object.fromEntries(Object.entries(changes).map(([f, c]) => [f, c.to])));
      const after = await applyReportPatch(tx, before, patch);
      audit.updated("Visit", before.id, await auditView(tx, before), await auditView(tx, after), {
        note: `طلب تعديل بموافقة ${decider.displayName}`,
      });
      await tx.editRequest.update({
        where: { id: req.id },
        data: { status: "APPROVED", decidedById: actor.id, decidedAt: new Date() },
      });
    },
    db,
  );
}

/** الطلبات بانتظار قرار هالمستخدم (على زياراته هو) */
export function pendingRequestsFor(userId: string, db: Db = defaultPrisma) {
  return db.editRequest.findMany({
    where: { status: "PENDING", visit: { ownerId: userId, deletedAt: null } },
    include: { visit: true, requester: { select: { displayName: true } } },
    orderBy: { createdAt: "asc" },
  });
}
