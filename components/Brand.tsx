/**
 * الهوية المؤقتة. لما يوصل ملف اللوجو الرسمي (SVG أو PNG) بنحطه بـ public/brand/
 * وبنبدّل BrandMark بصورة اللوجو. الألوان من plan.md.
 */
import Link from "next/link";

export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <rect width="36" height="36" rx="9" fill="#115d92" />
      <path d="M10 23.5c3.6 3.4 12.4 3.4 16 0" stroke="#77bb45" strokeWidth="3.2" strokeLinecap="round" fill="none" />
      <circle cx="13" cy="14" r="2.6" fill="#fff" />
      <circle cx="23" cy="14" r="2.6" fill="#77bb45" />
    </svg>
  );
}

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link className="brand" href={href}>
      <BrandMark />
      <span className="brand-text">
        <b>جوال</b>
        <span>نظام زيارات فريق السفراء</span>
      </span>
    </Link>
  );
}
