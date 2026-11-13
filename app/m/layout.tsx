import type { Metadata } from "next";
import { MobileShell } from "@/components/m/MobileShell";

export const metadata: Metadata = { title: "الميدان" };

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return <MobileShell>{children}</MobileShell>;
}
