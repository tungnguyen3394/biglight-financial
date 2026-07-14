"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Panel from "@/components/ui/Panel";
import {
  METRICS, INPUT_METRICS, FY_YEARS, STORAGE_KEY,
  defaultStore, emptyYear, getSeries, sum, toMan, fromMan, manStr,
  type Store, type InputMetric, type MetricKey,
} from "@/lib/yojitsu";
import { fiscalLabel, FY_MONTH_LABELS, fiscalYearOf, fiscalMonthIndex, deltaPct } from "@/lib/fiscal";

const yenFull = (n: number) => "¥" + Math.round(n).toLocaleString("ja-JP");

// ===== 比較期間（会計年度 8月始まり） =====
type Gran = "month" | "quarter" | "half" | "year";
const GRAN_TABS: { key: Gran; label: string }[] = [
  { key: "month", label: "月次" }, { key: "quarter", label: "四半期" }, { key: "half", label: "半期" }, { key: "year", label: "通期" },
];
const BUCKETS: Record<Gran, { label: string; months: number[] }[]> = {
  month: FY_MONTH_LABELS.map((l, i) => ({ label: l, months: [i] })),
  quarter: [
    { label: "Q1", months: [0, 1, 2] }, { label: "Q2", months: [3, 4, 5] },
    { label: "Q3", months: [6, 7, 8] }, { label: "Q4", months: [9, 10, 11] },
  ],
  half: [{ label: "上期", months: [0, 1, 2, 3, 4, 5] }, { label: "下期", months: [6, 7, 8, 9, 10, 11] }],
  year: [{ label: "通期", months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }],
};

type Bucket = { label: string; plan: number; actual: number; hasActual: boolean };
function bucketize(series: { plan: number[]; actual: number[] }, gran: Gran, cum: boolean): Bucket[] {
  let cp = 0, ca = 0;
  return BUCKETS[gran].map((b) => {
    const p = b.months.reduce((t, m) => t + series.plan[m], 0);
    const a = b.months.reduce((t, m) => t + series.actual[m], 0);
    const hasA = b.months.some((m) => series.actual[m] !== 0);
    if (cum) { cp += p; ca += a; return { label: b.label, plan: cp, actual: ca, hasActual: hasA || ca !== 0 }; }
    return { label: b.label, plan: p, actual: a, hasActual: hasA };
  });
}

function rateTone(rate: number, good: boolean): string {
  const ok = good ? rate >= 100 : rate <= 100;
  const warn = good ? rate >= 80 : rate <= 110;
  return ok ? "text-emerald-600" : warn ? "text-amber-600" : "text-rose-600";
}
function Delta({ cur, base, good }: { cur: number; base: number; good: boolean }) {
  const d = deltaPct(cur, base);
  if (d === null) return <span className="text-slate-300">—</span>;
  const ok = good ? d >= 0 : d <= 0;
  return <span className={`font-bold tabular-nums ${ok ? "text-emerald-600" : "text-red-600"}`}>{d >= 0 ? "+" : ""}{d.toFixed(1)}%</span>;
}

export default function YojitsuManager() {
  const [store, setStore] = useState<Store>(() => defaultStore());
  const [year, setYear] = useState(2025);
  const [gran, setGran] = useState<Gran>("quarter");
  const [cum, setCum] = useState(false);
  const [metric, setMetric] = useState<MetricKey>("revenue");
  const [editMonth, setEditMonth] = useState(10);
  const [showBudget, setShowBudget] = useState(false);
  const [annualDraft, setAnnualDraft] = useState<Record<InputMetric, string>>({ revenue: "", cogs: "", sga: "" });
  const [menuOpen, setMenuOpen] = useState(false);
  const ready = useRef(false);

  useEffect(() => {
    const iso = new Date().toISOString().slice(0, 10);
    setYear(fiscalYearOf(iso)); setEditMonth(fiscalMonthIndex(iso));
    try { const raw = window.localStorage.getItem(STORAGE_KEY); if (raw) setStore(JSON.parse(raw) as Store); } catch { /* ignore */ }
    ready.current = true;
  }, []);
  useEffect(() => { if (!ready.current) return; try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* ignore */ } }, [store]);

  const yearData = store[String(year)] ?? emptyYear();
  const prevData = store[String(year - 1)] ?? emptyYear();
  const series = useMemo(() => getSeries(yearData), [yearData]);
  const prevSeries = useMemo(() => getSeries(prevData), [prevData]);

  function setBook(kind: "plan" | "actual", m: InputMetric, month: number, manV: number) {
    setStore((prev) => { const y = prev[String(year)] ?? emptyYear(); const b = y[kind]; const arr = [...b[m]]; arr[month] = fromMan(manV); return { ...prev, [String(year)]: { ...y, [kind]: { ...b, [m]: arr } } }; });
  }
  function distribute(m: InputMetric) {
    const per = fromMan(Math.round((Number(annualDraft[m]) || 0) / 12));
    setStore((prev) => { const y = prev[String(year)] ?? emptyYear(); return { ...prev, [String(year)]: { ...y, plan: { ...y.plan, [m]: Array(12).fill(per) } } }; });
  }
  function resetSample() { if (!confirm("サンプルデータに戻します。よろしいですか？")) return; setStore(defaultStore()); }

  // ヒーロー：主要3指標の通期（年間）
  const heroKeys: MetricKey[] = ["revenue", "gross", "operating"];
  const hero = heroKeys.map((k) => ({ key: k, label: METRICS.find((x) => x.key === k)!.label, plan: sum(series[k].plan), actual: sum(series[k].actual) }));

  // 選択した期間の対照表
  const rows = useMemo(() => {
    const cur = bucketize(series[metric], gran, cum);
    const prev = bucketize(prevSeries[metric], gran, cum);
    return cur.map((b, i) => ({ ...b, prevActual: prev[i]?.actual ?? 0 }));
  }, [series, prevSeries, metric, gran, cum]);
  const metricDef = METRICS.find((x) => x.key === metric)!;
  const totalPlan = sum(series[metric].plan), totalActual = sum(series[metric].actual);
  const chartMax = Math.max(1, ...rows.map((r) => Math.max(r.plan, r.actual)));

  function printReport() {
    const pct = (c: number, b: number) => { const d = deltaPct(c, b); return d === null ? "—" : `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`; };
    const secs = heroKeys.map((k) => {
      const def = METRICS.find((x) => x.key === k)!;
      const rs = bucketize(series[k], gran, cum);
      return `<h1 style="font-size:14px">${def.label}（${GRAN_TABS.find((g) => g.key === gran)!.label}${cum ? "・累計" : ""}）</h1>
      <table><tr><th>期間</th><th class="r">予算</th><th class="r">実績</th><th class="r">差異</th><th class="r">達成率</th></tr>
      ${rs.map((b) => { const diff = b.actual - b.plan; const rate = b.plan ? Math.round((b.actual / b.plan) * 100) : 0; return `<tr><td>${b.label}</td><td class="r">${manStr(b.plan)}</td><td class="r">${b.hasActual ? manStr(b.actual) : "—"}</td><td class="r">${b.hasActual ? (diff >= 0 ? "+" : "") + manStr(diff) : "—"}</td><td class="r">${b.hasActual && b.plan ? rate + "%" : "—"}</td></tr>`; }).join("")}</table>`;
    }).join("");
    const w = window.open("", "_blank", "width=1000,height=740"); if (!w) return;
    w.document.write(`<html><head><meta charset="utf-8"><title>予実対照_${year}</title><style>@page{size:A4 portrait;margin:14mm}body{font-family:'Hiragino Sans','Noto Sans JP',Meiryo,sans-serif;padding:20px;color:#0f172a}h1{font-size:16px;margin:6px 0 3px}table{border-collapse:collapse;width:100%;font-size:11px;margin-bottom:12px}th,td{border:1px solid #cbd5e1;padding:4px 7px}th{background:#f1f5f9}td.r,th.r{text-align:right}</style></head><body><h1 style="font-size:18px">予実対照表 — ${fiscalLabel(year)}</h1><div style="color:#64748b;font-size:11px;margin-bottom:12px">単位：万円</div>${secs}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  }

  return (
    <div className="space-y-6">
      {/* ===== 仕組みの説明（1行） ===== */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 rounded-3xl border border-line/70 bg-white px-5 py-3.5 text-sm shadow-card">
        <span className="font-black text-ink">仕組み：</span>
        <span className="text-muted"><b className="text-brand-700">予算</b> = 計画</span>
        <span className="text-muted"><b className="text-emerald-600">実績</b> = 実際</span>
        <span className="text-muted"><b className="text-ink">差異</b> = 実績 − 予算</span>
        <span className="text-muted"><b className="text-ink">達成率</b> = 実績 ÷ 予算</span>
        <span className="hidden text-slate-400 lg:inline">粗利 = 売上 − 原価 ／ 営業利益 = 粗利 − 販管費（自動）</span>
      </div>

      {/* ===== ツールバー ===== */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-3xl border border-line/70 bg-white p-3.5 shadow-card">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-bold text-ink outline-none focus:border-brand-500">
          {FY_YEARS.map((y) => <option key={y} value={y}>{fiscalLabel(y)}</option>)}
        </select>
        <span className="text-xs text-muted">会計年度 8/1〜7/31</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setShowBudget(true)} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-brand-700">＋ 予算を登録</button>
          <div className="relative">
            <button onClick={() => setMenuOpen((o) => !o)} className="flex h-9 items-center rounded-xl border border-line px-3 text-xs font-bold text-muted hover:border-brand-500 hover:text-brand-600">⚙ 設定</button>
            {menuOpen && (<>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-50 mt-1.5 w-40 rounded-2xl border border-line bg-white p-1.5 shadow-card">
                <button onClick={() => { printReport(); setMenuOpen(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-ink hover:bg-surface">印刷 / PDF（A4）</button>
                <div className="my-1 border-t border-line/70" />
                <button onClick={() => { resetSample(); setMenuOpen(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-rose-500 hover:bg-rose-50">サンプルに戻す</button>
              </div>
            </>)}
          </div>
        </div>
      </div>

      {/* ===== ヒーロー：通期 予算 vs 実績（主要3指標） ===== */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {hero.map((h) => {
          const rate = h.plan ? Math.round((h.actual / h.plan) * 100) : 0;
          const diff = h.actual - h.plan;
          return (
            <div key={h.key} className="rounded-3xl border border-line/70 bg-white p-6 shadow-card">
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-ink">{h.label}<span className="ml-1.5 text-[11px] font-normal text-slate-400">通期</span></p>
                <span className={`rounded-full px-2.5 py-1 text-xs font-black ${rate >= 100 ? "bg-emerald-50 text-emerald-600" : rate >= 80 ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600"}`}>達成 {rate}%</span>
              </div>
              <div className="mt-4 flex items-end gap-4">
                <div><p className="text-[11px] font-bold text-emerald-600">実績</p><p className="text-2xl font-black tracking-tight text-ink">{yenFull(h.actual)}</p></div>
                <div className="pb-1"><p className="text-[11px] font-bold text-brand-700">予算</p><p className="text-sm font-bold text-muted">{yenFull(h.plan)}</p></div>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface">
                <div className={`h-full rounded-full ${rate >= 100 ? "bg-emerald-500" : rate >= 80 ? "bg-brand-600" : "bg-amber-500"}`} style={{ width: `${Math.min(rate, 100)}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted">差異 <span className={`font-black ${diff >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{diff >= 0 ? "+" : ""}{yenFull(diff)}</span></p>
            </div>
          );
        })}
      </div>

      {/* ===== 予実対照 — 期間選択 ===== */}
      <Panel title="予実対照（予算 vs 実績）"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* metric */}
            <select value={metric} onChange={(e) => setMetric(e.target.value as MetricKey)}
              className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-bold text-ink outline-none focus:border-brand-500">
              {METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            {/* 単月/累計 */}
            <select value={cum ? "cum" : "single"} onChange={(e) => setCum(e.target.value === "cum")}
              className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-bold text-ink outline-none focus:border-brand-500">
              <option value="single">単月</option>
              <option value="cum">累計</option>
            </select>
          </div>
        }>
        {/* 期間タブ */}
        <div className="mb-4 inline-flex overflow-hidden rounded-xl border border-line">
          {GRAN_TABS.map((g) => (
            <button key={g.key} onClick={() => setGran(g.key)}
              className={`px-4 py-2 text-sm font-bold transition ${gran === g.key ? "bg-brand-600 text-white" : "bg-white text-muted hover:bg-surface"}`}>{g.label}</button>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          {/* 対照表 */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[440px] text-sm">
              <thead>
                <tr className="border-b-2 border-line text-xs text-muted">
                  <th className="py-2.5 pr-2 text-left font-bold">期間</th>
                  <th className="py-2.5 text-right font-bold text-brand-700">予算</th>
                  <th className="py-2.5 text-right font-bold text-emerald-600">実績</th>
                  <th className="py-2.5 text-right font-bold">差異</th>
                  <th className="py-2.5 text-right font-bold">達成率</th>
                  <th className="py-2.5 text-right font-bold">前年比</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((b, i) => {
                  const diff = b.actual - b.plan; const rate = b.plan ? Math.round((b.actual / b.plan) * 100) : 0;
                  const dgood = metricDef.good ? diff >= 0 : diff <= 0;
                  return (
                    <tr key={i} className="hover:bg-surface">
                      <td className="py-2.5 pr-2 text-left font-bold text-ink">{b.label}</td>
                      <td className="py-2.5 text-right tabular-nums text-muted">{manStr(b.plan)}</td>
                      <td className="py-2.5 text-right font-black tabular-nums text-ink">{b.hasActual ? manStr(b.actual) : <span className="text-slate-300">—</span>}</td>
                      <td className={`py-2.5 text-right font-semibold tabular-nums ${b.hasActual ? (dgood ? "text-emerald-600" : "text-rose-600") : "text-slate-300"}`}>{b.hasActual ? (diff >= 0 ? "+" : "") + manStr(diff) : "—"}</td>
                      <td className={`py-2.5 text-right font-black tabular-nums ${b.hasActual && b.plan ? rateTone(rate, metricDef.good) : "text-slate-300"}`}>{b.hasActual && b.plan ? rate + "%" : "—"}</td>
                      <td className="py-2.5 text-right tabular-nums">{b.hasActual ? <Delta cur={b.actual} base={b.prevActual} good={metricDef.good} /> : <span className="text-slate-300">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line bg-surface font-black">
                  <td className="py-2.5 pr-2">年間合計</td>
                  <td className="py-2.5 text-right tabular-nums text-muted">{manStr(totalPlan)}</td>
                  <td className="py-2.5 text-right tabular-nums text-ink">{manStr(totalActual)}</td>
                  <td className={`py-2.5 text-right tabular-nums ${(metricDef.good ? totalActual - totalPlan >= 0 : totalActual - totalPlan <= 0) ? "text-emerald-600" : "text-rose-600"}`}>{totalActual - totalPlan >= 0 ? "+" : ""}{manStr(totalActual - totalPlan)}</td>
                  <td className={`py-2.5 text-right tabular-nums ${rateTone(totalPlan ? Math.round((totalActual / totalPlan) * 100) : 0, metricDef.good)}`}>{totalPlan ? Math.round((totalActual / totalPlan) * 100) + "%" : "—"}</td>
                  <td className="py-2.5" />
                </tr>
              </tfoot>
            </table>
            <p className="mt-2 text-[10px] text-slate-400">単位：万円 ・ Q1=8〜10月 / Q2=11〜1月 / Q3=2〜4月 / Q4=5〜7月 ・ 上期=8〜1月 / 下期=2〜7月</p>
          </div>

          {/* 予算 vs 実績 の棒グラフ */}
          <div>
            <div className="flex items-end gap-2 overflow-x-auto pb-2" style={{ height: 200 }}>
              {rows.map((b, i) => (
                <div key={i} className="flex min-w-[44px] flex-1 flex-col items-center gap-1.5">
                  <div className="flex h-[160px] w-full items-end justify-center gap-1">
                    <div className="w-1/2 rounded-t bg-brand-200" style={{ height: `${(b.plan / chartMax) * 100}%` }} title={`予算 ${manStr(b.plan)}万`} />
                    <div className="w-1/2 rounded-t bg-emerald-500" style={{ height: `${(b.hasActual ? b.actual / chartMax : 0) * 100}%` }} title={`実績 ${manStr(b.actual)}万`} />
                  </div>
                  <span className="text-[11px] font-bold text-slate-500">{b.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-1 flex items-center justify-center gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-brand-200" />予算</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-emerald-500" />実績</span>
            </div>
          </div>
        </div>
      </Panel>

      {/* ===== ② 月次実績入力 ===== */}
      <Panel title={`② 月次実績入力（${FY_MONTH_LABELS[editMonth]}）`}
        action={
          <select value={editMonth} onChange={(e) => setEditMonth(Number(e.target.value))}
            className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm font-bold text-ink outline-none focus:border-brand-500">
            {FY_MONTH_LABELS.map((l, i) => <option key={i} value={i}>{l}</option>)}
          </select>
        }>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="py-2 text-left font-bold">項目</th>
                <th className="py-2 text-right font-bold">予算（万円）</th>
                <th className="py-2 text-right font-bold">実績（万円）</th>
                <th className="py-2 text-right font-bold">達成率</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {INPUT_METRICS.map((m) => {
                const plan = yearData.plan[m.key][editMonth]; const actual = yearData.actual[m.key][editMonth];
                const rate = plan ? Math.round((actual / plan) * 100) : 0;
                return (
                  <tr key={m.key}>
                    <td className="py-2.5 font-bold text-ink">{m.label}</td>
                    <td className="py-2.5 text-right text-slate-400">{manStr(plan)}</td>
                    <td className="py-2.5 text-right">
                      <input type="number" value={toMan(actual) || ""} onChange={(e) => setBook("actual", m.key, editMonth, Number(e.target.value) || 0)}
                        placeholder="0" className="w-32 rounded-lg border border-line bg-white px-2.5 py-1.5 text-right font-semibold text-ink outline-none focus:border-brand-500" />
                    </td>
                    <td className="py-2.5 text-right font-bold">{plan ? <span className={rateTone(rate, m.key === "revenue")}>{rate}%</span> : <span className="text-slate-300">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-line text-xs text-muted">
                <td className="pt-2.5 font-bold text-ink">自動計算</td>
                <td className="pt-2.5 text-right" colSpan={3}>粗利 <span className="font-black text-ink">{manStr(series.gross.actual[editMonth])}</span>万 ／ 営業利益 <span className="font-black text-ink">{manStr(series.operating.actual[editMonth])}</span>万</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      {/* ===== Modal ① 予算登録 ===== */}
      {showBudget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setShowBudget(false)} />
          <div className="relative flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="bg-gradient-to-r from-brand-600 to-brand-700 px-6 py-4 text-white">
              <div className="flex items-center justify-between">
                <div><h3 className="text-lg font-black">① 予算登録 — {fiscalLabel(year)}</h3><p className="mt-0.5 text-[11px] opacity-85">年間一括→「均等」で12ヶ月に配分、または各月を直接入力。粗利・営業利益は自動計算。</p></div>
                <button onClick={() => setShowBudget(false)} className="flex h-9 w-9 items-center justify-center rounded-lg text-white/80 hover:bg-white/15">✕</button>
              </div>
            </div>
            <div className="overflow-auto p-4">
              <table className="w-full min-w-[880px] text-xs">
                <thead>
                  <tr className="text-[10px] text-muted">
                    <th className="sticky left-0 z-10 whitespace-nowrap bg-white py-1.5 pr-2 text-left font-bold">項目</th>
                    <th className="whitespace-nowrap px-1 py-1.5 text-center font-bold text-brand-700">年間一括</th>
                    {FY_MONTH_LABELS.map((l) => <th key={l} className="px-1 py-1.5 text-right font-bold">{l}</th>)}
                    <th className="px-1.5 py-1.5 text-right font-black text-ink">合計</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {INPUT_METRICS.map((m) => (
                    <tr key={m.key}>
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-white py-1.5 pr-2 text-left text-[13px] font-bold text-ink">{m.label}</td>
                      <td className="px-1 py-1.5">
                        <div className="flex items-center gap-1">
                          <input type="number" placeholder="年間" value={annualDraft[m.key]} onChange={(e) => setAnnualDraft((d) => ({ ...d, [m.key]: e.target.value }))}
                            className="w-14 rounded-md border border-line px-1.5 py-1 text-right text-[11px] font-semibold outline-none focus:border-brand-500" />
                          <button onClick={() => distribute(m.key)} className="whitespace-nowrap rounded-md bg-brand-50 px-1.5 py-1 text-[10px] font-bold text-brand-700 hover:bg-brand-100">均等</button>
                        </div>
                      </td>
                      {FY_MONTH_LABELS.map((_, mi) => (
                        <td key={mi} className="px-0.5 py-1.5">
                          <input type="number" value={toMan(yearData.plan[m.key][mi]) || ""} onChange={(e) => setBook("plan", m.key, mi, Number(e.target.value) || 0)}
                            placeholder="0" className="w-[52px] rounded-md border border-line px-1 py-1 text-right text-[11px] font-semibold outline-none focus:border-brand-500" />
                        </td>
                      ))}
                      <td className="px-1.5 py-1.5 text-right text-[11px] font-black tabular-nums text-ink">{manStr(sum(yearData.plan[m.key]))}</td>
                    </tr>
                  ))}
                  <tr className="bg-emerald-50/50">
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-emerald-50 py-1.5 pr-2 text-left text-[13px] font-black text-emerald-700">売上総利益</td>
                    <td className="whitespace-nowrap px-1 py-1.5 text-center text-[9px] text-emerald-600">自動</td>
                    {FY_MONTH_LABELS.map((_, mi) => <td key={mi} className="px-0.5 py-1.5 text-right text-[11px] font-bold tabular-nums text-emerald-700">{manStr(series.gross.plan[mi])}</td>)}
                    <td className="px-1.5 py-1.5 text-right text-[11px] font-black tabular-nums text-emerald-700">{manStr(sum(series.gross.plan))}</td>
                  </tr>
                  <tr className="bg-violet-50/50">
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-violet-50 py-1.5 pr-2 text-left text-[13px] font-black text-violet-700">営業利益</td>
                    <td className="whitespace-nowrap px-1 py-1.5 text-center text-[9px] text-violet-600">自動</td>
                    {FY_MONTH_LABELS.map((_, mi) => <td key={mi} className={`px-0.5 py-1.5 text-right text-[11px] font-bold tabular-nums ${series.operating.plan[mi] < 0 ? "text-red-600" : "text-violet-700"}`}>{manStr(series.operating.plan[mi])}</td>)}
                    <td className={`px-1.5 py-1.5 text-right text-[11px] font-black tabular-nums ${sum(series.operating.plan) < 0 ? "text-red-600" : "text-violet-700"}`}>{manStr(sum(series.operating.plan))}</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-[10px] text-slate-400">単位：万円 ・ 粗利・営業利益は自動計算</p>
              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {[
                  { l: "年間売上高", v: yenFull(sum(series.revenue.plan)), tone: "bg-brand-50 text-brand-700" },
                  { l: "年間粗利", v: yenFull(sum(series.gross.plan)), tone: "bg-emerald-50 text-emerald-700" },
                  { l: "年間営業利益", v: yenFull(sum(series.operating.plan)), tone: "bg-violet-50 text-violet-700" },
                  { l: "営業利益率", v: (sum(series.revenue.plan) ? ((sum(series.operating.plan) / sum(series.revenue.plan)) * 100).toFixed(1) : "0") + "%", tone: "bg-amber-50 text-amber-700" },
                ].map((x) => (<div key={x.l} className={`rounded-xl px-3.5 py-2.5 ${x.tone}`}><p className="text-[10px] font-bold opacity-80">{x.l}</p><p className="mt-0.5 text-base font-black">{x.v}</p></div>))}
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-line px-5 py-3">
              <span className="text-[11px] text-slate-400">単位：万円 ・ 変更は自動保存</span>
              <button onClick={() => setShowBudget(false)} className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white hover:bg-brand-700">完了</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
