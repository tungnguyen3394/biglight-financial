// Năm tài chính BIGLIGHT: 8/1 〜 翌年 7/31.
// "2025年度" = 2025-08-01 〜 2026-07-31.
// Quý:  Q1 = 8〜10月, Q2 = 11〜1月, Q3 = 2〜4月, Q4 = 5〜7月.

export const FY_START_MONTH = 8;

export const QUARTER_LABELS = ["Q1（8〜10月）", "Q2（11〜1月）", "Q3（2〜4月）", "Q4（5〜7月）"];

// "YYYY-MM-DD" (hoặc "YYYY-MM") → năm tài chính (năm bắt đầu).
export function fiscalYearOf(dateStr: string): number {
  const [y, m] = dateStr.split("-").map(Number);
  return m >= FY_START_MONTH ? y : y - 1;
}

export function fiscalLabel(fy: number): string {
  return `${fy}年度（${fy}/8〜${fy + 1}/7）`;
}

// 12 tháng của năm tài chính, dạng "YYYY-MM": ["2025-08", ..., "2026-07"].
export function fiscalMonths(fy: number): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const total = FY_START_MONTH + i;                 // 8..19
    const y = fy + Math.floor((total - 1) / 12);
    const m = ((total - 1) % 12) + 1;
    return `${y}-${String(m).padStart(2, "0")}`;
  });
}

// Nhãn tháng hiển thị: "8月", "9月", ..., "7月".
export const FY_MONTH_LABELS = fiscalMonths(2000).map((ym) => Number(ym.split("-")[1]) + "月");

// Quý (1..4) trong năm tài chính của 1 ngày.
export function quarterOf(dateStr: string): number {
  const m = Number(dateStr.split("-")[1]);
  const idx = (m - FY_START_MONTH + 12) % 12;         // 0..11 kể từ tháng 8
  return Math.floor(idx / 3) + 1;
}

// Chỉ số tháng tài chính (0..11) của 1 ngày: 8月=0, ..., 7月=11.
export function fiscalMonthIndex(dateStr: string): number {
  const m = Number(dateStr.split("-")[1]);
  return (m - FY_START_MONTH + 12) % 12;
}

// ==================== BỘ SO SÁNH KỲ (dùng chung) ====================
// cur/prev: mảng 12 tháng THEO NĂM TÀI CHÍNH (index 0 = 8月).
// i: tháng đang xét (0..11). prev = mảng của năm tài chính TRƯỚC.

export const sumRange = (a: number[], s: number, e: number): number => {
  let t = 0;
  for (let i = s; i <= e && i < a.length; i++) t += a[i] ?? 0;
  return t;
};

// % thay đổi so với mốc — null nếu mốc = 0 (không so được).
export function deltaPct(cur: number, base: number): number | null {
  if (!base) return null;
  return ((cur - base) / Math.abs(base)) * 100;
}

export type PeriodComparison = {
  month: number;        // 当月
  prevMonth: number;    // 前月 (tháng 8 → lấy 7月 năm trước)
  lastYearMonth: number;// 前年同月
  qtd: number;          // 四半期累計 (từ đầu quý tới tháng i)
  prevQtd: number;      // cùng kỳ QUÝ TRƯỚC (cùng số tháng)
  htd: number;          // 半期累計 (nửa kỳ: 上期 8〜1月 / 下期 2〜7月)
  prevHtd: number;      // cùng kỳ NỬA KỲ TRƯỚC
  ytd: number;          // 年度累計
  lastYearYtd: number;  // 前年 cùng kỳ 累計
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
