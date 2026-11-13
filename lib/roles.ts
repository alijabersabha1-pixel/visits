import type { Role } from "./authz";

export const ROLE_LABEL: Record<Role, string> = {
  AMBASSADOR: "سفير",
  MANAGER: "مسؤول",
};

export const ROLE_HINT: Record<Role, string> = {
  AMBASSADOR: "بيعمل كل شي بالنظام",
  MANAGER: "بيشوف كل شي للقراءة بس، وما بيغيّر ولا شي",
};
