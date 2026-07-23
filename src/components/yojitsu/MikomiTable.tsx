"use client";

// 見込実績表 — Excel「BIGLIGHT見込実績表」を再現。
//   列: 8月〜7月（四半期ごとにグループ）＋ 合計・上期・下期
//   月の値: 実績が入っている月 = 実績、まだの月 = 予算（黄色ハイライト）
//   行: 売上〜経常利益 ＋ 経常見込・累積見込
import Panel from "@/components/ui/Panel";
import { mikomiSeries, cumulate, sum, type YearData, type MetricKey } from "@/lib/yojitsu";
import { fiscalLabel, FY_MONTH_LABELS } from "@/lib/fiscal";

const QUARTERS = [
  { label: "第一期", months: [0, 1, 2] },
  { label: "第二期", months: [3, 4, 5] },
  { label: "第三期", months: [6, 7, 8] },
  { label: "第四期", months: [9, 10, 11] },
];
const H1 = [0, 1, 2, 3, 4, 5], H2 = [6, 7, 8, 9, 10, 11];

const ROWS: { key: MetricKey; label: string; strong?: boolean }[] = [
  { key: "revenue",   label: "売上" },
  { key: "cogs",      label: "売上原価" },
  { key: "gross",     label: "売上総利益", strong: true },
  { key: "sga",       label: "販管費" },
  { key: "operating", label: "営業利益", strong: true },
  { key: "nonop",     label: "営業外収支" },
  { key: "ordinary",  label: "経常利益", strong: true },
];

const fmt = (n: number) => (n === 0 ? "0" : Math.round(n).toLocaleString("ja-JP"));

export default function MikomiTable({ yearData, year }: { yearData: YearData; year: number }) {
  const { flags, mikomi } = mikomiSeries(yearData);
  const cumOrdinary = cumulate(mikomi.ordinary);
  const pick = (arr: number[], months: number[]) => months.reduce((t, m) => t + arr[m], 0);

  const cellTone = (m: number) => (flags[m] ? "" : "bg-amber-50");
  const valTone = (v: number, strong?: boolean) =>
    v < 0 ? "text-red-600" : strong ? "text-ink" : "text-slate-700";

  return (
    <Panel icon="doc" title={`見込実績表（${fiscalLabel(year)}）`}
      action={<span className="text-[11px] text-slate-400">白 = 実績 ・ <span className="rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-700">黄 = 予算（見込）</span> ・ 単位：円</span>}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1280px] border-collapse text-xs">
          <thead>
            {/* 四半期グループ + 四半期売上見込 */}
            <tr className="text-[11px]">
              <th rowSpan={2} className="sticky left-0 z-10 border-b-2 border-line bg-white px-2 py-2 text-left font-black text-ink">勘定科目</th>
              {QUARTERS.map((q) => {
                const allPlan = q.months.every((m) => !flags[m]);
                return (
                  <th key={q.label} colSpan={3} className={`border-b border-l border-line px-2 py-1.5 text-center font-black ${allPlan ? "bg-amber-100 text-amber-800" : "bg-surface text-ink"}`}>
                    {q.label}<span className="ml-2 font-bold tabular-nums">{fmt(pick(mikomi.revenue, q.months))}</span>
                  </th>
                );
              })}
              <th rowSpan={2} className="border-b-2 border-l-2 border-line bg-surface px-2 py-2 text-right font-black text-ink">合計</th>
              <th rowSpan={2} className="border-b-2 border-l border-line bg-surface px-2 py-2 text-right font-black text-ink">上期</th>
              <th rowSpan={2} className="border-b-2 border-l border-line bg-surface px-2 py-2 text-right font-black text-ink">下期</th>
            </tr>
            {/* 月 + 実績/予算ラベル */}
            <tr className="text-[10px]">
              {FY_MONTH_LABELS.map((l, m) => (
                <th key={m} className={`whitespace-nowrap border-b-2 border-l border-line px-1.5 py-1 text-right font-bold ${flags[m] ? "text-muted" : "bg-amber-100 text-amber-700"}`}>
                  {l}<span className="ml-1 font-normal">{flags[m] ? "実績" : "予算"}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.key} className={`${r.strong ? "border-t-2 border-line/80" : "border-t border-line/40"} hover:bg-surface/60`}>
                <td className={`sticky left-0 z-10 whitespace-nowrap bg-white px-2 py-2 text-left ${r.strong ? "font-black text-ink" : "font-semibold text-muted"}`}>{r.label}</td>
                {FY_MONTH_LABELS.map((_, m) => (
                  <td key={m} className={`border-l border-line/40 px-1.5 py-2 text-right tabular-nums ${cellTone(m)} ${valTone(mikomi[r.key][m], r.strong)} ${r.strong ? "font-bold" : ""}`}>
                    {fmt(mikomi[r.key][m])}
                  </td>
                ))}
                <td className={`border-l-2 border-line px-2 py-2 text-right font-black tabular-nums ${valTone(sum(mikomi[r.key]), true)}`}>{fmt(sum(mikomi[r.key]))}</td>
                <td className={`border-l border-line px-2 py-2 text-right font-bold tabular-nums ${valTone(pick(mikomi[r.key], H1))}`}>{fmt(pick(mikomi[r.key], H1))}</td>
                <td className={`border-l border-line px-2 py-2 text-right font-bold tabular-nums ${valTone(pick(mikomi[r.key], H2))}`}>{fmt(pick(mikomi[r.key], H2))}</td>
              </tr>
            ))}

            {/* 経常見込（ハイライト） */}
            <tr className="border-t-2 border-line bg-orange-50">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-orange-50 px-2 py-2 text-left font-black text-orange-800">経常見込</td>
              {FY_MONTH_LABELS.map((_, m) => (
                <td key={m} className={`border-l border-orange-200/60 px-1.5 py-2 text-right font-bold tabular-nums ${mikomi.ordinary[m] < 0 ? "text-red-600" : "text-orange-800"}`}>{fmt(mikomi.ordinary[m])}</td>
              ))}
              <td className="border-l-2 border-line bg-white px-2 py-2" />
              <td className="border-l border-line bg-white px-2 py-2" />
              <td className="border-l border-line bg-white px-2 py-2" />
            </tr>
            {/* 累積見込 */}
            <tr className="border-t border-line/60">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-2 py-2 text-left font-black text-ink">累積見込</td>
              {FY_MONTH_LABELS.map((_, m) => (
                <td key={m} className={`border-l border-line/40 px-1.5 py-2 text-right font-bold tabular-nums ${cumOrdinary[m] < 0 ? "text-red-600" : "text-ink"}`}>{fmt(cumOrdinary[m])}</td>
              ))}
              <td className="border-l-2 border-line px-2 py-2" />
              <td className="border-l border-line px-2 py-2" />
              <td className="border-l border-line px-2 py-2" />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-slate-400">
        見込 = 実績入力済みの月は実績、未入力の月は予算を採用（自動） ・ 経常利益 = 営業利益 ＋ 営業外収支 ・ 上期 = 8〜1月 / 下期 = 2〜7月 ・ 四半期横の数字 = 売上見込合計
      </p>
    </Panel>
  );
}
