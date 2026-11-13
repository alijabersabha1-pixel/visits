/**
 * استقبال عنصر من طابور الجوال (زيارة، حالة VPN، بطاقة).
 * كل عنصر إله رقم فريد (uuid) من الجوال، مخزّن بعمود unique: لو انبعت مرتين، أو مرتين بنفس اللحظة،
 * بينحفظ مرة وحدة والتانية بترجع «duplicate» بنفس الرقم.
 */
import { z } from "zod";
import { prisma as defaultPrisma, type Db } from "./db";
import { can, type Actor } from "./authz";
import { ApiError, forbidden } from "./errors";
import { decodeImage, MAX_PHOTOS } from "./attachments";
import { todayLocal } from "./dates";
import { gpsSchema } from "./geo";
import { createVisitSchema, createVisit } from "./visits";
import { validateAnswers } from "./mikrotik";
import { createVpnCase, vpnSchema } from "./vpn";
import { cardSchema, createCard } from "./cards";
import { Prisma } from "./generated/prisma/client";

const MAX_AGE_DAYS = 60;

const base = {
  uuid: z.uuid(),
  filledAt: z.iso.datetime({ offset: true }),
};

const visitPayload = createVisitSchema.omit({ visitedOn: true }).extend({
  gps: gpsSchema,
  photos: z.array(z.string()).max(MAX_PHOTOS, `الحد ${MAX_PHOTOS} صور`).optional(),
  mikrotik: z
    .array(z.object({ questionId: z.uuid(), answer: z.string().max(100) }))
    .max(20)
    .nullish(),
});

export const syncItemSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("VISIT"), payload: visitPayload }),
  z.object({ ...base, kind: z.literal("VPN"), payload: vpnSchema }),
  z.object({ ...base, kind: z.literal("CARD"), payload: cardSchema.and(z.object({ photo: z.string().nullish() })) }),
]);

export type SyncItem = z.input<typeof syncItemSchema>;
export type SyncResult = { uuid: string; status: "created" | "duplicate"; entityId: string; warning?: string | null };

function checkFilledAt(iso: string): Date {
  const d = new Date(iso);
  const now = Date.now();
  if (d.getTime() > now + 10 * 60_000) throw new ApiError(400, "وقت التعبئة بالمستقبل. تأكد من ساعة الجوال");
  if (d.getTime() < now - MAX_AGE_DAYS * 24 * 3600_000)
    throw new ApiError(400, `وقت التعبئة أقدم من ${MAX_AGE_DAYS} يوم`);
  return d;
}

async function existing(kind: string, uuid: string, db: Db): Promise<string | null> {
  const where = { clientUuid: uuid };
  const row =
    kind === "VISIT"
      ? await db.visit.findUnique({ where, select: { id: true } })
      : kind === "VPN"
        ? await db.vpnCase.findUnique({ where, select: { id: true } })
        : await db.cardPurchase.findUnique({ where, select: { id: true } });
  return row?.id ?? null;
}

export async function processSyncItem(actor: Actor, raw: SyncItem, db: Db = defaultPrisma): Promise<SyncResult> {
  if (!can(actor, "visits:create")) throw forbidden();
  const item = syncItemSchema.parse(raw);
  const already = await existing(item.kind, item.uuid, db);
  if (already) return { uuid: item.uuid, status: "duplicate", entityId: already };
  const filledAt = checkFilledAt(item.filledAt);

  try {
    if (item.kind === "VISIT") {
      const { gps, photos, mikrotik, ...rest } = item.payload;
      const answers = await validateAnswers(mikrotik, db);
      const decoded = (photos ?? []).map(decodeImage);
      const { visit, warning } = await createVisit(
        actor,
        { ...rest, visitedOn: todayLocal(filledAt) },
        { clientUuid: item.uuid, filledAt, gps, mikrotik: answers, photos: decoded },
        db,
      );
      return { uuid: item.uuid, status: "created", entityId: visit.id, warning };
    }
    if (item.kind === "VPN") {
      const { vpn } = await createVpnCase(actor, item.payload, { clientUuid: item.uuid, filledAt }, db);
      return { uuid: item.uuid, status: "created", entityId: vpn.id };
    }
    const { photo, ...card } = item.payload;
    const row = await createCard(
      actor,
      card,
      { clientUuid: item.uuid, filledAt, photo: photo ? decodeImage(photo) : null },
      db,
    );
    return { uuid: item.uuid, status: "created", entityId: row.id };
  } catch (err) {
    // نفس العنصر وصل بنفس اللحظة من طلب تاني وسبقنا: مش خطأ
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const id = await existing(item.kind, item.uuid, db);
      if (id) return { uuid: item.uuid, status: "duplicate", entityId: id };
    }
    throw err;
  }
}
