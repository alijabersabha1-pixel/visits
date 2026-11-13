import { NextResponse } from "next/server";
import { handler, apiUser, parseBody } from "@/lib/api";
import { idParam } from "@/lib/route-params";
import { postponeRevisit, postponeSchema } from "@/lib/revisits";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (req, { params }) => {
  const actor = await apiUser(req);
  const { reason } = await parseBody(req, postponeSchema);
  await postponeRevisit(actor, await idParam(params), reason);
  return NextResponse.json({ ok: true }, { status: 201 });
});
