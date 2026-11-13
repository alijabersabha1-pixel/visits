import { NextResponse } from "next/server";
import { handler, apiUser, parseBody } from "@/lib/api";
import { idParam } from "@/lib/route-params";
import { editRequestSchema, requestReportEdit } from "@/lib/edit-requests";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (req, { params }) => {
  const actor = await apiUser(req);
  const r = await requestReportEdit(actor, await idParam(params), await parseBody(req, editRequestSchema));
  return NextResponse.json({ id: r.id }, { status: 201 });
});
