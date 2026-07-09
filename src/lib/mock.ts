// Dữ liệu mẫu cho Giai đoạn 1 (chưa nối database).
// Sau này thay bằng truy vấn Prisma thật — cấu trúc giữ nguyên để dễ chuyển đổi.
import type { IconName } from "./nav";

export type Tone = "brand" | "green" | "rose" | "amber" | "red" | "teal" | "violet";

export type StatCard = {
  key: string;
  label: string;    // tiêu đề (JP)
  labelVi: string;  // chú thích (VI)
  value: string;    // giá trị đã format
  icon: IconName;
  tone: Tone;
  delta?: number;       // % thay đổi so kỳ trước
  deltaLabel?: string;  // vd "前月比"
  progress?: number;    // 0-100 (nếu là chỉ số dạng tiến độ)
  sub?: string;         // dòng phụ
};

// 8 thẻ trên Dashboard.
export const DASHBOARD_STATS: StatCard[] = [
  { key: "revenue",   label: "今月売上",         labelVi: "Doanh thu tháng này", value: "¥12,480,000", icon: "trending", tone: "green",  delta: 8.2,  deltaLabel: "前月比" },
  { key: "expense",   label: "今月支出",         labelVi: "Chi phí tháng này",   value: "¥7,920,000",  icon: "receipt",  tone: "rose",   delta: 3.1,  deltaLabel: "前月比" },
  { key: "ar",        label: "未回収売掛金",     labelVi: "Công nợ chưa thu",    value: "¥5,300,000",  icon: "wallet",   tone: "amber",  sub: "12件の請求" },
  { key: "overdue",   label: "延滞債権",         labelVi: "Công nợ quá hạn",     value: "¥1,150,000",  icon: "wallet",   tone: "red",    sub: "3件・要対応" },
  { key: "profit",    label: "予想利益",         labelVi: "Lợi nhuận dự kiến",   value: "¥4,560,000",  icon: "target",   tone: "brand",  delta: 12.0, deltaLabel: "前月比" },
  { key: "budget",    label: "予算達成率",       labelVi: "Tỷ lệ đạt kế hoạch",  value: "86%",         icon: "target",   tone: "brand",  progress: 86 },
  { key: "okr",       label: "OKR進捗",          labelVi: "Tiến độ OKR",         value: "72%",         icon: "flag",     tone: "violet", progress: 72 },
  { key: "cashflow",  label: "今月キャッシュフロー", labelVi: "Cash flow tháng này", value: "+¥3,410,000", icon: "chart",    tone: "teal",   delta: 5.4,  deltaLabel: "前月比" },
];

// 予実: kế hoạch vs thực tế theo hạng mục (dùng ở Dashboard + trang 予実管理).
export const YOJITSU_SAMPLE = [
  { label: "売上",   planned: 14500000, actual: 12480000 },
  { label: "粗利",   planned: 6200000,  actual: 5560000 },
  { label: "販管費", planned: 3800000,  actual: 3410000 },
  { label: "営業利益", planned: 2400000, actual: 2150000 },
];

// 回収予定 mẫu (dùng ở Dashboard).
export const COLLECTIONS_SAMPLE = [
  { customer: "株式会社アオイ工業",   amount: 1800000, due: "2026-07-10", status: "予定" },
  { customer: "ミライフーズ株式会社", amount: 950000,  due: "2026-07-05", status: "延滞" },
  { customer: "サクラ建設",           amount: 2200000, due: "2026-07-20", status: "予定" },
  { customer: "有限会社ハルタ",       amount: 600000,  due: "2026-06-28", status: "延滞" },
];
