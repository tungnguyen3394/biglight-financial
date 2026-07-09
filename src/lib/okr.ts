// OKR / KPI — cấu trúc 3 cấp:  全社(org) → 部署(dept) → 個人(user).
//
//   Objective (mục tiêu định tính)
//     └── KeyResult × n (kết quả then chốt ĐO ĐƯỢC: target / current)
//
//   progress(KR)        = min(100, current / target)
//   progress(Objective) = trung bình các KR
//   progress(部署/全社)  = trung bình các Objective thuộc cấp đó

export type KR = { id: string; title: string; target: number; current: number; unit: string };

export type Level = "org" | "dept" | "user";

export type Objective = {
  id: string;
  title: string;
  quarter: string;   // "2026-Q3"
  level: Level;
  owner: string;     // org: "全社" / dept: tên bộ phận / user: tên nhân viên
  krs: KR[];
};

export type Employee = { name: string; dept: string };

export const STORAGE_KEY = "bl_okr_v1";
export const QUARTERS = ["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"];
export const DEPARTMENTS = ["営業部", "管理部"];
export const EMPLOYEES: Employee[] = [
  { name: "Tung Nguyen", dept: "経営" },
  { name: "山田 太郎", dept: "営業部" },
  { name: "佐藤 花子", dept: "営業部" },
  { name: "鈴木 一郎", dept: "管理部" },
];

export const krProgress = (k: KR): number => (k.target > 0 ? Math.min(100, Math.round((k.current / k.target) * 100)) : 0);
export const objProgress = (o: Objective): number =>
  o.krs.length ? Math.round(o.krs.reduce((t, k) => t + krProgress(k), 0) / o.krs.length) : 0;
export const groupProgress = (objs: Objective[]): number =>
  objs.length ? Math.round(objs.reduce((t, o) => t + objProgress(o), 0) / objs.length) : 0;

export function statusOf(progress: number): { label: string; tone: string } {
  if (progress >= 70) return { label: "順調", tone: "bg-emerald-50 text-emerald-600" };
  if (progress >= 40) return { label: "要注意", tone: "bg-amber-50 text-amber-600" };
  return { label: "遅延", tone: "bg-rose-50 text-rose-600" };
}

export function sampleOkrs(): Objective[] {
  return [
    // ---- 全社 ----
    {
      id: "o1", title: "四半期売上4,500万円を達成し、黒字体質を確立する", quarter: "2026-Q3", level: "org", owner: "全社",
      krs: [
        { id: "k1", title: "四半期売上", target: 45000000, current: 31200000, unit: "円" },
        { id: "k2", title: "営業利益率", target: 15, current: 12, unit: "%" },
        { id: "k3", title: "延滞債権", target: 100, current: 55, unit: "%削減" },
      ],
    },
    // ---- 営業部 ----
    {
      id: "o2", title: "新規顧客の開拓で売上基盤を広げる", quarter: "2026-Q3", level: "dept", owner: "営業部",
      krs: [
        { id: "k4", title: "新規契約社数", target: 10, current: 6, unit: "社" },
        { id: "k5", title: "人材紹介 成約", target: 20, current: 11, unit: "名" },
      ],
    },
    // ---- 管理部 ----
    {
      id: "o3", title: "回収サイクルを短縮しキャッシュフローを改善", quarter: "2026-Q3", level: "dept", owner: "管理部",
      krs: [
        { id: "k6", title: "平均回収日数", target: 30, current: 22, unit: "日以内" },
        { id: "k7", title: "請求書発行の自動化", target: 100, current: 60, unit: "%" },
      ],
    },
    // ---- 個人 ----
    {
      id: "o4", title: "製造業向け顧客を深耕する", quarter: "2026-Q3", level: "user", owner: "山田 太郎",
      krs: [
        { id: "k8", title: "商談件数", target: 30, current: 21, unit: "件" },
        { id: "k9", title: "成約", target: 8, current: 4, unit: "件" },
      ],
    },
    {
      id: "o5", title: "食品業界の新規リードを増やす", quarter: "2026-Q3", level: "user", owner: "佐藤 花子",
      krs: [
        { id: "k10", title: "新規リード", target: 50, current: 38, unit: "件" },
        { id: "k11", title: "紹介成約", target: 6, current: 3, unit: "名" },
      ],
    },
    {
      id: "o6", title: "月次決算を5営業日以内に完了する", quarter: "2026-Q3", level: "user", owner: "鈴木 一郎",
      krs: [
        { id: "k12", title: "月次決算日数", target: 100, current: 80, unit: "%達成" },
      ],
    },
  ];
}
