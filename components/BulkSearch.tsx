"use client";

import { useState } from "react";
import { postJson } from "./fetcher";
import { csv } from "@/lib/csv";

type Row = {
  input: string;
  status: "FOUND" | "NOT_FOUND" | "DUPLICATE" | "INVALID";
  accountName: string | null;
  visits: number;
  lastVisit: string | null;
  lastRecommendation: string | null;
};

const STATUS: Record<Row["status"], { text: string; tone: string }> = {
  FOUND: { text: "موجود", tone: "badge-green" },
  NOT_FOUND: { text: "غير موجود", tone: "badge-gray" },
  DUPLICATE: { text: "مكرر بالقائمة", tone: "badge-warn" },
  INVALID: { text: "مش صالح", tone: "badge-red" },
};

export function BulkSearch() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const codes = String(new FormData(e.currentTarget).get("codes") ?? "");
    setBusy(true);
    setError(null);
    const res = await postJson<{ rows: Row[] }>("/api/lines/bulk", { codes });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setRows(res.data.rows);
  }

  function download() {
    if (!rows) return;
    const data = csv([
      ["الكود", "الحالة", "الحساب", "عدد الزيارات", "آخر زيارة", "آخر توصية"],
      ...rows.map((r) => [
        r.input,
        STATUS[r.status].text,
        r.accountName,
        r.visits,
        r.lastVisit?.slice(0, 10) ?? "",
        r.lastRecommendation,
      ]),
    ]);
    const url = URL.createObjectURL(new Blob([data], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "بحث-جماعي.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const counts = rows?.reduce<Record<string, number>>(
    (acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc),
    {},
  );

  return (
    <div className="grid">
      <form className="card card-pad grid" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="codes">الأكواد (كود بكل سطر، لغاية 1000)</label>
          <textarea
            id="codes"
            name="codes"
            className="input ltr"
            rows={8}
            placeholder={"G-7872-002\nG-6903-003"}
            required
          />
          <span className="hint">بتقدر تلصق عمود كامل من الإكسل.</span>
        </div>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        <div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "عم ندوّر…" : "بحث"}
          </button>
        </div>
      </form>

      {rows && (
        <div className="card">
          <div className="card-head">
            <h2>
              النتيجة <span className="muted small">({rows.length})</span>
            </h2>
            <span className="actions">
              {Object.entries(counts ?? {}).map(([k, n]) => (
                <span key={k} className={`badge ${STATUS[k as Row["status"]].tone}`}>
                  {STATUS[k as Row["status"]].text}: {n}
                </span>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={download}>
                تصدير CSV
              </button>
            </span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>الكود</th>
                  <th>الحالة</th>
                  <th>الحساب</th>
                  <th>عدد الزيارات</th>
                  <th>آخر زيارة</th>
                  <th>آخر توصية</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="ltr">
                      {r.status === "FOUND" ? (
                        <a href={`/search?code=${encodeURIComponent(r.input)}`}>{r.input}</a>
                      ) : (
                        r.input
                      )}
                    </td>
                    <td>
                      <span className={`badge ${STATUS[r.status].tone}`}>{STATUS[r.status].text}</span>
                    </td>
                    <td>{r.accountName ?? "—"}</td>
                    <td>{r.visits}</td>
                    <td className="ltr small">{r.lastVisit?.slice(0, 10) ?? "—"}</td>
                    <td className="small">{r.lastRecommendation ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
