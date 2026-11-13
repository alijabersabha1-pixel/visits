/**
 * الدخول والجلسات. الجلسة توكن عشوائي بكوكي httpOnly، وبقاعدة البيانات بس بصمته.
 * كل طلب بيتحقق من الجلسة بقاعدة البيانات، فإيقاف مستخدم أو إلغاء جلساته بيطرده فوراً.
 */
import { createHash, randomBytes } from "node:crypto";
import { prisma as defaultPrisma, type Db } from "./db";
import { afterFailure, afterSuccess, isLocked, minutesLeft } from "./lockout";
import { getDummyHash, verifyPassword } from "./password";
import { logEvent } from "./audit";
import type { Actor, Role } from "./authz";

export const SESSION_COOKIE = "av_session";
export const SESSION_DAYS = 30;
const TOUCH_EVERY_MS = 5 * 60_000;

export interface SessionUser extends Actor {
  username: string;
  displayName: string;
  role: Role;
  mustChangePassword: boolean;
  sessionId: string;
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; user: { id: string; mustChangePassword: boolean } }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "locked"; minutes: number };

export async function login(
  usernameInput: string,
  password: string,
  opts: { userAgent?: string | null; now?: Date; db?: Db } = {},
): Promise<LoginResult> {
  const db = opts.db ?? defaultPrisma;
  const now = opts.now ?? new Date();
  const username = normalizeUsername(usernameInput);
  const user = await db.user.findUnique({ where: { username } });

  if (!user) {
    await verifyPassword(await getDummyHash(), password); // نفس الوقت تقريباً
    return { ok: false, reason: "invalid" };
  }
  if (isLocked(user, now)) {
    return { ok: false, reason: "locked", minutes: minutesLeft(user, now) };
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid || !user.active) {
    if (!valid) {
      const next = afterFailure(user, now);
      await db.user.update({
        where: { id: user.id },
        data: { failedLoginCount: next.failedLoginCount, lockedUntil: next.lockedUntil },
      });
      if (next.justLocked) {
        await logEvent(
          null,
          {
            action: "LOCKED",
            entity: "User",
            entityId: user.id,
            note: `قفل مؤقت بعد ${next.failedLoginCount} محاولات خاطئة`,
          },
          db,
        );
        return { ok: false, reason: "locked", minutes: minutesLeft(next, now) };
      }
    }
    return { ok: false, reason: "invalid" };
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60_000);
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: afterSuccess() }),
    db.session.create({
      data: {
        tokenHash: hashToken(token),
        userId: user.id,
        expiresAt,
        userAgent: opts.userAgent?.slice(0, 300) ?? null,
      },
    }),
    db.auditLog.create({ data: { actorId: user.id, action: "LOGIN", entity: "User", entityId: user.id } }),
  ]);
  return { ok: true, token, expiresAt, user: { id: user.id, mustChangePassword: user.mustChangePassword } };
}

/** المستخدم صاحب التوكن، أو null إذا الجلسة منتهية أو ملغية أو الحساب موقوف */
export async function userFromToken(
  token: string | undefined | null,
  opts: { now?: Date; db?: Db } = {},
): Promise<SessionUser | null> {
  if (!token) return null;
  const db = opts.db ?? defaultPrisma;
  const now = opts.now ?? new Date();
  const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt <= now || !session.user.active) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: now } }).catch(() => {});
  }
  const u = session.user;
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    active: u.active,
    mustChangePassword: u.mustChangePassword,
    sessionId: session.id,
  };
}

export async function logout(token: string | undefined | null, db: Db = defaultPrisma): Promise<void> {
  if (!token) return;
  const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!session) return;
  await db.$transaction([
    db.session.delete({ where: { id: session.id } }),
    db.auditLog.create({
      data: { actorId: session.userId, action: "LOGOUT", entity: "User", entityId: session.userId },
    }),
  ]);
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}
