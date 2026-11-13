/**
 * تحديد معدل الطلبات بالذاكرة (نافذة ثابتة). كافي لأن النظام بيشتغل بنسخة وحدة على سيرفر واحد.
 * ⚠️ لو صار في أكتر من نسخة ورا موازن حِمل، لازم مخزن مشترك (متل Postgres أو Redis).
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; reset: number }>();
  constructor(private opts: { limit: number; windowMs: number; maxKeys?: number }) {}

  get size() {
    return this.hits.size;
  }

  /** هل المفتاح موقوف هلأ؟ (بدون ما يعدّ) */
  check(key: string, now = Date.now()): { ok: boolean; retryAfterSec: number } {
    const e = this.hits.get(key);
    if (!e || e.reset <= now) return { ok: true, retryAfterSec: 0 };
    return { ok: e.count < this.opts.limit, retryAfterSec: Math.ceil((e.reset - now) / 1000) };
  }

  hit(key: string, now = Date.now()): { ok: boolean; retryAfterSec: number } {
    let e = this.hits.get(key);
    if (!e || e.reset <= now) {
      if (this.hits.size >= (this.opts.maxKeys ?? 10_000)) this.sweep(now);
      e = { count: 0, reset: now + this.opts.windowMs };
      this.hits.set(key, e);
    }
    e.count++;
    return { ok: e.count <= this.opts.limit, retryAfterSec: Math.ceil((e.reset - now) / 1000) };
  }

  private sweep(now: number) {
    for (const [k, e] of this.hits) if (e.reset <= now) this.hits.delete(k);
    // لسا كبير؟ امسح الأقدم
    const max = this.opts.maxKeys ?? 10_000;
    if (this.hits.size >= max) {
      const drop = [...this.hits.entries()].sort((a, b) => a[1].reset - b[1].reset).slice(0, this.hits.size - max + 1);
      for (const [k] of drop) this.hits.delete(k);
    }
  }
}

/** عنوان العميل. X-Forwarded-For بينقرأ بس لو TRUST_PROXY=true (السيرفر ورا بروكسي الشركة) */
export function clientKey(headers: Headers, opts = { trustProxy: process.env.TRUST_PROXY === "true" }): string {
  if (!opts.trustProxy) return "direct";
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip") || "direct";
}

// الحدود المستعملة بالنظام
/**
 * محاولات الدخول الغلط بس (الصحيحة ما بتنعدّ): 10 كل 15 دقيقة لكل (عنوان + اسم دخول)،
 * و30 لكل عنوان (ضد تجربة أسماء كتيرة). هاد فوق قفل الحساب بعد 5 غلطات.
 */
export const loginLimiter = new RateLimiter({ limit: 10, windowMs: 15 * 60_000 });
export const loginIpLimiter = new RateLimiter({ limit: 30, windowMs: 15 * 60_000 });
/** كل الـ API: 300 طلب بالدقيقة لكل جلسة أو عنوان */
export const apiLimiter = new RateLimiter({ limit: 300, windowMs: 60_000 });
/** الـ PDF تقيل على السيرفر: 10 بالدقيقة لكل مستخدم */
export const pdfLimiter = new RateLimiter({ limit: 10, windowMs: 60_000 });
