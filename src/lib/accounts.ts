// 勘定科目マスタ (Chart of Accounts) — 大分類 › 中分類 › 小分類 › 細分類.
// ĐỊNH NGHĨA TẬP TRUNG ở 設定. Các nơi khác (回収 …) chỉ CHỌN từ dropdown.
// Dùng chung cấu trúc cây với expenses (CatNode) — nhưng lưu bảng riêng.

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

// Danh sách phẳng mọi nút (để chọn dropdown) — mỗi cấp đều chọn được.
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
// Chỉ lấy nút lá (小/細) — thường dùng cho 勘定科目 cụ thể.
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
