"use client";

// レポート — 売上 (bl_sales_v1) と 支出 (bl_expenses_v1) を集計。
// 会計年度 8/1〜7/31。月次 / 四半期 / 年度比較（複数年度・前年比）を表示。

import { useEffect, useMemo, useState } from "react";
import Panel from "@/components/ui/Panel";
import { STORAGE_KEY as SALES_KEY, sampleSales, yen, type Sale } from "@/lib/sales";
import { STORAGE_KEY as EXP_KEY, sampleExpenses, type Expense, type ExpenseStore } from "@/lib/expenses";
import { fiscalYearOf, fiscalLabel, fiscalMonths, FY_MONTH_LABELS, QUARTER_LABELS } from "@/lib/fiscal";

type ViewMode = "month" | "quarter" | "year";

function openPrint(title: string, bodyHtml: string) {
  const w = window.open("", "_blank", "width=1000,height=720");
  if (!w) return;
  w.document.write(`<html><head><meta charset="utf-8"><title>${title}</title><style>
    body{font-family:'Hiragino Sans','Noto Sans JP',Meiryo,sans-serif;padding:24px;color:#0f172a}
    h1{font-size:18px;margin:0 0 4px}.sub{color:#64748b;font-size:11px;margin-bottom:16px}
    table{border-collapse:collapse;width:100%;font-size:12px;margin-bottom:18px}
    th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}th{background:#f1f5f9}
    td.r,th.r{text-align:right}.tot{font-weight:800;background:#f8fafc}
    .red{color:#dc2626;font-weight:700}.green{color:#059669;font-weight:700}
  </style></head><body>${bodyHtml}</body></html>`);
  w.document.close(); w.focus();
  setTimeout(() => w.print(), 300);
}

// 1期間（月次 / 四半期 / 年度）の数値。
type PeriodRow = { rev: number; col: number; exp: number };
const emptyRow = (): PeriodRow => ({ rev: 0, col: 0, exp: 0 });

export default function ReportsManager() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [fy, setFy] = useState<number | null>(null);
  const [mode, setMode] = useState<ViewMode>("month");

  useEffect(() => {
    let s: Sale[] = [], e: Expense[] = [];
    try { const raw = window.localStorage.getItem(SALES_KEY); s = raw ? (JSON.parse(raw) as Sale[]) : sampleSales(); } catch { s = sampleSales(); }
    try { const raw = window.localStorage.getItem(EXP_KEY); e = raw ? (JSON.parse(raw) as ExpenseStore).records : sampleExpenses().records; } catch { e = sampleExpenses().records; }
    setSales(s); setExpenses(e);
    setFy(fiscalYearOf(new Date().toISOString().slice(0, 10)));
  }, []);

  // データのある会計年度。
  const fys = useMemo(() => {
    const set = new Set<number>();
    for (const s of sales) { set.add(fiscalYearOf(s.saleDate)); for (const p of s.payments) set.add(fiscalYearOf(p.date)); }
    for (const e of expenses) set.add(fiscalYearOf(e.date));
    return Array.from(set).sort((a, b) => a - b);
  }, [sales, expenses]);

  // "YYYY-MM" ごとの集計。
  const byMonth = useMemo(() => {
    const map = new Map<string, PeriodRow>();
    const get = (ym: string) => { let r = map.get(ym); if (!r) { r = emptyRow(); map.set(ym, r); } return r; };
    for (const s of sales) {
      if (!s.isForecast) get(s.saleDate.slice(0, 7)).rev += s.amount; // 予定売上は実売上に含めない
      for (const p of s.payments) get(p.date.slice(0, 7)).col += p.amount;
    }
    for (const e of expenses) get(e.date.slice(0, 7)).exp += e.amount;
    return map;
  }, [sales, expenses]);

  // 1会計年度の合計。
  const fyTotal = (y: number): PeriodRow => {
    const t = emptyRow();
    for (const ym of fiscalMonths(y)) {
      const r = byMonth.get(ym);
      if (r) { t.rev += r.rev; t.col += r.col; t.exp += r.exp; }
    }
    return t;
  };

  if (fy === null) return <div className="rounded-2xl border border-line bg-white p-12 text-center text-sm text-muted">読み込み中…</div>;

  const months = fiscalMonths(fy);
  const monthRows = months.map((ym) => byMonth.get(ym) ?? emptyRow());
  const total = fyTotal(fy);
  const profit = total.rev - total.exp;
  const margin = total.rev ? (profit / total.rev) * 100 : 0;

  // 四半期：3か月ごとに集計。
  const quarterRows = [0, 1, 2, 3].map((qi) => {
    const t = emptyRow();
    for (let i = qi * 3; i < qi * 3 + 3; i++) { t.rev += monthRows[i].rev; t.col += monthRows[i].col; t.exp += monthRows[i].exp; }
    return t;
  });

  // 年度比較 ＋ 前年比。
  const yearRows = fys.map((y) => {
    const t = fyTotal(y);
    return { fy: y, ...t, profit: t.rev - t.exp };
  });
  const maxYearRev = Math.max(1, ...yearRows.map((r) => r.rev));

  const chartMax = Math.max(1, ...monthRows.map((r) => r.rev));

  function printReport() {
    const growth = (i: number) => {
      if (i === 0) return "—";
      const prev = yearRows[i - 1].rev;
      if (!prev) return "—";
      const g = ((yearRows[i].rev - prev) / prev) * 100;
      return `<span class="${g >= 0 ? "green" : "red"}">${g >= 0 ? "+" : ""}${g.toFixed(1)}%</span>`;
    };
    const body = `<h1>経営レポート — ${fiscalLabel(fy!)}</h1><div class="sub">会計年度: 8/1〜7/31</div>
      <table><tr><th>指標</th><th class="r">金額</th></tr>
      <tr><td>売上高</td><td class="r">${yen(total.rev)}</td></tr>
      <tr><td>回収額（入金）</td><td class="r">${yen(total.col)}</td></tr>
      <tr><td>支出</td><td class="r">${yen(total.exp)}</td></tr>
      <tr class="tot"><td>差引損益</td><td class="r ${profit < 0 ? "red" : ""}">${yen(profit)}</td></tr></table>
      <h1 style="font-size:14px">月次推移</h1>
      <table><tr><th>月</th><th class="r">売上高</th><th class="r">回収額</th><th class="r">支出</th><th class="r">損益</th></tr>
      ${months.map((ym, i) => { const r = monthRows[i]; const p = r.rev - r.exp; return `<tr><td>${ym}</td><td class="r">${yen(r.rev)}</td><td class="r">${yen(r.col)}</td><td class="r">${yen(r.exp)}</td><td class="r ${p < 0 ? "red" : ""}">${yen(p)}</td></tr>`; }).join("")}</table>
      <h1 style="font-size:14px">四半期</h1>
      <table><tr><th>四半期</th><th class="r">売上高</th><th class="r">支出</th><th class="r">損益</th></tr>
      ${quarterRows.map((r, i) => `<tr><td>${QUARTER_LABELS[i]}</td><td class="r">${yen(r.rev)}</td><td class="r">${yen(r.exp)}</td><td class="r ${r.rev - r.exp < 0 ? "red" : ""}">${yen(r.rev - r.exp)}</td></tr>`).join("")}</table>
      <h1 style="font-size:14px">年度比較</h1>
      <table><tr><th>年度</th><th class="r">売上高</th><th class="r">前年比</th><th class="r">支出</th><th class="r">損益</th></tr>
      ${yearRows.map((r, i) => `<tr><td>${fiscalLabel(r.fy)}</td><td class="r">${yen(r.rev)}</td><td class="r">${growth(i)}</td><td class="r">${yen(r.exp)}</td><td class="r ${r.profit < 0 ? "red" : ""}">${yen(r.profit)}</td></tr>`).join("")}</table>`;
    openPrint(`経営レポート_${fy}年度`, body);
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white p-3 shadow-card">
        <select value={fy} onChange={(e) => setFy(Number(e.target.value))}
          className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-bold text-ink outline-none focus:border-brand-500">
          {(fys.length ? fys : [fy]).map((y) => <option key={y} value={y}>{fiscalLabel(y)}</option>)}
        </select>
        <div className="flex overflow-hidden rounded-xl border border-line">
          {([["month", "月次"], ["quarter", "四半期"], ["year", "年度比較"]] as [ViewMode, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)}
              className={`px-3 py-2 text-sm font-bold transition ${mode === k ? "bg-brand-600 text-white" : "bg-white text-muted hover:bg-surface"}`}>{l}</button>
          ))}
        </div>
        <span className="text-[11px] text-slate-400">会計年度：8/1〜7/31 ・ Q1=8〜10月 / Q2=11〜1月 / Q3=2〜4月 / Q4=5〜7月</span>
        <button onClick={printReport} className="ml-auto rounded-xl border border-line px-3 py-2 text-xs font-bold text-muted hover:border-brand-500 hover:text-brand-600">印刷 / PDF</button>
      </div>

      {/* 選択年度のKPI */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { l: "売上高", v: yen(total.rev), c: "text-ink" },
          { l: "回収額（入金）", v: yen(total.col), c: "text-emerald-600" },
          { l: "支出", v: yen(total.exp), c: "text-rose-600" },
          { l: "差引損益", v: yen(profit), c: profit >= 0 ? "text-ink" : "text-red-600" },
          { l: "利益率", v: margin.toFixed(1) + "%", c: margin >= 0 ? "text-brand-600" : "text-red-600" },
        ].map((x) => (
          <div key={x.l} className="rounded-2xl border border-line bg-white p-5 shadow-card">
            <p className="text-sm font-bold text-muted">{x.l}</p>
            <p className={`mt-2 text-2xl font-black tracking-tight ${x.c}`}>{x.v}</p>
            <p className="mt-1 text-[10px] text-slate-400">{fiscalLabel(fy)}</p>
          </div>
        ))}
      </div>

      {/* ===== 月次 ===== */}
      {mode === "month" && (
        <>
          <Panel title={`売上高 月次推移 — ${fiscalLabel(fy)}`}>
            <div className="flex items-end gap-1.5 overflow-x-auto pb-2" style={{ height: 170 }}>
              {monthRows.map((r, i) => (
                <div key={i} className="flex min-w-[32px] flex-1 flex-col items-center gap-1">
                  <div className="flex h-[130px] w-full items-end justify-center">
                    <div className="w-3/4 rounded-t bg-brand-600" style={{ height: `${(r.rev / chartMax) * 100}%` }} title={yen(r.rev)} />
                  </div>
                  <span className="text-[10px] text-slate-400">{FY_MONTH_LABELS[i]}</span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="月次テーブル（売上・回収・支出・損益）">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="py-2.5 font-bold">月</th>
                    <th className="py-2.5 text-right font-bold">売上高</th>
                    <th className="py-2.5 text-right font-bold">回収額</th>
                    <th className="py-2.5 text-right font-bold">支出</th>
                    <th className="py-2.5 text-right font-bold">差引損益</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {months.map((ym, i) => {
                    const r = monthRows[i]; const p = r.rev - r.exp;
                    return (
                      <tr key={ym} className="hover:bg-surface">
                        <td className="py-2.5 font-bold text-ink">{ym}</td>
                        <td className="py-2.5 text-right font-semibold">{r.rev ? yen(r.rev) : <span className="text-slate-300">—</span>}</td>
                        <td className="py-2.5 text-right text-emerald-600">{r.col ? yen(r.col) : <span className="text-slate-300">—</span>}</td>
                        <td className="py-2.5 text-right text-rose-600">{r.exp ? yen(r.exp) : <span className="text-slate-300">—</span>}</td>
                        <td className={`py-2.5 text-right font-black ${r.rev || r.exp ? (p >= 0 ? "text-ink" : "text-red-600") : "text-slate-300"}`}>{r.rev || r.exp ? yen(p) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line bg-surface font-black">
                    <td className="py-2.5">合計</td>
                    <td className="py-2.5 text-right">{yen(total.rev)}</td>
                    <td className="py-2.5 text-right text-emerald-600">{yen(total.col)}</td>
                    <td className="py-2.5 text-right text-rose-600">{yen(total.exp)}</td>
                    <td className={`py-2.5 text-right ${profit >= 0 ? "text-ink" : "text-red-600"}`}>{yen(profit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Panel>
        </>
      )}

      {/* ===== 四半期 ===== */}
      {mode === "quarter" && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {quarterRows.map((r, i) => {
              const p = r.rev - r.exp;
              const share = total.rev ? Math.round((r.rev / total.rev) * 100) : 0;
              return (
                <div key={i} className="rounded-2xl border border-line bg-white p-5 shadow-card">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-black text-ink">{QUARTER_LABELS[i]}</p>
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-black text-brand-700">構成比 {share}%</span>
                  </div>
                  <p className="mt-2 text-xl font-black text-ink">{yen(r.rev)}</p>
                  <div className="mt-2 space-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-muted">回収額</span><span className="font-bold text-emerald-600">{yen(r.col)}</span></div>
                    <div className="flex justify-between"><span className="text-muted">支出</span><span className="font-bold text-rose-600">{yen(r.exp)}</span></div>
                    <div className="flex justify-between border-t border-line pt-1"><span className="font-bold text-ink">損益</span><span className={`font-black ${p >= 0 ? "text-ink" : "text-red-600"}`}>{yen(p)}</span></div>
                  </div>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface">
                    <div className="h-full rounded-full bg-brand-600" style={{ width: `${share}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-center text-[11px] text-slate-400">※ 会計年度 8/1〜7/31 に合わせた四半期です（Q1=8〜10月）。</p>
        </>
      )}

      {/* ===== 年度比較 ===== */}
      {mode === "year" && (
        <>
          <Panel title="年度別 売上高（成長推移）">
            <div className="space-y-3">
              {yearRows.map((r, i) => {
                const prev = i > 0 ? yearRows[i - 1].rev : 0;
                const g = prev ? ((r.rev - prev) / prev) * 100 : null;
                return (
                  <div key={r.fy}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-bold text-ink">{fiscalLabel(r.fy)}</span>
                      <span className="text-muted">
                        <span className="font-black text-ink">{yen(r.rev)}</span>
                        {g !== null && (
                          <span className={`ml-2 font-black ${g >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {g >= 0 ? "▲ +" : "▼ "}{g.toFixed(1)}% <span className="font-normal text-slate-400">前年比</span>
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-5 w-full overflow-hidden rounded-lg bg-surface">
                      <div className={`h-full rounded-lg ${r.fy === fy ? "bg-brand-600" : "bg-brand-200"}`} style={{ width: `${(r.rev / maxYearRev) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
          <Panel title="年度比較テーブル">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="py-2.5 font-bold">年度</th>
                    <th className="py-2.5 text-right font-bold">売上高</th>
                    <th className="py-2.5 text-right font-bold">前年比</th>
                    <th className="py-2.5 text-right font-bold">回収額</th>
                    <th className="py-2.5 text-right font-bold">支出</th>
                    <th className="py-2.5 text-right font-bold">損益</th>
                    <th className="py-2.5 text-right font-bold">利益率</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {yearRows.map((r, i) => {
                    const prev = i > 0 ? yearRows[i - 1].rev : 0;
                    const g = prev ? ((r.rev - prev) / prev) * 100 : null;
                    const m = r.rev ? (r.profit / r.rev) * 100 : 0;
                    return (
                      <tr key={r.fy} className={`hover:bg-surface ${r.fy === fy ? "bg-brand-50/40" : ""}`}>
                        <td className="py-2.5 font-bold text-ink">{fiscalLabel(r.fy)}{r.fy === fy && <span className="ml-1.5 rounded-full bg-brand-600 px-1.5 py-0.5 text-[9px] font-black text-white">表示中</span>}</td>
                        <td className="py-2.5 text-right font-black">{yen(r.rev)}</td>
                        <td className={`py-2.5 text-right font-black ${g === null ? "text-slate-300" : g >= 0 ? "text-emerald-600" : "text-red-600"}`}>{g === null ? "—" : `${g >= 0 ? "+" : ""}${g.toFixed(1)}%`}</td>
                        <td className="py-2.5 text-right text-emerald-600">{yen(r.col)}</td>
                        <td className="py-2.5 text-right text-rose-600">{yen(r.exp)}</td>
                        <td className={`py-2.5 text-right font-black ${r.profit >= 0 ? "text-ink" : "text-red-600"}`}>{yen(r.profit)}</td>
                        <td className="py-2.5 text-right font-bold">{m.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {yearRows.length < 2 && <p className="mt-3 text-[11px] text-slate-400">※ データが1年度分のみです。複数年度のサンプルを読み込むには、売上・回収ページで「サンプルに戻す」を押してください。</p>}
          </Panel>
        </>
      )}
    </div>
  );
}
