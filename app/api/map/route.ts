import { NextResponse } from "next/server";
import { handler, apiRequire } from "@/lib/api";
import { mapData, mapFilterSchema } from "@/lib/map";

export const GET = handler(async (req) => {
  await apiRequire(req, "stats:view");
  const sp = req.nextUrl.searchParams;
  const pick = (k: string) => sp.get(k) || undefined;
  const filter = mapFilterSchema.parse({
    region: pick("region"),
    recommendationId: pick("rec"),
    from: pick("from"),
    to: pick("to"),
    ownerId: pick("owner"),
  });
  return NextResponse.json(await mapData(filter));
});
