// 勘定科目マスタ — 大分類 › 中分類 › 小分類 › 細分類.
// 設定画面で一元管理。他の画面（回収 …）はドロップダウンで選択のみ。
// expenses と同じツリー構造（CatNode）を利用するが、別テーブルに保存。

import { defaultTree, type CatNode } from "./expenses";
export type { CatNode } from "./expenses";
export { addChildAt, renameAt, deleteAt, childrenAt, labelsOf } from "./expenses";

export const STORAGE_KEY = "bl_accounts_v1";
export const TIER_LABELS = ["大分類", "中分類", "小分類", "細分類"];

export const defaultAccounts = (): CatNode[] => defaultTree();

export function loadAccounts(): CatNode[] {
  if (typeof window === "undefined") return defaultAccounts();
  try { const raw = window.localStorage.getItem(STORAGE_KEY); return raw ? (JSON.parse(raw) as CatNode[]) : defaultAccounts(); }
  catch { return defaultAccounts(); }
}

// 全ノードのフラット一覧（ドロップダウン用）— 各階層を選択可能。
export type AccountRef = { keys: string[]; label: string; depth: number };
export function accountOptions(tree: CatNode[]): AccountRef[] {
  const out: AccountRef[] = [];
  const rec = (nodes: CatNode[], labels: string[], keys: string[]) => {
    for (const n of [...nodes]) {
      const l = [...labels, n.label], k = [...keys, n.key];
      out.push({ keys: k, label: l.join(" › "), depth: k.length });
      if (n.children) rec(n.children, l, k);
    }
  };
  rec(tree, [], []);
  return out;
}
// 末端ノード（小/細）のみ取得 — 具体的な勘定科目に使用。
export function accountLeaves(tree: CatNode[]): AccountRef[] {
  const out: AccountRef[] = [];
  const rec = (nodes: CatNode[], labels: string[], keys: string[]) => {
    for (const n of nodes) {
      const l = [...labels, n.label], k = [...keys, n.key];
      if (!n.children || n.children.length === 0) out.push({ keys: k, label: l.join(" › "), depth: k.length });
      else rec(n.children, l, k);
    }
  };
  rec(tree, [], []);
  return out;
}
