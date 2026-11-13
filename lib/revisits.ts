/**
 * قائمة «بانتظار إعادة زيارة». الزيارة مفتوحة إذا توصيتها «إعادة زيارة» أو «زيارة غير ناجحة»،
 * وما في بعدها زيارة لنفس الخط ولا زيارة مربوطة فيها. ما بنخزن «مغلقة»: بتنحسب، فما بتتلخبط.
 */
import { z } from "zod";
import { prisma as defaultPrisma, type Db, type Tx } from "./db";
import { withAudit } from "./audit";
import { can, type Actor } from "./authz";
import { ApiError, forbidden, notFound } from "./errors";

export const REVISIT_LABELS = ["إعادة زيارة", "زيارة غير ناجحة"] as const;

export interface OpenRevisit {
  id: string;
  number: number;
  lineCode: string | null;
  accountName: string | null;
  region: string | null;
  visitedOn: Date | null;
  recommendation: string;
  revisitDue: Date | null;
  postponeCount: number;
  lastPostponeReason: string | null;
}

const REGION_ORDER = `CASE l."region" WHEN 'غزة' THEN 1 WHEN 'الوسطى' THEN 2 WHEN 'الجنوب' THEN 3 ELSE 4 END`;

export async function openRevisits(
  opts: { region?: string; lineCodeKey?: string } = {},
  db: Db | Tx = defaultPrisma,
): Promise<OpenRevisit[]> {
  const rows = await db.$queryRawUnsafe<Array<OpenRevisit & { postponeCount: bigint }>>(
    `SELECT v."id", v."number", v."lineCode", v."accountName", l."region", v."visitedOn", r."label" AS "recommendation",
            v."revisitDue",
            (SELECT count(*) FROM "revisit_postponements" p WHERE p."visitId" = v."id") AS "postponeCount",
            (SELECT p."reason" FROM "revisit_postponements" p WHERE p."visitId" = v."id" ORDER BY p."createdAt" DESC LIMIT 1) AS "lastPostponeReason"
       FROM "visits" v
       JOIN "list_items" r ON r."id" = v."recommendationId"
       LEFT JOIN "lines" l ON l."id" = v."lineId"
      WHERE v."deletedAt" IS NULL
        AND r."label" = ANY($1::text[])
        AND ($2::text IS NULL OR l."region" = $2)
        AND ($3::text IS NULL OR v."lineCodeKey" = $3)
        AND NOT EXISTS (
          SELECT 1 FROM "visits" n
           WHERE n."deletedAt" IS NULL AND n."id" <> v."id"
             AND (n."revisitOfId" = v."id"
                  OR (v."lineCodeKey" IS NOT NULL AND n."lineCodeKey" = v."lineCodeKey"
                      AND (n."visitedOn" > v."visitedOn" OR (n."visitedOn" = v."visitedOn" AND n."number" > v."number"))))
        )
      ORDER BY ${REGION_ORDER}, v."revisitDue" ASC NULLS LAST, v."visitedOn" ASC, v."number" ASC`,
    [...REVISIT_LABELS],
    opts.region ?? null,
    opts.lineCodeKey ?? null,
  );
  return rows.map((r) => ({ ...r, postponeCount: Number(r.postponeCount) }));
}

/** أقدم زيارة مفتوحة لنفس الخط: الزيارة الجديدة بتنربط فيها */
export async function openRevisitFor(tx: Tx, lineCodeKey: string | null): Promise<string | null> {
  if (!lineCodeKey) return null;
  const [first] = await openRevisits({ lineCodeKey }, tx);
  return first?.id ?? null;
}

export const postponeSchema = z.object({ reason: z.string().trim().min(2, "اكتب سبب التأجيل").max(300) });

export async function postponeRevisit(actor: Actor, visitId: string, reason: string, db: Db = defaultPrisma) {
  if (!can(actor, "visits:editStatus")) throw forbidden();
  const input = postponeSchema.parse({ reason });
  return withAudit(
    actor.id,
    async (tx, audit) => {
      const v = await tx.visit.findUnique({ where: { id: visitId } });
      if (!v || v.deletedAt) throw notFound();
      const open = await openRevisits({ lineCodeKey: v.lineCodeKey ?? undefined }, tx);
      if (!open.some((o) => o.id === v.id)) throw new ApiError(409, "الزيارة مش بقائمة إعادة الزيارة");
      const p = await tx.revisitPostponement.create({ data: { visitId, reason: input.reason, byId: actor.id } });
      audit.event("UPDATE", "Visit", visitId, `تأجيل إعادة الزيارة: ${input.reason}`);
      return p;
    },
    db,
  );
}
