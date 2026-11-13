import { NextResponse } from "next/server";
import { z } from "zod";
import { handler, apiUser, parseBody } from "@/lib/api";
import { idParam } from "@/lib/route-params";
import { decideEditRequest } from "@/lib/edit-requests";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (req, { params }) => {
  const actor = await apiUser(req);
  const { approve } = await parseBody(req, z.object({ approve: z.boolean() }));
  await decideEditRequest(actor, await idParam(params), approve);
  return NextResponse.json({ ok: true });
});
