import { NextResponse } from "next/server";
import { z } from "zod";
import { handler, apiRequire, parseBody } from "@/lib/api";
import { idParam } from "@/lib/route-params";
import { revealCredential } from "@/lib/mikrotik-credentials";

export const POST = handler<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  // الجلسة والصلاحية أول، قبل قراءة أي شي من الطلب
  const actor = await apiRequire(req, "mikrotik:reveal");
  const id = await idParam(params);
  const { accountPassword } = await parseBody(
    req,
    z.object({ accountPassword: z.string().min(1, "اكتب كلمة سر حسابك").max(200) }),
  );
  const secret = await revealCredential(actor, id, accountPassword);
  return NextResponse.json(secret, { headers: { "Cache-Control": "no-store" } });
});
