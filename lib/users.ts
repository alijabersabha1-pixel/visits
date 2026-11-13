/**
 * عمليات إدارة المستخدمين. كلها عبر withAudit، وكلها بتفحص إنه بيضل مسؤول واحد فعّال على الأقل.
 */
import { z } from "zod";
import { prisma as defaultPrisma, type Db, type Tx } from "./db";
import { withAudit } from "./audit";
import { ApiError, notFound } from "./errors";
import { generateTempPassword, hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "./password";
import { normalizeUsername } from "./auth";

export const usernameSchema = z
  .string()
  .transform(normalizeUsername)
  .pipe(
    z
      .string()
      .min(3, "اسم الدخول 3 أحرف على الأقل")
      .max(32, "اسم الدخول طويل")
      .regex(/^[a-z0-9._-]+$/, "اسم الدخول بالإنجليزي: أحرف صغيرة وأرقام و . _ - بس"),
  );

const displayNameSchema = z.string().trim().min(2, "اكتب الاسم").max(80, "الاسم طويل");
const roleSchema = z.enum(["AMBASSADOR", "MANAGER"]);
const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `كلمة السر لازم تكون ${MIN_PASSWORD_LENGTH} أحرف على الأقل`)
  .max(200, "كلمة السر طويلة كتير");

export const createUserSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
  role: roleSchema,
  // بدون كلمة سر ← النظام بيولّد وحدة مؤقتة بتنعرض للمسؤول مرة وحدة
  password: passwordSchema.optional(),
});

export const updateUserSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    role: roleSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "ما في شي يتعدّل");

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "اكتب كلمة السر الحالية"),
  newPassword: passwordSchema,
});

/** الحقول اللي بتطلع للواجهة. passwordHash ما بيطلع أبداً. */
export const publicUserSelect = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  active: true,
  lockedUntil: true,
  mustChangePassword: true,
  createdAt: true,
} as const;

const AUDITED_FIELDS = ["username", "displayName", "role", "active"] as const;

/** السفراء بس بيديروا الحسابات، فلازم يضل سفير فعّال واحد على الأقل */
async function assertAmbassadorRemains(tx: Tx, changingUserId: string, next: { role?: string; active?: boolean }) {
  const target = await tx.user.findUnique({ where: { id: changingUserId } });
  if (!target) throw notFound();
  const losesAmbassador =
    target.role === "AMBASSADOR" && target.active && (next.role === "MANAGER" || next.active === false);
  if (!losesAmbassador) return target;
  const others = await tx.user.count({ where: { role: "AMBASSADOR", active: true, id: { not: changingUserId } } });
  if (others === 0) throw new ApiError(409, "لازم يضل سفير فعّال واحد على الأقل، لأنه هو اللي بيدير الحسابات");
  return target;
}

export async function createUser(
  actorId: string | null,
  input: z.infer<typeof createUserSchema>,
  db: Db = defaultPrisma,
) {
  const tempPassword = input.password ? null : generateTempPassword();
  const passwordHash = await hashPassword(input.password ?? tempPassword!);
  const user = await withAudit(
    actorId,
    async (tx, audit) => {
      const exists = await tx.user.findUnique({ where: { username: input.username } });
      if (exists) throw new ApiError(409, "اسم الدخول مستخدم");
      const user = await tx.user.create({
        data: {
          username: input.username,
          displayName: input.displayName,
          role: input.role,
          passwordHash,
          // المسؤول بيعطي كلمة سر أولية، والمستخدم بيغيّرها أول ما يدخل
          mustChangePassword: actorId !== null,
        },
        select: publicUserSelect,
      });
      audit.created("User", user.id, {
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        active: user.active,
      });
      return user;
    },
    db,
  );
  return { user, tempPassword };
}

export async function updateUser(
  actorId: string,
  userId: string,
  input: z.infer<typeof updateUserSchema>,
  db: Db = defaultPrisma,
) {
  return withAudit(
    actorId,
    async (tx, audit) => {
      if (actorId === userId && (input.active === false || (input.role !== undefined && input.role !== "AMBASSADOR"))) {
        throw new ApiError(409, "ما بتقدر توقف حسابك أو تغيّر دورك");
      }
      const before = await assertAmbassadorRemains(tx, userId, input);
      const after = await tx.user.update({ where: { id: userId }, data: input, select: publicUserSelect });
      audit.updated("User", userId, before, after, { fields: AUDITED_FIELDS });
      // الإيقاف بيطرد المستخدم من كل الأجهزة
      if (input.active === false && before.active) {
        await tx.session.deleteMany({ where: { userId } });
      }
      return after;
    },
    db,
  );
}

/** كلمة سر مؤقتة، وإلغاء كل الجلسات، وإجبار على التغيير بأول دخول */
export async function resetPassword(actorId: string, userId: string, db: Db = defaultPrisma) {
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  await withAudit(
    actorId,
    async (tx, audit) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw notFound();
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
      });
      const { count } = await tx.session.deleteMany({ where: { userId } });
      audit.event("PASSWORD_RESET", "User", userId, `كلمة سر مؤقتة، وانلغت ${count} جلسة`);
    },
    db,
  );
  return { tempPassword };
}

/** للجوال الضايع: طرد المستخدم من كل الأجهزة */
export async function revokeSessions(actorId: string, userId: string, db: Db = defaultPrisma) {
  return withAudit(
    actorId,
    async (tx, audit) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw notFound();
      const { count } = await tx.session.deleteMany({ where: { userId } });
      audit.event("SESSIONS_REVOKED", "User", userId, `انلغت ${count} جلسة`);
      return { revoked: count };
    },
    db,
  );
}

/** المستخدم بيغيّر كلمة سره. الجلسات التانية بتنلغي، والحالية بتضل. */
export async function changeOwnPassword(
  userId: string,
  currentSessionId: string,
  input: z.infer<typeof changePasswordSchema>,
  db: Db = defaultPrisma,
) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound();
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new ApiError(400, "كلمة السر الحالية غلط");
  }
  if (input.currentPassword === input.newPassword) {
    throw new ApiError(400, "اختار كلمة سر جديدة غير القديمة");
  }
  const passwordHash = await hashPassword(input.newPassword);
  await withAudit(
    userId,
    async (tx, audit) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } });
      await tx.session.deleteMany({ where: { userId, id: { not: currentSessionId } } });
      audit.event("PASSWORD_CHANGE", "User", userId);
    },
    db,
  );
}
