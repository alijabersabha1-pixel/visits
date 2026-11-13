"use client";

import Link from "next/link";
import { useState } from "react";
import { postJson } from "@/components/fetcher";

export function PasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    if (form.get("newPassword") !== form.get("confirm")) {
      setError("كلمتين السر الجداد مش متطابقات");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await postJson("/api/account/password", {
      currentPassword: form.get("currentPassword"),
      newPassword: form.get("newPassword"),
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    formEl.reset();
    setDone(true);
  }

  if (done) {
    return (
      <div className="grid">
        <div className="alert alert-ok" role="status">
          تغيّرت كلمة السر.
        </div>
        <Link className="btn btn-primary" href="/">
          للرئيسية
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid">
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      <div className="field">
        <label htmlFor="currentPassword">كلمة السر الحالية</label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          className="input"
          dir="ltr"
          autoComplete="current-password"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="newPassword">كلمة السر الجديدة</label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          className="input"
          dir="ltr"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <span className="hint">8 أحرف على الأقل</span>
      </div>
      <div className="field">
        <label htmlFor="confirm">أعد كتابة كلمة السر الجديدة</label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          className="input"
          dir="ltr"
          autoComplete="new-password"
          required
        />
      </div>
      <div>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "لحظة…" : "حفظ"}
        </button>
      </div>
    </form>
  );
}
