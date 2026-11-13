/**
 * مساعدات واجهات السيرفر (app/api). كل route بيمر من handler:
 *  - بيفحص مصدر الطلب للعمليات اللي بتغيّر (حماية CSRF)
 *  - بيرجع 401 بدون جلسة و403 بدون صلاحية
 *  - بيحوّل أخطاء التحقق لرسائل واضحة
 */
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { SESSION_COOKIE, userFromToken, type SessionUser } from "./auth";
import { can, type Permission } from "./authz";
import { ApiError, unauthorized, forbidden, notFound } from "./errors";

export { ApiError, unauthorized, forbidden, notFound };

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** الطلبات اللي بتغيّر لازم تيجي من نفس الموقع */
export function checkOrigin(req: NextRequest): void {
  if (!UNSAFE_METHODS.has(req.method)) return;
  const origin = req.headers.get("origin");
  const allowed = new Set([req.nextUrl.origin]);
  if (process.env.APP_ORIGIN) allowed.add(process.env.APP_ORIGIN);
  if (!origin || !allowed.has(origin)) throw new ApiError(403, "مصدر الطلب غير مسموح");
}

export async function apiUser(req: NextRequest): Promise<SessionUser> {
  const user = await userFromToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) throw unauthorized();
  return user;
}

export async function apiRequire(req: NextRequest, permission: Permission): Promise<SessionUser> {
  const user = await apiUser(req);
  if (!can(user, permission)) throw forbidden();
  return user;
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "الطلب مش مفهوم");
  }
  return schema.parse(raw);
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

export function handler<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      checkOrigin(req);
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message, details: err.details }, { status: err.status });
      }
      if (err instanceof ZodError) {
        const first = err.issues[0];
        return NextResponse.json(
          {
            error: first?.message ?? "بيانات غير صحيحة",
            details: err.issues.map((i) => ({ path: i.path, message: i.message })),
          },
          { status: 400 },
        );
      }
      console.error(err);
      return NextResponse.json({ error: "صار خطأ بالسيرفر" }, { status: 500 });
    }
  };
}
