import { NextResponse } from "next/server";
import { z } from "zod";
import { handler, apiRequire, notFound } from "@/lib/api";
import { resetPassword } from "@/lib/users";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (req, { params }) => {
  const actor = await apiRequire(req, "users:manage");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) throw notFound();
  const { tempPassword } = await resetPassword(actor.id, id);
  // كلمة السر المؤقتة بتنعرض مرة وحدة للمسؤول وما بتنحفظ بأي مكان
  return NextResponse.json({ tempPassword }, { headers: { "Cache-Control": "no-store" } });
});
