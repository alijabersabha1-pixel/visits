"use client";

import Link from "next/link";
import { useMobile } from "@/components/m/MobileShell";

export default function MobileHome() {
  const { boot, online } = useMobile();
  return (
    <div className="grid">
      <h1 style={{ fontSize: 20 }}>أهلاً {boot?.me.displayName ?? ""}</h1>
      <div className="m-tiles">
        <Link className="m-tile" href="/m/visit">
          <b>زيارة جديدة</b>
          <span>تقرير، موقع، صور، مايكروتيك</span>
        </Link>
        <Link className="m-tile" href="/m/vpn">
          <b>حالة VPN</b>
          <span>اسم الشبكة والـ IP والمكان</span>
        </Link>
        <Link className="m-tile" href="/m/card">
          <b>شراء بطاقة</b>
          <span>السعر والشبكة</span>
        </Link>
        {online && (
          <>
            <Link className="m-tile m-tile-soft" href="/search">
              <b>بحث بالـ Line Code</b>
              <span>بده نت</span>
            </Link>
            <Link className="m-tile m-tile-soft" href="/revisits">
              <b>إعادة الزيارة</b>
              <span>بده نت</span>
            </Link>
            <Link className="m-tile m-tile-soft" href="/">
              <b>الموقع الكامل</b>
              <span>بده نت</span>
            </Link>
          </>
        )}
      </div>
      <p className="small muted">
        كل شي بتعبّيه هون بينحفظ بالجوال أول، وبينبعت لحاله لما يكون في نت. وقت التعبئة والموقع بينحفظوا لحظة الحفظ.
      </p>
    </div>
  );
}
