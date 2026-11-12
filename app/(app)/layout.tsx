import { requireUser } from "@/lib/session";
import { can } from "@/lib/authz";
import { Brand, BrandMark } from "@/components/Brand";
import { Nav } from "@/components/Nav";
import { LogoutButton } from "@/components/LogoutButton";

const ROLE_LABEL = { ADMIN: "مسؤول", AMBASSADOR: "سفير" } as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // كل صفحة بتفحص الدخول والصلاحية بنفسها كمان (requireUser / requirePermission)
  const user = await requireUser({ passwordPage: true });

  const isAdmin = can(user, "users:manage");
  const foot = (
    <div className="sidebar-foot">
      <span className="avatar" aria-hidden="true">
        {user.displayName.trim().charAt(0)}
      </span>
      <span className="me">
        <b>{user.displayName}</b>
        <span className="small muted">{ROLE_LABEL[user.role]}</span>
      </span>
      <LogoutButton />
    </div>
  );

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="القائمة">
        <div className="sidebar-head">
          <Brand />
        </div>
        <Nav isAdmin={isAdmin} />
        {foot}
      </aside>

      <details className="topbar">
        <summary>
          <span className="brand">
            <BrandMark size={32} />
            <span className="brand-text">
              <b>جوال</b>
            </span>
          </span>
          <span className="menu-btn" aria-label="القائمة">
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
        </summary>
        <Nav isAdmin={isAdmin} />
        {foot}
      </details>

      <main className="main">{children}</main>
    </div>
  );
}
