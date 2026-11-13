import { NextResponse } from "next/server";
import { handler, apiRequire, parseBody } from "@/lib/api";
import { createMikrotikQuestion, questionCreateSchema } from "@/lib/mikrotik";

export const POST = handler(async (req) => {
  const actor = await apiRequire(req, "lists:manage");
  const question = await createMikrotikQuestion(actor, await parseBody(req, questionCreateSchema));
  return NextResponse.json({ question }, { status: 201 });
});
