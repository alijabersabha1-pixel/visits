/**
 * أعمدة أفقية بسيطة لسلسلة وحدة (توزيع الإجراءات): الاسم، العمود، الرقم.
 * كل الأرقام مكتوبة، فما في حاجة لتلميح عند التمرير.
 */
export function BarList({
  rows,
  muted,
}: {
  rows: Array<{ label: string; count: number }>;
  /** صفوف بتنرسم رمادي (متل «بدون إجراء») */
  muted?: string[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((s, r) => s + r.count, 0);
  if (rows.length === 0) return <div className="empty">ما في بيانات لسا.</div>;
  return (
    <ul className="barlist">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${r.count} (${Math.round((r.count / Math.max(1, total)) * 100)}%)`}>
          <span className="barlist-label">{r.label}</span>
          <span className="barlist-track" aria-hidden="true">
            <span
              className={`barlist-bar${muted?.includes(r.label) ? " is-muted" : ""}`}
              style={{ width: `${Math.max(2, (r.count / max) * 100)}%` }}
            />
          </span>
          <b className="barlist-value ltr">{r.count}</b>
        </li>
      ))}
    </ul>
  );
}
