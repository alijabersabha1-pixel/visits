/**
 * طابور الجوال (IndexedDB). كل عنصر بيتخزن برقمه الفريد ووقت تعبئته،
 * وما بينمسح إلا بعد ما السيرفر يأكد إنه وصل (lib/offline/sync.ts).
 * نفس شكل التخزين بيقرأه public/sw.js للـ Background Sync.
 */
export const DB_NAME = "av-offline";
export const STORE = "queue";

export type QueueKind = "VISIT" | "VPN" | "CARD";

export interface QueueItem {
  uuid: string;
  kind: QueueKind;
  filledAt: string;
  payload: Record<string, unknown>;
  label: string; // للعرض بشريط الانتظار
  status: "pending" | "failed";
  error?: string;
  attempts: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "uuid" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => {
      db.close();
      resolve(r.result);
    };
    t.onerror = () => reject(t.error);
  });
}

export function allItems(): Promise<QueueItem[]> {
  return tx("readonly", (s) => s.getAll() as IDBRequest<QueueItem[]>).then((items) =>
    items.sort((a, b) => a.filledAt.localeCompare(b.filledAt)),
  );
}

export function putItem(item: QueueItem): Promise<IDBValidKey> {
  return tx("readwrite", (s) => s.put(item));
}

export function deleteItem(uuid: string): Promise<undefined> {
  return tx("readwrite", (s) => s.delete(uuid));
}

export const QUEUE_EVENT = "av-queue-changed";

/** عنصر جديد: بيتخزن بالجوال أول، وبعدين بنحاول نبعته */
export async function enqueue(kind: QueueKind, payload: Record<string, unknown>, label: string): Promise<QueueItem> {
  const item: QueueItem = {
    uuid: crypto.randomUUID(),
    kind,
    filledAt: new Date().toISOString(),
    payload,
    label,
    status: "pending",
    attempts: 0,
  };
  await putItem(item);
  window.dispatchEvent(new Event(QUEUE_EVENT));
  // Background Sync إذا الجوال بيدعم (أندرويد/كروم): بيبعت حتى لو التطبيق انسكّر
  navigator.serviceWorker?.ready
    .then((r) =>
      (r as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync?.register("av-sync"),
    )
    .catch(() => {});
  return item;
}
