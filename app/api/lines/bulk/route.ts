import { NextResponse } from "next/server";
import { z } from "zod";
import { handler, apiRequire, parseBody } from "@/lib/api";
import { bulkLookup } from "@/lib/search";

export const POST = handler(async (req) => {
  await apiRequire(req, "visits:view");
  const { codes } = await parseBody(req, z.object({ codes: z.string().max(100_000) }));
  return NextResponse.json({ rows: await bulkLookup(codes) });
});
