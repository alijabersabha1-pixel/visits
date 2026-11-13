import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiRequire, apiUser, checkOrigin, handler, parseBody, ApiError } from "@/lib/api";
import { login, SESSION_COOKIE } from "@/lib/auth";
import { generateTempPassword, verifyPassword } from "@/lib/password";
import { resetDb, makeUser } from "./helpers";

const BASE = "http://app.test";

function req(method: string, opts: { origin?: string; body?: unknown; cookie?: string } = {}) {
  const headers = new Headers();
  if (opts.origin) headers.set("origin", opts.origin);
  if (opts.cookie) headers.set("cookie", `${SESSION_COOKIE}=${opts.cookie}`);
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  return new NextRequest(`${BASE}/api/x`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body),
  });
}

describe("checkOrigin (CSRF)", () => {
  it("GET ما بيحتاج مصدر", () => expect(() => checkOrigin(req("GET"))).not.toThrow());
  it("POST من نفس الموقع مسموح", () => expect(() => checkOrigin(req("POST", { origin: BASE }))).not.toThrow());
  it("POST بدون مصدر أو من موقع تاني بينرفض", () => {
    expect(() => checkOrigin(req("POST"))).toThrow(ApiError);
    expect(() => checkOrigin(req("DELETE", { origin: "https://evil.example" }))).toThrow("مصدر");
  });
});

describe("handler", () => {
  const ok = handler(async () => NextResponse.json({ ok: true }));

  it("بيرجع 403 للمصدر الغريب قبل ما ينفذ", async () => {
    const res = await ok(req("POST", { origin: "https://evil.example" }), undefined);
    expect(res.status).toBe(403);
  });

  it("بيحوّل ApiError وZodError والأخطاء المجهولة", async () => {
    const apiErr = handler(async () => {
      throw new ApiError(409, "تعارض");
    });
    expect((await apiErr(req("GET"), undefined)).status).toBe(409);

    const zodErr = handler(async (r) => {
      await parseBody(r, z.object({ n: z.number({ error: "رقم لو سمحت" }) }));
      return NextResponse.json({});
    });
    const res = await zodErr(req("POST", { origin: BASE, body: { n: "x" } }), undefined);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("رقم لو سمحت");

    const badJson = await zodErr(req("POST", { origin: BASE, body: "{not json" }), undefined);
    expect(badJson.status).toBe(400);

    const boom = handler(async () => {
      throw new Error("secret internal detail");
    });
    const orig = console.error;
    console.error = () => {};
    const r500 = await boom(req("GET"), undefined);
    console.error = orig;
    expect(r500.status).toBe(500);
    expect(JSON.stringify(await r500.json())).not.toContain("secret");
  });
});

describe("apiUser / apiRequire", () => {
  beforeEach(resetDb);

  it("401 بدون جلسة، و403 للمسؤول على أي عملية بتغيّر", async () => {
    await expect(apiUser(req("GET"))).rejects.toMatchObject({ status: 401 });
    await makeUser("boss", "MANAGER");
    const r = await login("boss", "correct-horse-1");
    if (!r.ok) throw new Error();
    const u = await apiUser(req("GET", { cookie: r.token }));
    expect(u.username).toBe("boss");
    await expect(apiRequire(req("GET", { cookie: r.token }), "users:manage")).rejects.toMatchObject({ status: 403 });
    await expect(apiRequire(req("GET", { cookie: r.token }), "visits:create")).rejects.toMatchObject({ status: 403 });
    await expect(apiRequire(req("GET", { cookie: r.token }), "audit:view")).resolves.toMatchObject({
      username: "boss",
    });
  });
});

describe("كلمات السر", () => {
  it("المؤقتة بدون أحرف متشابهة", () => {
    for (let i = 0; i < 50; i++) expect(generateTempPassword()).toMatch(/^[a-km-np-zA-HJ-NP-Z2-9]{10}$/);
  });
  it("بصمة تالفة ما بتكسر التحقق", async () => {
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
  });
});
