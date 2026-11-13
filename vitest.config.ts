import { defineConfig } from "vitest/config";
import path from "node:path";
import { TEST_DATABASE_URL } from "./tests/env";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      // مفتاح تجريبي للاختبارات بس (32 بايت)
      MIKROTIK_KEY: "dGVzdC1rZXktdGVzdC1rZXktdGVzdC1rZXktMzJieXQ=",
      UPLOAD_DIR: "/tmp/av-test-uploads",
    },
    // اختبارات قاعدة البيانات بتشتغل على قاعدة منفصلة وبالترتيب
    fileParallelism: false,
    testTimeout: 20_000,
    // session.ts مربوط بـ next/headers فبيتغطى باختبارات المتصفح (e2e)
    coverage: {
      include: ["lib/**/*.ts"],
      exclude: ["lib/generated/**", "lib/session.ts"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
