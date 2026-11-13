/** أسئلة المايكروتيك بنموذج الزيارة، وآخر إجابات كل خط، وقائمة «بحاجة access» */
import { prisma as defaultPrisma, type Db, type Tx } from "./db";
import { z } from "zod";
import { ApiError, forbidden, notFound } from "./errors";
import { can, type Actor } from "./authz";
import { withAudit } from "./audit";

export type MikrotikAnswer = { questionId: string; question: string; answer: string };

export function mikrotikQuestions(db: Db | Tx = defaultPrisma) {
  return db.mikrotikQuestion.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

/** بيتأكد إن كل إجابة من خيارات سؤالها، وبيحفظ نص السؤال مع الإجابة (عشان التاريخ ما يخرب لو السؤال تعدّل) */
export async function validateAnswers(
  raw: Array<{ questionId: string; answer: string }> | null | undefined,
  db: Db | Tx = defaultPrisma,
): Promise<MikrotikAnswer[] | null> {
  if (!raw?.length) return null;
  const questions = await db.mikrotikQuestion.findMany({ where: { id: { in: raw.map((a) => a.questionId) } } });
  const seen = new Set<string>();
  return raw.map((a) => {
    const q = questions.find((x) => x.id === a.questionId);
    if (!q || !q.options.includes(a.answer) || seen.has(a.questionId))
      throw new ApiError(400, "إجابة المايكروتيك مش من الخيارات");
    seen.add(a.questionId);
    return { questionId: q.id, question: q.text, answer: a.answer };
  });
}

type Latest = {
  lineCodeKey: string;
  lineCode: string | null;
  accountName: string | null;
  visitId: string;
  visitedOn: Date | null;
  mikrotik: MikrotikAnswer[];
};

async function latestAnswers(db: Db, lineCodeKey?: string): Promise<Latest[]> {
  return db.$queryRaw<Latest[]>`
    SELECT DISTINCT ON (v."lineCodeKey") v."lineCodeKey", v."lineCode", v."accountName", v."id" AS "visitId", v."visitedOn", v."mikrotik"
      FROM "visits" v
     WHERE v."deletedAt" IS NULL AND v."mikrotik" IS NOT NULL AND v."lineCodeKey" IS NOT NULL
       AND (${lineCodeKey ?? null}::text IS NULL OR v."lineCodeKey" = ${lineCodeKey ?? null})
     ORDER BY v."lineCodeKey", v."visitedOn" DESC NULLS LAST, v."filledAt" DESC NULLS LAST, v."number" DESC`;
}

export async function lastMikrotikAnswers(lineCodeKey: string, db: Db = defaultPrisma) {
  const [row] = await latestAnswers(db, lineCodeKey);
  return row ? { visitId: row.visitId, visitedOn: row.visitedOn, answers: row.mikrotik } : null;
}

/** خطوط آخر زيارة إلها قالت: ما في access للشركة، ولسا ما انعمل يوزر */
export async function linesNeedingAccess(db: Db = defaultPrisma) {
  const roles = new Map(
    (await db.mikrotikQuestion.findMany({ where: { role: { not: null } } })).map((q) => [q.id, q.role]),
  );
  const answerOf = (a: MikrotikAnswer[], role: string) => a.find((x) => roles.get(x.questionId) === role)?.answer;
  return (await latestAnswers(db)).filter(
    (r) => answerOf(r.mikrotik, "ACCESS") === "لا" && answerOf(r.mikrotik, "USER_CREATED") !== "نعم",
  );
}

// ===== إدارة الأسئلة (السفراء) =====

const optionsSchema = z
  .array(z.string())
  .transform((a) => [...new Set(a.map((o) => o.trim()).filter(Boolean))])
  .pipe(z.array(z.string().max(60, "الخيار طويل")).min(2, "لازم خيارين على الأقل").max(8, "8 خيارات كحد أقصى"));

export const questionCreateSchema = z.object({
  text: z.string().trim().min(3, "اكتب السؤال").max(200, "السؤال طويل"),
  options: optionsSchema,
});

export const questionUpdateSchema = z
  .object({
    text: z.string().trim().min(3, "اكتب السؤال").max(200, "السؤال طويل").optional(),
    options: optionsSchema.optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "ما في شي يتعدّل");

const AUDITED = ["text", "options", "active", "sortOrder"] as const;

export async function createMikrotikQuestion(
  actor: Actor,
  raw: z.input<typeof questionCreateSchema>,
  db: Db = defaultPrisma,
) {
  if (!can(actor, "lists:manage")) throw forbidden();
  const input = questionCreateSchema.parse(raw);
  return withAudit(
    actor.id,
    async (tx, audit) => {
      const max = await tx.mikrotikQuestion.aggregate({ _max: { sortOrder: true } });
      const q = await tx.mikrotikQuestion.create({
        data: { text: input.text, options: input.options, sortOrder: (max._max.sortOrder ?? 0) + 1 },
      });
      audit.created("MikrotikQuestion", q.id, { text: q.text, options: q.options.join(" · ") });
      return q;
    },
    db,
  );
}

/** الإجابات القديمة محفوظة مع نص السؤال، فتعديل السؤال أو إيقافه ما بيخرب التاريخ */
export async function updateMikrotikQuestion(
  actor: Actor,
  id: string,
  raw: z.input<typeof questionUpdateSchema>,
  db: Db = defaultPrisma,
) {
  if (!can(actor, "lists:manage")) throw forbidden();
  const input = questionUpdateSchema.parse(raw);
  return withAudit(
    actor.id,
    async (tx, audit) => {
      const before = await tx.mikrotikQuestion.findUnique({ where: { id } });
      if (!before) throw notFound();
      const after = await tx.mikrotikQuestion.update({ where: { id }, data: input });
      const view = (q: typeof before) => ({ ...q, options: q.options.join(" · ") });
      audit.updated("MikrotikQuestion", id, view(before), view(after), { fields: AUDITED });
      return after;
    },
    db,
  );
}
