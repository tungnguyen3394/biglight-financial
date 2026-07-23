"use client";

// ミーティング報告書 — Excel「ミーティング報告書」を再現。
//   月を選択 → 当月 / 累積 / 年間 の3ブロックで 予算・見込・達成率・対売上・昨年実績・昨年比 を表示。
//   昨年実績が無い場合は「昨年実績を入力」からその場で登録できる（前年度の実績として保存）。
import { Fragment, useMemo, useState } from "react";
import Panel from "@/components/ui/Panel";
import Icon from "@/components/Icon";
import {
  INPUT_METRICS, getSeries, mikomiSeries, sum, toMan,
  type YearData, type InputMetric, type MetricKey,
} from "@/lib/yojitsu";
import { fiscalLabel, FY_MONTH_LABELS } from "@/lib/fiscal";

const ROWS: { key: MetricKey; label: string; good: boolean; strong?: boolean }[] = [
  { key: "revenue",   label: "売上",     good: true },
  { key: "cogs",      label: "売上原価", good: false },
  { key: "gross",     label: "粗利",     good: true, strong: true },
  { key: "sga",       label: "販管費",   good: false },
  { key: "operating", label: "営業利益", good: true, strong: true },
  { key: "ordinary",  label: "経常利益", good: true, strong: true },
];

// 単位: 千円
const k = (n: number) => Math.round(n / 1000).toLocaleString("ja-JP");
const pctS = (a: number, b: number) => (b ? Math.round((a / b) * 100) + "%" : "—");
function pctTone(a: number, b: number, good: boolean): string {
  if (!b) return "text-slate-300";
  const r = a / b;
  const ok = good ? r >= 1 : r <= 1;
  return ok ? "text-emerald-600" : "text-rose-600";
}

export default function MeetingReport({
  yearData, prevData, year, onSetPrevActual,
}: {
  yearData: YearData; prevData: YearData; year: number;
  onSetPrevActual: (metric: InputMetric, month: number, manV: number) => void;
}) {
  const [mi, setMi] = useState(() => {
    // 実績が入っている最後の月を初期選択（なければ8月）
    const { flags } = mikomiSeries(yearData);
    const last = flags.lastIndexOf(true);
    return last >= 0 ? last : 0;
  });
  const [showPrevInput, setShowPrevInput] = useState(false);

  const cur = useMemo(() => getSeries(yearData), [yearData]);
  const mk = useMemo(() => mikomiSeries(yearData).mikomi, [yearData]);
  const prev = useMemo(() => getSeries(prevData), [prevData]);
  const prevHasData = useMemo(() => INPUT_METRICS.some((m) => prevData.actual[m.key].some((v) => v !== 0)), [prevData]);

  const range = Array.from({ length: mi + 1 }, (_, i) => i); // 累積 = 8月〜選択月
  const pick = (arr: number[], months: number[]) => months.reduce((t, m) => t + arr[m], 0);

  type Block = { plan: number; mikomi: number; last: number };
  const blocks = (key: MetricKey): { month: Block; cum: Block; yearB: Block } => ({
    month: { plan: cur[key].plan[mi], mikomi: mk[key][mi], last: prev[key].actual[mi] },
    cum:   { plan: pick(cur[key].plan, range), mikomi: pick(mk[key], range), last: pick(prev[key].actual, range) },
    yearB: { plan: sum(cur[key].plan), mikomi: sum(mk[key]), last: sum(prev[key].actual) },
  });
  const revB = blocks("revenue");

  const TH = "border-b-2 border-line px-2 py-1.5 text-right text-[10px] font-bold text-muted";
  const groupTH = "border-b border-line px-2 py-1.5 text-center text-[11px] font-black";

  return (
    <div className="space-y-6">
      <Panel icon="doc" title={`ミーティング報告書 — ${fiscalLabel(year)}`}
        action={
          <div className="flex items-center gap-2">
            <select value={mi} onChange={(e) => setMi(Number(e.target.value))}
              className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm font-bold text-ink outline-none focus:border-brand-500">
              {FY_MONTH_LABELS.map((l, i) => <option key={i} value={i}>{l}</option>)}
            </select>
            <button onClick={() => setShowPrevInput(true)}
              className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-bold text-muted hover:border-brand-500 hover:text-brand-600">
              <Icon name="pencil" size={12} />昨年実績を入力
            </button>
          </div>
        }>

        {!prevHasData && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3">
            <Icon name="warning" size={16} className="text-amber-500" />
            <p className="flex-1 text-xs font-bold text-amber-700">昨年（{fiscalLabel(year - 1)}）の実績データがありません。昨年比を表示するには入力してください。</p>
            <button onClick={() => setShowPrevInput(true)} className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white hover:bg-amber-600">昨年実績を入力する</button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-xs">
            <thead>
              <tr>
                <th rowSpan={2} className="sticky left-0 z-10 border-b-2 border-line bg-white px-2 py-1.5 text-left text-[13px] font-black text-ink">{FY_MONTH_LABELS[mi]}</th>
                <th colSpan={6} className={`${groupTH} bg-emerald-50/60 text-emerald-700`}>当月</th>
                <th colSpan={6} className={`${groupTH} border-l-2 border-line bg-sky-50/60 text-sky-700`}>累積（8月〜{FY_MONTH_LABELS[mi]}）</th>
                <th colSpan={6} className={`${groupTH} border-l-2 border-line bg-violet-50/60 text-violet-700`}>年間</th>
              </tr>
              <tr>
                {(["当月", "累積", "年間"] as const).map((g, gi) => (
                  <Fragment key={g}>
                    <th className={`${TH} ${gi > 0 ? "border-l-2 border-l-line" : ""}`}>予算</th>
                    <th className={TH}>見込</th>
                    <th className={TH}>{gi === 2 ? "進捗率" : "達成率"}</th>
                    <th className={TH}>対売上</th>
                    <th className={TH}>昨年実績</th>
                    <th className={TH}>昨年比</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => {
                const b = blocks(r.key);
                const cells = ([["month", revB.month], ["cum", revB.cum], ["yearB", revB.yearB]] as const).map(([bk, rev], gi) => {
                  const x = b[bk];
                  return (
                    <Fragment key={bk}>
                      <td className={`px-2 py-2 text-right tabular-nums text-muted ${gi > 0 ? "border-l-2 border-line" : ""}`}>{k(x.plan)}</td>
                      <td className={`px-2 py-2 text-right font-bold tabular-nums ${x.mikomi < 0 ? "text-red-600" : "text-ink"}`}>{k(x.mikomi)}</td>
                      <td className={`px-2 py-2 text-right font-bold tabular-nums ${pctTone(x.mikomi, x.plan, r.good)}`}>{pctS(x.mikomi, x.plan)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-500">{pctS(x.mikomi, rev.mikomi)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-500">{prevHasData ? k(x.last) : "—"}</td>
                      <td className={`px-2 py-2 text-right font-bold tabular-nums ${prevHasData ? pctTone(x.mikomi, x.last, r.good) : "text-slate-300"}`}>{prevHasData ? pctS(x.mikomi, x.last) : "—"}</td>
                    </Fragment>
                  );
                });
                return (
                  <tr key={r.key} className={`${r.strong ? "border-t-2 border-line/80 bg-surface/40" : "border-t border-line/40"} hover:bg-surface/70`}>
                    <td className={`sticky left-0 z-10 whitespace-nowrap bg-white px-2 py-2 text-left ${r.strong ? "font-black text-ink" : "font-semibold text-muted"}`}>{r.label}</td>
                    {cells}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-slate-400">
          単位：千円 ・ 見込 = 実績入力済みの月は実績／未入力の月は予算 ・ 達成率 = 見込÷予算 ・ 対売上 = 見込÷売上見込 ・ 昨年比 = 見込÷昨年実績 ・ 進捗率 = 年間見込÷年間予算
        </p>
      </Panel>

      {/* ===== Modal: 昨年実績の入力 ===== */}
      {showPrevInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setShowPrevInput(false)} />
          <div className="relative flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="bg-gradient-to-r from-slate-600 to-slate-700 px-6 py-4 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black">昨年実績の入力 — {fiscalLabel(year - 1)}</h3>
                  <p className="mt-0.5 text-[11px] opacity-85">前年度の月次実績（売上・原価・販管費・営業外収支）を入力。ミーティング報告書の昨年比に使われます。</p>
                </div>
                <button onClick={() => setShowPrevInput(false)} className="flex h-9 w-9 items-center justify-center rounded-lg text-white/80 hover:bg-white/15" aria-label="閉じる"><Icon name="close" size={16} /></button>
              </div>
            </div>
            <div className="overflow-auto p-4">
              <table className="w-full min-w-[880px] text-xs">
                <thead>
                  <tr className="text-[10px] text-muted">
                    <th className="sticky left-0 z-10 whitespace-nowrap bg-white py-1.5 pr-2 text-left font-bold">項目</th>
                    {FY_MONTH_LABELS.map((l) => <th key={l} className="px-1 py-1.5 text-right font-bold">{l}</th>)}
                    <th className="px-1.5 py-1.5 text-right font-black text-ink">合計</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {INPUT_METRICS.map((m) => (
                    <tr key={m.key}>
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-white py-1.5 pr-2 text-left text-[13px] font-bold text-ink">{m.label}</td>
                      {FY_MONTH_LABELS.map((_, month) => (
                        <td key={month} className="px-0.5 py-1.5">
                          <input type="number" value={toMan(prevData.actual[m.key][month]) || ""}
                            onChange={(e) => onSetPrevActual(m.key, month, Number(e.target.value) || 0)}
                            placeholder="0" className="w-[52px] rounded-md border border-line px-1 py-1 text-right text-[11px] font-semibold outline-none focus:border-brand-500" />
                        </td>
                      ))}
                      <td className="px-1.5 py-1.5 text-right text-[11px] font-black tabular-nums text-ink">{toMan(sum(prevData.actual[m.key])).toLocaleString("ja-JP")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[10px] text-slate-400">単位：万円 ・ 営業外収支はマイナス入力可 ・ 粗利・営業利益・経常利益は自動計算 ・ 変更は自動保存</p>
            </div>
            <div className="flex justify-end border-t border-line px-5 py-3">
              <button onClick={() => setShowPrevInput(false)} className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white hover:bg-brand-700">完了</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
