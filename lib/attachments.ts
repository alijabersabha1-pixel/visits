/**
 * الصور المرفقة. بنفحص المحتوى نفسه (أول بايتات الملف)، مش الاسم أو النوع المكتوب،
 * وبنخزنها برّا مجلد الموقع (UPLOAD_DIR)، وبتنخدم بس عبر /api/files بعد فحص الدخول.
 */
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma as defaultPrisma, type Db, type Tx } from "./db";
import { ApiError } from "./errors";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_PHOTOS = 5;

const MAGIC: Array<{ mime: string; ext: string; bytes: number[] }> = [
  { mime: "image/jpeg", ext: "jpg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", ext: "png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/webp", ext: "webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF....WEBP
];

export interface DecodedImage {
  buffer: Buffer;
  mime: string;
  ext: string;
}

export function decodeImage(dataUrl: string): DecodedImage {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new ApiError(400, "الملف المرفق مش صورة");
  if ((m[2].length * 3) / 4 > MAX_IMAGE_BYTES + 4) throw new ApiError(413, "الصورة كبيرة كتير (الحد 2 ميغا)");
  const buffer = Buffer.from(m[2], "base64");
  if (buffer.length > MAX_IMAGE_BYTES) throw new ApiError(413, "الصورة كبيرة كتير (الحد 2 ميغا)");
  const kind = MAGIC.find((k) => k.bytes.every((b, i) => buffer[i] === b));
  if (!kind || (kind.ext === "webp" && buffer.subarray(8, 12).toString("ascii") !== "WEBP")) {
    throw new ApiError(400, "الملف المرفق مش صورة");
  }
  return { buffer, mime: kind.mime, ext: kind.ext };
}

function uploadRoot() {
  return path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), "data", "uploads"));
}

/**
 * بيكتب الملفات وبيضيف سطورها بنفس الـ transaction.
 * إذا فشلت العملية بعد الكتابة، الملفات بتنمسح (cleanup بيرجع للمستدعي).
 */
export async function storeImages(
  tx: Tx,
  entity: "Visit" | "Card",
  entityId: string,
  images: DecodedImage[],
  createdById: string,
): Promise<() => Promise<void>> {
  const written: string[] = [];
  const now = new Date();
  const dir = path.join(uploadRoot(), String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, "0"));
  await mkdir(dir, { recursive: true });
  for (const img of images) {
    const id = randomUUID();
    const file = path.join(dir, `${id}.${img.ext}`);
    await writeFile(file, img.buffer, { flag: "wx" });
    written.push(file);
    await tx.attachment.create({
      data: { id, entity, entityId, mime: img.mime, size: img.buffer.length, path: file, createdById },
    });
  }
  return async () => {
    await Promise.all(written.map((f) => unlink(f).catch(() => {})));
  };
}

export async function readAttachment(id: string, db: Db = defaultPrisma) {
  const a = await db.attachment.findUnique({ where: { id } });
  if (!a) return null;
  // احتياط: ما بنقرأ إلا من جوّا مجلد الرفع
  const resolved = path.resolve(a.path);
  if (!resolved.startsWith(uploadRoot() + path.sep)) return null;
  return { ...a, buffer: await readFile(resolved) };
}
