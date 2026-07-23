"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Panel from "@/components/ui/Panel";
import Icon from "@/components/Icon";
import {
  STORAGE_KEY, STATUS_LABEL, STATUS_TONE,
  sampleSales, statusOf, paidOf, remainOf, balanceOf, discrepancies, daysLate,
  overdueReport, customerSummaries, revenueByMonths, collectionsByMonths, isFc, yen,
  type Sale, type SaleStatus,
} from "@/lib/sales";
import {
  fiscalYearOf, fiscalMonthIndex, fiscalMonths, fiscalLabel, FY_MONTH_LABELS,
  compareSeries, deltaPct, sumRange,
} from "@/lib/fiscal";

type Filter = "ALL" | SaleStatus | "FORECAST";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "すべて" }, { key: "OPEN", label: "未回収" }, { key: "OVERDUE", label: "延滞" },
  { key: "PARTIAL", label: "一部入金" }, { key: "OVERPAID", label: "過入金" }, { key: "PAID", label: "回収済" },
  { key: "FORECAST", label: "予定" },
];

const emptyDraft = { customer: "", title: "", amount: "", saleDate: "", dueDate: "", isForecast: false };

function openPrint(title: string, bodyHtml: string) {
  const w = window.open("", "_blank", "width=1000,height=720");
  if (!w) return;
  w.document.write(`<html><head><meta charset="utf-8"><title>${title}</title><style>
    @page{size:A4 landscape;margin:12mm}
    body{font-family:'Hiragino Sans','Noto Sans JP',Meiryo,sans-serif;padding:24px;color:#0f172a}
    h1{font-size:18px;margin:0 0 4px} .sub{color:#64748b;font-size:11px;margin-bottom:16px}
    table{border-collapse:collapse;width:100%;font-size:11px;margin-bottom:18px}
    th,td{border:1px solid #cbd5e1;padding:5px 7px;text-align:left}
    th{background:#f1f5f9} td.r,th.r{text-align:right}
    .tot{font-weight:800;background:#f8fafc}
    .red{color:#dc2626;font-weight:700}.sky{color:#0284c7;font-weight:700}
  </style></head><body>${bodyHtml}</body></html>`);
  w.document.close(); w.focus();
  setTimeout(() => w.print(), 300);
}

function Delta({ cur, base }: { cur: number; base: number }) {
  const d = deltaPct(cur, base);
  if (d === null) return <span className="text-slate-300">—</span>;
  return (
    <span className={`font-bold tabular-nums ${d >= 0 ? "text-emerald-600" : "text-red-600"}`}>
      {d >= 0 ? "▲+" : "▼"}{d.toFixed(1)}%
    </span>
  );
}

export default function SalesManager() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [today, setToday] = useState("");
  const [fy, setFy] = useState(2025);
  const [mi, setMi] = useState(11); // 現在の会計月インデックス（0=8月）
  const [cum, setCum] = useState(false);
  const [view, setView] = useState<"list" | "customer">("list");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [payFor, setPayFor] = useState<Sale | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [detail, setDetail] = useState<string | null>(null);
  const ready = useRef(false);

  useEffect(() => {
    const now = new Date();
    const iso = now.toISOString().slice(0, 10);
    setToday(iso);
    setFy(fiscalYearOf(iso));
    setMi(fiscalMonthIndex(iso));
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      setSales(raw ? (JSON.parse(raw) as Sale[]) : sampleSales());
    } catch { setSales(sampleSales()); }
    ready.current = true;
  }, []);
  useEffect(() => {
    if (!ready.current) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sales)); } catch { /* ignore */ }
  }, [sales]);

  const customers = useMemo(() => Array.from(new Set(sales.map((s) => s.customer))).sort(), [sales]);
  const thisMonth = today.slice(0, 7);

  // ===== 集計カード（予定売上は実額から除外）=====
  const stats = useMemo(() => {
    let monthSales = 0, unpaid = 0, overdue = 0, overdueCnt = 0, monthCollected = 0, overpaid = 0, overpaidCnt = 0, fcTotal = 0;
    for (const s of sales) {
      if (isFc(s)) { fcTotal += s.amount; continue; }
      if (s.saleDate.slice(0, 7) === thisMonth) monthSales += s.amount;
      const remain = remainOf(s);
      unpaid += remain;
      if (statusOf(s, today) === "OVERDUE") { overdue += remain; overdueCnt += 1; }
      const over = Math.max(0, -balanceOf(s));
      if (over > 0) { overpaid += over; overpaidCnt += 1; }
      for (const p of s.payments) if (p.date.slice(0, 7) === thisMonth) monthCollected += p.amount;
    }
    return { monthSales, unpaid, overdue, overdueCnt, monthCollected, overpaid, overpaidCnt, fcTotal };
  }, [sales, today, thisMonth]);

  // ===== 会計年度別の配列（比較・グラフ用）=====
  const months = useMemo(() => fiscalMonths(fy), [fy]);
  const prevMonths = useMemo(() => fiscalMonths(fy - 1), [fy]);
  const actualRev = useMemo(() => revenueByMonths(sales, months, false), [sales, months]);
  const fcRev = useMemo(() => revenueByMonths(sales, months, true), [sales, months]);
  const prevRev = useMemo(() => revenueByMonths(sales, prevMonths, false), [sales, prevMonths]);
  const colArr = useMemo(() => collectionsByMonths(sales, months), [sales, months]);
  const prevCol = useMemo(() => collectionsByMonths(sales, prevMonths), [sales, prevMonths]);

  const combRev = actualRev.map((v, i) => v + fcRev[i]); // 予定込み
  const outlook = sumRange(actualRev, 0, 11) + sumRange(fcRev, 0, 11); // 年度見通し

  // 比較表：3行。
  const compareRows = [
    { label: "売上高（実績）", c: compareSeries(actualRev, prevRev, mi), strong: true },
    { label: "売上高（予定込み）", c: compareSeries(combRev, prevRev, mi), strong: false },
    { label: "回収額（入金）", c: compareSeries(colArr, prevCol, mi), strong: false },
  ];

  const lateRows = useMemo(() => overdueReport(sales, today), [sales, today]);
  const diffRows = useMemo(() => discrepancies(sales), [sales]);
  const custRows = useMemo(() => customerSummaries(sales, today), [sales, today]);

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return sales
      .filter((s) => {
        if (filter === "ALL") return true;
        if (filter === "FORECAST") return isFc(s);
        return !isFc(s) && statusOf(s, today) === filter;
      })
      .filter((s) => !kw || `${s.customer} ${s.title}`.toLowerCase().includes(kw))
      .sort((a, b) => b.saleDate.localeCompare(a.saleDate));
  }, [sales, filter, q, today]);

  const detailData = useMemo(() => {
    if (!detail) return null;
    const rows = sales.filter((s) => s.customer === detail && !isFc(s)).sort((a, b) => b.saleDate.localeCompare(a.saleDate));
    const fcRows = sales.filter((s) => s.customer === detail && isFc(s)).sort((a, b) => a.saleDate.localeCompare(b.saleDate));
    const payments = rows
      .flatMap((s) => s.payments.map((p) => ({ ...p, title: s.title })))
      .sort((a, b) => b.date.localeCompare(a.date));
    const billed = rows.reduce((t, s) => t + s.amount, 0);
    const paid = rows.reduce((t, s) => t + paidOf(s), 0);
    const overdue = rows.reduce((t, s) => t + (statusOf(s, today) === "OVERDUE" ? remainOf(s) : 0), 0);
    const overpaid = rows.reduce((t, s) => t + Math.max(0, -balanceOf(s)), 0);
    return { rows, fcRows, payments, billed, paid, remain: rows.reduce((t, s) => t + remainOf(s), 0), overdue, overpaid };
  }, [detail, sales, today]);

  // ===== 操作 =====
  function addSale() {
    if (!draft.customer || !draft.amount || !draft.saleDate || !draft.dueDate) { alert("顧客名・金額・計上日・入金期日は必須です。"); return; }
    setSales((prev) => [{
      id: "s" + Date.now(), customer: draft.customer.trim(), title: draft.title.trim() || (draft.isForecast ? "予定売上" : "売上"),
      amount: Number(draft.amount) || 0, saleDate: draft.saleDate, dueDate: draft.dueDate, payments: [],
      isForecast: draft.isForecast || undefined,
    }, ...prev]);
    setDraft(emptyDraft); setShowNew(false);
  }
  function confirmForecast(id: string) {
    if (!confirm("この予定売上を「実績」に確定しますか？（売掛金として管理されます）")) return;
    setSales((prev) => prev.map((s) => s.id === id ? { ...s, isForecast: undefined } : s));
  }
  function addPayment() {
    if (!payFor) return;
    const amt = Number(payAmount) || 0;
    if (amt <= 0) { alert("入金額を入力してください。"); return; }
    setSales((prev) => prev.map((s) => s.id === payFor.id ? { ...s, payments: [...s.payments, { date: today, amount: amt }] } : s));
    setPayFor(null); setPayAmount("");
  }
  function adjustOverpay(s: Sale) {
    const over = -balanceOf(s);
    if (over <= 0) return;
    if (!confirm(`${s.customer}\n過入金 ${yen(over)} を返金・調整として記録しますか？`)) return;
    setSales((prev) => prev.map((x) => x.id === s.id ? { ...x, payments: [...x.payments, { date: today, amount: -over }] } : x));
  }
  function removeSale(id: string) {
    if (!confirm("この売上を削除しますか？")) return;
    setSales((prev) => prev.filter((s) => s.id !== id));
  }
  function resetSample() {
    if (!confirm("サンプルデータに戻します。よろしいですか？")) return;
    setSales(sampleSales());
  }

  function exportCsv() {
    const head = ["計上日", "顧客", "件名", "区分", "売上金額", "入金済", "残高", "入金期日", "状態"];
    const rows = list.map((s) => [s.saleDate, s.customer, s.title, isFc(s) ? "予定" : "実績", s.amount, paidOf(s), remainOf(s), s.dueDate, isFc(s) ? "予定" : STATUS_LABEL[statusOf(s, today)]]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "sales.csv"; a.click(); URL.revokeObjectURL(a.href);
  }

  function printList() {
    const pct = (cur: number, base: number) => { const d = deltaPct(cur, base); return d === null ? "—" : `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`; };
    const body = `<h1>売上・回収サマリー — ${fiscalLabel(fy)}</h1><div class="sub">対象月: ${FY_MONTH_LABELS[mi]} ・ 出力日 ${today}</div>
      <table><tr><th>指標</th><th class="r">当月</th><th class="r">前月比</th><th class="r">前年同月比</th><th class="r">四半期累計</th><th class="r">前四半期比</th><th class="r">半期累計</th><th class="r">年度累計</th><th class="r">前年累計比</th></tr>
      ${compareRows.map((r) => `<tr><td>${r.label}</td><td class="r">${yen(r.c.month)}</td><td class="r">${pct(r.c.month, r.c.prevMonth)}</td><td class="r">${pct(r.c.month, r.c.lastYearMonth)}</td><td class="r">${yen(r.c.qtd)}</td><td class="r">${pct(r.c.qtd, r.c.prevQtd)}</td><td class="r">${yen(r.c.htd)}</td><td class="r">${yen(r.c.ytd)}</td><td class="r">${pct(r.c.ytd, r.c.lastYearYtd)}</td></tr>`).join("")}</table>
      <h1 style="font-size:14px">売上・売掛金一覧</h1>
      <table><tr><th>計上日</th><th>顧客</th><th>件名</th><th>区分</th><th class="r">売上金額</th><th class="r">入金済</th><th class="r">残高</th><th>入金期日</th><th>状態</th></tr>
      ${list.map((s) => { const fc = isFc(s); const st = fc ? null : statusOf(s, today); return `<tr><td>${s.saleDate}</td><td>${s.customer}</td><td>${s.title}</td><td class="${fc ? "sky" : ""}">${fc ? "予定" : "実績"}</td><td class="r">${yen(s.amount)}</td><td class="r">${yen(paidOf(s))}</td><td class="r">${yen(remainOf(s))}</td><td${st === "OVERDUE" ? ' class="red"' : ""}>${s.dueDate}</td><td${st === "OVERDUE" ? ' class="red"' : ""}>${fc ? "予定" : STATUS_LABEL[st!]}</td></tr>`; }).join("")}</table>`;
    openPrint("売上・回収レポート", body);
  }

  function printCustomer() {
    if (!detail || !detailData) return;
    const d = detailData;
    const body = `<h1>お取引明細書 — ${detail}</h1><div class="sub">出力日: ${today}</div>
      <table><tr><th>請求合計（総額）</th><th>入金済合計</th><th>未回収残高</th><th>うち延滞</th><th>過入金</th></tr>
      <tr><td class="r">${yen(d.billed)}</td><td class="r">${yen(d.paid)}</td><td class="r">${yen(d.remain)}</td><td class="r ${d.overdue ? "red" : ""}">${yen(d.overdue)}</td><td class="r">${yen(d.overpaid)}</td></tr></table>
      <h1 style="font-size:14px">請求・支払状況</h1>
      <table><tr><th>計上日</th><th>件名</th><th class="r">金額</th><th class="r">入金済</th><th class="r">残高</th><th>期日</th><th>状態</th></tr>
      ${d.rows.map((s) => { const st = statusOf(s, today); return `<tr><td>${s.saleDate}</td><td>${s.title}</td><td class="r">${yen(s.amount)}</td><td class="r">${yen(paidOf(s))}</td><td class="r">${yen(remainOf(s))}</td><td>${s.dueDate}</td><td${st === "OVERDUE" ? ' class="red"' : ""}>${STATUS_LABEL[st]}${st === "OVERDUE" ? `（${daysLate(s, today)}日遅延）` : ""}</td></tr>`; }).join("")}</table>
      <h1 style="font-size:14px">入金履歴</h1>
      <table><tr><th>入金日</th><th>対象</th><th class="r">入金額</th></tr>
      ${d.payments.length ? d.payments.map((p) => `<tr><td>${p.date}</td><td>${p.title}</td><td class="r">${yen(p.amount)}</td></tr>`).join("") : `<tr><td colspan="3">入金履歴なし</td></tr>`}</table>
      ${d.fcRows.length ? `<h1 style="font-size:14px">予定売上</h1><table><tr><th>予定日</th><th>件名</th><th class="r">金額</th></tr>${d.fcRows.map((s) => `<tr><td>${s.saleDate}</td><td>${s.title}</td><td class="r sky">${yen(s.amount)}</td></tr>`).join("")}</table>` : ""}`;
    openPrint(`お取引明細書_${detail}`, body);
  }

  const chartActual = cum ? actualRev.map((_, i) => sumRange(actualRev, 0, i)) : actualRev;
  const chartFc = cum ? fcRev.map((_, i) => sumRange(fcRev, 0, i)) : fcRev;
  const chartMax = Math.max(1, ...chartActual.map((v, i) => v + chartFc[i]));

  if (!today) return <div className="rounded-2xl border border-line bg-white p-12 text-center text-sm text-muted">読み込み中…</div>;

  return (
    <div className="space-y-6">
      {/* ===== フロー図 ===== */}
      <div className="flex flex-wrap items-stretch gap-2 rounded-2xl border border-line bg-white p-3 shadow-card">
        {[
          { n: "①", t: "売上登録", d: "実績または予定", tone: "bg-brand-50 text-brand-700" },
          { n: "②", t: "入金記録", d: "入金で売掛金を消し込み", tone: "bg-emerald-50 text-emerald-700" },
          { n: "③", t: "回収・分析", d: "延滞・過不足・累計・前期比", tone: "bg-violet-50 text-violet-700" },
        ].map((s, i) => (
          <div key={s.n} className="flex flex-1 items-center gap-2">
            <div className={`flex-1 rounded-xl px-3 py-2 ${s.tone}`}>
              <div className="text-sm font-black">{s.n} {s.t}</div>
              <div className="text-[11px] opacity-80">{s.d}</div>
            </div>
            {i < 2 && <span className="text-slate-300">→</span>}
          </div>
        ))}
      </div>

      {/* ===== 集計カード6枚 ===== */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "今月売上", vi: "当月の売上高", value: yen(stats.monthSales), cls: "text-ink" },
          { label: "予定売上", vi: "今後の見込み", value: yen(stats.fcTotal), cls: "text-sky-600" },
          { label: "未回収残高", vi: "回収予定額", value: yen(stats.unpaid), cls: "text-amber-600" },
          { label: "延滞金額", vi: `期限超過 — ${stats.overdueCnt}件`, value: yen(stats.overdue), cls: "text-red-600" },
          { label: "過入金", vi: `払い過ぎ — ${stats.overpaidCnt}件`, value: yen(stats.overpaid), cls: "text-violet-600" },
          { label: "今月回収額", vi: "当月の入金", value: yen(stats.monthCollected), cls: "text-emerald-600" },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-line bg-white p-4 shadow-card">
            <p className="text-xs font-bold text-muted">{c.label}</p>
            <p className="mt-0.5 text-[10px] text-slate-400">{c.vi}</p>
            <p className={`mt-1.5 text-lg font-black tracking-tight ${c.cls}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* ===== 売上サマリー（累計・前期比を1画面で表示）===== */}
      <Panel icon="chart" title={`売上サマリー（${fiscalLabel(fy)} ・ 対象月 ${FY_MONTH_LABELS[mi]}）`}
        action={
          <div className="flex items-center gap-2">
            <select value={mi} onChange={(e) => setMi(Number(e.target.value))}
              className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-bold outline-none focus:border-brand-500">
              {FY_MONTH_LABELS.map((l, i) => <option key={i} value={i}>対象月：{l}</option>)}
            </select>
            <button onClick={printList} className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold text-muted hover:border-brand-500 hover:text-brand-600">印刷 / PDF（A4）</button>
          </div>
        }>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b-2 border-line text-[11px] text-muted">
                <th className="py-2 pr-2 text-left font-bold">指標</th>
                <th className="py-2 text-right font-bold">当月</th>
                <th className="py-2 text-right font-bold">前月比</th>
                <th className="py-2 text-right font-bold">前年同月比</th>
                <th className="border-l border-line py-2 text-right font-bold">四半期累計</th>
                <th className="py-2 text-right font-bold">前四半期比</th>
                <th className="border-l border-line py-2 text-right font-bold">半期累計</th>
                <th className="py-2 text-right font-bold">前半期比</th>
                <th className="border-l border-line py-2 text-right font-bold">年度累計</th>
                <th className="py-2 text-right font-bold">前年累計比</th>
              </tr>
            </thead>
            <tbody>
              {compareRows.map((r) => (
                <tr key={r.label} className={`border-b border-line/60 ${r.strong ? "bg-surface" : ""}`}>
                  <td className={`py-2.5 pr-2 text-left font-bold ${r.strong ? "text-ink" : "text-muted"}`}>{r.label}</td>
                  <td className="py-2.5 text-right font-black tabular-nums text-ink">{yen(r.c.month)}</td>
                  <td className="py-2.5 text-right"><Delta cur={r.c.month} base={r.c.prevMonth} /></td>
                  <td className="py-2.5 text-right"><Delta cur={r.c.month} base={r.c.lastYearMonth} /></td>
                  <td className="border-l border-line py-2.5 text-right font-bold tabular-nums">{yen(r.c.qtd)}</td>
                  <td className="py-2.5 text-right"><Delta cur={r.c.qtd} base={r.c.prevQtd} /></td>
                  <td className="border-l border-line py-2.5 text-right font-bold tabular-nums">{yen(r.c.htd)}</td>
                  <td className="py-2.5 text-right"><Delta cur={r.c.htd} base={r.c.prevHtd} /></td>
                  <td className="border-l border-line py-2.5 text-right font-black tabular-nums text-ink">{yen(r.c.ytd)}</td>
                  <td className="py-2.5 text-right"><Delta cur={r.c.ytd} base={r.c.lastYearYtd} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-sky-50 px-4 py-2.5 text-xs">
          <span className="flex items-center gap-1.5 font-black text-sky-700"><Icon name="telescope" size={14} />年度見通し（実績＋予定）</span>
          <span className="font-black text-sky-700">{yen(outlook)}</span>
          <span className="text-sky-600">= 実績 {yen(sumRange(actualRev, 0, 11))} ＋ 予定 {yen(sumRange(fcRev, 0, 11))}</span>
        </div>
        <p className="mt-2 text-[10px] text-slate-400">四半期：Q1=8〜10月 / Q2=11〜1月 / Q3=2〜4月 / Q4=5〜7月 ・ 半期：上期=8〜1月 / 下期=2〜7月</p>
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ===== 会計年度グラフ：実績 + 予定 ===== */}
        <Panel title={`売上 月次推移（実績＋予定）${cum ? " — 累計" : ""}`} className="lg:col-span-2"
          action={
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-bold text-muted">
              <input type="checkbox" checked={cum} onChange={(e) => setCum(e.target.checked)} className="accent-brand-600" />
              累計表示
            </label>
          }>
          <div className="flex items-end gap-1.5 overflow-x-auto pb-2" style={{ height: 170 }}>
            {FY_MONTH_LABELS.map((label, m) => (
              <div key={m} className={`flex min-w-[32px] flex-1 flex-col items-center gap-1 ${m === mi ? "rounded-lg bg-brand-50/60" : ""}`}>
                <div className="flex h-[130px] w-full flex-col items-center justify-end">
                  {chartFc[m] > 0 && <div className="w-3/4 rounded-t border border-dashed border-sky-400 bg-sky-200/70" style={{ height: `${(chartFc[m] / chartMax) * 100}%` }} title={`予定 ${yen(chartFc[m])}`} />}
                  <div className={`w-3/4 bg-brand-600 ${chartFc[m] > 0 ? "" : "rounded-t"}`} style={{ height: `${(chartActual[m] / chartMax) * 100}%` }} title={`実績 ${yen(chartActual[m])}`} />
                </div>
                <span className={`text-[10px] ${m === mi ? "font-black text-brand-700" : "text-slate-400"}`}>{label}</span>
              </div>
            ))}
          </div>
          <div className="mt-1 flex items-center justify-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-brand-600" />実績</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded border border-dashed border-sky-400 bg-sky-200/70" />予定</span>
            <span>年間合計（実績）<b className="text-ink">{yen(sumRange(actualRev, 0, 11))}</b></span>
          </div>
        </Panel>

        <Panel icon="warning" title="延滞レポート（支払遅延企業）">
          {lateRows.length === 0 ? (
            <p className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-4 py-6 text-center text-sm font-bold text-emerald-600"><Icon name="check" size={16} />延滞なし</p>
          ) : (
            <ul className="space-y-3">
              {lateRows.map((r) => (
                <li key={r.customer}>
                  <button onClick={() => setDetail(r.customer)} className="w-full rounded-xl border border-red-100 bg-red-50/50 px-3.5 py-3 text-left transition hover:border-red-300">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-bold text-ink">{r.customer}</p>
                      <span className="flex-none rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white">{r.maxDays}日遅延</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-muted">{r.count}件の未払い ・ クリックで明細</span>
                      <span className="font-black text-red-600">{yen(r.total)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ===== 入金差異リスト ===== */}
      {diffRows.length > 0 && (
        <Panel icon="search" title="入金差異リスト（過不足のある取引）"
          action={<span className="text-[11px] text-slate-400">入金があるのに金額が一致しない取引 — {diffRows.length}件</span>}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2.5 font-bold">顧客・件名</th>
                  <th className="py-2.5 text-right font-bold">請求額</th>
                  <th className="py-2.5 text-right font-bold">入金額</th>
                  <th className="py-2.5 text-right font-bold">差額</th>
                  <th className="py-2.5 text-center font-bold">区分</th>
                  <th className="py-2.5 text-right font-bold">対応</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {diffRows.map(({ sale: s, diff }) => (
                  <tr key={s.id} className="hover:bg-surface">
                    <td className="py-3">
                      <button onClick={() => setDetail(s.customer)} className="font-bold text-ink hover:text-brand-600 hover:underline">{s.customer}</button>
                      <p className="text-[11px] text-muted">{s.title}（期日 {s.dueDate}）</p>
                    </td>
                    <td className="py-3 text-right font-bold text-ink">{yen(s.amount)}</td>
                    <td className="py-3 text-right text-emerald-600">{yen(paidOf(s))}</td>
                    <td className={`py-3 text-right font-black ${diff > 0 ? "text-red-600" : "text-violet-600"}`}>
                      {diff > 0 ? `不足 ${yen(diff)}` : `過入金 ${yen(-diff)}`}
                    </td>
                    <td className="py-3 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${diff > 0 ? "bg-red-50 text-red-600" : "bg-violet-50 text-violet-600"}`}>
                        {diff > 0 ? "不足" : "過入金"}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      {diff > 0 ? (
                        <button onClick={() => { setPayFor(s); setPayAmount(String(diff)); }}
                          className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700">不足分を入金</button>
                      ) : (
                        <button onClick={() => adjustOverpay(s)}
                          className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-violet-700">返金・調整</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* ===== メイン一覧 ===== */}
      <Panel
        title={view === "list" ? "売上・売掛金一覧" : "顧客別 回収状況"}
        action={
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-line">
              <button onClick={() => setView("list")} className={`px-3 py-1.5 text-xs font-bold ${view === "list" ? "bg-brand-600 text-white" : "bg-white text-muted hover:bg-surface"}`}>取引一覧</button>
              <button onClick={() => setView("customer")} className={`px-3 py-1.5 text-xs font-bold ${view === "customer" ? "bg-brand-600 text-white" : "bg-white text-muted hover:bg-surface"}`}>顧客別</button>
            </div>
            <button onClick={() => { setDraft({ ...emptyDraft, saleDate: today, isForecast: false }); setShowNew(true); }}
              className="rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-bold text-white shadow-sm hover:bg-brand-700">＋ 売上を登録</button>
            <button onClick={() => { setDraft({ ...emptyDraft, saleDate: today, isForecast: true }); setShowNew(true); }}
              className="rounded-xl bg-sky-600 px-3.5 py-2 text-sm font-bold text-white shadow-sm hover:bg-sky-700">＋ 予定売上</button>
          </div>
        }>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {view === "list" && (
            <div className="flex overflow-hidden rounded-xl border border-line">
              {FILTERS.map((f) => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className={`px-2.5 py-1.5 text-xs font-bold transition ${filter === f.key ? "bg-brand-600 text-white" : "bg-white text-muted hover:bg-surface"}`}>
                  {f.label}
                </button>
              ))}
            </div>
          )}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="顧客名・件名で検索…"
            className="w-52 rounded-xl border border-line bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-500" />
          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={exportCsv} className="rounded-xl border border-line px-3 py-1.5 text-xs font-bold text-muted hover:border-brand-500 hover:text-brand-600">CSV出力</button>
            <button onClick={printList} className="rounded-xl border border-line px-3 py-1.5 text-xs font-bold text-muted hover:border-brand-500 hover:text-brand-600">印刷 / PDF</button>
            <button onClick={resetSample} className="rounded-xl border border-line px-3 py-1.5 text-xs font-bold text-muted hover:border-rose-400 hover:text-rose-500">サンプルに戻す</button>
          </div>
        </div>

        {view === "list" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2.5 font-bold">計上日</th>
                  <th className="py-2.5 font-bold">顧客・件名</th>
                  <th className="py-2.5 text-right font-bold">売上金額</th>
                  <th className="py-2.5 text-right font-bold">入金済</th>
                  <th className="py-2.5 text-right font-bold">残高</th>
                  <th className="py-2.5 font-bold">入金期日</th>
                  <th className="py-2.5 text-center font-bold">状態</th>
                  <th className="py-2.5 text-right font-bold">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-muted">該当データがありません。</td></tr>}
                {list.map((s) => {
                  const fc = isFc(s);
                  const st = fc ? null : statusOf(s, today);
                  const remain = remainOf(s);
                  return (
                    <tr key={s.id} className={`hover:bg-surface ${fc ? "bg-sky-50/40" : ""}`}>
                      <td className="py-3 text-muted">{s.saleDate}</td>
                      <td className="py-3">
                        <button onClick={() => setDetail(s.customer)} className="font-bold text-ink hover:text-brand-600 hover:underline">{s.customer}</button>
                        <p className="text-[11px] text-muted">{s.title}</p>
                      </td>
                      <td className={`py-3 text-right font-bold ${fc ? "text-sky-600" : "text-ink"}`}>{yen(s.amount)}</td>
                      <td className="py-3 text-right text-emerald-600">{paidOf(s) ? yen(paidOf(s)) : "—"}</td>
                      <td className={`py-3 text-right font-black ${fc ? "text-slate-300" : balanceOf(s) < 0 ? "text-violet-600" : remain ? "text-ink" : "text-slate-300"}`}>
                        {fc ? "—" : balanceOf(s) < 0 ? `+${yen(-balanceOf(s))}` : remain ? yen(remain) : "—"}
                      </td>
                      <td className="py-3">
                        <span className={st === "OVERDUE" ? "font-bold text-red-600" : "text-muted"}>{s.dueDate}</span>
                        {st === "OVERDUE" && <span className="ml-1 text-[10px] font-black text-red-500">+{daysLate(s, today)}日</span>}
                      </td>
                      <td className="py-3 text-center">
                        {fc
                          ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-700">予定</span>
                          : <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_TONE[st!]}`}>{STATUS_LABEL[st!]}</span>}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          {fc && (
                            <button onClick={() => confirmForecast(s.id)}
                              className="rounded-lg bg-sky-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-sky-700">実績に確定</button>
                          )}
                          {!fc && remain > 0 && (
                            <button onClick={() => { setPayFor(s); setPayAmount(String(remain)); }}
                              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700">入金</button>
                          )}
                          {!fc && st === "OVERPAID" && (
                            <button onClick={() => adjustOverpay(s)}
                              className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-violet-700">調整</button>
                          )}
                          <button onClick={() => removeSale(s.id)} className="rounded-lg border border-line px-2 py-1 text-xs text-muted hover:border-rose-400 hover:text-rose-500">削除</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2.5 font-bold">顧客</th>
                  <th className="py-2.5 text-right font-bold">総売上（総額）</th>
                  <th className="py-2.5 text-right font-bold">入金済（総額）</th>
                  <th className="py-2.5 text-right font-bold">未回収残高</th>
                  <th className="py-2.5 text-right font-bold">うち延滞</th>
                  <th className="py-2.5 text-right font-bold">過入金</th>
                  <th className="py-2.5 font-bold">最終入金日</th>
                  <th className="py-2.5 text-right font-bold">明細</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {custRows.filter((r) => !q.trim() || r.customer.toLowerCase().includes(q.trim().toLowerCase())).map((r) => (
                  <tr key={r.customer} className="cursor-pointer hover:bg-surface" onClick={() => setDetail(r.customer)}>
                    <td className="py-3">
                      <p className="font-bold text-ink">{r.customer}</p>
                      <p className="text-[11px] text-muted">{r.salesCount}件の取引</p>
                    </td>
                    <td className="py-3 text-right font-bold text-ink">{yen(r.billed)}</td>
                    <td className="py-3 text-right text-emerald-600">{yen(r.paid)}</td>
                    <td className={`py-3 text-right font-black ${r.remain ? "text-amber-600" : "text-slate-300"}`}>{yen(r.remain)}</td>
                    <td className={`py-3 text-right font-black ${r.overdue ? "text-red-600" : "text-slate-300"}`}>{r.overdue ? yen(r.overdue) : "—"}</td>
                    <td className={`py-3 text-right font-black ${r.overpaid ? "text-violet-600" : "text-slate-300"}`}>{r.overpaid ? yen(r.overpaid) : "—"}</td>
                    <td className="py-3 text-muted">{r.lastPayment ?? "—"}</td>
                    <td className="py-3 text-right"><span className="rounded-lg border border-line px-2.5 py-1 text-xs font-bold text-brand-600">詳細 →</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* ===== モーダル：顧客明細 ===== */}
      {detail && detailData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setDetail(null)} />
          <div className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h3 className="text-base font-black text-ink">{detail}</h3>
                <p className="text-[11px] text-muted">お取引明細 — {detailData.rows.length}件{detailData.fcRows.length ? ` ・ 予定 ${detailData.fcRows.length}件` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={printCustomer} className="rounded-xl border border-line px-3 py-1.5 text-xs font-bold text-muted hover:border-brand-500 hover:text-brand-600">明細を印刷 / PDF</button>
                <button onClick={() => setDetail(null)} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface" aria-label="閉じる"><Icon name="close" size={16} /></button>
              </div>
            </div>

            <div className="space-y-5 overflow-auto p-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  { l: "請求合計（総額）", v: yen(detailData.billed), c: "text-ink" },
                  { l: "入金済合計", v: yen(detailData.paid), c: "text-emerald-600" },
                  { l: "未回収残高", v: yen(detailData.remain), c: detailData.remain ? "text-amber-600" : "text-slate-400" },
                  { l: "うち延滞", v: yen(detailData.overdue), c: detailData.overdue ? "text-red-600" : "text-slate-400" },
                  { l: "過入金", v: yen(detailData.overpaid), c: detailData.overpaid ? "text-violet-600" : "text-slate-400" },
                ].map((x) => (
                  <div key={x.l} className="rounded-xl bg-surface px-3.5 py-3">
                    <p className="text-[11px] font-bold text-muted">{x.l}</p>
                    <p className={`mt-0.5 text-lg font-black ${x.c}`}>{x.v}</p>
                  </div>
                ))}
              </div>

              <div>
                <h4 className="mb-2 text-sm font-black text-ink">請求・支払状況</h4>
                <div className="overflow-x-auto rounded-xl border border-line">
                  <table className="w-full min-w-[600px] text-sm">
                    <thead>
                      <tr className="border-b border-line bg-surface text-left text-xs text-muted">
                        <th className="px-3 py-2 font-bold">計上日</th>
                        <th className="px-3 py-2 font-bold">件名</th>
                        <th className="px-3 py-2 text-right font-bold">金額</th>
                        <th className="px-3 py-2 text-right font-bold">残高</th>
                        <th className="px-3 py-2 font-bold">期日</th>
                        <th className="px-3 py-2 text-center font-bold">状態</th>
                        <th className="px-3 py-2 text-right font-bold">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {detailData.rows.map((s) => {
                        const st = statusOf(s, today);
                        const remain = remainOf(s);
                        const bal = balanceOf(s);
                        return (
                          <tr key={s.id}>
                            <td className="px-3 py-2.5 text-muted">{s.saleDate}</td>
                            <td className="px-3 py-2.5 font-semibold text-ink">{s.title}</td>
                            <td className="px-3 py-2.5 text-right font-bold">{yen(s.amount)}</td>
                            <td className={`px-3 py-2.5 text-right font-black ${bal < 0 ? "text-violet-600" : remain ? "text-ink" : "text-slate-300"}`}>
                              {bal < 0 ? `+${yen(-bal)}` : remain ? yen(remain) : "—"}
                            </td>
                            <td className={`px-3 py-2.5 ${st === "OVERDUE" ? "font-bold text-red-600" : "text-muted"}`}>{s.dueDate}</td>
                            <td className="px-3 py-2.5 text-center"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[st]}`}>{STATUS_LABEL[st]}</span></td>
                            <td className="px-3 py-2.5 text-right">
                              {remain > 0 && (
                                <button onClick={() => { setPayFor(s); setPayAmount(String(remain)); }}
                                  className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700">入金</button>
                              )}
                              {st === "OVERPAID" && (
                                <button onClick={() => adjustOverpay(s)}
                                  className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-violet-700">調整</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* この顧客の予定売上 */}
              {detailData.fcRows.length > 0 && (
                <div>
                  <h4 className="mb-2 flex items-center gap-1.5 text-sm font-black text-sky-700"><Icon name="telescope" size={14} />予定売上（見込み）</h4>
                  <div className="overflow-x-auto rounded-xl border border-sky-200">
                    <table className="w-full min-w-[460px] text-sm">
                      <tbody className="divide-y divide-line">
                        {detailData.fcRows.map((s) => (
                          <tr key={s.id} className="bg-sky-50/40">
                            <td className="px-3 py-2.5 text-muted">{s.saleDate}</td>
                            <td className="px-3 py-2.5 font-semibold text-ink">{s.title}</td>
                            <td className="px-3 py-2.5 text-right font-black text-sky-600">{yen(s.amount)}</td>
                            <td className="px-3 py-2.5 text-right">
                              <button onClick={() => confirmForecast(s.id)}
                                className="rounded-lg bg-sky-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-sky-700">実績に確定</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div>
                <h4 className="mb-2 text-sm font-black text-ink">入金履歴</h4>
                {detailData.payments.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-xs text-muted">入金履歴はまだありません。</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-line">
                    <table className="w-full min-w-[460px] text-sm">
                      <thead>
                        <tr className="border-b border-line bg-surface text-left text-xs text-muted">
                          <th className="px-3 py-2 font-bold">入金日</th>
                          <th className="px-3 py-2 font-bold">対象</th>
                          <th className="px-3 py-2 text-right font-bold">入金額</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {detailData.payments.map((p, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2.5 font-semibold text-ink">{p.date}</td>
                            <td className="px-3 py-2.5 text-muted">{p.title}</td>
                            <td className={`px-3 py-2.5 text-right font-bold ${p.amount < 0 ? "text-violet-600" : "text-emerald-600"}`}>{yen(p.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== モーダル：① 売上登録（実績/予定）===== */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setShowNew(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="mb-1 text-base font-black text-ink">① 売上を登録</h3>
            <p className="mb-4 text-[11px] text-muted">実績 = 確定した売上（売掛金化）・ 予定 = 翌月以降の見込み。</p>
            <div className="space-y-3">
              {/* 実績/予定 switch */}
              <div className="flex overflow-hidden rounded-xl border border-line">
                <button onClick={() => setDraft((d) => ({ ...d, isForecast: false }))}
                  className={`flex-1 py-2 text-sm font-bold ${!draft.isForecast ? "bg-brand-600 text-white" : "bg-white text-muted"}`}>実績（確定売上）</button>
                <button onClick={() => setDraft((d) => ({ ...d, isForecast: true }))}
                  className={`flex-1 py-2 text-sm font-bold ${draft.isForecast ? "bg-sky-600 text-white" : "bg-white text-muted"}`}>予定（見込み）</button>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-muted">顧客名 *</label>
                <input list="customer-list" value={draft.customer} onChange={(e) => setDraft((d) => ({ ...d, customer: e.target.value }))}
                  placeholder="株式会社〇〇" className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
                <datalist id="customer-list">{customers.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-muted">件名</label>
                <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  placeholder="人材紹介（2名）" className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-muted">金額（円） *</label>
                <input type="number" inputMode="numeric" value={draft.amount} onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                  placeholder="1800000" className="w-full rounded-xl border border-line px-3 py-2 text-right text-sm font-semibold outline-none focus:border-brand-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">{draft.isForecast ? "計上予定日 *" : "計上日 *"}</label>
                  <input type="date" value={draft.saleDate} onChange={(e) => setDraft((d) => ({ ...d, saleDate: e.target.value }))}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">入金期日 *</label>
                  <input type="date" value={draft.dueDate} onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
              </div>
              {draft.isForecast && (
                <p className="flex items-start gap-1.5 rounded-xl bg-sky-50 px-3 py-2 text-[11px] text-sky-700">
                  <Icon name="bulb" size={13} className="mt-0.5 shrink-0" />予定売上は売掛金・延滞に含まれません。受注が確定したら「実績に確定」を押して実売上に変換してください。
                </p>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowNew(false)} className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-muted hover:bg-surface">キャンセル</button>
              <button onClick={addSale} className={`rounded-xl px-5 py-2 text-sm font-bold text-white ${draft.isForecast ? "bg-sky-600 hover:bg-sky-700" : "bg-brand-600 hover:bg-brand-700"}`}>登録する</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal: ② 入金記録 ===== */}
      {payFor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setPayFor(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="mb-1 text-base font-black text-ink">② 入金を記録</h3>
            <p className="mb-4 text-xs text-muted">{payFor.customer} — {payFor.title}</p>
            <div className="mb-3 rounded-xl bg-surface px-4 py-3 text-sm">
              <div className="flex justify-between"><span className="text-muted">売上金額</span><span className="font-bold">{yen(payFor.amount)}</span></div>
              <div className="flex justify-between"><span className="text-muted">入金済</span><span className="font-bold text-emerald-600">{yen(paidOf(payFor))}</span></div>
              <div className="mt-1.5 flex justify-between border-t border-line pt-1.5"><span className="font-bold text-ink">残高</span><span className="font-black text-ink">{yen(remainOf(payFor))}</span></div>
            </div>
            <label className="mb-1 block text-xs font-bold text-muted">入金額（円）— {today}</label>
            <input type="number" inputMode="numeric" value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
              className="w-full rounded-xl border border-line px-3 py-2 text-right text-sm font-semibold outline-none focus:border-brand-500" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setPayFor(null)} className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-muted hover:bg-surface">キャンセル</button>
              <button onClick={addPayment} className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700">入金を記録</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
