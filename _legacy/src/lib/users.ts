// ユーザー管理 — 従業員とモジュール別の閲覧権限。
// perms: moduleKey（lib/nav.ts 準拠）→ true/false（閲覧可否）。
// 管理者が権限マトリクスの各項目を切り替える。

import { NAV } from "./nav";

export type Role = "ADMIN" | "MANAGER" | "STAFF" | "VIEWER";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  dept: string;
  role: Role;
  active: boolean;
  perms: Record<string, boolean>; // key = NAV item key
};

export const STORAGE_KEY = "bl_users_v1";
export const MODULE_KEYS = NAV.map((n) => n.key);

export const ROLE_TONE: Record<Role, string> = {
  ADMIN: "bg-brand-50 text-brand-700",
  MANAGER: "bg-violet-50 text-violet-600",
  STAFF: "bg-slate-100 text-slate-600",
  VIEWER: "bg-slate-100 text-slate-500",
};

// ロール別の初期権限（管理者が後から各項目を調整可能）。
export function presetPerms(role: Role): Record<string, boolean> {
  const all = (v: boolean) => Object.fromEntries(MODULE_KEYS.map((k) => [k, v]));
  if (role === "ADMIN") return all(true);
  if (role === "MANAGER") return { ...all(true), users: false, settings: false };
  if (role === "STAFF") return { ...all(false), dashboard: true, sales: true, customers: true, okr: true };
  return { ...all(false), dashboard: true, reports: true }; // VIEWER
}

export function sampleUsers(): AppUser[] {
  return [
    { id: "u1", name: "Tung Nguyen", email: "tung@biglight.jp", dept: "経営", role: "ADMIN", active: true, perms: presetPerms("ADMIN") },
    { id: "u2", name: "山田 太郎", email: "yamada@biglight.jp", dept: "営業部", role: "MANAGER", active: true, perms: presetPerms("MANAGER") },
    { id: "u3", name: "佐藤 花子", email: "sato@biglight.jp", dept: "営業部", role: "STAFF", active: true, perms: presetPerms("STAFF") },
    { id: "u4", name: "鈴木 一郎", email: "suzuki@biglight.jp", dept: "管理部", role: "STAFF", active: true,
      perms: { ...presetPerms("STAFF"), expenses: true, yojitsu: true } },
  ];
}
