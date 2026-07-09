// Cấu hình menu điều hướng — KHÔNG hard-code trong component.
// Thêm/bớt/đổi thứ tự module chỉ cần sửa mảng NAV này.

export type IconName =
  | "dashboard" | "target" | "trending" | "wallet" | "receipt"
  | "users" | "doc" | "flag" | "id" | "chart" | "gear";

export type NavItem = {
  key: string;
  href: string;
  label: string;    // nhãn hiển thị (tiếng Nhật)
  labelVi: string;  // chú thích tiếng Việt (tooltip / phụ đề)
  icon: IconName;
};

export const NAV: NavItem[] = [
  { key: "dashboard",   href: "/dashboard",   label: "ダッシュボード", labelVi: "Tổng quan",            icon: "dashboard" },
  { key: "yojitsu",     href: "/yojitsu",     label: "予実管理",       labelVi: "Kế hoạch vs Thực tế",  icon: "target" },
  { key: "sales",       href: "/sales",       label: "売上・回収管理", labelVi: "Doanh thu & thu hồi công nợ", icon: "trending" },
  { key: "expenses",    href: "/expenses",    label: "支出管理",       labelVi: "Chi phí",              icon: "receipt" },
  { key: "collection",  href: "/collection",  label: "回収管理",       labelVi: "Quản lý thu hồi tiền",  icon: "wallet" },
  { key: "customers",   href: "/customers",   label: "顧客・契約管理", labelVi: "Khách hàng & hợp đồng", icon: "users" },
  { key: "okr",         href: "/okr",         label: "OKR / KPI",      labelVi: "Mục tiêu",             icon: "flag" },
  { key: "users",       href: "/users",       label: "User管理",       labelVi: "Nhân viên",            icon: "id" },
  { key: "reports",     href: "/reports",     label: "レポート",       labelVi: "Báo cáo",              icon: "chart" },
  { key: "settings",    href: "/settings",    label: "設定",           labelVi: "Cài đặt",              icon: "gear" },
];

export const APP_NAME = "BIGLIGHT Management";
