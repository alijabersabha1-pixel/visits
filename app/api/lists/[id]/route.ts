import { NextResponse } from "next/server";
import { z } from "zod";
import { handler, apiRequire, parseBody, notFound } from "@/lib/api";
import { moveListItem, setListItemActive } from "@/lib/lists";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.union([z.object({ active: z.boolean() }), z.object({ move: z.enum(["up", "down"]) })]);

export const PATCH = handler<Ctx>(async (req, { params }) => {
  const actor = await apiRequire(req, "lists:manage");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) throw notFound();
  const body = await parseBody(req, schema);
  const item =
    "active" in body ? await setListItemActive(actor.id, id, body.active) : await moveListItem(actor.id, id, body.move);
  return NextResponse.json({ item });
});
