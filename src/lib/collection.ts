// 回収管理 — 立替・未収の回収を会計ソフト風に管理。
//
// 考え方: 回収が必要な勘定科目ごとに 1 つの「回収項目」。
//   各項目は多階層の対象ツリーを持つ（深さは任意）:
//     地代家賃 → 物件A → Aさん / Bさん / Dさん  （各人に予定回収額）
//     社員貸付 → フン / トゥン                   （1 階層）
//   各ノード:  支出（立替＝会社が支払った額）  +  予定回収（このノード/人から回収する額）
//   回収記録 (CollectRecord) = 対象ごとの実回収額。
//
// 各項目のレポート:  支出 − 実回収 = 実質負担 ／ 予定回収 − 実回収 = 未回収。
//
// 原則: マスタ（項目・対象）とトランザクション（回収記録）はテーブルを分離。

import { fiscalMonths } from "./fiscal";

export type PayMethod = "自動引き落とし" | "振込" | "現金" | "給与天引き";
export const PAY_METHODS: PayMethod[] = ["振込", "現金", "自動引き落とし", "給与天引き"];

// 対象ノード — 多階層の再帰構造。
export type Target = {
  id: string;
  name: string;       // 物件A / Aさん / 社員名…
  paidOut: number;    // 支出（このノードで会社が立替えた金額）
  expected: number;   // 予定回収額（このノード/人から回収する額）
  order: number;
  children: Target[];
};

export type CollectItem = {
  id: string;
  name: string;       // 勘定科目 (地代家賃 / 社員貸付 / 立替金…) — 勘定科目マスタから選択
  order: number;
  monthly: boolean;   // true=毎月（予定は毎月繰り返し） / false=一括（予定は総額1回）
  accountKeys?: string[]; // 勘定科目マスタとの紐付け
  targets: Target[];
};

export type CollectRecord = {
  id: string;
  itemId: string;
  targetId: string;   // 回収した対象（末端ノード）
  ym: string;         // 対象月
  amount: number;
  date: string;       // 回収日
  method: PayMethod;
  memo: string;
};

export type CollectStore = { items: CollectItem[]; records: CollectRecord[] };

export const STORAGE_KEY = "bl_collect_v1";
export const yen = (n: number): string => "¥" + Math.round(n).toLocaleString("ja-JP");
export const uid = (): string => "t" + Date.now().toString(36) + Math.floor(Math.random() * 1e5).toString(36);

// ---- ツリー走査 ----
export function walk(targets: Target[], fn: (t: Target, depth: number, parent: Target | null) => void, depth = 0, parent: Target | null = null): void {
  for (const t of [...targets].sort((a, b) => a.order - b.order)) { fn(t, depth, parent); walk(t.children, fn, depth + 1, t); }
}
export function sumPaidOut(targets: Target[]): number { let s = 0; walk(targets, (t) => (s += t.paidOut)); return s; }
export function sumExpected(targets: Target[]): number { let s = 0; walk(targets, (t) => (s += t.expected)); return s; }

// 末端ノードのフラットな一覧（回収記録時の選択用）。
export type LeafRef = { itemId: string; itemName: string; targetId: string; label: string; expected: number };
export function leafTargets(items: CollectItem[]): LeafRef[] {
  const out: LeafRef[] = [];
  for (const it of [...items].sort((a, b) => a.order - b.order)) {
    const path: string[] = [];
    walk(it.targets, (t, depth) => {
      path[depth] = t.name; path.length = depth + 1;
      if (t.children.length === 0) out.push({ itemId: it.id, itemName: it.name, targetId: t.id, label: path.join(" › "), expected: t.expected });
    });
  }
  return out;
}
export const nameOfTarget = (items: CollectItem[], itemId: string, targetId: string): string => {
  const it = items.find((x) => x.id === itemId); if (!it) return "—";
  let res = "—"; const path: string[] = [];
  walk(it.targets, (t, depth) => { path[depth] = t.name; path.length = depth + 1; if (t.id === targetId) res = path.join(" › "); });
  return res;
};

// ---- レポート ----
export type ItemRow = { item: CollectItem; paidOut: number; expected: number; collected: number; uncollected: number; net: number };
export function itemReport(store: CollectStore, ym: string): ItemRow[] {
  return [...store.items].sort((a, b) => a.order - b.order).map((item) => {
    const paidOut = sumPaidOut(item.targets);
    const expected = sumExpected(item.targets);
    const collected = store.records.filter((r) => r.itemId === item.id && r.ym === ym).reduce((t, r) => t + r.amount, 0);
    return { item, paidOut, expected, collected, uncollected: Math.max(0, expected - collected), net: paidOut - collected };
  });
}
// その月の対象ごとの実回収額。
export const collectedOfTarget = (store: CollectStore, targetId: string, ym: string): number =>
  store.records.filter((r) => r.targetId === targetId && r.ym === ym).reduce((t, r) => t + r.amount, 0);

// ---- 12ヶ月の履歴（会計年度単位）＋ 対象ごとの残高 ----
export type HistoryRow = {
  itemId: string; itemName: string; monthly: boolean; targetId: string; label: string;
  expected: number;      // 予定（毎月＝月額 / 一括＝総額）
  months: number[];      // 12ヶ月: 実回収額
  collectedYear: number; // 年間の回収合計
  expectedYear: number;  // 年間の予定（毎月→×12 / 一括→そのまま）
  balance: number;       // 残高 = 予定 − 実回収（未回収額）
};
export function history(store: CollectStore, fy: number): HistoryRow[] {
  const months = fiscalMonths(fy);
  const out: HistoryRow[] = [];
  for (const it of [...store.items].sort((a, b) => a.order - b.order)) {
    const path: string[] = [];
    walk(it.targets, (t, depth) => {
      path[depth] = t.name; path.length = depth + 1;
      if (t.children.length === 0) {
        const mArr = months.map((ym) => collectedOfTarget(store, t.id, ym));
        const collectedYear = mArr.reduce((a, b) => a + b, 0);
        const expectedYear = it.monthly ? t.expected * 12 : t.expected;
        out.push({ itemId: it.id, itemName: it.name, monthly: it.monthly, targetId: t.id, label: path.join(" › "), expected: t.expected, months: mArr, collectedYear, expectedYear, balance: expectedYear - collectedYear });
      }
    });
  }
  return out;
}
// 対象1件の現在残高（表示中の月末時点）— 入力フォームで使用。
export function balanceOfTarget(store: CollectStore, item: CollectItem, target: Target, fy: number): number {
  const months = fiscalMonths(fy);
  const collected = months.reduce((t, ym) => t + collectedOfTarget(store, target.id, ym), 0);
  const expectedYear = item.monthly ? target.expected * 12 : target.expected;
  return expectedYear - collected;
}

// ---- ツリー編集（immutable、path = id の配列） ----
function mapTree(targets: Target[], path: string[], fn: (list: Target[]) => Target[]): Target[] {
  if (path.length === 0) return fn(targets);
  return targets.map((t) => t.id === path[0] ? { ...t, children: mapTree(t.children, path.slice(1), fn) } : t);
}
export const newTarget = (order: number): Target => ({ id: uid(), name: "新規", paidOut: 0, expected: 0, order, children: [] });
export function addChild(targets: Target[], parentPath: string[]): Target[] {
  return mapTree(targets, parentPath, (list) => [...list, newTarget(Math.max(0, ...list.map((x) => x.order)) + 1)]);
}
export function patchNode(targets: Target[], path: string[], patch: Partial<Target>): Target[] {
  return mapTree(targets, path.slice(0, -1), (list) => list.map((t) => t.id === path[path.length - 1] ? { ...t, ...patch } : t));
}
export function deleteNode(targets: Target[], path: string[]): Target[] {
  return mapTree(targets, path.slice(0, -1), (list) => list.filter((t) => t.id !== path[path.length - 1]));
}
export function moveNode(targets: Target[], path: string[], dir: -1 | 1): Target[] {
  return mapTree(targets, path.slice(0, -1), (list) => {
    const s = [...list].sort((a, b) => a.order - b.order);
    const i = s.findIndex((t) => t.id === path[path.length - 1]); const j = i + dir;
    if (i < 0 || j < 0 || j >= s.length) return list;
    const a = s[i], b = s[j];
    return list.map((t) => t.id === a.id ? { ...t, order: b.order } : t.id === b.id ? { ...t, order: a.order } : t);
  });
}

// ---- サンプルデータ ----
export function sampleCollect(): CollectStore {
  const T = (id: string, name: string, paidOut: number, expected: number, order: number, children: Target[] = []): Target => ({ id, name, paidOut, expected, order, children });
  const items: CollectItem[] = [
    {
      id: "it_rent", name: "地代家賃", order: 1, monthly: true, accountKeys: ["admin", "office", "rent"], targets: [
        T("pA", "物件A（A寮）", 80000, 0, 1, [T("pA1", "Aさん", 0, 20000, 1), T("pA2", "Bさん", 0, 30000, 2), T("pA3", "Dさん", 0, 30000, 3)]),
        T("pB", "物件B（B寮）", 75000, 0, 2, [T("pB1", "Eさん", 0, 40000, 1), T("pB2", "Fさん", 0, 35000, 2)]),
        T("pC", "物件C（C寮）", 90000, 0, 3, [T("pC1", "空室", 0, 0, 1)]),
      ],
    },
    {
      id: "it_loan", name: "社員貸付", order: 2, monthly: false, targets: [
        T("lo1", "フン", 100000, 100000, 1), T("lo2", "トゥン", 50000, 50000, 2),
      ],
    },
    {
      id: "it_adv", name: "立替金（交通費等）", order: 3, monthly: false, targets: [
        T("ad1", "リン", 15000, 15000, 1),
      ],
    },
  ];
  const records: CollectRecord[] = [
    { id: "cr1", itemId: "it_rent", targetId: "pA1", ym: "2026-07", amount: 20000, date: "2026-07-05", method: "振込", memo: "" },
    { id: "cr2", itemId: "it_rent", targetId: "pA2", ym: "2026-07", amount: 30000, date: "2026-07-05", method: "現金", memo: "" },
    { id: "cr3", itemId: "it_rent", targetId: "pB1", ym: "2026-07", amount: 40000, date: "2026-07-06", method: "振込", memo: "" },
    { id: "cr4", itemId: "it_loan", targetId: "lo1", ym: "2026-07", amount: 20000, date: "2026-07-25", method: "給与天引き", memo: "分割1回目" },
  ];
  return { items, records };
}
