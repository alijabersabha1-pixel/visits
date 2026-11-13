/**
 * أرقام الرئيسية. كل رقم استعلام مستقل على نفس البيانات (الزيارات غير المحذوفة)،
 * عشان يكون مطابق لما تعدّه بنفسك من صفحة الزيارات.
 */
import { prisma as defaultPrisma, type Db } from "./db";
import { TIME_ZONE } from "./dates";
import { openRevisits } from "./revisits";
import { linesNeedingAccess } from "./mikrotik";
import { pendingRequestsFor } from "./edit-requests";

const MONTHS_BACK = 12;

/** بداية أسبوع العمل (السبت) لليوم المعطى */
export function weekStart(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 1) % 7));
  return d.toISOString().slice(0, 10);
}

/** قائمة آخر 12 شهر، الأقدم أول، آخرها شهر اليوم */
function monthsBack(today: string): string[] {
  const [y, m] = today.split("-").map(Number);
  const out: string[] = [];
  for (let i = MONTHS_BACK - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

const rate = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10);

export interface DashboardStats {
  visits: { today: number; week: number; month: number; total: number };
  violations: { month: number; monthRate: number; total: number; totalRate: number };
  openRevisits: number;
  cards: { monthCount: number; monthTotal: number };
  monthly: Array<{ month: string; total: number; parts: Array<{ label: string; color: string | null; count: number }> }>;
  actions: Array<{ label: string; count: number }>;
  byAmbassador: Array<{ name: string; month: number; total: number }>;
  alerts: {
    violationsNoAction: Array<{ id: string; number: number; lineCode: string | null; accountName: string | null }>;
    postponedTwice: Array<{ id: string; number: number; lineCode: string | null; postponeCount: number }>;
    needAccess: number;
    pendingRequests: number;
  };
}

const VIOLATION = "يوجد تجاوز";

export async function dashboardStats(
  opts: { today: string; userId: string },
  db: Db = defaultPrisma,
): Promise<DashboardStats> {
  const { today, userId } = opts;
  const month = today.slice(0, 7);
  const from = weekStart(today);
  const months = monthsBack(today);
  const since = `${months[0]}-01`;

  const day = (col = "visitedOn") => `to_char("${col}", 'YYYY-MM-DD')`;
  const alive = `"deletedAt" IS NULL`;

  const [counts, byMonth, actions, ambassadors, cards, violationsNoAction, revisits, needAccess, pending] =
    await Promise.all([
      db.$queryRawUnsafe<[{ today: bigint; week: bigint; month: bigint; total: bigint; vmonth: bigint; vtotal: bigint }]>(
        `SELECT count(*) FILTER (WHERE ${day()} = $1)                       AS today,
                count(*) FILTER (WHERE ${day()} >= $2)                      AS week,
                count(*) FILTER (WHERE to_char("visitedOn",'YYYY-MM') = $3) AS month,
                count(*)                                                    AS total,
                count(*) FILTER (WHERE to_char("visitedOn",'YYYY-MM') = $3 AND r."label" = $4) AS vmonth,
                count(*) FILTER (WHERE r."label" = $4)                      AS vtotal
           FROM "visits" v LEFT JOIN "list_items" r ON r."id" = v."recommendationId"
          WHERE v.${alive}`,
        today,
        from,
        month,
        VIOLATION,
      ),
      db.$queryRawUnsafe<Array<{ month: string; label: string; color: string | null; count: bigint }>>(
        `SELECT to_char(v."visitedOn",'YYYY-MM') AS month, coalesce(r."label",'بدون توصية') AS label, r."color", count(*) AS count
           FROM "visits" v LEFT JOIN "list_items" r ON r."id" = v."recommendationId"
          WHERE v.${alive} AND v."visitedOn" >= $1::date
          GROUP BY 1, 2, 3`,
        since,
      ),
      db.$queryRawUnsafe<Array<{ label: string; count: bigint }>>(
        // «بدون إجراء» دايماً بالآخر، والباقي من الأكتر للأقل
        `SELECT coalesce(a."label",'بدون إجراء') AS label, count(*) AS count
           FROM "visits" v LEFT JOIN "list_items" a ON a."id" = v."actionId"
          WHERE v.${alive}
          GROUP BY a."label" ORDER BY (a."label" IS NULL), count DESC, 1`,
      ),
      db.$queryRawUnsafe<Array<{ name: string; month: bigint; total: bigint }>>(
        `SELECT u."displayName" AS name,
                count(v."id") FILTER (WHERE to_char(v."visitedOn",'YYYY-MM') = $1) AS month,
                count(v."id") AS total
           FROM "users" u LEFT JOIN "visits" v ON v."ownerId" = u."id" AND v.${alive}
          WHERE u."role" = 'AMBASSADOR'
          GROUP BY 1 ORDER BY total DESC, 1`,
        month,
      ),
      db.$queryRawUnsafe<[{ count: bigint; total: string | null }]>(
        `SELECT count(*) AS count, coalesce(sum("price"),0)::text AS total
           FROM "card_purchases"
          WHERE ${alive}
            AND to_char(("filledAt" AT TIME ZONE 'UTC') AT TIME ZONE '${TIME_ZONE}', 'YYYY-MM') = $1`,
        month,
      ),
      db.$queryRawUnsafe<Array<{ id: string; number: number; lineCode: string | null; accountName: string | null }>>(
        `SELECT v."id", v."number", v."lineCode", v."accountName"
           FROM "visits" v JOIN "list_items" r ON r."id" = v."recommendationId"
          WHERE v.${alive} AND r."label" = $1 AND v."actionId" IS NULL
          ORDER BY v."visitedOn" DESC, v."number" DESC LIMIT 50`,
        VIOLATION,
      ),
      openRevisits({}, db),
      linesNeedingAccess(db),
      pendingRequestsFor(userId, db),
    ]);

  const c = counts[0];
  const parts = new Map<string, Map<string, { color: string | null; count: number }>>();
  for (const r of byMonth) {
    const m = parts.get(r.month) ?? new Map();
    m.set(r.label, { color: r.color, count: Number(r.count) });
    parts.set(r.month, m);
  }

  return {
    visits: { today: Number(c.today), week: Number(c.week), month: Number(c.month), total: Number(c.total) },
    violations: {
      month: Number(c.vmonth),
      monthRate: rate(Number(c.vmonth), Number(c.month)),
      total: Number(c.vtotal),
      totalRate: rate(Number(c.vtotal), Number(c.total)),
    },
    openRevisits: revisits.length,
    cards: { monthCount: Number(cards[0].count), monthTotal: Number(cards[0].total ?? 0) },
    monthly: months.map((m) => {
      const inMonth = [...(parts.get(m) ?? new Map())].map(([label, v]) => ({ label, ...v }));
      return { month: m, total: inMonth.reduce((s, p) => s + p.count, 0), parts: inMonth };
    }),
    actions: actions.map((a) => ({ label: a.label, count: Number(a.count) })),
    byAmbassador: ambassadors.map((a) => ({ name: a.name, month: Number(a.month), total: Number(a.total) })),
    alerts: {
      violationsNoAction,
      postponedTwice: revisits
        .filter((r) => r.postponeCount >= 2)
        .map((r) => ({ id: r.id, number: r.number, lineCode: r.lineCode, postponeCount: r.postponeCount })),
      needAccess: needAccess.length,
      pendingRequests: pending.length,
    },
  };
}
