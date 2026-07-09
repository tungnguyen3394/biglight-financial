// 売上・回収（統合）— GỘP 売上明細 + 売上回収 thành 1 nguồn duy nhất.
//
// 1 dòng = 1 công ty × 1 tháng:
//   種別 定期(recurring)/不定期(spot) ・ 予定(forecast)→確定(confirmed)
//   金額 lưu 税抜 (chưa thuế) + 消費税率 → 税込 (đã thuế) tự tính = số tiền hóa đơn
//   請求書番号 ・ 入金期日 ・ 入金(payments) → 残高(未回収)
//   監査履歴: ai đăng ký / sửa / lúc nào.
//
// Mục tiêu: 総売上 bao nhiêu, 未回収 bao nhiêu.

import { fiscalMonths, fiscalYearOf } from "./fiscal";

export type Payment = { date: string; amount: number; by: string; note?: string };
export type Audit = { at: string; by: string; action: string };
export type LineStatus = "forecast" | "confirmed";
export type CollectStatus = "FORECAST" | "OPEN" | "PARTIAL" | "PAID" | "OVERDUE" | "OVERPAID";

export type RevLine = {
  id: string;
  ym: string;            // "2025-08"
  customer: string;
  owner: string;         // 担当
  category: string;      // 区分
  headcount: number;     // 人数
  amount: number;        // 売上（税抜）
  taxRate: number;       // 消費税率 %
  cost: number;          // 原価（税抜）
  invoiceNo: string;     // 請求書番号
  dueDate: string;       // 入金期日
  recurring: boolean;    // 定期/不定期
  status: LineStatus;    // 予定/確定
  payments: Payment[];
  seriesId?: string;
  createdAt: string; createdBy: string;
  updatedAt: string; updatedBy: string;
  history: Audit[];
};

export type RevSettings = { owners: string[]; categories: string[]; taxRate: number; operator: string };
export type RevStore = { lines: RevLine[]; settings: RevSettings };

export const STORAGE_KEY = "bl_revenue_v1";

export const DEFAULT_SETTINGS: RevSettings = {
  owners: ["フン", "トゥン", "リン", "HR"],
  categories: ["管理費", "紹介料", "初期費用", "その他"],
  taxRate: 10,
  operator: "管理者",
};

export const STATUS_LABEL: Record<CollectStatus, string> = {
  FORECAST: "予定", OPEN: "未回収", PARTIAL: "一部入金", PAID: "回収済", OVERDUE: "延滞", OVERPAID: "過入金",
};
export const STATUS_TONE: Record<CollectStatus, string> = {
  FORECAST: "bg-sky-100 text-sky-700",
  OPEN: "bg-amber-50 text-amber-600",
  PARTIAL: "bg-brand-50 text-brand-700",
  PAID: "bg-emerald-50 text-emerald-600",
  OVERDUE: "bg-red-50 text-red-600",
  OVERPAID: "bg-violet-50 text-violet-600",
};

// ---- tính thuế ----
export const taxIn = (l: RevLine): number => Math.round(l.amount * (1 + l.taxRate / 100)); // 税込 (số tiền hóa đơn)
export const grossOf = (l: RevLine): number => l.amount - l.cost;                            // 粗利 (税抜)
export const paidOf = (l: RevLine): number => l.payments.reduce((t, p) => t + p.amount, 0);
export const balanceOf = (l: RevLine): number => taxIn(l) - paidOf(l);                        // 未回収 (税込基準)
export const remainOf = (l: RevLine): number => Math.max(0, balanceOf(l));

export function statusOf(l: RevLine, today: string): CollectStatus {
  if (l.status === "forecast") return "FORECAST";
  const bal = balanceOf(l);
  if (bal < 0) return "OVERPAID";
  if (bal === 0) return "PAID";
  if (l.dueDate && l.dueDate < today) return "OVERDUE";
  return paidOf(l) > 0 ? "PARTIAL" : "OPEN";
}
export const daysLate = (l: RevLine, today: string): number =>
  Math.max(0, Math.floor((+new Date(today) - +new Date(l.dueDate)) / 86400000));

export type Agg = { amountEx: number; amountIn: number; gross: number; confirmedEx: number; forecastEx: number; headcount: number; count: number };
export function aggregate(lines: RevLine[]): Agg {
  const a: Agg = { amountEx: 0, amountIn: 0, gross: 0, confirmedEx: 0, forecastEx: 0, headcount: 0, count: lines.length };
  for (const l of lines) {
    a.amountEx += l.amount; a.amountIn += taxIn(l); a.gross += grossOf(l); a.headcount += l.headcount;
    if (l.status === "confirmed") a.confirmedEx += l.amount; else a.forecastEx += l.amount;
  }
  return a;
}

export const yen = (n: number): string => "¥" + Math.round(n).toLocaleString("ja-JP");
export const uid = (): string => "l" + Date.now().toString(36) + Math.floor(Math.random() * 1e5).toString(36);

export function endOfNextMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  const last = new Date(ny, nm, 0).getDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

// Nhân bản 定期 tới hết năm tài chính.
export function expandRecurring(base: Omit<RevLine, "id" | "ym" | "seriesId" | "dueDate" | "invoiceNo">, startYm: string, invoicePrefix: string): RevLine[] {
  const months = fiscalMonths(fiscalYearOf(startYm));
  const startIdx = months.indexOf(startYm);
  if (startIdx < 0) return [];
  const seriesId = "sr" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  const out: RevLine[] = [];
  for (let i = startIdx; i < 12; i++) {
    const ym = months[i];
    out.push({ ...base, id: uid() + "_" + i, ym, seriesId, dueDate: endOfNextMonth(ym), invoiceNo: `${invoicePrefix}-${ym.replace("-", "")}` });
  }
  return out;
}

// ---------- Dữ liệu mẫu (gộp: 明細 + 請求 + 入金) ----------
type Seed = { customer: string; owner: string; amount: number; hc: number };
const SEED: Seed[] = [
  { customer: "毎味水産(株)", owner: "フン", amount: 316774, hc: 16 },
  { customer: "南海食品株式会社", owner: "フン", amount: 234000, hc: 13 },
  { customer: "株式会社古屋鉄筋", owner: "フン", amount: 150000, hc: 6 },
  { customer: "株式会社高山", owner: "フン", amount: 401775, hc: 15 },
  { customer: "近藤技研株式会社", owner: "フン", amount: 98000, hc: 4 },
  { customer: "株式会社志葉屋", owner: "フン", amount: 18000, hc: 1 },
  { customer: "城南金属(株)", owner: "フン", amount: 25000, hc: 1 },
  { customer: "アース建設(株)", owner: "フン", amount: 66935, hc: 3 },
  { customer: "ヤスダ工業株式会社", owner: "トゥン", amount: 139516, hc: 7 },
  { customer: "株式会社タイセイ", owner: "トゥン", amount: 125000, hc: 5 },
  { customer: "小島工業株式会社", owner: "トゥン", amount: 390323, hc: 12 },
  { customer: "合同会社オン", owner: "トゥン", amount: 54545, hc: 6 },
  { customer: "株式会社ゴトウ", owner: "トゥン", amount: 125000, hc: 6 },
  { customer: "株式会社タケシタ", owner: "トゥン", amount: 252569, hc: 5 },
  { customer: "株式会社TSAディラ", owner: "トゥン", amount: 300000, hc: 6 },
  { customer: "ワタナベバー(株)", owner: "トゥン", amount: 175000, hc: 7 },
];

export function sampleStore(): RevStore {
  const fy = 2025;
  const months = fiscalMonths(fy);
  const lines: RevLine[] = [];
  const stamp = (ym: string): Audit => ({ at: ym + "-01T09:00:00.000Z", by: "管理者", action: "登録" });
  SEED.forEach((c, ci) => {
    months.forEach((ym, mi) => {
      const confirmed = mi <= 10;      // Aug〜June: 確定
      const paidFull = mi <= 9;        // Aug〜May: đã thu
      const due = endOfNextMonth(ym);
      const amountIn = Math.round(c.amount * 1.1);
      const payments: Payment[] = paidFull ? [{ date: due, amount: amountIn, by: "経理", note: "銀行振込・全額入金" }] : [];
      // vài case đặc biệt ở tháng 10 (June)
      let pay = payments;
      if (mi === 10 && ci === 0) pay = [{ date: due, amount: Math.round(amountIn / 2), by: "経理" }]; // 一部入金
      if (mi === 10 && ci === 1) pay = [{ date: due, amount: amountIn + 20000, by: "経理" }];           // 過入金
      lines.push({
        id: `seed_${ci}_${mi}`, ym, customer: c.customer, owner: c.owner, category: "管理費",
        headcount: c.hc, amount: c.amount, taxRate: 10, cost: 0,
        invoiceNo: `INV-${ym.replace("-", "")}-${String(ci + 1).padStart(3, "0")}`,
        dueDate: due, recurring: true, status: confirmed ? "confirmed" : "forecast", payments: pay,
        seriesId: `seed_sr_${ci}`,
        createdAt: ym + "-01T09:00:00.000Z", createdBy: "管理者", updatedAt: ym + "-01T09:00:00.000Z", updatedBy: "管理者",
        history: [stamp(ym)],
      });
    });
  });
  // vài 不定期
  const spot = (id: string, ym: string, customer: string, owner: string, amount: number, hc: number, cat: string, status: LineStatus, pay: Payment[]): RevLine => ({
    id, ym, customer, owner, category: cat, headcount: hc, amount, taxRate: 10, cost: 0,
    invoiceNo: `INV-${ym.replace("-", "")}-S`, dueDate: endOfNextMonth(ym), recurring: false, status, payments: pay,
    createdAt: ym + "-05T09:00:00.000Z", createdBy: "管理者", updatedAt: ym + "-05T09:00:00.000Z", updatedBy: "管理者",
    history: [{ at: ym + "-05T09:00:00.000Z", by: "管理者", action: "登録" }],
  });
  lines.push(spot("spot1", "2025-10", "サクラ建設", "トゥン", 1500000, 2, "紹介料", "confirmed", [{ date: "2025-11-30", amount: 1650000, by: "経理" }]));
  lines.push(spot("spot2", "2026-06", "株式会社アオイ工業", "フン", 1800000, 2, "紹介料", "confirmed", [])); // 延滞 (due 2026-07-31? no → past → overdue)
  lines.push(spot("spot3", "2026-07", "グリーン農園株式会社", "フン", 800000, 1, "初期費用", "forecast", []));
  return { lines, settings: { ...DEFAULT_SETTINGS } };
}

// Đọc 予算 tháng từ 予実管理.
export function readBudgetSeries(fy: number): number[] {
  if (typeof window === "undefined") return Array(12).fill(0);
  try {
    const raw = window.localStorage.getItem("bl_yojitsu_v3");
    if (!raw) return Array(12).fill(0);
    const store = JSON.parse(raw) as Record<string, { plan: { revenue: number[] } }>;
    return store[String(fy)]?.plan?.revenue ?? Array(12).fill(0);
  } catch { return Array(12).fill(0); }
}
