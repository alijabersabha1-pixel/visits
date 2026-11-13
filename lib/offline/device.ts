/** أدوات الجوال: موقع GPS بدقته، وتصغير الصور قبل التخزين والإرسال */

export type Gps = { lat: number; lng: number; accuracy: number };

/** GPS بيشتغل بدون نت. بنستنى لغاية 20 ثانية لأحسن دقة */
export function readGps(timeout = 20_000): Promise<Gps> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("الجوال ما بيدعم تحديد الموقع"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) =>
        reject(
          new Error(
            e.code === e.PERMISSION_DENIED
              ? "اسمح للتطبيق يوصل للموقع من إعدادات الجوال"
              : "ما قدرنا نحدد الموقع، جرّب برّا أو استنى شوي",
          ),
        ),
      { enableHighAccuracy: true, timeout, maximumAge: 30_000 },
    );
  });
}

/** صورة ← JPEG أبعاده لغاية 1280 بكسل (~150-300 كيلو) */
export async function compressImage(file: File, maxSide = 1280, quality = 0.72): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}

export interface Bootstrap {
  me: { id: string; displayName: string; canCreate: boolean };
  recommendations: { id: string; label: string }[];
  actions: { id: string; label: string }[];
  ambassadors: { id: string; displayName: string }[];
  mikrotikQuestions: { id: string; text: string; options: string[] }[];
  savedAt: string;
}

const BOOT_KEY = "av-bootstrap";

/** القوائم والأسئلة: من السيرفر إذا في نت، وإلا آخر نسخة محفوظة بالجوال */
export async function loadBootstrap(): Promise<{ data: Bootstrap | null; fromCache: boolean; needsLogin: boolean }> {
  try {
    const res = await fetch("/api/m/bootstrap", { credentials: "same-origin" });
    if (res.status === 401) return { data: cached(), fromCache: true, needsLogin: true };
    if (res.ok) {
      const data = (await res.json()) as Bootstrap;
      try {
        localStorage.setItem(BOOT_KEY, JSON.stringify(data));
      } catch {}
      return { data, fromCache: false, needsLogin: false };
    }
  } catch {}
  return { data: cached(), fromCache: true, needsLogin: false };
}

function cached(): Bootstrap | null {
  try {
    const raw = localStorage.getItem(BOOT_KEY);
    return raw ? (JSON.parse(raw) as Bootstrap) : null;
  } catch {
    return null;
  }
}
