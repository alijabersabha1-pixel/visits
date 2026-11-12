import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { PasswordForm } from "./PasswordForm";

export const metadata: Metadata = { title: "تغيير كلمة السر" };

export default async function PasswordPage() {
  const user = await requireUser({ passwordPage: true });
  return (
    <>
      <div className="page-head">
        <div>
          <h1>تغيير كلمة السر</h1>
          <p className="muted">بعد التغيير بتطلع من كل الأجهزة التانية، وبتضل داخل هون.</p>
        </div>
      </div>
      {user.mustChangePassword && (
        <div className="alert alert-warn" role="alert" style={{ marginBottom: 16, maxWidth: 520 }}>
          المسؤول أعطاك كلمة سر مؤقتة. اختار كلمة سر جديدة عشان تكمّل.
        </div>
      )}
      <div className="card card-pad" style={{ maxWidth: 520 }}>
        <PasswordForm />
      </div>
    </>
  );
}
