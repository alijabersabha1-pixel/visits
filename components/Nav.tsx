"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; soon?: boolean };

// الصفحات اللي جاية بالمراحل الجاية بتظهر «قريباً» عشان الشكل العام يبيّن من هلأ
const MAIN: Item[] = [
  { href: "/", label: "الرئيسية" },
  { href: "/search", label: "البحث بالـ Line Code", soon: true },
  { href: "/visits", label: "الزيارات", soon: true },
  { href: "/visits/mine", label: "زياراتي", soon: true },
  { href: "/revisits", label: "إعادة الزيارة", soon: true },
  { href: "/map", label: "الخريطة", soon: true },
  { href: "/vpn", label: "حالات VPN", soon: true },
  { href: "/cards", label: "البطاقات", soon: true },
];

const MANAGE: Item[] = [
  { href: "/admin/lines", label: "خطوط المشتركين" },
  { href: "/admin/import", label: "ملف الشهر" },
  { href: "/admin/lists", label: "القوائم" },
  { href: "/admin/users", label: "المستخدمون" },
  { href: "/admin/audit", label: "سجل التعديلات" },
];

const ACCOUNT: Item[] = [{ href: "/account/password", label: "تغيير كلمة السر" }];

function NavItem({ item, path }: { item: Item; path: string }) {
  if (item.soon) {
    return (
      <span className="nav-soon" aria-disabled="true">
        {item.label}
        <span className="soon-tag">قريباً</span>
      </span>
    );
  }
  const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined}>
      {item.label}
    </Link>
  );
}

export function Nav({ showAdmin }: { showAdmin: boolean }) {
  const path = usePathname();
  return (
    <nav className="nav">
      {MAIN.map((i) => (
        <NavItem key={i.href} item={i} path={path} />
      ))}
      {showAdmin && (
        <>
          <div className="nav-group">الإدارة</div>
          {MANAGE.map((i) => (
            <NavItem key={i.href} item={i} path={path} />
          ))}
        </>
      )}
      <div className="nav-group">حسابي</div>
      {ACCOUNT.map((i) => (
        <NavItem key={i.href} item={i} path={path} />
      ))}
    </nav>
  );
}
