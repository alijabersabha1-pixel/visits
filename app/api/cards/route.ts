import { NextResponse } from "next/server";
import { handler, apiUser, parseBody } from "@/lib/api";
import { cardSchema, createCard } from "@/lib/cards";

export const POST = handler(async (req) => {
  const card = await createCard(await apiUser(req), await parseBody(req, cardSchema));
  return NextResponse.json({ id: card.id }, { status: 201 });
});
