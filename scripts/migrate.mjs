/**
 * يطبّق ملفات prisma/migrations/<اسم>/migration.sql بالترتيب، وكل ملف مرة وحدة.
 * بنستخدمه بدل `prisma migrate deploy` لأنه ما بيحتاج تنزيل محرك Prisma من الإنترنت،
 * فبيشتغل على سيرفرات الشركة حتى لو كانت بدون نت.
 *
 * الاستخدام: npm run db:migrate   (أو: node scripts/migrate.mjs داخل Docker)
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { Client } from "pg";

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

/**
 * @param {string} databaseUrl
 * @param {(msg: string) => void} [log]
 * @returns {Promise<string[]>} أسماء الـ migrations اللي انطبقت هالمرة
 */
export async function migrate(databaseUrl, log = console.log) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  /** @type {string[]} */
  const applied = [];
  try {
    // قفل يمنع تشغيلين بنفس الوقت (مثلاً حاويتين)
    await client.query("SELECT pg_advisory_lock(728134)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_app_migrations" (
        "name" TEXT PRIMARY KEY,
        "checksum" TEXT NOT NULL,
        "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
    const done = new Map(
      (await client.query(`SELECT name, checksum FROM "_app_migrations"`)).rows.map((r) => [r.name, r.checksum]),
    );

    const names = (await readdir(MIGRATIONS_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    for (const name of names) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = done.get(name);
      if (previous) {
        if (previous !== checksum) {
          throw new Error(`Migration ${name} was changed after it was applied. Add a new migration instead.`);
        }
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(`INSERT INTO "_app_migrations" (name, checksum) VALUES ($1, $2)`, [name, checksum]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${name} failed: ${err.message}`);
      }
      applied.push(name);
      log(`applied ${name}`);
    }
    if (applied.length === 0) log("database is up to date");
  } finally {
    await client.query("SELECT pg_advisory_unlock(728134)").catch(() => {});
    await client.end();
  }
  return applied;
}

/**
 * صلاحيات مستخدم الموقع بقاعدة البيانات (مش مالك الجداول):
 * قراءة وكتابة عادية، بس سجل التعديلات وسجل عرض كلمات السر إضافة وقراءة بس.
 * مش مالك، فما بيقدر يطفي المحفّزات ولا يغيّر الجداول.
 *
 * @param {string} databaseUrl اتصال المالك
 * @param {string} role اسم مستخدم الموقع
 */
export async function grantAppRole(databaseUrl, role) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw new Error(`Invalid APP_DB_ROLE "${role}"`);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
    if (exists.rowCount === 0) throw new Error(`Database role "${role}" does not exist`);
    const r = `"${role}"`;
    await client.query(`GRANT USAGE ON SCHEMA public TO ${r}`);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${r}`);
    await client.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${r}`);
    for (const t of ["audit_log", "mikrotik_reveals"]) {
      await client.query(`REVOKE UPDATE, DELETE, TRUNCATE ON "${t}" FROM ${r}`);
    }
    // جداول الـ migrations للمالك بس
    await client.query(`REVOKE ALL ON "_app_migrations" FROM ${r}`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  // ملف .env (للتطوير). على Docker المتغيرات بتيجي من docker-compose.
  if (!process.env.DATABASE_URL && existsSync(".env")) process.loadEnvFile(".env");
  // الـ migrations بتنطبق باتصال المالك إذا موجود، والموقع بيشتغل باتصال مستخدم أقل صلاحيات
  const url = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  migrate(url)
    .then(async () => {
      if (process.env.APP_DB_ROLE) {
        await grantAppRole(url, process.env.APP_DB_ROLE);
        console.log(`permissions granted to ${process.env.APP_DB_ROLE}`);
      }
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
