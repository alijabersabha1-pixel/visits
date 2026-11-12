import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export type Db = PrismaClient;
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export function createPrisma(url = process.env.DATABASE_URL): PrismaClient {
  if (!url) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

// نسخة وحدة، بتنعمل أول ما تنطلب (مش وقت الاستيراد) عشان السكربتات والاختبارات
// تقدر تحدد DATABASE_URL قبل. بالتطوير بتنحفظ عالـ global عشان إعادة التحميل ما تفتح اتصالات جديدة.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getPrisma(): PrismaClient {
  globalForPrisma.prisma ??= createPrisma();
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
