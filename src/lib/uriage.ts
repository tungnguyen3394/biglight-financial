// 売上明細 — 会社別の売上発生を管理する標準リスト（ミーティング報告書形式）。
//
// 1行 = 1社 × 1か月: 担当・区分・人数・売上・粗利。
//   定期(recurring): 追加時に会計年度末(7月)まで自動で各月へ展開。
//   不定期(spot):    その月だけに存在（単発、自動展開なし）。
//   状態: 予定(forecast) → 確定(confirmed)。売上レポートの数値（実績＋見込）を生成。

import { fiscalMonths, fiscalYearOf } from "./fiscal";

export type LineStatus = "forecast" | "confirmed"; // 予定 / 確定

export type RevLine = {
  id: string;
  ym: string;          // "2025-08" — この行が属する月
  customer: string;    // 会社名
  owner: string;       // 担当
  category: string;    // 区分
  headcount: number;   // 人数
  amount: number;      // 売上
  cost: number;        // 売上原価 (粗利 = amount − cost)
  recurring: boolean;  // 定期 = 翌月以降に自動展開
  status: LineStatus;  // 予定 / 確定
  seriesId?: string;   // 定期の系列リンク（系列単位で削除・編集）
};

export const STORAGE_KEY = "bl_uriage_v1";
export const OWNERS = ["フン", "トゥン", "リン", "HR"];
export const CATEGORIES = ["管理費", "紹介料", "初期費用", "その他"];

export const grossOf = (l: RevLine): number => l.amount - l.cost;

export type Agg = { amount: number; gross: number; confirmed: number; forecast: number; headcount: number; count: number };

export function aggregate(lines: RevLine[]): Agg {
  const a: Agg = { amount: 0, gross: 0, confirmed: 0, forecast: 0, headcount: 0, count: lines.length };
  for (const l of lines) {
    a.amount += l.amount; a.gross += grossOf(l); a.headcount += l.headcount;
    if (l.status === "confirmed") a.confirmed += l.amount; else a.forecast += l.amount;
  }
  return a;
}

export const yen = (n: number): string => "¥" + Math.round(n).toLocaleString("ja-JP");
export const uid = (): string => "l" + Date.now().toString(36) + Math.floor(Math.random() * 1e5).toString(36);

// 定期明細を開始月から会計年度末(7月)まで展開。
export function expandRecurring(base: Omit<RevLine, "id" | "ym" | "seriesId">, startYm: string): RevLine[] {
  const months = fiscalMonths(fiscalYearOf(startYm));
  const startIdx = months.indexOf(startYm);
  if (startIdx < 0) return [];
  const seriesId = "sr" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  const out: RevLine[] = [];
  for (let i = startIdx; i < 12; i++) {
    out.push({ ...base, id: uid() + "_" + i, ym: months[i], seriesId });
  }
  return out;
}

// ---------- サンプルデータ（実データを基に作成） ----------
type Seed = { customer: string; owner: string; amount: number; hc: number; cat?: string };
const SEED_RECURRING: Seed[] = [
  { customer: "株式会社志葉屋", owner: "フン", amount: 18000, hc: 1 },
  { customer: "毎味水産(株)", owner: "フン", amount: 316774, hc: 16 },
  { customer: "南海食品株式会社", owner: "フン", amount: 234000, hc: 13 },
  { customer: "城南金属(株)", owner: "フン", amount: 25000, hc: 1 },
  { customer: "株式会古屋鉄筋", owner: "フン", amount: 150000, hc: 6 },
  { customer: "株式会社高山", owner: "フン", amount: 401775, hc: 15 },
  { customer: "近藤技研株式会社", owner: "フン", amount: 98000, hc: 4 },
  { customer: "ヤスダ工業株式会社", owner: "トゥン", amount: 139516, hc: 7 },
  { customer: "小島工業株式会社", owner: "トゥン", amount: 390323, hc: 12 },
  { customer: "合同会社オン", owner: "トゥン", amount: 54545, hc: 6 },
  { customer: "株式会社タケシタ", owner: "トゥン", amount: 252569, hc: 5 },
  { customer: "株式会社TSAディラ", owner: "トゥン", amount: 300000, hc: 6 },
  { customer: "ワタナベバー(株)", owner: "トゥン", amount: 175000, hc: 7 },
];
const SEED_SPOT: (Seed & { ym: string })[] = [
  { customer: "サクラ建設", owner: "トゥン", amount: 1500000, hc: 2, cat: "紹介料", ym: "2025-10" },
  { customer: "株式会社アオイ工業", owner: "フン", amount: 1800000, hc: 2, cat: "紹介料", ym: "2025-12" },
  { customer: "グリーン農園株式会社", owner: "フン", amount: 800000, hc: 1, cat: "初期費用", ym: "2026-06" },
];

export function sampleLines(): RevLine[] {
  const fy = 2025;
  const months = fiscalMonths(fy); // 2025-08 .. 2026-07
  const out: RevLine[] = [];
  SEED_RECURRING.forEach((c, ci) => {
    months.forEach((ym, mi) => {
      out.push({
        id: `seed_${ci}_${mi}`, ym, customer: c.customer, owner: c.owner,
        category: c.cat ?? "管理費", headcount: c.hc, amount: c.amount, cost: 0,
        recurring: true, status: mi <= 10 ? "confirmed" : "forecast", seriesId: `seed_sr_${ci}`,
      });
    });
  });
  SEED_SPOT.forEach((c, ci) => {
    out.push({
      id: `seedspot_${ci}`, ym: c.ym, customer: c.customer, owner: c.owner,
      category: c.cat ?? "紹介料", headcount: c.hc, amount: c.amount, cost: 0,
      recurring: false, status: "confirmed",
    });
  });
  return out;
}

// ---------- 予実管理 (bl_yojitsu_v3) から月次予算を読み込む ----------
export function readBudgetSeries(fy: number): number[] {
  if (typeof window === "undefined") return Array(12).fill(0);
  try {
    const raw = window.localStorage.getItem("bl_yojitsu_v3");
    if (!raw) return Array(12).fill(0);
    const store = JSON.parse(raw) as Record<string, { plan: { revenue: number[] } }>;
    return store[String(fy)]?.plan?.revenue ?? Array(12).fill(0);
  } catch { return Array(12).fill(0); }
}