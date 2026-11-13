import { NextResponse } from "next/server";
import { handler, apiUser, parseBody } from "@/lib/api";
import { createVisit, createVisitSchema } from "@/lib/visits";

export const POST = handler(async (req) => {
  const actor = await apiUser(req);
  const { visit, warning } = await createVisit(actor, await parseBody(req, createVisitSchema));
  return NextResponse.json({ id: visit.id, number: visit.number, warning }, { status: 201 });
});
