export type FetchResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

/** طلب JSON للـ API. لو الجلسة انتهت (401) بيرجع لصفحة الدخول. */
export async function sendJson<T>(method: string, url: string, body?: unknown): Promise<FetchResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    return { ok: false, status: 0, error: "ما في اتصال بالسيرفر. تأكد من النت وجرّب كمان مرة." };
  }
  const data = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, data: data as T };
  if (res.status === 401 && !url.startsWith("/api/auth/") && !url.startsWith("/api/account/")) {
    // تحميل كامل عن قصد: الجلسة تغيّرت وبدنا كل الصفحة تنبني من جديد
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }
  return { ok: false, status: res.status, error: (data as { error?: string }).error ?? "صار خطأ، جرّب كمان مرة" };
}

export const postJson = <T>(url: string, body?: unknown) => sendJson<T>("POST", url, body ?? {});
export const patchJson = <T>(url: string, body: unknown) => sendJson<T>("PATCH", url, body);
