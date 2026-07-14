// 売上・回収（統合）— 売上明細と売上回収を1つのデータソースに統合。
//
// 1行 = 1社 × 1ヶ月:
//   種別 定期(recurring)/不定期(spot) ・ 予定(forecast)→確定(confirmed)
//   金額は税抜で保持 + 消費税率 → 税込を自動計算（＝請求額）
//   請求書番号 ・ 入金期日 ・ 入金(payments) → 残高(未回収)
//   監査履歴: 登録者・更新者・日時を記録。
//
// 目的: 総売上と未回収を把握する。

import { fiscalMonths, fiscalYearOf } from "./fiscal";

export type PayMethod = "銀行振込" | "現金" | "その他";
export type Payment = {
  date: string;          // 入金日（実際に入金された日）
  amount: number;        // 実際に受け取った金額
  fee?: number;          // 手数料（当社負担）— 差引かれた振込手数料など。残高の消し込みに算入
  by: string;            // 操作者
  note?: string;
  method?: PayMethod;    // 入金方法
  createdAt?: string;    // 登録日時
};
export type Audit = { at: string; by: string; action: string };
export type LineStatus = "forecast" | "confirmed";
export type CollectStatus = "FORECAST" | "OPEN" | "PARTIAL" | "PAID" | "OVERDUE" | "OVERPAID";

export type RevLine = {
  id: string;
  ym: string;               // 売上計上日から導出する年月 "2025-08"
  recognitionDate: string;  // 売上計上日（YYYY-MM-DD）— 月次・年次集計の基準
  customer: string;
  owner: string;            // 担当
  category: string;         // 区分
  amount: number;           // 売上（税抜）
  taxRate: number;          // 消費税率 %
  cost: number;             // 原価（税抜）
  invoiceNo: string;        // 請求書番号
  dueDate: string;          // 入金期日
  recurring: boolean;       // 定期/不定期
  status: LineStatus;       // 予定/確定
  payments: Payment[];
  note?: string;            // メモ
  seriesId?: string;
  headcount?: number;       // 廃止（旧データ互換のため型のみ保持・未使用）
  createdAt: string; createdBy: string;   // 登録日時 / 登録者
  updatedAt: string; updatedBy: string;
  history: Audit[];
};

export type RevSettings = { owners: string[]; categories: string[]; taxRate: number; operator: string };
export type RevStore = { lines: RevLine[]; settings: RevSettings };

export const STORAGE_KEY = "bl_revenue_v1";

export const DEFAULT_SETTINGS: RevSettings = {
  owners: ["フン", "トゥン", "リン", "HR"],
  categories: ["特定技能", "人材紹介"],
  taxRate: 10,
  operator: "管理者",
};

export const STATUS_LABEL: Record<CollectStatus, string> = {
  FORECAST: "予定", OPEN: "未入金", PARTIAL: "一部入金", PAID: "入金済", OVERDUE: "延滞", OVERPAID: "過入金",
};
export const STATUS_TONE: Record<CollectStatus, string> = {
  FORECAST: "bg-sky-100 text-sky-700",
  OPEN: "bg-amber-50 text-amber-600",
  PARTIAL: "bg-brand-50 text-brand-700",
  PAID: "bg-emerald-50 text-emerald-600",
  OVERDUE: "bg-red-50 text-red-600",
  OVERPAID: "bg-violet-50 text-violet-600",
};

// ---- 税計算 ----
export const taxIn = (l: RevLine): number => Math.round(l.amount * (1 + l.taxRate / 100)); // 税込（請求額）
export const grossOf = (l: RevLine): number => l.amount - l.cost;                            // 粗利（税抜）
export const paidOf = (l: RevLine): number => l.payments.reduce((t, p) => t + p.amount, 0);      // 実際の入金額
export const feeOf = (l: RevLine): number => l.payments.reduce((t, p) => t + (p.fee || 0), 0);   // 当社負担手数料の合計
export const balanceOf = (l: RevLine): number => taxIn(l) - paidOf(l) - feeOf(l);                // 未回収（入金＋手数料で消し込み）
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
    a.amountEx += l.amount; a.amountIn += taxIn(l); a.gross += grossOf(l); a.headcount += l.headcount || 0;
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

// 月末日にクランプ（例：31日指定で30日までの月は30日に）。
function clampDay(ym: string, day: number): string {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${ym}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

// 定期明細を年度末まで複製する（各月の売上計上日は開始日の「日」を踏襲）。
export function expandRecurring(base: Omit<RevLine, "id" | "ym" | "seriesId" | "dueDate" | "invoiceNo" | "recognitionDate">, startDate: string, invoicePrefix: string): RevLine[] {
  const startYm = startDate.slice(0, 7);
  const day = Number(startDate.slice(8, 10)) || 1;
  const months = fiscalMonths(fiscalYearOf(startYm));
  const startIdx = months.indexOf(startYm);
  if (startIdx < 0) return [];
  const seriesId = "sr" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  const out: RevLine[] = [];
  for (let i = startIdx; i < 12; i++) {
    const ym = months[i];
    out.push({ ...base, id: uid() + "_" + i, ym, recognitionDate: clampDay(ym, day), seriesId, dueDate: endOfNextMonth(ym), invoiceNo: `${invoicePrefix}-${ym.replace("-", "")}` });
  }
  return out;
}

// ---------- サンプルデータ（明細 + 請求 + 入金） ----------
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
    const cat = ci % 2 === 0 ? "特定技能" : "人材紹介";
    months.forEach((ym, mi) => {
      const confirmed = mi <= 10;      // 8月〜6月: 確定
      const paidFull = mi <= 9;        // 8月〜5月: 入金済
      const recog = `${ym}-01`;
      const due = endOfNextMonth(ym);
      const amountIn = Math.round(c.amount * 1.1);
      const payments: Payment[] = paidFull ? [{ date: due, amount: amountIn, by: "経理", method: "銀行振込", note: "全額入金", createdAt: due + "T09:00:00.000Z" }] : [];
      // 10番目の月（6月）の特別ケース
      let pay = payments;
      if (mi === 10 && ci === 0) pay = [{ date: due, amount: Math.round(amountIn / 2), by: "経理", method: "銀行振込", createdAt: due + "T09:00:00.000Z" }]; // 一部入金
      if (mi === 10 && ci === 1) pay = [{ date: due, amount: amountIn + 20000, by: "経理", method: "銀行振込", createdAt: due + "T09:00:00.000Z" }];           // 過入金
      lines.push({
        id: `seed_${ci}_${mi}`, ym, recognitionDate: recog, customer: c.customer, owner: c.owner, category: cat,
        amount: c.amount, taxRate: 10, cost: 0,
        invoiceNo: `INV-${ym.replace("-", "")}-${String(ci + 1).padStart(3, "0")}`,
        dueDate: due, recurring: true, status: confirmed ? "confirmed" : "forecast", payments: pay,
        seriesId: `seed_sr_${ci}`,
        createdAt: ym + "-01T09:00:00.000Z", createdBy: "管理者", updatedAt: ym + "-01T09:00:00.000Z", updatedBy: "管理者",
        history: [stamp(ym)],
      });
    });
  });
  // 不定期（単発）の例
  const spot = (id: string, ym: string, customer: string, owner: string, amount: number, cat: string, status: LineStatus, pay: Payment[]): RevLine => ({
    id, ym, recognitionDate: `${ym}-05`, customer, owner, category: cat, amount, taxRate: 10, cost: 0,
    invoiceNo: `INV-${ym.replace("-", "")}-S`, dueDate: endOfNextMonth(ym), recurring: false, status, payments: pay,
    createdAt: ym + "-05T09:00:00.000Z", createdBy: "管理者", updatedAt: ym + "-05T09:00:00.000Z", updatedBy: "管理者",
    history: [{ at: ym + "-05T09:00:00.000Z", by: "管理者", action: "登録" }],
  });
  lines.push(spot("spot1", "2025-10", "サクラ建設", "トゥン", 1500000, "人材紹介", "confirmed", [{ date: "2025-11-30", amount: 1650000, by: "経理", method: "銀行振込", createdAt: "2025-11-30T09:00:00.000Z" }]));
  lines.push(spot("spot2", "2026-06", "株式会社アオイ工業", "フン", 1800000, "人材紹介", "confirmed", []));
  lines.push(spot("spot3", "2026-07", "グリーン農園株式会社", "フン", 800000, "特定技能", "forecast", []));
  return { lines, settings: { ...DEFAULT_SETTINGS } };
}

// 旧データの互換移行：売上計上日・区分・入金方法などを補完。
export function migrateStore(s: RevStore): RevStore {
  const cats = s.settings?.categories ?? [];
  const useNewCats = cats.includes("特定技能") || cats.includes("人材紹介");
  const settings: RevSettings = {
    ...DEFAULT_SETTINGS, ...s.settings,
    categories: useNewCats ? cats : [...DEFAULT_SETTINGS.categories],
  };
  const lines = (s.lines ?? []).map((l) => {
    const recognitionDate = l.recognitionDate || (l.ym ? `${l.ym}-01` : (l.createdAt || "").slice(0, 10));
    return {
      ...l,
      recognitionDate,
      ym: (recognitionDate || l.ym || "").slice(0, 7) || l.ym,
      payments: (l.payments ?? []).map((p) => ({ ...p, createdAt: p.createdAt || (p.date ? `${p.date}T00:00:00.000Z` : undefined) })),
    };
  });
  return { lines, settings };
}

// 予実管理から月次予算を読み込む。
export function readBudgetSeries(fy: number): number[] {
  if (typeof window === "undefined") return Array(12).fill(0);
  try {
    const raw = window.localStorage.getItem("bl_yojitsu_v3");
    if (!raw) return Array(12).fill(0);
    const store = JSON.parse(raw) as Record<string, { plan: { revenue: number[] } }>;
    return store[String(fy)]?.plan?.revenue ?? Array(12).fill(0);
  } catch { return Array(12).fill(0); }
}
