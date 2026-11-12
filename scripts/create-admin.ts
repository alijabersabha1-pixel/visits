/**
 * ينشئ أول مسؤول بالنظام.
 *
 *   npm run create-admin -- --username ali --name "علي جبر"
 *
 * كلمة السر بتنطلب من الشاشة (ما بتنكتب بالأمر عشان ما تنحفظ بتاريخ الأوامر).
 * للتشغيل الآلي (الاختبارات) ممكن تنعطى بـ ADMIN_PASSWORD.
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { createPrisma } from "../lib/db";
import { createUser, createUserSchema } from "../lib/users";

async function askHidden(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
  out._writeToOutput = (s: string) => {
    if (s.includes(question)) out.output.write(s);
  };
  const answer = await rl.question(question);
  rl.close();
  process.stdout.write("\n");
  return answer;
}

async function main() {
  const { values } = parseArgs({
    options: { username: { type: "string" }, name: { type: "string" } },
  });
  if (!values.username || !values.name) {
    console.error('الاستخدام: npm run create-admin -- --username ali --name "علي جبر"');
    process.exit(1);
  }
  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    password = await askHidden("كلمة السر: ");
    const again = await askHidden("أعد كتابتها: ");
    if (password !== again) {
      console.error("كلمتين السر مش متطابقات");
      process.exit(1);
    }
  }
  const input = createUserSchema.parse({ username: values.username, displayName: values.name, role: "ADMIN", password });
  const db = createPrisma();
  try {
    const { user } = await createUser(null, input, db);
    console.log(`تم إنشاء المسؤول ${user.displayName} (${user.username})`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err?.issues?.[0]?.message ?? err?.message ?? err);
  process.exit(1);
});
