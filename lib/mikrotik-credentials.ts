/**
 * بيانات دخول المايكروتيك. كلمة السر مشفّرة، بتنعرض للسفراء بس بعد كلمة سر حسابهم،
 * وكل عرض بينسجل بسجل خاص بيشوفوه السفراء (مش سجل التعديلات العام اللي بيشوفه المسؤول).
 */
import { z } from "zod";
import { prisma as defaultPrisma, type Db } from "./db";
import { withAudit } from "./audit";
import { can, type Actor } from "./authz";
import { ApiError, forbidden, notFound } from "./errors";
import { decryptSecret, encryptSecret } from "./crypto";
import { verifyPassword } from "./password";
import { displayLineCode, isValidLineCode, normalizeLineCode } from "./line-code";

export const credentialSchema = z.object({
  lineCode: z.string().refine(isValidLineCode, "الـ Line Code مش صالح"),
  username: z.string().trim().min(1, "اكتب اسم المستخدم").max(100),
  password: z.string().min(1, "اكتب كلمة السر").max(200),
});

export async function saveCredential(actor: Actor, raw: z.input<typeof credentialSchema>, db: Db = defaultPrisma) {
  if (!can(actor, "mikrotik:reveal")) throw forbidden();
  const input = credentialSchema.parse(raw);
  const lineCodeKey = normalizeLineCode(input.lineCode);
  const passwordCipher = encryptSecret(input.password);
  return withAudit(
    actor.id,
    async (tx, audit) => {
      const existed = await tx.mikrotikCredential.findUnique({ where: { lineCodeKey } });
      const cred = await tx.mikrotikCredential.upsert({
        where: { lineCodeKey },
        create: { lineCodeKey, username: input.username, passwordCipher, updatedById: actor.id },
        update: { username: input.username, passwordCipher, updatedById: actor.id },
      });
      // كلمة السر نفسها ما بتدخل السجل
      audit.event(
        existed ? "UPDATE" : "CREATE",
        "MikrotikCredential",
        cred.id,
        `بيانات دخول مايكروتيك ${displayLineCode(input.lineCode)}`,
      );
      return { id: cred.id, lineCodeKey, username: cred.username };
    },
    db,
  );
}

export async function revealCredential(
  actor: Actor,
  credentialId: string,
  accountPassword: string,
  db: Db = defaultPrisma,
) {
  if (!can(actor, "mikrotik:reveal")) throw forbidden();
  const user = await db.user.findUnique({ where: { id: actor.id } });
  if (!user || !(await verifyPassword(user.passwordHash, accountPassword))) {
    throw new ApiError(403, "كلمة سر حسابك غلط");
  }
  const cred = await db.mikrotikCredential.findUnique({ where: { id: credentialId } });
  if (!cred) throw notFound();
  const password = decryptSecret(cred.passwordCipher);
  await db.mikrotikReveal.create({ data: { credentialId: cred.id, lineCodeKey: cred.lineCodeKey, userId: actor.id } });
  return { username: cred.username, password };
}

export function credentialFor(lineCodeKey: string, db: Db = defaultPrisma) {
  return db.mikrotikCredential.findUnique({
    where: { lineCodeKey },
    select: { id: true, username: true, updatedAt: true },
  });
}

export async function revealLog(actor: Actor, db: Db = defaultPrisma) {
  if (!can(actor, "mikrotik:revealLog")) throw forbidden();
  return db.mikrotikReveal.findMany({
    orderBy: { id: "desc" },
    take: 500,
    include: { user: { select: { displayName: true } } },
  });
}
