import { describe, expect, it } from "vitest";
import { RateLimiter, clientKey } from "@/lib/rate-limit";

describe("تحديد معدل الطلبات (المهمة 26)", () => {
  it("بيسمح لحد الحد، وبعدها بيرفض لحد ما تخلص النافذة", () => {
    const rl = new RateLimiter({ limit: 3, windowMs: 60_000 });
    const t0 = 1_000_000;
    expect([1, 2, 3].map(() => rl.hit("a", t0).ok)).toEqual([true, true, true]);
    const blocked = rl.hit("a", t0 + 10);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(60);
    // مفتاح تاني ما بيتأثر
    expect(rl.hit("b", t0 + 10).ok).toBe(true);
    // بعد النافذة بيرجع يسمح
    expect(rl.hit("a", t0 + 60_001).ok).toBe(true);
  });

  it("check بيفحص بدون ما يعدّ", () => {
    const rl = new RateLimiter({ limit: 2, windowMs: 60_000 });
    expect(rl.check("x", 0).ok).toBe(true);
    rl.hit("x", 0);
    expect(rl.check("x", 1).ok).toBe(true);
    rl.hit("x", 1);
    expect(rl.check("x", 2)).toEqual({ ok: false, retryAfterSec: 60 });
    expect(rl.check("x", 60_001).ok).toBe(true);
  });

  it("بينضّف المفاتيح القديمة عشان الذاكرة ما تكبر", () => {
    const rl = new RateLimiter({ limit: 1, windowMs: 1000, maxKeys: 100 });
    for (let i = 0; i < 500; i++) rl.hit(`k${i}`, i);
    expect(rl.size).toBeLessThanOrEqual(100);
  });

  it("عنوان العميل من X-Forwarded-For بس إذا السيرفر ورا بروكسي موثوق", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    expect(clientKey(h, { trustProxy: true })).toBe("203.0.113.9");
    expect(clientKey(h, { trustProxy: false })).toBe("direct");
    expect(clientKey(new Headers(), { trustProxy: true })).toBe("direct");
  });
});
