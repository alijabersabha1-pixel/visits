import { NextResponse } from "next/server";
import { handler, apiUser, parseBody } from "@/lib/api";
import { credentialSchema, saveCredential } from "@/lib/mikrotik-credentials";

export const POST = handler(async (req) => {
  const saved = await saveCredential(await apiUser(req), await parseBody(req, credentialSchema));
  return NextResponse.json({ id: saved.id, username: saved.username }, { status: 201 });
});
