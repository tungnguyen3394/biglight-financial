// 支出管理 v2 — ユーザー定義の分類ツリー（最大4階層）:
//   大分類 → 中分類 → 小分類 → 細分類（第4階層は任意）
// 分類は「分類設定」で追加・編集・削除でき、ツリーはデータと共に保存される。
//
// 各支出は次を持つ：定期/不定期、定期支払日、支払方法（自動引き落とし/振込/現金）。

export type CatNode = { key: string; label: string; children?: CatNode[] };

export const TIER_LABELS = ["大分類", "中分類", "小分類", "細分類"];
export const MAX_DEPTH = 4;

export type PayMethod = "自動引き落とし" | "振込" | "現金";
export const PAY_METHODS: PayMethod[] = ["自動引き落とし", "振込", "現金"];
export const METHOD_TONE: Record<PayMethod, string> = {
  "自動引き落とし": "bg-brand-50 text-brand-700",
  "振込": "bg-emerald-50 text-emerald-600",
  "現金": "bg-amber-50 text-amber-600",
};

export type Expense = {
  id: string;
  date: string;            // 支払日 YYYY-MM-DD
  path: string[];          // ツリーのkey: [大, 中, 小, (細)] — 階層の深さは可変
  vendor: string;          // 支払先
  amount: number;          // 円
  method: PayMethod;       // 支払方法
  recurring: boolean;      // true = 定期 / false = 不定期
  recurringDay?: number;   // 定期支払日 (1〜31) — 定期のみ
  note: string;
  propertyId?: string;     // 物件マスタ連携 — 小項目 = 地代家賃 のみ
};

export type ExpenseStore = {
  version: 2;
  tree: CatNode[];                  // ユーザーが編集する分類ツリー
  records: Expense[];
  budgets: Record<string, number>;  // 大分類keyごとの月次予算
};

export const STORAGE_KEY = "bl_expenses_v2";
export const LEGACY_KEY = "bl_expenses_v1";

// ---------- 既定ツリー（Web広告の枝に第4階層をサンプルとして用意） ----------
export function defaultTree(): CatNode[] {
  return [
    {
      key: "personnel", label: "人件費", children: [
        { key: "salary", label: "給与", children: [
          { key: "exec", label: "役員報酬" }, { key: "fulltime", label: "正社員給与" }, { key: "parttime", label: "パート・アルバイト" }] },
        { key: "bonus", label: "賞与", children: [{ key: "bonus_all", label: "賞与" }] },
        { key: "welfare", label: "法定福利費", children: [
          { key: "social", label: "社会保険料" }, { key: "labor", label: "労働保険料" }] },
      ],
    },
    {
      key: "sales_cost", label: "販売費", children: [
        { key: "ad", label: "広告宣伝費", children: [
          { key: "web_ad", label: "Web広告", children: [           // ← 第4階層（任意）
            { key: "google", label: "Google広告" }, { key: "meta", label: "Meta広告" }] },
          { key: "sns", label: "SNS運用" }, { key: "print", label: "印刷物" }] },
        { key: "travel", label: "旅費交通費", children: [
          { key: "train", label: "電車・バス" }, { key: "biz_trip", label: "出張費" }] },
        { key: "entertain", label: "接待交際費", children: [
          { key: "meal", label: "会食" }, { key: "gift", label: "贈答品" }] },
      ],
    },
    {
      key: "admin", label: "管理費", children: [
        { key: "office", label: "オフィス", children: [
          { key: "rent", label: "地代家賃" }, { key: "utility", label: "水道光熱費" }] },
        { key: "it", label: "IT・通信", children: [
          { key: "comm", label: "通信費" }, { key: "saas", label: "システム利用料" }] },
        { key: "other", label: "その他", children: [
          { key: "supplies", label: "消耗品費" }, { key: "misc", label: "雑費" }] },
      ],
    },
  ];
}

// ---------- ツリー走査 ----------
export function findNode(tree: CatNode[], path: string[]): CatNode | null {
  let nodes = tree, found: CatNode | null = null;
  for (const key of path) {
    const n = nodes.find((x) => x.key === key);
    if (!n) return null;
    found = n; nodes = n.children ?? [];
  }
  return found;
}

export function childrenAt(tree: CatNode[], path: string[]): CatNode[] {
  if (path.length === 0) return tree;
  return findNode(tree, path)?.children ?? [];
}

// pathの各階層のラベル（ツリーから削除済みのkeyはkeyをそのまま表示）。
export function labelsOf(tree: CatNode[], path: string[]): string[] {
  const out: string[] = [];
  let nodes = tree;
  for (const key of path) {
    const n = nodes.find((x) => x.key === key);
    out.push(n?.label ?? key);
    nodes = n?.children ?? [];
  }
  return out;
}

// 支出のpathがノードのpathで始まる場合、その支出はノードに属する。
export const underPath = (e: Expense, prefix: string[]): boolean =>
  prefix.every((k, i) => e.path[i] === k);

// ---------- ツリー編集（immutable） ----------
function mapAt(tree: CatNode[], path: string[], fn: (nodes: CatNode[]) => CatNode[]): CatNode[] {
  if (path.length === 0) return fn(tree);
  return tree.map((n) => n.key === path[0]
    ? { ...n, children: mapAt(n.children ?? [], path.slice(1), fn) }
    : n);
}

export const newKey = (): string => "c" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);

export function addChildAt(tree: CatNode[], parentPath: string[], label: string): CatNode[] {
  return mapAt(tree, parentPath, (nodes) => [...nodes, { key: newKey(), label }]);
}
export function renameAt(tree: CatNode[], path: string[], label: string): CatNode[] {
  return mapAt(tree, path.slice(0, -1), (nodes) => nodes.map((n) => n.key === path[path.length - 1] ? { ...n, label } : n));
}
export function deleteAt(tree: CatNode[], path: string[]): CatNode[] {
  return mapAt(tree, path.slice(0, -1), (nodes) => nodes.filter((n) => n.key !== path[path.length - 1]));
}

export const yen = (n: number): string => "¥" + Math.round(n).toLocaleString("ja-JP");

// ---------- v1（major/mid/small）からの移行 ----------
type LegacyExpense = { id: string; date: string; major: string; mid: string; small: string; vendor: string; amount: number; note: string };
type LegacyStore = { records: LegacyExpense[]; budgets: Record<string, number> };

export function migrateV1(old: LegacyStore): ExpenseStore {
  return {
    version: 2,
    tree: defaultTree(),
    budgets: old.budgets ?? {},
    records: (old.records ?? []).map((r) => ({
      id: r.id, date: r.date, path: [r.major, r.mid, r.small],
      vendor: r.vendor, amount: r.amount, method: "振込" as PayMethod, recurring: false, note: r.note,
    })),
  };
}

// ---------- サンプルデータ ----------
export function sampleExpenses(): ExpenseStore {
  return {
    version: 2,
    tree: defaultTree(),
    budgets: { personnel: 4500000, sales_cost: 1200000, admin: 900000 },
    records: [
      // 定期 (recurring)
      { id: "e01", date: "2026-07-25", path: ["personnel", "salary", "fulltime"], vendor: "給与振込", amount: 3200000, method: "振込", recurring: true, recurringDay: 25, note: "7月分給与" },
      { id: "e02", date: "2026-07-25", path: ["personnel", "salary", "exec"], vendor: "役員報酬", amount: 800000, method: "振込", recurring: true, recurringDay: 25, note: "" },
      { id: "e03", date: "2026-07-28", path: ["personnel", "welfare", "social"], vendor: "年金事務所", amount: 620000, method: "自動引き落とし", recurring: true, recurringDay: 28, note: "社会保険" },
      { id: "e08a", date: "2026-07-27", path: ["admin", "office", "rent"], vendor: "田中不動産(株)", amount: 80000, method: "自動引き落とし", recurring: true, recurringDay: 27, note: "A寮 家賃", propertyId: "prop_a" },
      { id: "e08b", date: "2026-07-27", path: ["admin", "office", "rent"], vendor: "山田地所", amount: 75000, method: "自動引き落とし", recurring: true, recurringDay: 27, note: "B寮 家賃", propertyId: "prop_b" },
      { id: "e08c", date: "2026-07-25", path: ["admin", "office", "rent"], vendor: "佐藤ハウジング", amount: 90000, method: "振込", recurring: true, recurringDay: 25, note: "C寮 家賃", propertyId: "prop_c" },
      { id: "e08d", date: "2026-07-05", path: ["admin", "office", "rent"], vendor: "鈴木不動産", amount: 120000, method: "自動引き落とし", recurring: true, recurringDay: 5, note: "Dマンション 家賃", propertyId: "prop_d" },
      { id: "e09", date: "2026-07-05", path: ["admin", "it", "saas"], vendor: "各種SaaS", amount: 128000, method: "自動引き落とし", recurring: true, recurringDay: 5, note: "システム利用料" },
      { id: "e10", date: "2026-07-08", path: ["admin", "office", "utility"], vendor: "電力会社", amount: 46000, method: "自動引き落とし", recurring: true, recurringDay: 8, note: "" },
      { id: "e16", date: "2026-07-20", path: ["admin", "it", "comm"], vendor: "通信キャリア", amount: 38000, method: "自動引き落とし", recurring: true, recurringDay: 20, note: "携帯・ネット" },
      // 不定期（単発）— Web広告は第4階層を使用
      { id: "e04", date: "2026-07-05", path: ["sales_cost", "ad", "web_ad", "google"], vendor: "Google広告", amount: 450000, method: "振込", recurring: false, note: "求人広告" },
      { id: "e05", date: "2026-07-10", path: ["sales_cost", "ad", "web_ad", "meta"], vendor: "Meta広告", amount: 380000, method: "振込", recurring: false, note: "Facebook求人" },
      { id: "e06", date: "2026-07-12", path: ["sales_cost", "travel", "biz_trip"], vendor: "JR東海", amount: 86000, method: "現金", recurring: false, note: "岐阜出張" },
      { id: "e07", date: "2026-07-15", path: ["sales_cost", "entertain", "meal"], vendor: "会食", amount: 42000, method: "現金", recurring: false, note: "顧客会食" },
      // 前月 + 前年度（比較レポート用）
      { id: "e11", date: "2026-06-25", path: ["personnel", "salary", "fulltime"], vendor: "給与振込", amount: 3150000, method: "振込", recurring: true, recurringDay: 25, note: "6月分給与" },
      { id: "e12", date: "2026-06-05", path: ["sales_cost", "ad", "web_ad", "google"], vendor: "Google広告", amount: 400000, method: "振込", recurring: false, note: "" },
      { id: "e13", date: "2024-11-25", path: ["personnel", "salary", "fulltime"], vendor: "給与振込", amount: 1800000, method: "振込", recurring: true, recurringDay: 25, note: "11月分給与" },
      { id: "e14", date: "2025-02-05", path: ["sales_cost", "ad", "web_ad", "google"], vendor: "Google広告", amount: 300000, method: "振込", recurring: false, note: "" },
      { id: "e15", date: "2025-06-25", path: ["personnel", "salary", "fulltime"], vendor: "給与振込", amount: 1900000, method: "振込", recurring: true, recurringDay: 25, note: "6月分給与" },
    ],
  };
}
