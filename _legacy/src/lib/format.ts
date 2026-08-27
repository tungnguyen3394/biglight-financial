// 共通フォーマット関数。

export const yen = (n: number): string =>
  "¥" + Math.round(n).toLocaleString("ja-JP");

// 大きな数を短縮: 12,480,000 -> "1,248万"
export const yenMan = (n: number): string => {
  const man = n / 10000;
  return "¥" + man.toLocaleString("ja-JP", { maximumFractionDigits: 0 }) + "万";
};

export const percent = (n: number, digits = 0): string =>
  n.toLocaleString("ja-JP", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + "%";

export const signed = (n: number): string => (n >= 0 ? "+" : "") + n.toLocaleString("ja-JP");
