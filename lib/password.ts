import { hash, verify } from "@node-rs/argon2";

// Argon2id بإعدادات OWASP الموصى فيها (19 MiB ذاكرة، مرتين، خيط واحد)
const OPTIONS = { algorithm: 2 /* Argon2id */, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const MIN_PASSWORD_LENGTH = 8;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** بصمة ثابتة بنتحقق منها لما المستخدم مش موجود، عشان الوقت يكون نفسه وما ينعرف مين موجود */
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("dummy-password-for-timing");
  return dummyHash;
}

/** كلمة سر مؤقتة سهلة القراءة: بدون أحرف متشابهة متل 0 وO و1 وl */
export function generateTempPassword(length = 10): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
