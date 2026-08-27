// 予実管理 v3 — 会計年度 8/1〜7/31（index 0 = 8月, 11 = 7月）。
//
//   年度(FY) → { 予算(plan) , 実績(actual) } → 予実対比(差異・達成率・累計・各種前期比)
//
// - 予算(plan)  : 年間分を一括登録（「予算を登録」から）
// - 実績(actual): 月ごとに順次入力
// - 粗利・営業利益は保存せず、常に自動計算。

export type InputMetric = "revenue" | "cogs" | "sga" | "nonop";
export type MetricKey = InputMetric | "gross" | "operating" | "ordinary";

export type Book = Record<InputMetric, number[]>;   // 各配列は12ヶ月分（0=8月）
export type YearData = { plan: Book; actual: Book };
export type Store = Record<string, YearData>;        // key = 会計年度（開始年）

export const STORAGE_KEY = "bl_yojitsu_v3";          // v3: 会計年度ベースに移行
export const FY_YEARS = [2024, 2025, 2026];

export const METRICS: {
  key: MetricKey; label: string; editable: boolean; good: boolean; strong?: boolean;
}[] = [
  { key: "revenue",   label: "売上高",     editable: true,  good: true },
  { key: "cogs",      label: "売上原価",   editable: true,  good: false },
  { key: "gross",     label: "売上総利益", editable: false, good: true,  strong: true },
  { key: "sga",       label: "販管費",     editable: true,  good: false },
  { key: "operating", label: "営業利益",   editable: false, good: true,  strong: true },
  { key: "nonop",     label: "営業外収支", editable: true,  good: true },
  { key: "ordinary",  label: "経常利益",   editable: false, good: true,  strong: true },
];

export const INPUT_METRICS: { key: InputMetric; label: string }[] = [
  { key: "revenue", label: "売上高" },
  { key: "cogs", label: "売上原価" },
  { key: "sga", label: "販管費" },
  { key: "nonop", label: "営業外収支" },
];

const arr12 = (fn: (m: number) => number): number[] => Array.from({ length: 12 }, (_, m) => fn(m));

export function emptyBook(): Book {
  return { revenue: arr12(() => 0), cogs: arr12(() => 0), sga: arr12(() => 0), nonop: arr12(() => 0) };
}

// 旧データ（nonop なし）を新形式へ移行 — localStorage 読み込み時に必ず通す。
export function migrateStore(s: Store): Store {
  const out: Store = {};
  for (const [fy, y] of Object.entries(s)) {
    const fix = (b: Partial<Book> | undefined): Book => ({
      revenue: b?.revenue ?? arr12(() => 0),
      cogs: b?.cogs ?? arr12(() => 0),
      sga: b?.sga ?? arr12(() => 0),
      nonop: b?.nonop ?? arr12(() => 0),
    });
    out[fy] = { plan: fix(y?.plan), actual: fix(y?.actual) };
  }
  return out;
}
export function emptyYear(): YearData {
  return { plan: emptyBook(), actual: emptyBook() };
}

// 会計年度別のサンプルデータ：
//   2024年度 (2024/8〜2025/7): 実績12ヶ月分あり — 前年比の比較用。
//   2025年度 (2025/8〜2026/7): 6月まで実績あり、7月は数日分のみ（一部）。
//   2026年度: 予算のみ（翌年度）。
export function sampleYear(fy: number): YearData {
  const base = fy === 2024 ? 10_500_000 : fy === 2025 ? 12_000_000 : 13_500_000;
  const revPlan = arr12((m) => base + m * 200_000);
  const actualMonths = fy <= 2024 ? 12 : fy === 2025 ? 12 : 0;
  const revActual = arr12((m) => {
    if (m >= actualMonths) return 0;
    if (fy === 2025 && m === 11) return Math.round(revPlan[m] * 0.18); // 7月は6日分のみ
    return Math.round(revPlan[m] * (0.93 + ((m * 7) % 12) / 100));
  });
  const plan: Book = {
    revenue: revPlan,
    cogs: revPlan.map((v) => Math.round(v * 0.55)),
    sga: arr12(() => (fy === 2024 ? 3_300_000 : 3_600_000)),
    nonop: arr12(() => 0),
  };
  const actual: Book = {
    revenue: revActual,
    cogs: revActual.map((v) => (v ? Math.round(v * 0.56) : 0)),
    sga: arr12((m) => (m < actualMonths ? (fy === 2024 ? 3_250_000 : 3_500_000) + (m % 3) * 60_000 : 0)),
    nonop: arr12(() => 0),
  };
  if (fy === 2025) actual.sga[11] = 600_000; // 7月は一部
  return { plan, actual };
}

export function defaultStore(): Store {
  return { "2024": sampleYear(2024), "2025": sampleYear(2025), "2026": sampleYear(2026) };
}

function derive(book: Book): Record<MetricKey, number[]> {
  const gross = book.revenue.map((v, i) => v - book.cogs[i]);
  const operating = gross.map((v, i) => v - book.sga[i]);
  const ordinary = operating.map((v, i) => v + (book.nonop?.[i] ?? 0)); // 経常利益 = 営業利益 + 営業外収支
  return { revenue: book.revenue, cogs: book.cogs, gross, sga: book.sga, operating, nonop: book.nonop ?? book.revenue.map(() => 0), ordinary };
}

export function getSeries(y: YearData): Record<MetricKey, { plan: number[]; actual: number[] }> {
  const p = derive(y.plan), a = derive(y.actual);
  const keys: MetricKey[] = ["revenue", "cogs", "gross", "sga", "operating", "nonop", "ordinary"];
  const out = {} as Record<MetricKey, { plan: number[]; actual: number[] }>;
  keys.forEach((k) => (out[k] = { plan: p[k], actual: a[k] }));
  return out;
}

// ===== 見込（フォーキャスト）ロジック — Excel「見込実績表」と同じ =====
// 実績が入っている月 = 実績、まだの月 = 予算 を使う。入力は一切不要（自動）。
export function actualMonthFlags(y: YearData): boolean[] {
  return Array.from({ length: 12 }, (_, m) =>
    (["revenue", "cogs", "sga", "nonop"] as InputMetric[]).some((k) => (y.actual[k]?.[m] ?? 0) !== 0));
}
export function mikomiSeries(y: YearData): { flags: boolean[]; mikomi: Record<MetricKey, number[]> } {
  const flags = actualMonthFlags(y);
  const s = getSeries(y);
  const mikomi = {} as Record<MetricKey, number[]>;
  (Object.keys(s) as MetricKey[]).forEach((k) => {
    mikomi[k] = Array.from({ length: 12 }, (_, m) => (flags[m] ? s[k].actual[m] : s[k].plan[m]));
  });
  return { flags, mikomi };
}

export function cumulate(a: number[]): number[] {
  let t = 0;
  return a.map((v) => (t += v));
}

export const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0);

export const toMan = (yenV: number): number => Math.round(yenV / 10000);
export const fromMan = (man: number): number => Math.round(man * 10000);
export const manStr = (yenV: number): string => toMan(yenV).toLocaleString("ja-JP");
