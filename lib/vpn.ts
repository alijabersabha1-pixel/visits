/** حالات VPN: مستقلة عن الزيارات، بدون Line Code. التكرار بالـ IP أو اسم الشبكة بيبيّن الحالات السابقة */
import { isIP } from "node:net";
import { z } from "zod";
import { prisma as defaultPrisma, type Db } from "./db";
import { withAudit } from "./audit";
import { can, type Actor } from "./authz";
import { forbidden } from "./errors";
import { gpsSchema } from "./geo";
import { normArabic } from "./import/legacy-values";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const vpnSchema = z.object({
  networkName: z.string().trim().min(1, "اكتب اسم الشبكة").max(200),
  ip: z
    .string()
    .trim()
    .refine((v) => isIP(v) !== 0, "الـ IP مش صحيح"),
  placeText: text(300),
  suspects: text(2000),
  notes: text(2000),
  gps: gpsSchema,
});

export interface VpnField {
  clientUuid?: string;
  filledAt?: Date;
}

const nameKey = (s: string) => normArabic(s).toLowerCase();

/** حالات سابقة بنفس الـ IP أو نفس الاسم (بعد توحيد الإملاء) */
async function previousCases(db: Db, ip: string, name: string, excludeId?: string) {
  const candidates = await db.vpnCase.findMany({
    where: { deletedAt: null, id: excludeId ? { not: excludeId } : undefined },
    include: { owner: { select: { displayName: true } } },
    orderBy: { filledAt: "desc" },
  });
  return candidates.filter((c) => c.ip === ip || nameKey(c.networkName) === nameKey(name));
}

export async function createVpnCase(
  actor: Actor,
  raw: z.input<typeof vpnSchema>,
  field: VpnField = {},
  db: Db = defaultPrisma,
) {
  if (!can(actor, "visits:create")) throw forbidden();
  const input = vpnSchema.parse(raw);
  const vpn = await withAudit(
    actor.id,
    async (tx, audit) => {
      const row = await tx.vpnCase.create({
        data: {
          clientUuid: field.clientUuid,
          filledAt: field.filledAt ?? new Date(),
          ownerId: actor.id,
          networkName: input.networkName,
          ip: input.ip,
          placeText: input.placeText,
          suspects: input.suspects,
          notes: input.notes,
          lat: input.gps?.lat,
          lng: input.gps?.lng,
          gpsAccuracy: input.gps?.accuracy,
        },
      });
      audit.created("VpnCase", row.id, { networkName: row.networkName, ip: row.ip, placeText: row.placeText });
      return row;
    },
    db,
  );
  return { vpn, previous: await previousCases(db, vpn.ip, vpn.networkName, vpn.id) };
}

export async function findVpnCases(opts: { q?: string } = {}, db: Db = defaultPrisma) {
  const q = opts.q?.trim();
  const rows = await db.vpnCase.findMany({
    where: { deletedAt: null },
    include: { owner: { select: { displayName: true } } },
    orderBy: { filledAt: "desc" },
    take: 1000,
  });
  // عدد التكرار لكل حالة (نفس IP أو نفس الاسم)
  const withDup = rows.map((r) => ({
    ...r,
    duplicates: rows.filter(
      (o) => o.id !== r.id && (o.ip === r.ip || nameKey(o.networkName) === nameKey(r.networkName)),
    ).length,
  }));
  if (!q) return withDup;
  const k = nameKey(q);
  return withDup.filter((r) => r.ip.includes(q) || nameKey(r.networkName).includes(k));
}
