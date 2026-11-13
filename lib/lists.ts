/**
 * القوائم القابلة للتعديل (التوصية، الإجراء). السفراء بيضيفوا ويرتبوا ويوقفوا.
 * ما في حذف ولا تعديل للنص: القيمة الموقوفة بتختفي من الاختيار وبتضل ظاهرة بالزيارات القديمة.
 */
import { z } from "zod";
import { prisma as defaultPrisma, type Db, type Tx } from "./db";
import { withAudit } from "./audit";
import { ApiError, notFound } from "./errors";

export const LIST_KINDS = ["RECOMMENDATION", "ACTION"] as const;
export type ListKind = (typeof LIST_KINDS)[number];

export const LIST_LABEL: Record<ListKind, string> = { RECOMMENDATION: "التوصية", ACTION: "الإجراء المطبق" };

export const addListItemSchema = z.object({
  kind: z.enum(LIST_KINDS),
  label: z.string().trim().min(2, "اكتب القيمة").max(100, "القيمة طويلة"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "لون غير صالح")
    .optional(),
});

export function listItems(kind: ListKind, opts: { includeInactive?: boolean } = {}, db: Db | Tx = defaultPrisma) {
  return db.listItem.findMany({
    where: { kind, ...(opts.includeInactive ? {} : { active: true }) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function addListItem(actorId: string, raw: z.input<typeof addListItemSchema>, db: Db = defaultPrisma) {
  const input = addListItemSchema.parse(raw);
  return withAudit(
    actorId,
    async (tx, audit) => {
      const exists = await tx.listItem.findUnique({ where: { kind_label: { kind: input.kind, label: input.label } } });
      if (exists)
        throw new ApiError(409, exists.active ? "القيمة موجودة" : "القيمة موجودة بس موقوفة، رجّعها بدل ما تضيفها");
      const last = await tx.listItem.aggregate({
        where: { kind: input.kind, active: true },
        _max: { sortOrder: true },
      });
      const item = await tx.listItem.create({
        data: { kind: input.kind, label: input.label, color: input.color, sortOrder: (last._max.sortOrder ?? 0) + 1 },
      });
      audit.created("ListItem", item.id, { kind: item.kind, label: item.label, color: item.color });
      return item;
    },
    db,
  );
}

export async function setListItemActive(actorId: string, id: string, active: boolean, db: Db = defaultPrisma) {
  return withAudit(
    actorId,
    async (tx, audit) => {
      const before = await tx.listItem.findUnique({ where: { id } });
      if (!before) throw notFound();
      const after = await tx.listItem.update({ where: { id }, data: { active } });
      audit.updated("ListItem", id, before, after, { fields: ["active"], note: before.label });
      return after;
    },
    db,
  );
}

/** بيبدّل مكان القيمة مع اللي فوقها أو تحتها (بين القيم الفعّالة) */
export async function moveListItem(actorId: string, id: string, direction: "up" | "down", db: Db = defaultPrisma) {
  return withAudit(
    actorId,
    async (tx, audit) => {
      const item = await tx.listItem.findUnique({ where: { id } });
      if (!item) throw notFound();
      const siblings = await listItems(item.kind, {}, tx);
      const i = siblings.findIndex((s) => s.id === id);
      const j = direction === "up" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= siblings.length) return item;
      // ترقيم من جديد عشان ما يصير في أرقام مكررة
      const order = siblings.map((s) => s.id);
      [order[i], order[j]] = [order[j], order[i]];
      for (const [n, sid] of order.entries())
        await tx.listItem.update({ where: { id: sid }, data: { sortOrder: n + 1 } });
      audit.event("UPDATE", "ListItem", id, `ترتيب: ${item.label} ${direction === "up" ? "لفوق" : "لتحت"}`);
      return item;
    },
    db,
  );
}
