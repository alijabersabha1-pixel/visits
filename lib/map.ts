/**
 * بيانات الخريطة: دبوس لكل خط، مكانه من آخر زيارة فيها GPS، ولونه حسب آخر توصية.
 * الزيارات المحذوفة والحالات الخاصة (بدون كود) ما بتطلع.
 */
import { z } from "zod";
import { prisma as defaultPrisma, type Db } from "./db";

export const mapFilterSchema = z.object({
  region: z.string().max(40).optional(),
  recommendationId: z.uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ownerId: z.uuid().optional(),
});
export type MapFilter = z.infer<typeof mapFilterSchema>;

export interface MapPin {
  codeKey: string;
  code: string;
  name: string | null;
  region: string | null;
  speed: string | null;
  lat: number;
  lng: number;
  accuracy: number | null;
  visits: number;
  lastVisitOn: string | null;
  lastVisitId: string;
  lastRec: string | null;
  color: string | null;
}

export interface MapVpn {
  id: string;
  networkName: string;
  ip: string;
  lat: number;
  lng: number;
  day: string;
  owner: string;
}

export interface MapData {
  pins: MapPin[];
  withoutLocation: number;
  vpn: MapVpn[];
}

export async function mapData(raw: MapFilter, db: Db = defaultPrisma): Promise<MapData> {
  const f = mapFilterSchema.parse(raw);
  // شروط الزيارات اللي بتنحسب (الفترة والسفير)
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const visitWhere = [`v."deletedAt" IS NULL`, `v."lineCodeKey" IS NOT NULL`, `v."specialCase" = false`];
  if (f.from) visitWhere.push(`v."visitedOn" >= ${p(f.from)}::date`);
  if (f.to) visitWhere.push(`v."visitedOn" <= ${p(f.to)}::date`);
  if (f.ownerId) visitWhere.push(`(v."ownerId" = ${p(f.ownerId)}::uuid OR ${p(f.ownerId)}::uuid = ANY(v."companionIds"))`);
  const vw = visitWhere.join(" AND ");

  const outer: string[] = [];
  if (f.region) outer.push(`l."region" = ${p(f.region)}`);
  if (f.recommendationId) outer.push(`last."recommendationId" = ${p(f.recommendationId)}::uuid`);
  const ow = outer.length ? `WHERE ${outer.join(" AND ")}` : "";

  const rows = await db.$queryRawUnsafe<
    Array<{
      key: string;
      code: string;
      name: string | null;
      region: string | null;
      speed: string | null;
      lat: number | null;
      lng: number | null;
      accuracy: number | null;
      visits: bigint;
      lastVisitOn: string | null;
      lastVisitId: string;
      lastRec: string | null;
      color: string | null;
    }>
  >(
    `WITH vis AS (
       SELECT v.* FROM "visits" v WHERE ${vw}
     ),
     last AS (
       SELECT DISTINCT ON (vis."lineCodeKey") vis."lineCodeKey" AS key, vis."id", vis."visitedOn",
              vis."recommendationId", vis."lineCode", vis."accountName"
         FROM vis ORDER BY vis."lineCodeKey", vis."visitedOn" DESC NULLS LAST, vis."number" DESC
     ),
     located AS (
       SELECT DISTINCT ON (vis."lineCodeKey") vis."lineCodeKey" AS key, vis."lat", vis."lng", vis."gpsAccuracy"
         FROM vis WHERE vis."lat" IS NOT NULL AND vis."lng" IS NOT NULL
         ORDER BY vis."lineCodeKey", vis."visitedOn" DESC NULLS LAST, vis."number" DESC
     ),
     counts AS (SELECT vis."lineCodeKey" AS key, count(*) AS n FROM vis GROUP BY 1)
     SELECT last.key, coalesce(l."code", last."lineCode", last.key) AS code,
            coalesce(l."accountName", last."accountName") AS name, l."region", l."speed",
            located."lat", located."lng", located."gpsAccuracy" AS accuracy,
            counts.n AS visits, to_char(last."visitedOn", 'YYYY-MM-DD') AS "lastVisitOn", last."id" AS "lastVisitId",
            r."label" AS "lastRec", r."color"
       FROM last
       JOIN counts ON counts.key = last.key
       LEFT JOIN located ON located.key = last.key
       LEFT JOIN "lines" l ON l."codeKey" = last.key
       LEFT JOIN "list_items" r ON r."id" = last."recommendationId"
       ${ow}`,
    ...params,
  );

  const pins: MapPin[] = [];
  let withoutLocation = 0;
  for (const r of rows) {
    if (r.lat === null || r.lng === null) {
      withoutLocation++;
      continue;
    }
    pins.push({
      codeKey: r.key,
      code: r.code,
      name: r.name,
      region: r.region,
      speed: r.speed,
      lat: r.lat,
      lng: r.lng,
      accuracy: r.accuracy,
      visits: Number(r.visits),
      lastVisitOn: r.lastVisitOn,
      lastVisitId: r.lastVisitId,
      lastRec: r.lastRec,
      color: r.color,
    });
  }

  const vpnRows = await db.vpnCase.findMany({
    where: {
      deletedAt: null,
      lat: { not: null },
      lng: { not: null },
      ...(f.ownerId && { ownerId: f.ownerId }),
      ...((f.from || f.to) && {
        filledAt: {
          ...(f.from && { gte: new Date(`${f.from}T00:00:00+02:00`) }),
          ...(f.to && { lt: new Date(new Date(`${f.to}T00:00:00+02:00`).getTime() + 86_400_000) }),
        },
      }),
    },
    select: { id: true, networkName: true, ip: true, lat: true, lng: true, filledAt: true, owner: { select: { displayName: true } } },
    orderBy: { filledAt: "desc" },
    take: 2000,
  });

  return {
    pins,
    withoutLocation,
    vpn: vpnRows.map((v) => ({
      id: v.id,
      networkName: v.networkName,
      ip: v.ip,
      lat: v.lat!,
      lng: v.lng!,
      day: v.filledAt.toISOString().slice(0, 10),
      owner: v.owner.displayName,
    })),
  };
}
