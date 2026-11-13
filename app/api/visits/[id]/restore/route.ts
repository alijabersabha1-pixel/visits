import { NextResponse } from "next/server";
import { handler, apiUser } from "@/lib/api";
import { idParam } from "@/lib/route-params";
import { restoreVisit } from "@/lib/visits";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (req, { params }) => {
  await restoreVisit(await apiUser(req), await idParam(params));
  return NextResponse.json({ ok: true });
});
