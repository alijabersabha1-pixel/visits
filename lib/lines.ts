/**
 * خطوط المشتركين. أغلبها بيجي من ملف الشهر (lib/import)، والسفير بيضيف الخط الطارئ يدوياً.
 */
import { z } from "zod";
import { prisma as defaultPrisma, type Db } from "./db";
import { withAudit } from "./audit";
import { ApiError } from "./errors";
import { accountKeyOf, displayLineCode, isValidLineCode, normalizeLineCode, regionOf } from "./line-code";

const optionalText = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v ? v : undefined));

export const manualLineSchema = z.object({
  code: z.string().trim().min(1, "اكتب الـ Line Code").max(40).refine(isValidLineCode, "الـ Line Code مش صالح"),
  accountName: z.string().trim().min(2, "اكتب اسم الحساب").max(200),
  speed: optionalText,
  locality: optionalText,
  fixedIp: optionalText,
});

export function findLineByCode(raw: unknown, db: Db = defaultPrisma) {
  const codeKey = normalizeLineCode(raw);
  if (!codeKey) return Promise.resolve(null);
  return db.line.findUnique({ where: { codeKey } });
}

/** حساب طارئ وصل قبل ملف الشهر الجاي. بينعلّم «مضاف يدوياً». */
export async function addManualLine(actorId: string, raw: z.input<typeof manualLineSchema>, db: Db = defaultPrisma) {
  const input = manualLineSchema.parse(raw);
  const codeKey = normalizeLineCode(input.code);
  return withAudit(
    actorId,
    async (tx, audit) => {
      const existing = await tx.line.findUnique({ where: { codeKey } });
      if (existing) {
        throw new ApiError(
          409,
          `الخط ${existing.code} موجود من قبل${existing.accountName ? ` (${existing.accountName})` : ""}`,
        );
      }
      const line = await tx.line.create({
        data: {
          codeKey,
          code: displayLineCode(input.code),
          accountKey: accountKeyOf(input.code),
          accountName: input.accountName,
          speed: input.speed,
          locality: input.locality,
          region: regionOf(input.locality),
          fixedIp: input.fixedIp,
          manual: true,
        },
      });
      audit.created("Line", line.id, {
        code: line.code,
        accountName: line.accountName,
        speed: line.speed,
        locality: line.locality,
        manual: line.manual,
      });
      return line;
    },
    db,
  );
}
