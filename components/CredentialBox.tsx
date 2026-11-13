"use client";

/** بيانات دخول المايكروتيك على بطاقة الخط: حفظ، وعرض بعد كلمة سر الحساب (للسفراء بس) */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "./fetcher";

export function CredentialBox({ lineCode, cred }: { lineCode: string; cred: { id: string; username: string } | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit" | "reveal">("view");
  const [shown, setShown] = useState<{ username: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const r = await postJson("/api/mikrotik/credentials", {
      lineCode,
      username: f.get("username"),
      password: f.get("password"),
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setMode("view");
    router.refresh();
  }

  async function reveal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const r = await postJson<{ username: string; password: string }>(`/api/mikrotik/credentials/${cred!.id}/reveal`, {
      accountPassword: f.get("accountPassword"),
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setShown(r.data);
    setMode("view");
    // ما بتضل ظاهرة على الشاشة
    window.setTimeout(() => setShown(null), 30_000);
  }

  return (
    <div className="grid" style={{ gap: 8 }}>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      {mode === "view" && (
        <div className="actions" style={{ alignItems: "center" }}>
          {cred ? (
            <span className="small">
              اسم المستخدم: <b className="ltr">{cred.username}</b>
              {shown && (
                <>
                  {" "}
                  · كلمة السر:{" "}
                  <b className="ltr" data-testid="mk-password">
                    {shown.password}
                  </b>
                </>
              )}
            </span>
          ) : (
            <span className="small muted">ما في بيانات دخول محفوظة</span>
          )}
          {cred && !shown && (
            <button className="btn btn-ghost btn-sm" onClick={() => setMode("reveal")}>
              عرض كلمة السر
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setMode("edit")}>
            {cred ? "تغيير" : "حفظ بيانات الدخول"}
          </button>
        </div>
      )}
      {mode === "edit" && (
        <form className="actions" onSubmit={save}>
          <input
            name="username"
            className="input ltr"
            style={{ maxWidth: 170 }}
            placeholder="اسم المستخدم"
            aria-label="اسم مستخدم المايكروتيك"
            required
            defaultValue={cred?.username}
          />
          <input
            name="password"
            type="password"
            className="input ltr"
            style={{ maxWidth: 170 }}
            placeholder="كلمة السر"
            aria-label="كلمة سر المايكروتيك"
            required
            autoComplete="off"
          />
          <button className="btn btn-primary btn-sm" disabled={busy}>
            حفظ مشفّر
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("view")}>
            إلغاء
          </button>
        </form>
      )}
      {mode === "reveal" && (
        <form className="actions" onSubmit={reveal}>
          <input
            name="accountPassword"
            type="password"
            className="input ltr"
            style={{ maxWidth: 220 }}
            placeholder="كلمة سر حسابك"
            aria-label="كلمة سر حسابك"
            required
            autoComplete="current-password"
            autoFocus
          />
          <button className="btn btn-primary btn-sm" disabled={busy}>
            عرض
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("view")}>
            إلغاء
          </button>
          <span className="hint" style={{ width: "100%" }}>
            العرض بينسجل باسمك ووقته.
          </span>
        </form>
      )}
    </div>
  );
}
