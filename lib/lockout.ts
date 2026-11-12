/** قفل مؤقت بعد محاولات دخول غلط. منطق صافي بدون قاعدة بيانات عشان ينختبر بسهولة. */

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

export interface LockState {
  failedLoginCount: number;
  lockedUntil: Date | null;
}

export function isLocked(state: LockState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

export function minutesLeft(state: LockState, now: Date): number {
  if (!isLocked(state, now)) return 0;
  return Math.ceil((state.lockedUntil!.getTime() - now.getTime()) / 60_000);
}

/** الحالة الجديدة بعد محاولة غلط. القفل بيبلّش بالمحاولة الخامسة. */
export function afterFailure(state: LockState, now: Date): LockState & { justLocked: boolean } {
  // إذا القفل القديم خلص، العداد بيرجع من الصفر
  const base = state.lockedUntil !== null && !isLocked(state, now) ? 0 : state.failedLoginCount;
  const failedLoginCount = base + 1;
  if (failedLoginCount >= MAX_FAILED_ATTEMPTS) {
    return {
      failedLoginCount,
      lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000),
      justLocked: true,
    };
  }
  return { failedLoginCount, lockedUntil: null, justLocked: false };
}

export function afterSuccess(): LockState {
  return { failedLoginCount: 0, lockedUntil: null };
}
