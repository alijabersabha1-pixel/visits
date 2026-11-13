"use client";

/**
 * إطار تطبيق الميدان: القوائم المحفوظة بالجوال، شريط «بانتظار الإرسال»، وتشغيل الإرسال التلقائي.
 * الصفحات تحت /m ما بتحتاج السيرفر لتنعرض، فبتفتح بدون نت من نسخة الـ Service Worker.
 */
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/Brand";
import { loadBootstrap, type Bootstrap } from "@/lib/offline/device";
import { allItems, deleteItem, putItem, QUEUE_EVENT, type QueueItem } from "@/lib/offline/queue";
import { flushQueue } from "@/lib/offline/sync";

type Ctx = { boot: Bootstrap | null; online: boolean; refreshQueue: () => void };
const MobileCtx = createContext<Ctx>({ boot: null, online: true, refreshQueue: () => {} });

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}
export const useMobile = () => useContext(MobileCtx);

export function MobileShell({ children }: { children: React.ReactNode }) {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [bootState, setBootState] = useState<"loading" | "ok" | "cache" | "none" | "login">("loading");
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const [items, setItems] = useState<QueueItem[]>([]);
  const [sending, setSending] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);

  const refreshQueue = useCallback(() => {
    allItems()
      .then(setItems)
      .catch(() => {});
  }, []);

  const flush = useCallback(async () => {
    if (!navigator.onLine) return;
    setSending(true);
    const r = await flushQueue().catch(() => null);
    setSending(false);
    if (r?.needsLogin) setNeedsLogin(true);
    refreshQueue();
  }, [refreshQueue]);

  useEffect(() => {
    loadBootstrap().then((b) => {
      setBoot(b.data);
      setBootState(b.needsLogin && !b.data ? "login" : b.data ? (b.fromCache ? "cache" : "ok") : "none");
      if (b.needsLogin) setNeedsLogin(true);
    });
    refreshQueue();
    // أول محاولة إرسال بعد ما تنرسم الصفحة
    const first = window.setTimeout(() => void flush(), 0);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
      navigator.serviceWorker.addEventListener("message", (e) => {
        if (e.data === "flush") void flush();
      });
    }
    const goOnline = () => void flush();
    const onVisible = () => document.visibilityState === "visible" && void flush();
    window.addEventListener("online", goOnline);
    window.addEventListener(QUEUE_EVENT, refreshQueue);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => void flush(), 60_000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener(QUEUE_EVENT, refreshQueue);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
      window.clearTimeout(first);
    };
  }, [flush, refreshQueue]);

  const pending = items.filter((i) => i.status === "pending");
  const failed = items.filter((i) => i.status === "failed");

  return (
    <MobileCtx.Provider value={{ boot, online, refreshQueue }}>
      <div className="m-shell">
        <header className="m-top">
          <Link href="/m" className="brand">
            <BrandMark size={30} />
            <span className="brand-text">
              <b>الميدان</b>
            </span>
          </Link>
          <span className={`badge ${online ? "badge-green" : "badge-gray"}`} data-testid="net">
            {online ? "متصل" : "بدون نت"}
          </span>
        </header>

        {(pending.length > 0 || failed.length > 0) && (
          <div className="m-queue" role="status" data-testid="queue-bar">
            <div className="m-queue-row">
              <span>
                {pending.length > 0 && (
                  <b>
                    <span data-testid="pending-count">{pending.length}</span> بانتظار الإرسال
                  </b>
                )}
                {pending.length > 0 && !online && (
                  <span className="muted small"> · بتنبعت لحالها أول ما يرجع النت</span>
                )}
                {failed.length > 0 && <b className="warn-text"> {failed.length} ما انقبلت</b>}
              </span>
              {online && pending.length > 0 && (
                <button className="btn btn-sm btn-primary" disabled={sending} onClick={() => void flush()}>
                  {sending ? "عم نبعت…" : "إرسال هلأ"}
                </button>
              )}
            </div>
            {failed.map((f) => (
              <div key={f.uuid} className="m-failed small">
                <span>
                  {f.label}: <span className="warn-text">{f.error}</span>
                </span>
                <span className="actions">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={async () => {
                      await putItem({ ...f, status: "pending", error: undefined });
                      void flush();
                    }}
                  >
                    إعادة
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={async () => {
                      if (!window.confirm("حذف هالعنصر من الجوال؟ ما رح ينبعت.")) return;
                      await deleteItem(f.uuid);
                      refreshQueue();
                    }}
                  >
                    حذف
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}

        {needsLogin && (
          <div className="alert alert-warn" style={{ margin: "10px 14px 0" }}>
            انتهت جلستك. <a href="/login">ادخل من جديد</a> عشان ينبعت اللي بانتظار الإرسال (ما رح يضيع).
          </div>
        )}
        {bootState === "none" && (
          <div className="alert alert-warn" style={{ margin: "10px 14px 0" }}>
            افتح التطبيق مرة وحدة مع نت عشان تنحفظ القوائم بالجوال.
          </div>
        )}
        {bootState === "cache" && !online && boot && (
          <div className="small muted" style={{ margin: "8px 14px 0" }}>
            القوائم من آخر مرة اتصلت ({new Date(boot.savedAt).toLocaleDateString("ar-PS-u-nu-latn")}).
          </div>
        )}
        <main className="m-main">{children}</main>
      </div>
    </MobileCtx.Provider>
  );
}

/** آخر العناصر اللي انسجلت على هالجوال (لربط البطاقة بزيارة أو حالة VPN) */
const RECENT_KEY = "av-recent";
export type Recent = { uuid: string; kind: "VISIT" | "VPN"; label: string; at: string };

export function rememberRecent(r: Recent) {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as Recent[];
    localStorage.setItem(RECENT_KEY, JSON.stringify([r, ...list].slice(0, 30)));
  } catch {}
}

export function recentItems(kind: "VISIT" | "VPN"): Recent[] {
  try {
    const since = Date.now() - 3 * 24 * 3600_000;
    return (JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as Recent[]).filter(
      (r) => r.kind === kind && Date.parse(r.at) > since,
    );
  } catch {
    return [];
  }
}
