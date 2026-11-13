import Link from "next/link";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/authz";
import { prisma } from "@/lib/db";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const { denied } = await searchParams;
  const showStats = can(user, "stats:view");
  const canManage = can(user, "users:manage");

  const [ambassadors, managers, changesToday] = showStats
    ? await Promise.all([
        prisma.user.count({ where: { role: "AMBASSADOR", active: true } }),
        prisma.user.count({ where: { role: "MANAGER", active: true } }),
        prisma.auditLog.count({ where: { at: { gte: startOfToday() } } }),
      ])
    : [0, 0, 0];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>أهلاً {user.displayName}</h1>
          <p className="muted">الرئيسية بتصير لوحة الأرقام لما تجهز الزيارات (المرحلة 5).</p>
        </div>
      </div>

      {denied && (
        <div className="alert alert-warn" role="alert" style={{ marginBottom: 16 }}>
          ما عندك صلاحية لهالصفحة.
        </div>
      )}

      {showStats && (
        <div className="grid grid-3" style={{ marginBottom: 16 }}>
          <div className="card stat">
            <div className="label">سفراء فعّالين</div>
            <div className="value">{ambassadors}</div>
          </div>
          <div className="card stat">
            <div className="label">مسؤولين فعّالين</div>
            <div className="value">{managers}</div>
          </div>
          <div className="card stat">
            <div className="label">عمليات بالسجل اليوم</div>
            <div className="value">{changesToday}</div>
            <div className="sub">
              <Link href="/admin/audit">افتح السجل</Link>
            </div>
          </div>
        </div>
      )}

      <div className="card card-pad">
        <h2>شو الجاهز هلأ</h2>
        <ul className="muted" style={{ margin: "10px 0 0", paddingInlineStart: 20 }}>
          <li>الدخول بالحساب الشخصي، والخروج، وتغيير كلمة السر</li>
          {canManage ? (
            <li>إدارة المستخدمين: إضافة، تغيير الدور، إيقاف، كلمة سر مؤقتة، طرد من كل الأجهزة</li>
          ) : (
            <li>قائمة المستخدمين للاطلاع</li>
          )}
          <li>سجل التعديلات بفلتر حسب الشخص والتاريخ</li>
        </ul>
      </div>
    </>
  );
}
