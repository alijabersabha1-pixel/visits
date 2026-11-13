import { NextResponse } from "next/server";
import { handler, apiUser, parseBody } from "@/lib/api";
import { createVpnCase, vpnSchema } from "@/lib/vpn";

export const POST = handler(async (req) => {
  const { vpn, previous } = await createVpnCase(await apiUser(req), await parseBody(req, vpnSchema));
  return NextResponse.json({ id: vpn.id, previous: previous.length }, { status: 201 });
});
