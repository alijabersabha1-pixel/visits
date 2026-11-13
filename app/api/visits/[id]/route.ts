import { NextResponse } from "next/server";
import { z } from "zod";
import { handler, apiUser, parseBody } from "@/lib/api";
import { idParam } from "@/lib/route-params";
import { deleteVisit, reportPatchSchema, statusPatchSchema, updateReport, updateStatus } from "@/lib/visits";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.union([z.object({ report: reportPatchSchema }), z.object({ status: statusPatchSchema })]);

/** { report: {...} } لتعديل التقرير، أو { status: {...} } لتعديل الحالة */
export const PATCH = handler<Ctx>(async (req, { params }) => {
  const actor = await apiUser(req);
  const id = await idParam(params);
  const body = await parseBody(req, schema);
  if ("report" in body) await updateReport(actor, id, body.report);
  else await updateStatus(actor, id, body.status);
  return NextResponse.json({ ok: true });
});

export const DELETE = handler<Ctx>(async (req, { params }) => {
  await deleteVisit(await apiUser(req), await idParam(params));
  return NextResponse.json({ ok: true });
});
