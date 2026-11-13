import { NextResponse } from "next/server";
import { handler, apiUser } from "@/lib/api";
import { can } from "@/lib/authz";
import { listItems } from "@/lib/lists";
import { mikrotikQuestions } from "@/lib/mikrotik";
import { prisma } from "@/lib/db";

/** كل اللي بيحتاجه تطبيق الجوال ليعبّي بدون نت. بينحفظ بالجوال ويتحدّث كل ما يفتح التطبيق مع نت */
export const GET = handler(async (req) => {
  const me = await apiUser(req);
  const [recommendations, actions, ambassadors, questions] = await Promise.all([
    listItems("RECOMMENDATION"),
    listItems("ACTION"),
    prisma.user.findMany({
      where: { role: "AMBASSADOR", active: true },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    mikrotikQuestions(),
  ]);
  return NextResponse.json(
    {
      me: { id: me.id, displayName: me.displayName, canCreate: can(me, "visits:create") },
      recommendations: recommendations.map(({ id, label }) => ({ id, label })),
      actions: actions.map(({ id, label }) => ({ id, label })),
      ambassadors,
      mikrotikQuestions: questions.map(({ id, text, options }) => ({ id, text, options })),
      savedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
});
