import { NextResponse, type NextRequest } from "next/server";

// فحص سريع: بدون كوكي جلسة ← صفحة الدخول.
// الفحص الحقيقي (الجلسة صالحة؟ الحساب فعّال؟ الصلاحية؟) بيصير على السيرفر بكل صفحة وكل API.
const SESSION_COOKIE = "av_session";

export function proxy(req: NextRequest) {
  if (!req.cookies.has(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // كل الصفحات ما عدا الدخول والـ API والملفات الثابتة
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|icon-|brand/|sw.js|manifest.webmanifest|\\.well-known).*)"],
};
