/**
 * هوية جوال. اللوجو من الصورة اللي بعتها علي (public/brand/).
 * لما توصل نسخة SVG رسمية بنبدّل الملفات بس، والكود بيضل نفسه.
 */
import Link from "next/link";

/* eslint-disable @next/next/no-img-element -- صور صغيرة ثابتة، ما بتحتاج تحسين Next */

export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <img className="brand-mark" src="/brand/jawwal-symbol.png" width={size} height={size} alt="" aria-hidden="true" />
  );
}

export function BrandLogo({ height = 96 }: { height?: number }) {
  return (
    <img
      src="/brand/jawwal-logo.png"
      height={height}
      width={Math.round((height * 170) / 228)}
      alt="جوال Jawwal"
      style={{ display: "block", margin: "0 auto" }}
    />
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
