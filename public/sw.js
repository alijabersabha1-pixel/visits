/* Service Worker لتطبيق الميدان: بيخلي صفحات /m تفتح بدون نت، وبيبعت الطابور بالخلفية إذا الجوال بيدعم.
   كل ما يتغير هالملف، غيّر VERSION عشان النسخة القديمة تتمسح. */
const VERSION = "v1";
const STATIC = `av-static-${VERSION}`;
const PAGES = `av-pages-${VERSION}`;
const FIELD_PAGES = ["/m", "/m/visit", "/m/vpn", "/m/card"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGES);
      // الصفحات بتنحفظ بس إذا وصلت عادي (مش تحويل لصفحة الدخول)
      await Promise.all(
        FIELD_PAGES.map(async (url) => {
          try {
            const res = await fetch(url, { credentials: "same-origin" });
            if (res.ok && !res.redirected) await cache.put(url, res);
          } catch {}
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (![STATIC, PAGES].includes(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

function isFieldPage(url) {
  return url.pathname === "/m" || url.pathname.startsWith("/m/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // ملفات البناء والصور الثابتة: من الكاش أول (أسماؤها بتتغير مع كل بناء)
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/brand/") ||
    /^\/(icon|apple-icon|icon-\d+)/.test(url.pathname)
  ) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // صفحات الميدان: من النت أول، وإذا ما في نت من آخر نسخة محفوظة
  if (req.mode === "navigate" && isFieldPage(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGES);
        try {
          const res = await fetch(req);
          if (res.ok && !res.redirected) cache.put(url.pathname, res.clone());
          return res;
        } catch {
          return (
            (await cache.match(url.pathname)) ||
            (await cache.match("/m")) ||
            new Response("بدون نت، وما في نسخة محفوظة. افتح التطبيق مرة مع نت.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }
      })(),
    );
  }
});

// Background Sync: إذا التطبيق مفتوح بنطلب منه يبعت، وإلا بنبعت من هون بنفس قواعد lib/offline/sync.ts
self.addEventListener("sync", (event) => {
  if (event.tag !== "av-sync") return;
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window" });
      if (clients.length) {
        clients.forEach((c) => c.postMessage("flush"));
        return;
      }
      await flushFromWorker();
    })(),
  );
});

function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("av-offline", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("queue", { keyPath: "uuid" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function store(db, mode) {
  return db.transaction("queue", mode).objectStore("queue");
}

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function flushFromWorker() {
  const db = await idb();
  const items = (await req(store(db, "readonly").getAll()))
    .filter((i) => i.status === "pending")
    .sort((a, b) => a.filledAt.localeCompare(b.filledAt));
  for (const item of items) {
    let res;
    try {
      res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ uuid: item.uuid, kind: item.kind, filledAt: item.filledAt, payload: item.payload }),
      });
    } catch {
      throw new Error("offline"); // المتصفح بيعيد المحاولة لحاله
    }
    if (res.ok) await req(store(db, "readwrite").delete(item.uuid));
    else if (res.status === 401 || res.status >= 500) break;
    else {
      const data = await res.json().catch(() => ({}));
      await req(
        store(db, "readwrite").put({
          ...item,
          status: "failed",
          attempts: item.attempts + 1,
          error: data.error || `خطأ ${res.status}`,
        }),
      );
    }
  }
  db.close();
}
