import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { SESSION_COOKIE, userFromToken, type SessionUser } from "./auth";
import { can, type Permission } from "./authz";

/** المستخدم الحالي للصفحات (مرة وحدة لكل طلب) */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  return userFromToken(jar.get(SESSION_COOKIE)?.value);
});

/**
 * للصفحات: بدون دخول ← صفحة الدخول.
 * إذا المسؤول عامل إعادة تعيين لكلمة السر، المستخدم لازم يغيّرها قبل أي صفحة تانية.
 */
export async function requireUser(opts: { passwordPage?: boolean } = {}): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !opts.passwordPage) redirect("/account/password");
  return user;
}

/** للصفحات: بدون صلاحية ← الرئيسية */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, permission)) redirect("/?denied=1");
  return user;
}
