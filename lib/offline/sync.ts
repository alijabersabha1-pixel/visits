/**
 * إرسال الطابور: لما يرجع النت، لما ينفتح التطبيق، كل دقيقة والتطبيق مفتوح، وبعد كل حفظ.
 * - نجح (201 أو 200 «duplicate») ← بينمسح من الجوال
 * - رفض (4xx) ← «فشل» مع السبب، وما بنعيد لحالنا (السفير بيقرر)
 * - 401 ← لازم يدخل من جديد، العنصر بيضل
 * - ما في نت أو 5xx ← بيضل بالانتظار للمرة الجاية
 */
import { allItems, deleteItem, putItem, QUEUE_EVENT } from "./queue";

export type FlushResult = { sent: number; failed: number; offline: boolean; needsLogin: boolean };

let running: Promise<FlushResult> | null = null;

export function flushQueue(): Promise<FlushResult> {
  // مرة وحدة بنفس الوقت، عشان ما ينبعت نفس العنصر من محاولتين
  running ??= doFlush().finally(() => {
    running = null;
    window.dispatchEvent(new Event(QUEUE_EVENT));
  });
  return running;
}

async function doFlush(): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, failed: 0, offline: false, needsLogin: false };
  for (const item of await allItems()) {
    if (item.status !== "pending") continue;
    let res: Response;
    try {
      res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ uuid: item.uuid, kind: item.kind, filledAt: item.filledAt, payload: item.payload }),
      });
    } catch {
      result.offline = true;
      break;
    }
    if (res.ok) {
      await deleteItem(item.uuid);
      result.sent++;
      continue;
    }
    if (res.status === 401) {
      result.needsLogin = true;
      break;
    }
    if (res.status >= 500) {
      await putItem({ ...item, attempts: item.attempts + 1 });
      break;
    }
    const data = await res.json().catch(() => ({}));
    await putItem({
      ...item,
      status: "failed",
      attempts: item.attempts + 1,
      error: (data as { error?: string }).error ?? `خطأ ${res.status}`,
    });
    result.failed++;
  }
  return result;
}
