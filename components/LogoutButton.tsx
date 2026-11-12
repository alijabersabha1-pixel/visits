"use client";

import { postJson } from "./fetcher";

export function LogoutButton() {
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        await postJson("/api/auth/logout");
        // تحميل كامل عن قصد: الجلسة تغيّرت وبدنا كل الصفحة تنبني من جديد
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/login");
      }}
    >
      خروج
    </button>
  );
}
