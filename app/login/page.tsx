import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { BrandMark } from "@/components/Brand";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "تسجيل الدخول" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  return (
    <main className="auth">
      <div className="auth-card">
        <div className="card">
          <div className="card-pad">
            <div>
              <BrandMark size={44} />
              <h1 className="auth-title">تسجيل الدخول</h1>
              <p className="muted small" style={{ margin: "4px 0 0" }}>
                نظام زيارات فريق السفراء — جوال
              </p>
            </div>
            <LoginForm />
          </div>
        </div>
        <p className="auth-foot">كل شخص بيدخل بحسابه الشخصي. نسيت كلمة السر؟ احكي مع المسؤول.</p>
      </div>
    </main>
  );
}
