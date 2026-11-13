import { requirePermission } from "@/lib/session";
import "./print.css";

/** صفحات الطباعة: بدون قائمة، A4، ومنها بينعمل الـ PDF */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("export");
  return <div className="print-root">{children}</div>;
}
