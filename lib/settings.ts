import { prisma as defaultPrisma, type Db, type Tx } from "./db";
import type { Prisma } from "./generated/prisma/client";

export async function getSetting<T>(key: string, fallback: T, db: Db | Tx = defaultPrisma): Promise<T> {
  const row = await db.setting.findUnique({ where: { key } });
  return row ? (row.value as T) : fallback;
}

export function setSetting(key: string, value: Prisma.InputJsonValue, db: Db | Tx = defaultPrisma) {
  return db.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}
