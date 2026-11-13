"use client";

import { useState } from "react";
import { postJson } from "@/components/fetcher";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await postJson<{ mustChangePassword: boolean }>("/api/auth/login", {
      username: form.get("username"),
      password: form.get("password"),
    });
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    // تحميل كامل عن قصد بعد الدخول

    window.location.assign(res.data.mustChangePassword ? "/account/password" : "/");
  }

  return (
    <form onSubmit={onSubmit} className="grid" noValidate>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      <div className="field">
        <label htmlFor="username">اسم الدخول</label>
        <input
          id="username"
          name="username"
          className="input"
          dir="ltr"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          autoFocus
        />
      </div>
      <div className="field">
        <label htmlFor="password">كلمة السر</label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          dir="ltr"
          autoComplete="current-password"
          required
        />
      </div>
      <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
        {busy ? "لحظة…" : "دخول"}
      </button>
    </form>
  );
}
