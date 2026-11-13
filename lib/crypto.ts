/**
 * تشفير كلمات سر المايكروتيك: AES-256-GCM (بيكشف أي تلاعب).
 * المفتاح بمتغير البيئة MIKROTIK_KEY (32 بايت base64)، مش بقاعدة البيانات:
 * تسريب قاعدة البيانات لحالها ما بيكشف كلمات السر.
 *   توليد مفتاح: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ApiError } from "./errors";

function key(): Buffer {
  const raw = process.env.MIKROTIK_KEY;
  const k = raw ? Buffer.from(raw, "base64") : null;
  if (!k || k.length !== 32) throw new ApiError(500, "مفتاح التشفير MIKROTIK_KEY مش مضبوط على السيرفر");
  return k;
}

/** «v1:» + base64(iv 12 | tag 16 | النص المشفر) */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith("v1:")) throw new Error("unknown cipher format");
  const raw = Buffer.from(stored.slice(3), "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}
