// 予実管理 v3 — theo NĂM TÀI CHÍNH 8/1〜7/31 (index 0 = 8月, 11 = 7月).
//
//   年度(FY) → { 予算(plan) , 実績(actual) } → 予実対比(差異・達成率・累計・各種前期比)
//
// - 予算(plan)  : đăng ký 1 lần cho cả năm (bấm「予算を登録」)
// - 実績(actual): nhập dần theo từng tháng
// - 粗利・営業利益 KHÔNG lưu — luôn tự tính.

export type InputMetric = "revenue" | "cogs" | "sga";
export type MetricKey = InputMetric | "gross" | "operating";

export type Book = Record<InputMetric, number[]>;   // mỗi mảng 12 tháng (0=8月)
export type YearData = { plan: Book; actual: Book };
export type Store = Record<string, YearData>;        // key = năm tài chính (năm bắt đầu)

export const STORAGE_KEY = "bl_yojitsu_v3";          // v3: chuyển sang năm tài chính
export const FY_YEARS = [2024, 2025, 2026];

export const METRICS: {
  key: MetricKey; label: string; editable: boolean; good: boolean; strong?: boolean;
}[] = [
  { key: "revenue",   label: "売上高",     editable: true,  good: true },
  { key: "cogs",      label: "売上原価",   editable: true,  good: false },
  { key: "gross",     label: "売上総利益", editable: false, good: true,  strong: true },
  { key: "sga",       label: "販管費",     editable: true,  good: false },
  { key: "operating", label: "営業利益",   editable: false, good: true,  strong: true },
];

export const INPUT_METRICS: { key: InputMetric; label: string }[] = [
  { key: "revenue", label: "売上高" },
  { key: "cogs", label: "売上原価" },
  { key: "sga", label: "販管費" },
];

const arr12 = (fn: (m: number) => number): number[] => Array.from({ length: 12 }, (_, m) => fn(m));

export function emptyBook(): Book {
  return { revenue: arr12(() => 0), cogs: arr12(() => 0), sga: arr12(() => 0) };
}
export function emptyYear(): YearData {
  return { plan: emptyBook(), actual: emptyBook() };
}

// Dữ liệu mẫu theo năm tài chính:
//   2024年度 (2024/8〜2025/7): đủ 12 tháng thực tế — để so 前年比.
//   2025年度 (2025/8〜2026/7): thực tế tới 6月, 7月 mới chạy vài ngày (một phần).
//   2026年度: chỉ có kế hoạch (năm tới).
export function sampleYear(fy: number): YearData {
  const base = fy === 2024 ? 10_500_000 : fy === 2025 ? 12_000_000 : 13_500_000;
  const revPlan = arr12((m) => base + m * 200_000);
  const actualMonths = fy <= 2024 ? 12 : fy === 2025 ? 12 : 0;
  const revActual = arr12((m) => {
    if (m >= actualMonths) return 0;
    if (fy === 2025 && m === 11) return Math.round(revPlan[m] * 0.18); // 7月 mới 6 ngày
    return Math.round(revPlan[m] * (0.93 + ((m * 7) % 12) / 100));
  });
  const plan: Book = {
    revenue: revPlan,
    cogs: revPlan.map((v) => Math.round(v * 0.55)),
    sga: arr12(() => (fy === 2024 ? 3_300_000 : 3_600_000)),
  };
  const actual: Book = {
    revenue: revActual,
    cogs: revActual.map((v) => (v ? Math.round(v * 0.56) : 0)),
    sga: arr12((m) => (m < actualMonths ? (fy === 2024 ? 3_250_000 : 3_500_000) + (m % 3) * 60_000 : 0)),
  };
  if (fy === 2025) actual.sga[11] = 600_000; // 7月 một phần
  return { plan, actual };
}

export function defaultStore(): Store {
  return { "2024": sampleYear(2024), "2025": sampleYear(2025), "2026": sampleYear(2026) };
}

function derive(book: Book): Record<MetricKey, number[]> {
  const gross = book.revenue.map((v, i) => v - book.cogs[i]);
  const operating = gross.map((v, i) => v - book.sga[i]);
  return { revenue: book.revenue, cogs: book.cogs, gross, sga: book.sga, operating };
}

export function getSeries(y: YearData): Record<MetricKey, { plan: number[]; actual: number[] }> {
  const p = derive(y.plan), a = derive(y.actual);
  const keys: MetricKey[] = ["revenue", "cogs", "gross", "sga", "operating"];
  const out = {} as Record<MetricKey, { plan: number[]; actual: number[] }>;
  keys.forEach((k) => (out[k] = { plan: p[k], actual: a[k] }));
  return out;
}

export function cumulate(a: number[]): number[] {
  let t = 0;
  return a.map((v) => (t += v));
}

export const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0);

export const toMan = (yenV: number): number => Math.round(yenV / 10000);
export const fromMan = (man: number): number => Math.round(man * 10000);
export const manStr = (yenV: number): string => toMan(yenV).toLocaleString("ja-JP");
