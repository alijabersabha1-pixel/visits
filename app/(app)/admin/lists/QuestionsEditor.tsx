"use client";

/** أسئلة المايكروتيك: إضافة، تعديل النص والخيارات، ترتيب، إيقاف وتفعيل */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { patchJson, postJson } from "@/components/fetcher";

type Q = { id: string; text: string; options: string[]; active: boolean; sortOrder: number; role: string | null };

const splitOptions = (s: string) => s.split(/[\n،,·]/).map((o) => o.trim()).filter(Boolean);

export function QuestionsEditor({ questions, canManage }: { questions: Q[]; canManage: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const active = questions.filter((q) => q.active);
  const inactive = questions.filter((q) => !q.active);

  async function run(p: Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const res = await p;
    setBusy(false);
    if (!res.ok) setError(res.error ?? "صار خطأ");
    else router.refresh();
    return res.ok;
  }

  /** تبديل الترتيب مع السؤال اللي جنبه */
  async function move(i: number, dir: -1 | 1) {
    const a = active[i];
    const b = active[i + dir];
    if (!a || !b) return;
    await run(patchJson(`/api/mikrotik/questions/${a.id}`, { sortOrder: b.sortOrder }));
    await run(patchJson(`/api/mikrotik/questions/${b.id}`, { sortOrder: a.sortOrder }));
  }

  return (
    <section className="card" aria-label="أسئلة المايكروتيك" data-list="MIKROTIK" style={{ gridColumn: "1 / -1" }}>
      <div className="card-head">
        <h2>أسئلة المايكروتيك</h2>
        <span className="muted small">{active.length} فعّالة · بتظهر بنموذج الزيارة بأزرار سريعة</span>
      </div>
      {error && (
        <div className="alert alert-error" role="alert" style={{ margin: "12px 20px 0" }}>
          {error}
        </div>
      )}
      <ol style={{ listStyle: "none", margin: 0, padding: "6px 0" }}>
        {active.map((q, i) =>
          editing === q.id ? (
            <li key={q.id} className="list-row" style={{ display: "block" }}>
              <form
                className="grid"
                style={{ gap: 8 }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const ok = await run(
                    patchJson(`/api/mikrotik/questions/${q.id}`, {
                      text: String(f.get("text") ?? ""),
                      options: splitOptions(String(f.get("options") ?? "")),
                    }),
                  );
                  if (ok) setEditing(null);
                }}
              >
                <input name="text" className="input" defaultValue={q.text} aria-label="نص السؤال" required />
                <input
                  name="options"
                  className="input"
                  defaultValue={q.options.join("، ")}
                  aria-label="الخيارات"
                  required
                />
                <div className="actions">
                  <button className="btn btn-primary btn-sm" disabled={busy}>
                    حفظ
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>
                    إلغاء
                  </button>
                </div>
              </form>
            </li>
          ) : (
            <li key={q.id} className="list-row">
              <span className="list-label">
                <b>{q.text}</b>
                <span className="muted small"> — {q.options.join(" · ")}</span>
              </span>
              {canManage && (
                <span className="actions">
                  <button className="btn btn-ghost btn-sm" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="لفوق">
                    ↑
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={busy || i === active.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label="لتحت"
                  >
                    ↓
                  </button>
                  <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(q.id)}>
                    تعديل
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    disabled={busy}
                    onClick={() => run(patchJson(`/api/mikrotik/questions/${q.id}`, { active: false }))}
                  >
                    إيقاف
                  </button>
                </span>
              )}
            </li>
          ),
        )}
      </ol>
      {inactive.length > 0 && (
        <details style={{ padding: "0 20px 12px" }}>
          <summary className="small muted">موقوفة ({inactive.length})</summary>
          {inactive.map((q) => (
            <div key={q.id} className="list-row" style={{ padding: "6px 0" }}>
              <span className="list-label muted">{q.text}</span>
              {canManage && (
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => run(patchJson(`/api/mikrotik/questions/${q.id}`, { active: true }))}
                >
                  تفعيل
                </button>
              )}
            </div>
          ))}
        </details>
      )}
      {canManage && (
        <form
          className="filters form-grid"
          style={{ borderTop: "1px solid var(--line)", borderBottom: 0 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const formEl = e.currentTarget;
            const f = new FormData(formEl);
            const ok = await run(
              postJson("/api/mikrotik/questions", {
                text: String(f.get("text") ?? ""),
                options: splitOptions(String(f.get("options") ?? "")),
              }),
            );
            if (ok) formEl.reset();
          }}
        >
          <div className="field">
            <label htmlFor="mq-text">سؤال جديد</label>
            <input id="mq-text" name="text" className="input" placeholder="مثلاً: نوع الجهاز؟" required />
          </div>
          <div className="field">
            <label htmlFor="mq-options">الخيارات</label>
            <input id="mq-options" name="options" className="input" placeholder="نعم، لا" required />
            <span className="hint">افصل بينها بفاصلة</span>
          </div>
          <div>
            <button className="btn btn-primary" disabled={busy}>
              إضافة سؤال
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
