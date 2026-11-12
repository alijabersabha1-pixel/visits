import { NextResponse } from "next/server";
import { z } from "zod";
import { handler, apiRequire, notFound } from "@/lib/api";
import { revokeSessions } from "@/lib/users";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (req, { params }) => {
  const actor = await apiRequire(req, "users:manage");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) throw notFound();
  return NextResponse.json(await revokeSessions(actor.id, id));
});
