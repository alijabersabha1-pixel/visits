import { NextResponse } from "next/server";
import { handler, apiRequire, parseBody } from "@/lib/api";
import { addListItem, addListItemSchema } from "@/lib/lists";

export const POST = handler(async (req) => {
  const actor = await apiRequire(req, "lists:manage");
  const item = await addListItem(actor.id, await parseBody(req, addListItemSchema));
  return NextResponse.json({ item }, { status: 201 });
});
