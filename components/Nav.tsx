"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; soon?: boolean; count?: number; exact?: boolean };

// الصفحات اللي جاية بالمراحل الجاية بتظهر «قريباً» عشان الشكل العام يبيّن من هلأ
const MAIN: Item[] = [
  { href: "/", label: "الرئيسية" },
  { href: "/search", label: "البحث بالـ Line Code" },
  { href: "/visits", label: "الزيارات", exact: true },
  { href: "/visits/mine", label: "زياراتي" },
  { href: "/revisits", label: "إعادة الزيارة" },
  { href: "/map", label: "الخريطة" },
  { href: "/vpn", label: "حالات VPN" },
  { href: "/cards", label: "البطاقات" },
  { href: "/mikrotik/access", label: "بحاجة access" },
];

// للسفراء بس
const FIELD: Item[] = [
  { href: "/m", label: "تطبيق الميدان" },
  { href: "/mikrotik/reveals", label: "سجل عرض كلمات السر" },
];

const MANAGE: Item[] = [
  { href: "/admin/lines", label: "خطوط المشتركين" },
  { href: "/admin/import", label: "ملف الشهر" },
  { href: "/admin/lists", label: "القوائم" },
  { href: "/admin/users", label: "المستخدمون" },
  { href: "/admin/trash", label: "سلة المحذوفات" },
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
  const active =
    item.href === "/"
      ? path === "/"
      : item.exact
        ? path === item.href || (path.startsWith(`${item.href}/`) && !path.startsWith(`${item.href}/mine`))
        : path.startsWith(item.href);
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined}>
      {item.label}
      {!!item.count && (
        <span className="badge badge-red" aria-label={`${item.count} بانتظارك`}>
          {item.count}
        </span>
      )}
    </Link>
  );
}

export function Nav({ showAdmin, isAmbassador, inbox }: { showAdmin: boolean; isAmbassador: boolean; inbox: number }) {
  const path = usePathname();
  // زياراتي وطلبات التعديل للسفير بس
  const main = MAIN.filter((i) => isAmbassador || i.href !== "/visits/mine");
  const account = isAmbassador ? [{ href: "/inbox", label: "طلبات التعديل", count: inbox }, ...ACCOUNT] : ACCOUNT;
  return (
    <nav className="nav">
      {main.map((i) => (
        <NavItem key={i.href} item={i} path={path} />
      ))}
      {isAmbassador && (
        <>
          <div className="nav-group">الميدان</div>
          {FIELD.map((i) => (
            <NavItem key={i.href} item={i} path={path} />
          ))}
        </>
      )}
      {showAdmin && (
        <>
          <div className="nav-group">الإدارة</div>
          {MANAGE.map((i) => (
            <NavItem key={i.href} item={i} path={path} />
          ))}
        </>
      )}
      <div className="nav-group">حسابي</div>
      {account.map((i) => (
        <NavItem key={i.href} item={i} path={path} />
      ))}
    </nav>
  );
}
