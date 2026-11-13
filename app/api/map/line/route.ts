import { NextResponse } from "next/server";
import { handler, apiRequire, notFound } from "@/lib/api";
import { lookupLine } from "@/lib/search";

/** اللوحة الجانبية بالخريطة: بيانات الخط وآخر زياراته */
export const GET = handler(async (req) => {
  await apiRequire(req, "stats:view");
  const r = await lookupLine(req.nextUrl.searchParams.get("code") ?? "");
  if (!r) throw notFound();
  const l = r.line;
  return NextResponse.json({
    codeKey: r.codeKey,
    line: l && {
      code: l.code,
      accountName: l.accountName,
      speed: l.speed,
      fixedIp: l.fixedIp,
      region: l.region,
      locality: l.locality,
      accountManager: l.accountManager,
    },
    total: r.visits.length,
    visits: r.visits.slice(0, 10).map((v) => ({
      id: v.id,
      day: v.visitedOn?.toISOString().slice(0, 10) ?? null,
      owner: v.owner?.displayName ?? null,
      rec: v.recommendation?.label ?? null,
      color: v.recommendation?.color ?? null,
      action: v.action?.label ?? null,
    })),
  });
});
