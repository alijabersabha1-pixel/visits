import { NextResponse } from "next/server";
import { z } from "zod";
import { handler, apiRequire, parseBody, notFound } from "@/lib/api";
import { updateUser, updateUserSchema } from "@/lib/users";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler<Ctx>(async (req, { params }) => {
  const actor = await apiRequire(req, "users:manage");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) throw notFound();
  const input = await parseBody(req, updateUserSchema);
  const user = await updateUser(actor.id, id, input);
  return NextResponse.json({ user });
});
