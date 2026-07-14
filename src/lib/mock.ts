// フェーズ1用のサンプルデータ（DB未接続）。
// 後で実際のPrismaクエリに差し替え — 移行しやすいよう構造は維持。
import type { IconName } from "./nav";

export type Tone = "brand" | "green" | "rose" | "amber" | "red" | "teal" | "violet";

export type StatCard = {
  key: string;
  label: string;    // 見出し
  labelVi: string;  // 補足
  value: string;    // フォーマット済みの値
  icon: IconName;
  tone: Tone;
  delta?: number;       // 前期比の増減率(%)
  deltaLabel?: string;  // 例 "前月比"
  progress?: number;    // 0-100（進捗指標の場合）
  sub?: string;         // 補助行
};

// ダッシュボードの8枚のカード。
export const DASHBOARD_STATS: StatCard[] = [
  { key: "revenue",   label: "今月売上",         labelVi: "今月の売上",       value: "¥12,480,000", icon: "trending", tone: "green",  delta: 8.2,  deltaLabel: "前月比" },
  { key: "expense",   label: "今月支出",         labelVi: "今月の支出",       value: "¥7,920,000",  icon: "receipt",  tone: "rose",   delta: 3.1,  deltaLabel: "前月比" },
  { key: "ar",        label: "未回収売掛金",     labelVi: "未回収債権",       value: "¥5,300,000",  icon: "wallet",   tone: "amber",  sub: "12件の請求" },
  { key: "overdue",   label: "延滞債権",         labelVi: "延滞債権",         value: "¥1,150,000",  icon: "wallet",   tone: "red",    sub: "3件・要対応" },
  { key: "profit",    label: "予想利益",         labelVi: "予想利益",         value: "¥4,560,000",  icon: "target",   tone: "brand",  delta: 12.0, deltaLabel: "前月比" },
  { key: "budget",    label: "予算達成率",       labelVi: "計画達成率",       value: "86%",         icon: "target",   tone: "brand",  progress: 86 },
  { key: "okr",       label: "OKR進捗",          labelVi: "OKR進捗",          value: "72%",         icon: "flag",     tone: "violet", progress: 72 },
  { key: "cashflow",  label: "今月キャッシュフロー", labelVi: "今月のキャッシュフロー", value: "+¥3,410,000", icon: "chart",    tone: "teal",   delta: 5.4,  deltaLabel: "前月比" },
];

// 予実: 項目別の計画 vs 実績（ダッシュボード + 予実管理ページで使用）。
export const YOJITSU_SAMPLE = [
  { label: "売上",   planned: 14500000, actual: 12480000 },
  { label: "粗利",   planned: 6200000,  actual: 5560000 },
  { label: "販管費", planned: 3800000,  actual: 3410000 },
  { label: "営業利益", planned: 2400000, actual: 2150000 },
];

// 回収予定のサンプル（ダッシュボードで使用）。
export const COLLECTIONS_SAMPLE = [
  { customer: "株式会社アオイ工業",   amount: 1800000, due: "2026-07-10", status: "予定" },
  { customer: "ミライフーズ株式会社", amount: 950000,  due: "2026-07-05", status: "延滞" },
  { customer: "サクラ建設",           amount: 2200000, due: "2026-07-20", status: "予定" },
  { customer: "有限会社ハルタ",       amount: 600000,  due: "2026-06-28", status: "延滞" },
];
