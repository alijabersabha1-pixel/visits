/** البحث بالـ Line Code: كود واحد (بطاقة الخط) أو لغاية 1000 كود (متل ورقة All Visits بالإكسل) */
import { prisma as defaultPrisma, type Db } from "./db";
import { ApiError } from "./errors";
import { accountKeyOf, isValidLineCode, normalizeLineCode } from "./line-code";

const visitInclude = {
  recommendation: { select: { label: true, color: true } },
  action: { select: { label: true } },
  owner: { select: { displayName: true } },
} as const;

export async function lookupLine(raw: string, db: Db = defaultPrisma) {
  const codeKey = normalizeLineCode(raw);
  if (!isValidLineCode(raw)) return null;
  const line = await db.line.findUnique({ where: { codeKey } });
  const accountKey = line?.accountKey ?? accountKeyOf(raw);
  const [visits, siblings, managerLog, target] = await Promise.all([
    db.visit.findMany({
      where: { lineCodeKey: codeKey, deletedAt: null },
      orderBy: [{ visitedOn: "desc" }, { number: "desc" }],
      include: visitInclude,
    }),
    db.line.findMany({ where: { accountKey, codeKey: { not: codeKey } }, orderBy: { codeKey: "asc" }, take: 50 }),
    line
      ? db.managerLogEntry.findMany({
          where: { lineId: line.id },
          orderBy: [{ visitDate: "desc" }, { rowKey: "desc" }],
        })
      : [],
    line ? db.monthTarget.findFirst({ where: { lineId: line.id }, orderBy: { month: "desc" } }) : null,
  ]);
  return { codeKey, line, visits, siblings, managerLog, target };
}

export type BulkStatus = "FOUND" | "NOT_FOUND" | "DUPLICATE" | "INVALID";

export interface BulkRow {
  input: string;
  codeKey: string;
  status: BulkStatus;
  accountName: string | null;
  visits: number;
  lastVisit: Date | null;
  lastRecommendation: string | null;
}

export const MAX_BULK_CODES = 1000;

/** كود بكل سطر (أو مفصولين بفاصلة أو Tab من الإكسل) */
export async function bulkLookup(text: string, db: Db = defaultPrisma): Promise<BulkRow[]> {
  const inputs = text
    .split(/[\n\r,\t;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (inputs.length > MAX_BULK_CODES) throw new ApiError(400, `الحد ${MAX_BULK_CODES} كود بالمرة`);
  const keys = [...new Set(inputs.filter(isValidLineCode).map(normalizeLineCode))];

  const [lines, counts, latest] = await Promise.all([
    db.line.findMany({ where: { codeKey: { in: keys } }, select: { codeKey: true, accountName: true } }),
    db.visit.groupBy({ by: ["lineCodeKey"], where: { lineCodeKey: { in: keys }, deletedAt: null }, _count: true }),
    db.$queryRaw<
      Array<{ lineCodeKey: string; visitedOn: Date | null; label: string | null; accountName: string | null }>
    >`
      SELECT DISTINCT ON (v."lineCodeKey") v."lineCodeKey", v."visitedOn", r."label", v."accountName"
        FROM "visits" v LEFT JOIN "list_items" r ON r."id" = v."recommendationId"
       WHERE v."deletedAt" IS NULL AND v."lineCodeKey" = ANY(${keys}::text[])
       ORDER BY v."lineCodeKey", v."visitedOn" DESC NULLS LAST, v."number" DESC`,
  ]);
  const lineBy = new Map(lines.map((l) => [l.codeKey, l]));
  const countBy = new Map(counts.map((c) => [c.lineCodeKey!, c._count]));
  const lastBy = new Map(latest.map((l) => [l.lineCodeKey, l]));

  const seen = new Set<string>();
  return inputs.map((input) => {
    if (!isValidLineCode(input)) {
      return {
        input,
        codeKey: "",
        status: "INVALID",
        accountName: null,
        visits: 0,
        lastVisit: null,
        lastRecommendation: null,
      };
    }
    const codeKey = normalizeLineCode(input);
    const visits = countBy.get(codeKey) ?? 0;
    const last = lastBy.get(codeKey);
    const status: BulkStatus = seen.has(codeKey)
      ? "DUPLICATE"
      : lineBy.has(codeKey) || visits > 0
        ? "FOUND"
        : "NOT_FOUND";
    seen.add(codeKey);
    return {
      input,
      codeKey,
      status,
      accountName: lineBy.get(codeKey)?.accountName ?? last?.accountName ?? null,
      visits,
      lastVisit: last?.visitedOn ?? null,
      lastRecommendation: last?.label ?? null,
    };
  });
}
