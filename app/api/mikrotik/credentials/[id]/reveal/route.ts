import { NextResponse } from "next/server";
import { z } from "zod";
import { handler, apiUser, parseBody } from "@/lib/api";
import { idParam } from "@/lib/route-params";
import { revealCredential } from "@/lib/mikrotik-credentials";

export const POST = handler<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { accountPassword } = await parseBody(
    req,
    z.object({ accountPassword: z.string().min(1, "اكتب كلمة سر حسابك").max(200) }),
  );
  const secret = await revealCredential(await apiUser(req), await idParam(params), accountPassword);
  return NextResponse.json(secret, { headers: { "Cache-Control": "no-store" } });
});
