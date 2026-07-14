// 売上・回収管理 — 単一のデータフローで管理。
//
//   ① 売上登録 ──▶ 売掛金を自動生成（入金期日付き）
//   ② 入金記録 ──▶ 売掛金を順次消し込み
//   ③ 状態を自動判定：未回収 / 一部入金 / 回収済 / 延滞
//
// 状態は保存せず、常に（金額・入金合計・期日・当日）から算出する。

export type Payment = { date: string; amount: number }; // 入金1件

export type Sale = {
  id: string;
  customer: string;   // 顧客名
  title: string;      // 件名
  amount: number;     // 売上金額 (円)
  saleDate: string;   // 計上日 YYYY-MM-DD
  dueDate: string;    // 入金期日 YYYY-MM-DD
  payments: Payment[];
  isForecast?: boolean; // true = 予定売上（未確定）— 売掛金に含めない
};

export const isFc = (s: Sale): boolean => !!s.isForecast;

// OVERPAID = 過入金（払い過ぎ）。PARTIAL = 一部入金（不足）。
export type SaleStatus = "PAID" | "PARTIAL" | "OPEN" | "OVERDUE" | "OVERPAID";

export const STORAGE_KEY = "bl_sales_v1";

export const STATUS_LABEL: Record<SaleStatus, string> = {
  PAID: "回収済", PARTIAL: "一部入金", OPEN: "未回収", OVERDUE: "延滞", OVERPAID: "過入金",
};
export const STATUS_TONE: Record<SaleStatus, string> = {
  PAID: "bg-emerald-50 text-emerald-600",
  PARTIAL: "bg-brand-50 text-brand-700",
  OPEN: "bg-amber-50 text-amber-600",
  OVERDUE: "bg-red-50 text-red-600",
  OVERPAID: "bg-violet-50 text-violet-600",
};

export const paidOf = (s: Sale): number => s.payments.reduce((t, p) => t + p.amount, 0);
// 実残高：正=不足、負=過入金。
export const balanceOf = (s: Sale): number => s.amount - paidOf(s);
export const remainOf = (s: Sale): number => Math.max(0, balanceOf(s));

export function statusOf(s: Sale, today: string): SaleStatus {
  const bal = balanceOf(s);
  if (bal < 0) return "OVERPAID";           // 過入金
  if (bal === 0) return "PAID";             // 完済
  if (today && s.dueDate < today) return "OVERDUE";
  return paidOf(s) > 0 ? "PARTIAL" : "OPEN"; // 一部入金 / 未入金
}

// ---- 入金差異のある取引一覧（入金済だが過不足あり）----
export type Discrepancy = { sale: Sale; diff: number }; // diff>0 = 不足, diff<0 = 過入金

export function discrepancies(sales: Sale[]): Discrepancy[] {
  return sales
    .filter((s) => !isFc(s) && s.payments.length > 0 && balanceOf(s) !== 0)
    .map((s) => ({ sale: s, diff: balanceOf(s) }))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

export const daysLate = (s: Sale, today: string): number => {
  const d = Math.floor((+new Date(today) - +new Date(s.dueDate)) / 86400000);
  return Math.max(0, d);
};

// ---- 支払遅延企業のレポート ----
export type OverdueRow = { customer: string; total: number; count: number; maxDays: number };

export function overdueReport(sales: Sale[], today: string): OverdueRow[] {
  const map = new Map<string, OverdueRow>();
  for (const s of sales) {
    if (isFc(s) || statusOf(s, today) !== "OVERDUE") continue;
    const row = map.get(s.customer) ?? { customer: s.customer, total: 0, count: 0, maxDays: 0 };
    row.total += remainOf(s);
    row.count += 1;
    row.maxDays = Math.max(row.maxDays, daysLate(s, today));
    map.set(s.customer, row);
  }
  return Array.from(map.values()).sort((a, b) => b.maxDays - a.maxDays || b.total - a.total);
}

// ---- 顧客別の集計（顧客別ビュー用）----
export type CustomerSummary = {
  customer: string;
  billed: number;       // 総売上
  paid: number;         // 入金済
  remain: number;       // 残高
  overdue: number;      // うち延滞
  overpaid: number;     // 過入金
  salesCount: number;
  lastPayment: string | null; // 最終入金日
};

export function customerSummaries(sales: Sale[], today: string): CustomerSummary[] {
  const map = new Map<string, CustomerSummary>();
  for (const s of sales) {
    if (isFc(s)) continue; // 予定売上は債権に含めない
    const row = map.get(s.customer) ?? { customer: s.customer, billed: 0, paid: 0, remain: 0, overdue: 0, overpaid: 0, salesCount: 0, lastPayment: null };
    row.billed += s.amount;
    row.paid += paidOf(s);
    row.remain += remainOf(s);
    if (statusOf(s, today) === "OVERDUE") row.overdue += remainOf(s);
    row.overpaid += Math.max(0, -balanceOf(s));
    row.salesCount += 1;
    for (const p of s.payments) if (!row.lastPayment || p.date > row.lastPayment) row.lastPayment = p.date;
    map.set(s.customer, row);
  }
  return Array.from(map.values()).sort((a, b) => b.remain - a.remain);
}

// ---- 月別（"YYYY-MM"、会計年度）の売上 ----
// forecast=false → 実績のみ / true → 予定のみ。
export function revenueByMonths(sales: Sale[], months: string[], forecast: boolean): number[] {
  const idx = new Map(months.map((m, i) => [m, i]));
  const out = Array(months.length).fill(0) as number[];
  for (const s of sales) {
    if (isFc(s) !== forecast) continue;
    const i = idx.get(s.saleDate.slice(0, 7));
    if (i !== undefined) out[i] += s.amount;
  }
  return out;
}

// ---- 月別の入金額 ----
export function collectionsByMonths(sales: Sale[], months: string[]): number[] {
  const idx = new Map(months.map((m, i) => [m, i]));
  const out = Array(months.length).fill(0) as number[];
  for (const s of sales) {
    for (const p of s.payments) {
      const i = idx.get(p.date.slice(0, 7));
      if (i !== undefined) out[i] += p.amount;
    }
  }
  return out;
}

export const yen = (n: number): string => "¥" + Math.round(n).toLocaleString("ja-JP");

// ---- サンプルデータ：6顧客の取引（当日 ~2026-07）----
export function sampleSales(): Sale[] {
  return [
    { id: "s01", customer: "株式会社アオイ工業", title: "特定技能 人材紹介（2名）", amount: 1800000, saleDate: "2026-07-01", dueDate: "2026-07-31", payments: [] },
    { id: "s02", customer: "株式会社アオイ工業", title: "登録支援委託費（6月分）", amount: 300000, saleDate: "2026-06-01", dueDate: "2026-06-30", payments: [{ date: "2026-06-28", amount: 300000 }] },
    { id: "s03", customer: "株式会社アオイ工業", title: "登録支援委託費（5月分）", amount: 300000, saleDate: "2026-05-01", dueDate: "2026-05-31", payments: [{ date: "2026-05-29", amount: 300000 }] },
    { id: "s04", customer: "ミライフーズ株式会社", title: "人材紹介（1名）", amount: 950000, saleDate: "2026-05-20", dueDate: "2026-06-20", payments: [{ date: "2026-06-25", amount: 400000 }] },
    { id: "s05", customer: "ミライフーズ株式会社", title: "登録支援委託費（7月分）", amount: 250000, saleDate: "2026-07-01", dueDate: "2026-07-31", payments: [] },
    { id: "s06", customer: "サクラ建設", title: "人材紹介（3名）", amount: 2200000, saleDate: "2026-06-10", dueDate: "2026-07-20", payments: [{ date: "2026-07-02", amount: 1000000 }] },
    { id: "s07", customer: "サクラ建設", title: "登録支援委託費（5月分）", amount: 350000, saleDate: "2026-05-01", dueDate: "2026-05-31", payments: [{ date: "2026-06-05", amount: 350000 }] },
    { id: "s08", customer: "有限会社ハルタ", title: "登録支援委託費", amount: 600000, saleDate: "2026-04-28", dueDate: "2026-05-31", payments: [] },
    { id: "s09", customer: "有限会社ハルタ", title: "人材紹介（1名）", amount: 800000, saleDate: "2026-03-15", dueDate: "2026-04-30", payments: [{ date: "2026-05-10", amount: 800000 }] },
    { id: "s10", customer: "ヤマト食品株式会社", title: "人材紹介（2名）", amount: 1600000, saleDate: "2026-06-15", dueDate: "2026-07-15", payments: [{ date: "2026-07-01", amount: 1600000 }] },
    { id: "s11", customer: "ヤマト食品株式会社", title: "登録支援委託費（7月分）", amount: 200000, saleDate: "2026-07-01", dueDate: "2026-07-31", payments: [] },
    { id: "s12", customer: "グリーン農園株式会社", title: "特定技能 人材紹介（4名）", amount: 3200000, saleDate: "2026-06-25", dueDate: "2026-07-25", payments: [{ date: "2026-07-03", amount: 1600000 }] },
    // 過入金：2カ月分を誤って振込 — ¥200,000の過剰。
    { id: "s13", customer: "ヤマト食品株式会社", title: "登録支援委託費（6月分）", amount: 200000, saleDate: "2026-06-01", dueDate: "2026-06-30", payments: [{ date: "2026-06-28", amount: 400000 }] },
    // ---- 前会計年度（2024年度 = 2024/8〜2025/7）— レポートの前年比用 ----
    { id: "s14", customer: "ミライフーズ株式会社", title: "人材紹介（1名）", amount: 800000, saleDate: "2024-10-15", dueDate: "2024-11-30", payments: [{ date: "2024-11-25", amount: 800000 }] },
    { id: "s15", customer: "サクラ建設", title: "人材紹介（2名）", amount: 1500000, saleDate: "2025-01-20", dueDate: "2025-02-28", payments: [{ date: "2025-02-20", amount: 1500000 }] },
    { id: "s16", customer: "株式会社アオイ工業", title: "人材紹介（1名）", amount: 900000, saleDate: "2025-04-10", dueDate: "2025-05-31", payments: [{ date: "2025-05-28", amount: 900000 }] },
    { id: "s17", customer: "有限会社ハルタ", title: "登録支援委託費", amount: 400000, saleDate: "2025-06-05", dueDate: "2025-07-15", payments: [{ date: "2025-07-10", amount: 400000 }] },
    // ---- 予定売上（今後の月の見込み）----
    { id: "s18", customer: "グリーン農園株式会社", title: "登録支援委託費（7月分・予定）", amount: 200000, saleDate: "2026-07-31", dueDate: "2026-08-31", payments: [], isForecast: true },
    { id: "s19", customer: "株式会社アオイ工業", title: "人材紹介（2名・内定済）", amount: 1800000, saleDate: "2026-08-10", dueDate: "2026-09-10", payments: [], isForecast: true },
    { id: "s20", customer: "サクラ建設", title: "人材紹介（2名・商談中）", amount: 1200000, saleDate: "2026-09-15", dueDate: "2026-10-15", payments: [], isForecast: true },
    { id: "s21", customer: "ヤマト食品株式会社", title: "登録支援委託費（8月分・予定）", amount: 200000, saleDate: "2026-08-01", dueDate: "2026-08-31", payments: [], isForecast: true },
  ];
}
