// يشغّل نسخة البناء المستقلة (.next/standalone) بعد ما ينسخ الملفات الثابتة جنبها،
// متل ما بيصير جوّا Docker. للتجربة المحلية والاختبارات.
import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

if (!existsSync(".next/standalone/server.js")) {
  console.error("ما في بناء. شغّل npm run build أول.");
  process.exit(1);
}
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true });

const child = spawn(process.execPath, [".next/standalone/server.js"], { stdio: "inherit", env: process.env });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
