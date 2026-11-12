import { Client } from "pg";
import { migrate } from "../scripts/migrate.mjs";
import { createPrisma } from "../lib/db";
import { createUser } from "../lib/users";
import { E2E_DATABASE_URL } from "../playwright.config";
import { ADMIN } from "./fixtures";

/** قاعدة بيانات نظيفة لكل تشغيل، فيها مسؤول واحد بس */
export default async function setup() {
  const url = new URL(E2E_DATABASE_URL);
  const dbName = url.pathname.slice(1);
  if (!dbName.endsWith("_test")) throw new Error(`Refusing to reset non-test database "${dbName}"`);
  const adminUrl = new URL(E2E_DATABASE_URL);
  adminUrl.pathname = "/postgres";
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await client.query(`CREATE DATABASE "${dbName}"`);
  await client.end();

  await migrate(E2E_DATABASE_URL, () => {});
  const db = createPrisma(E2E_DATABASE_URL);
  await createUser(null, { username: ADMIN.username, displayName: ADMIN.name, role: "ADMIN", password: ADMIN.password }, db);
  await db.$disconnect();
}
