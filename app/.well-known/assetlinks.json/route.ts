import { NextResponse } from "next/server";

/**
 * ربط ملف الـ APK بالموقع (Trusted Web Activity): بدونه التطبيق بيفتح مع شريط المتصفح.
 * القيم من متغيرات البيئة لأن بصمة التوقيع بتنعرف بعد بناء الـ APK (docs/install-android.md).
 */
export const dynamic = "force-dynamic";

export function GET() {
  const pkg = process.env.TWA_PACKAGE_NAME;
  const fingerprints = (process.env.TWA_SHA256_FINGERPRINTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s));
  if (!pkg || fingerprints.length === 0) return NextResponse.json([]);
  return NextResponse.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: fingerprints },
    },
  ]);
}
