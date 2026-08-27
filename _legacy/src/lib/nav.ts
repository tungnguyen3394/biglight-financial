// ナビゲーションメニュー設定 — コンポーネントにハードコードしない。
// モジュールの追加・削除・並び替えはこの NAV 配列を編集するだけ。

export type IconName =
  | "dashboard" | "target" | "trending" | "wallet" | "receipt"
  | "users" | "doc" | "flag" | "id" | "chart" | "gear";

export type NavItem = {
  key: string;
  href: string;
  label: string;    // 表示名
  labelVi: string;  // 補足（ツールチップ）
  icon: IconName;
};

export const NAV: NavItem[] = [
  { key: "dashboard",   href: "/dashboard",   label: "ダッシュボード", labelVi: "全体サマリー",       icon: "dashboard" },
  { key: "yojitsu",     href: "/yojitsu",     label: "予実管理",       labelVi: "予算と実績",         icon: "target" },
  { key: "sales",       href: "/sales",       label: "売上・回収管理", labelVi: "売上・入金・未回収", icon: "trending" },
  { key: "expenses",    href: "/expenses",    label: "支出管理",       labelVi: "経費・支払",         icon: "receipt" },
  { key: "collection",  href: "/collection",  label: "回収管理",       labelVi: "入金消込",           icon: "wallet" },
  { key: "customers",   href: "/customers",   label: "顧客・契約管理", labelVi: "顧客・契約",         icon: "users" },
  { key: "okr",         href: "/okr",         label: "OKR / KPI",      labelVi: "目標・KPI",          icon: "flag" },
  { key: "users",       href: "/users",       label: "User管理",       labelVi: "メンバー",           icon: "id" },
  { key: "reports",     href: "/reports",     label: "レポート",       labelVi: "各種レポート",       icon: "chart" },
  { key: "settings",    href: "/settings",    label: "設定",           labelVi: "マスタ・環境設定",   icon: "gear" },
];

export const APP_NAME = "BIGLIGHT Management";
