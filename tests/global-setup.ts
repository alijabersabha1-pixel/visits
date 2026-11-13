/**
 * قبل الاختبارات: قاعدة بيانات اختبار نظيفة (visits_test) بنفس الـ migrations.
 * ما بتلمس قاعدة التطوير.
 */
import { Client } from "pg";
import { migrate } from "../scripts/migrate.mjs";
import { TEST_DATABASE_URL } from "./env";

export default async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);
  if (!/^[a-z0-9_]+_test$/.test(dbName)) throw new Error(`Refusing to reset non-test database "${dbName}"`);
  const admin = new URL(TEST_DATABASE_URL);
  admin.pathname = "/postgres";
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await client.query(`CREATE DATABASE "${dbName}"`);
  await client.end();
  await migrate(TEST_DATABASE_URL, () => {});
  // نسخة من القوائم الابتدائية (من الـ migration) عشان كل اختبار يرجع لها
  const db = new Client({ connectionString: TEST_DATABASE_URL });
  await db.connect();
  await db.query(`CREATE TABLE "_seed_list_items" AS SELECT * FROM "list_items"`);
  await db.query(`CREATE TABLE "_seed_mikrotik_questions" AS SELECT * FROM "mikrotik_questions"`);
  await db.end();
}
