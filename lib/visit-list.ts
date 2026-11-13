/** قائمة الزيارات بفلاتر وترقيم صفحات. نفس الدالة لـ «كل الزيارات» و«زياراتي» وسلة المحذوفات */
import { prisma as defaultPrisma, type Db } from "./db";
import { normalizeLineCode } from "./line-code";
import { parseDay } from "./dates";
import type { Prisma } from "./generated/prisma/client";

export interface VisitFilters {
  from?: string;
  to?: string;
  ownerId?: string;
  region?: string;
  recommendationId?: string;
  actionId?: string;
  special?: boolean;
  q?: string;
  deleted?: boolean;
}

const UUID = /^[0-9a-f-]{36}$/i;

export function visitWhere(f: VisitFilters): Prisma.VisitWhereInput {
  const where: Prisma.VisitWhereInput = { deletedAt: f.deleted ? { not: null } : null };
  const from = f.from ? parseDay(f.from) : null;
  const to = f.to ? parseDay(f.to) : null;
  if (from || to) where.visitedOn = { ...(from && { gte: from }), ...(to && { lte: to }) };
  if (f.ownerId === "none") where.ownerId = null;
  else if (f.ownerId && UUID.test(f.ownerId)) where.ownerId = f.ownerId;
  if (f.region === "none") where.line = { is: { region: null } };
  else if (f.region) where.line = { is: { region: f.region } };
  if (f.recommendationId && UUID.test(f.recommendationId)) where.recommendationId = f.recommendationId;
  if (f.actionId === "none") where.actionId = null;
  else if (f.actionId && UUID.test(f.actionId)) where.actionId = f.actionId;
  if (f.special !== undefined) where.specialCase = f.special;
  const q = f.q?.trim();
  if (q) {
    const key = normalizeLineCode(q);
    where.OR = [
      ...(key.length >= 2 ? [{ lineCodeKey: { contains: key } }] : []),
      { accountName: { contains: q, mode: "insensitive" as const } },
      ...(/^\d+$/.test(q) ? [{ number: Number(q) }] : []),
    ];
  }
  return where;
}

export async function listVisits(
  f: VisitFilters,
  opts: { page?: number; pageSize?: number } = {},
  db: Db = defaultPrisma,
) {
  const pageSize = Math.min(opts.pageSize ?? 50, 200);
  const page = Math.max(1, opts.page ?? 1);
  const where = visitWhere(f);
  const [total, rows] = await Promise.all([
    db.visit.count({ where }),
    db.visit.findMany({
      where,
      orderBy: [{ visitedOn: "desc" }, { number: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        recommendation: { select: { label: true, color: true } },
        action: { select: { label: true } },
        owner: { select: { displayName: true } },
        line: { select: { region: true } },
      },
    }),
  ]);
  return { total, rows, page, pages: Math.max(1, Math.ceil(total / pageSize)) };
}
