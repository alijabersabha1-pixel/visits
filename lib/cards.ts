/** شراء البطاقات: كل بطاقة بسعرها، وملخص يومي، وتقرير شهري للصرف */
import { z } from "zod";
import { prisma as defaultPrisma, type Db } from "./db";
import { withAudit } from "./audit";
import { can, type Actor } from "./authz";
import { ApiError, forbidden } from "./errors";
import { gpsSchema } from "./geo";
import { storeImages, type DecodedImage } from "./attachments";
import { TIME_ZONE } from "./dates";

export const cardSchema = z
  .object({
    name: z.string().trim().min(1, "اكتب اسم البطاقة أو الشبكة").max(200),
    ip: z
      .string()
      .trim()
      .max(60)
      .nullish()
      .transform((v) => v || null),
    price: z.coerce
      .number({ error: "السعر لازم يكون رقم" })
      .gt(0, "السعر لازم يكون أكبر من صفر")
      .max(10_000, "السعر كبير كتير"),
    linkKind: z.enum(["VISIT", "EXTERNAL", "VPN", "NONE"]).default("NONE"),
    linkRef: z.uuid().nullish(),
    gps: gpsSchema,
  })
  .refine((v) => (v.linkKind === "VISIT" || v.linkKind === "VPN" ? !!v.linkRef : true), {
    message: "اختار الزيارة أو حالة الـ VPN المرتبطة",
    path: ["linkRef"],
  });

export interface CardField {
  clientUuid?: string;
  filledAt?: Date;
  photo?: DecodedImage | null;
}

export async function createCard(
  actor: Actor,
  raw: z.input<typeof cardSchema>,
  field: CardField = {},
  db: Db = defaultPrisma,
) {
  if (!can(actor, "visits:create")) throw forbidden();
  const input = cardSchema.parse(raw);
  let cleanup: (() => Promise<void>) | null = null;
  try {
    return await withAudit(
      actor.id,
      async (tx, audit) => {
        const card = await tx.cardPurchase.create({
          data: {
            clientUuid: field.clientUuid,
            filledAt: field.filledAt ?? new Date(),
            ownerId: actor.id,
            name: input.name,
            ip: input.ip,
            price: input.price,
            linkKind: input.linkKind,
            linkRef: input.linkKind === "VISIT" || input.linkKind === "VPN" ? input.linkRef : null,
            lat: input.gps?.lat,
            lng: input.gps?.lng,
          },
        });
        if (field.photo) cleanup = await storeImages(tx, "Card", card.id, [field.photo], actor.id);
        audit.created("CardPurchase", card.id, {
          name: card.name,
          price: input.price.toFixed(2),
          linkKind: card.linkKind,
        });
        return card;
      },
      db,
    );
  } catch (err) {
    if (cleanup) await (cleanup as () => Promise<void>)();
    throw err;
  }
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthCheck(month: string) {
  if (!MONTH.test(month)) throw new ApiError(400, "الشهر لازم يكون بصيغة 2026-11");
}

/** ملخص يومي (حسب يوم فلسطين)، الأحدث أول */
export async function cardDaily(opts: { month: string; ownerId?: string }, db: Db = defaultPrisma) {
  monthCheck(opts.month);
  const rows = await db.$queryRaw<Array<{ day: string; count: bigint; total: string }>>`
    SELECT to_char(("filledAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TIME_ZONE}, 'YYYY-MM-DD') AS day,
           count(*) AS count, sum("price")::text AS total
      FROM "card_purchases"
     WHERE "deletedAt" IS NULL
       AND to_char(("filledAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TIME_ZONE}, 'YYYY-MM') = ${opts.month}
       AND (${opts.ownerId ?? null}::uuid IS NULL OR "ownerId" = ${opts.ownerId ?? null}::uuid)
     GROUP BY 1 ORDER BY 1 DESC`;
  return rows.map((r) => ({ day: r.day, count: Number(r.count), total: Number(r.total) }));
}

/** تقرير الشهر للصرف: كل بطاقة بتفاصيلها + المجموع، والمجموع لكل سفير */
export async function cardMonthly(opts: { month: string; ownerId?: string }, db: Db = defaultPrisma) {
  monthCheck(opts.month);
  const ids = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "card_purchases"
     WHERE "deletedAt" IS NULL
       AND to_char(("filledAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TIME_ZONE}, 'YYYY-MM') = ${opts.month}
       AND (${opts.ownerId ?? null}::uuid IS NULL OR "ownerId" = ${opts.ownerId ?? null}::uuid)`;
  const rows = await db.cardPurchase.findMany({
    where: { id: { in: ids.map((i) => i.id) } },
    include: { owner: { select: { id: true, displayName: true } } },
    orderBy: [{ filledAt: "asc" }],
  });
  const byOwner = new Map<string, { ownerId: string; name: string; count: number; total: number }>();
  let total = 0;
  for (const r of rows) {
    const price = Number(r.price);
    total += price;
    const o = byOwner.get(r.ownerId) ?? { ownerId: r.ownerId, name: r.owner.displayName, count: 0, total: 0 };
    o.count++;
    o.total = Math.round((o.total + price) * 100) / 100;
    byOwner.set(r.ownerId, o);
  }
  return {
    rows,
    total: Math.round(total * 100) / 100,
    byOwner: [...byOwner.values()].sort((a, b) => b.total - a.total),
  };
}
