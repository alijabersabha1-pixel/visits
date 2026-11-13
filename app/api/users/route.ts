import { NextResponse } from "next/server";
import { handler, apiRequire, parseBody } from "@/lib/api";
import { prisma } from "@/lib/db";
import { createUser, createUserSchema, publicUserSelect } from "@/lib/users";

export const GET = handler(async (req) => {
  await apiRequire(req, "users:view");
  const users = await prisma.user.findMany({
    select: publicUserSelect,
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ users });
});

export const POST = handler(async (req) => {
  const actor = await apiRequire(req, "users:manage");
  const input = await parseBody(req, createUserSchema);
  const { user, tempPassword } = await createUser(actor.id, input);
  return NextResponse.json({ user, tempPassword }, { status: 201, headers: { "Cache-Control": "no-store" } });
});
