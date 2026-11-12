import { describe, expect, it } from "vitest";
import { afterFailure, afterSuccess, isLocked, minutesLeft, LOCK_MINUTES, MAX_FAILED_ATTEMPTS } from "@/lib/lockout";

const t0 = new Date("2026-11-13T10:00:00Z");
const plus = (min: number) => new Date(t0.getTime() + min * 60_000);

describe("القفل المؤقت", () => {
  it("5 محاولات و15 دقيقة", () => {
    expect(MAX_FAILED_ATTEMPTS).toBe(5);
    expect(LOCK_MINUTES).toBe(15);
  });

  it("4 محاولات غلط ما بتقفل، والخامسة بتقفل 15 دقيقة", () => {
    let s = { failedLoginCount: 0, lockedUntil: null as Date | null };
    for (let i = 1; i <= 4; i++) {
      const next = afterFailure(s, t0);
      expect(next.justLocked).toBe(false);
      expect(isLocked(next, t0)).toBe(false);
      s = next;
    }
    const fifth = afterFailure(s, t0);
    expect(fifth.justLocked).toBe(true);
    expect(isLocked(fifth, t0)).toBe(true);
    expect(isLocked(fifth, plus(14.9))).toBe(true);
    expect(isLocked(fifth, plus(15))).toBe(false);
    expect(minutesLeft(fifth, plus(1))).toBe(14);
  });

  it("بعد ما يخلص القفل، العداد بيبلّش من جديد", () => {
    const locked = { failedLoginCount: 5, lockedUntil: plus(15) };
    const later = afterFailure(locked, plus(20));
    expect(later.failedLoginCount).toBe(1);
    expect(later.lockedUntil).toBeNull();
  });

  it("الدخول الصحيح بيصفّر العداد", () => {
    expect(afterSuccess()).toEqual({ failedLoginCount: 0, lockedUntil: null });
  });
});
