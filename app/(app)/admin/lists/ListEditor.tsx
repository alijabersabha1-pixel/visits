"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { patchJson, postJson } from "@/components/fetcher";

type Item = { id: string; label: string; active: boolean; color: string | null };

export function ListEditor({
  kind,
  title,
  items,
  canManage,
}: {
  kind: "RECOMMENDATION" | "ACTION";
  title: string;
  items: Item[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = items.filter((i) => i.active);
  const inactive = items.filter((i) => !i.active);

  async function run(p: Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const res = await p;
    setBusy(false);
    if (!res.ok) setError(res.error ?? "صار خطأ");
    else router.refresh();
    return res.ok;
  }

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const label = String(new FormData(formEl).get("label") ?? "");
    if (await run(postJson("/api/lists", { kind, label }))) formEl.reset();
  }

  return (
    <section className="card" aria-label={title} data-list={kind}>
      <div className="card-head">
        <h2>{title}</h2>
        <span className="muted small">{active.length} فعّالة</span>
      </div>
      {error && (
        <div className="alert alert-error" role="alert" style={{ margin: "12px 20px 0" }}>
          {error}
        </div>
      )}
      <ol style={{ listStyle: "none", margin: 0, padding: "6px 0" }}>
        {active.map((item, i) => (
          <li key={item.id} className="list-row">
            <span className="list-label">
              {item.color && <span className="dot" style={{ background: item.color }} aria-hidden="true" />}
              {item.label}
            </span>
            {canManage && (
              <span className="actions">
                <button
                  className="btn btn-ghost btn-sm"
                  aria-label={`${item.label} لفوق`}
                  disabled={busy || i === 0}
                  onClick={() => run(patchJson(`/api/lists/${item.id}`, { move: "up" }))}
                >
                  ↑
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  aria-label={`${item.label} لتحت`}
                  disabled={busy || i === active.length - 1}
                  onClick={() => run(patchJson(`/api/lists/${item.id}`, { move: "down" }))}
                >
                  ↓
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  disabled={busy}
                  onClick={() => run(patchJson(`/api/lists/${item.id}`, { active: false }))}
                >
                  إيقاف
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>
      {canManage && (
        <form onSubmit={onAdd} className="list-add">
          <label className="sr-only" htmlFor={`add-${kind}`}>
            قيمة جديدة لـ {title}
          </label>
          <input id={`add-${kind}`} name="label" className="input" placeholder="قيمة جديدة" required />
          <button className="btn btn-primary" type="submit" disabled={busy}>
            إضافة
          </button>
        </form>
      )}
      {inactive.length > 0 && (
        <details className="list-inactive">
          <summary className="small muted">موقوفة ({inactive.length}): بتظهر بالزيارات القديمة بس</summary>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {inactive.map((item) => (
              <li key={item.id} className="list-row">
                <span className="list-label muted">{item.label}</span>
                {canManage && (
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() => run(patchJson(`/api/lists/${item.id}`, { active: true }))}
                  >
                    رجّعها
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
