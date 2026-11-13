/** خطأ برسالة للمستخدم ورمز HTTP. ما بيعتمد على Next، فبيشتغل بالسكربتات كمان. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const unauthorized = () => new ApiError(401, "لازم تسجّل دخول");
export const forbidden = () => new ApiError(403, "ما عندك صلاحية لهالعملية");
export const notFound = () => new ApiError(404, "مش موجود");

/** كتير طلبات: 429 مع Retry-After */
export class RateLimitError extends ApiError {
  constructor(public retryAfterSec: number, message = "طلبات كتير ورا بعض. استنى شوي وجرّب كمان مرة.") {
    super(429, message);
  }
}
