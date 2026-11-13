/** قطع للعرض: الموقع على خريطة، الصور، وإجابات المايكروتيك (على السيرفر) */
import type { MikrotikAnswer } from "@/lib/mikrotik";

export function GpsLink({ lat, lng, accuracy }: { lat: number | null; lng: number | null; accuracy?: number | null }) {
  if (lat === null || lng === null) return <span className="muted">—</span>;
  return (
    <a
      href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`}
      target="_blank"
      rel="noopener noreferrer"
      className="ltr"
    >
      {lat.toFixed(5)}, {lng.toFixed(5)}
      {accuracy != null && <span className="muted"> ±{Math.round(accuracy)}م</span>}
    </a>
  );
}

export function Photos({ ids }: { ids: string[] }) {
  if (!ids.length) return null;
  return (
    <div className="photos">
      {ids.map((id) => (
        <a key={id} href={`/api/files/${id}`} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element -- الصور بتنخدم من API بعد فحص الدخول */}
          <img src={`/api/files/${id}`} alt="صورة من الزيارة" loading="lazy" />
        </a>
      ))}
    </div>
  );
}

export function MikrotikAnswers({ answers }: { answers: MikrotikAnswer[] | null | undefined }) {
  if (!answers?.length) return <span className="muted">—</span>;
  return (
    <dl className="kv" style={{ gridTemplateColumns: "1fr" }}>
      {answers.map((a) => (
        <div key={a.questionId}>
          <dt>{a.question}</dt>
          <dd>{a.answer}</dd>
        </div>
      ))}
    </dl>
  );
}
