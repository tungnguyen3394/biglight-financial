// BIGLIGHT会計年度: 8/1 〜 翌年 7/31.
// "2025年度" = 2025-08-01 〜 2026-07-31.
// 四半期:  Q1 = 8〜10月, Q2 = 11〜1月, Q3 = 2〜4月, Q4 = 5〜7月.

export const FY_START_MONTH = 8;

export const QUARTER_LABELS = ["Q1（8〜10月）", "Q2（11〜1月）", "Q3（2〜4月）", "Q4（5〜7月）"];

// "YYYY-MM-DD"（または "YYYY-MM"）→ 会計年度（開始年）。
export function fiscalYearOf(dateStr: string): number {
  const [y, m] = dateStr.split("-").map(Number);
  return m >= FY_START_MONTH ? y : y - 1;
}

export function fiscalLabel(fy: number): string {
  return `${fy}年度（${fy}/8〜${fy + 1}/7）`;
}

// 会計年度の12か月、"YYYY-MM"形式: ["2025-08", ..., "2026-07"]。
export function fiscalMonths(fy: number): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const total = FY_START_MONTH + i;                 // 8..19
    const y = fy + Math.floor((total - 1) / 12);
    const m = ((total - 1) % 12) + 1;
    return `${y}-${String(m).padStart(2, "0")}`;
  });
}

// 月表示ラベル: "8月", "9月", ..., "7月"。
export const FY_MONTH_LABELS = fiscalMonths(2000).map((ym) => Number(ym.split("-")[1]) + "月");

// ある日付の会計年度内の四半期（1..4）。
export function quarterOf(dateStr: string): number {
  const m = Number(dateStr.split("-")[1]);
  const idx = (m - FY_START_MONTH + 12) % 12;         // 8月起点で0..11
  return Math.floor(idx / 3) + 1;
}

// ある日付の会計月インデックス（0..11）: 8月=0, ..., 7月=11。
export function fiscalMonthIndex(dateStr: string): number {
  const m = Number(dateStr.split("-")[1]);
  return (m - FY_START_MONTH + 12) % 12;
}

// ==================== 期間比較（共通） ====================
// cur/prev: 会計年度ベースの12か月配列（index 0 = 8月）。
// i: 対象月（0..11）。prev = 前会計年度の配列。

export const sumRange = (a: number[], s: number, e: number): number => {
  let t = 0;
  for (let i = s; i <= e && i < a.length; i++) t += a[i] ?? 0;
  return t;
};

// 基準に対する変化率 — 基準=0の場合はnull（比較不可）。
export function deltaPct(cur: number, base: number): number | null {
  if (!base) return null;
  return ((cur - base) / Math.abs(base)) * 100;
}

export type PeriodComparison = {
  month: number;        // 当月
  prevMonth: number;    // 前月（8月は前年7月を参照）
  lastYearMonth: number;// 前年同月
  qtd: number;          // 四半期累計（四半期開始から月iまで）
  prevQtd: number;      // 前四半期の同期間（同月数）
  htd: number;          // 半期累計（上期 8〜1月 / 下期 2〜7月）
  prevHtd: number;      // 前半期の同期間
  ytd: number;          // 年度累計
  lastYearYtd: number;  // 前年同期累計
};

export function compareSeries(cur: number[], prev: number[], i: number): PeriodComparison {
  const month = cur[i] ?? 0;
  const prevMonth = i > 0 ? (cur[i - 1] ?? 0) : (prev[11] ?? 0);
  const lastYearMonth = prev[i] ?? 0;
  const qs = Math.floor(i / 3) * 3, qSpan = i - qs;
  const qtd = sumRange(cur, qs, i);
  const prevQtd = qs >= 3 ? sumRange(cur, qs - 3, qs - 3 + qSpan) : sumRange(prev, 9, 9 + qSpan);
  const hs = Math.floor(i / 6) * 6, hSpan = i - hs;
  const htd = sumRange(cur, hs, i);
  const prevHtd = hs >= 6 ? sumRange(cur, hs - 6, hs - 6 + hSpan) : sumRange(prev, 6, 6 + hSpan);
  const ytd = sumRange(cur, 0, i);
  const lastYearYtd = sumRange(prev, 0, i);
  return { month, prevMonth, lastYearMonth, qtd, prevQtd, htd, prevHtd, ytd, lastYearYtd };
}
