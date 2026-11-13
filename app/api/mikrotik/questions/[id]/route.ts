import { NextResponse } from "next/server";
import { handler, apiRequire, parseBody } from "@/lib/api";
import { idParam } from "@/lib/route-params";
import { questionUpdateSchema, updateMikrotikQuestion } from "@/lib/mikrotik";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler<Ctx>(async (req, { params }) => {
  const actor = await apiRequire(req, "lists:manage");
  const id = await idParam(params);
  const question = await updateMikrotikQuestion(actor, id, await parseBody(req, questionUpdateSchema));
  return NextResponse.json({ question });
});
