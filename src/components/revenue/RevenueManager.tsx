"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Panel from "@/components/ui/Panel";
import {
  STORAGE_KEY, DEFAULT_SETTINGS, STATUS_LABEL, STATUS_TONE,
  sampleStore, statusOf, taxIn, grossOf, paidOf, remainOf, balanceOf, daysLate,
  aggregate, expandRecurring, readBudgetSeries, endOfNextMonth, uid, yen,
  type RevStore, type RevLine, type Payment, type CollectStatus,
} from "@/lib/revenue";
import { fiscalMonths, fiscalLabel, fiscalYearOf, fiscalMonthIndex, FY_MONTH_LABELS } from "@/lib/fiscal";

const nowIso = () => new Date().toISOString();
const fmtDT = (iso: string) => { try { return iso.replace("T", " ").slice(0, 16); } catch { return iso; } };

function openPrint(title: string, body: string) {
  const w = window.open("", "_blank", "width=1050,height=740");
  if (!w) return;
  w.document.write(`<html><head><meta charset="utf-8"><title>${title}</title><style>
    @page{size:A4 portrait;margin:12mm}
    body{font-family:'Hiragino Sans','Noto Sans JP',Meiryo,sans-serif;padding:18px;color:#0f172a}
    h1{font-size:16px;margin:0 0 3px}.sub{color:#64748b;font-size:11px;margin-bottom:12px}
    table{border-collapse:collapse;width:100%;font-size:10.5px;margin-bottom:14px}
    th,td{border:1px solid #cbd5e1;padding:3px 6px;text-align:left}th{background:#f1f5f9}
    td.r,th.r{text-align:right}.tot{font-weight:800;background:#f8fafc}.red{color:#dc2626;font-weight:700}
  </style></head><body>${body}</body></html>`);
  w.document.close(); w.focus();
  setTimeout(() => w.print(), 300);
}

const emptyDraft = { customer: "", owner: "", category: "", headcount: "", amount: "", cost: "", invoiceNo: "", dueDate: "", recurring: true, taxMode: "ex" as "ex" | "in" };

export default function RevenueManager() {
  const [store, setStore] = useState<RevStore>({ lines: [], settings: DEFAULT_SETTINGS });
  const [today, setToday] = useState("");
  const [fy, setFy] = useState(2025);
  const [mi, setMi] = useState(0);
  const [taxView, setTaxView] = useState<"ex" | "in">("ex");
  const [ownerF, setOwnerF] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [payFor, setPayFor] = useState<RevLine | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [custOpen, setCustOpen] = useState(false);
  const [histFor, setHistFor] = useState<RevLine | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [customerNames, setCustomerNames] = useState<string[]>([]);
  const ready = useRef(false);

  const S = store.settings;
  const op = S.operator || "管理者";

  useEffect(() => {
    const iso = new Date().toISOString().slice(0, 10);
    setToday(iso); setFy(fiscalYearOf(iso)); setMi(fiscalMonthIndex(iso));
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      setStore(raw ? (JSON.parse(raw) as RevStore) : sampleStore());
    } catch { setStore(sampleStore()); }
    try {
      const raw = window.localStorage.getItem("bl_customers_v1");
      if (raw) setCustomerNames((JSON.parse(raw) as { name: string }[]).map((c) => c.name));
    } catch { /* ignore */ }
    ready.current = true;
  }, []);
  useEffect(() => {
    if (!ready.current) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* ignore */ }
  }, [store]);

  const months = useMemo(() => fiscalMonths(fy), [fy]);
  const ym = months[mi];
  const budget = useMemo(() => readBudgetSeries(fy), [fy, store]);
  const fyLines = useMemo(() => store.lines.filter((l) => months.includes(l.ym)), [store.lines, months]);

  // ===== KPI năm =====
  const kpi = useMemo(() => {
    let confEx = 0, seenEx = 0, confIn = 0, unpaidIn = 0, overdueIn = 0, overdueCnt = 0;
    for (const l of fyLines) {
      seenEx += l.amount;
      if (l.status === "confirmed") { confEx += l.amount; confIn += taxIn(l); const r = remainOf(l); unpaidIn += r; if (statusOf(l, today) === "OVERDUE") { overdueIn += r; overdueCnt++; } }
    }
    const collectRate = confIn ? Math.round(((confIn - unpaidIn) / confIn) * 100) : 0;
    return { confEx, seenEx, confIn, unpaidIn, overdueIn, overdueCnt, collectRate };
  }, [fyLines, today]);

  const monthAggs = useMemo(() => months.map((m) => aggregate(store.lines.filter((l) => l.ym === m))), [store.lines, months]);
  const stripMax = Math.max(1, ...monthAggs.map((a) => a.amountEx), ...budget);
  const cur = monthAggs[mi];
  const curRate = budget[mi] ? Math.round((cur.amountEx / budget[mi]) * 100) : 0;

  const rows = useMemo(() => store.lines
    .filter((l) => l.ym === ym)
    .filter((l) => !ownerF || l.owner === ownerF)
    .sort((a, b) => a.owner.localeCompare(b.owner) || b.amount - a.amount),
  [store.lines, ym, ownerF]);
  const rowAgg = aggregate(rows);

  const names = useMemo(() => Array.from(new Set([...customerNames, ...store.lines.map((l) => l.customer)])).sort(), [customerNames, store.lines]);

  const detailData = useMemo(() => {
    if (!detail) return null;
    const ls = fyLines.filter((l) => l.customer === detail).sort((a, b) => a.ym.localeCompare(b.ym));
    const billed = ls.filter((l) => l.status === "confirmed").reduce((t, l) => t + taxIn(l), 0);
    const paid = ls.reduce((t, l) => t + paidOf(l), 0);
    const remain = ls.filter((l) => l.status === "confirmed").reduce((t, l) => t + remainOf(l), 0);
    const pays = ls.flatMap((l) => l.payments.map((p) => ({ ...p, invoiceNo: l.invoiceNo, ym: l.ym }))).sort((a, b) => b.date.localeCompare(a.date));
    return { ls, billed, paid, remain, pays };
  }, [detail, fyLines]);

  // ===== Danh sách công ty CÒN NỢ (未回収) — gộp theo công ty =====
  const owingList = useMemo(() => {
    const map = new Map<string, { customer: string; remain: number; count: number; overdue: number; oldestDue: string }>();
    for (const l of fyLines) {
      if (l.status !== "confirmed") continue;
      const r = remainOf(l); if (r <= 0) continue;
      const row = map.get(l.customer) ?? { customer: l.customer, remain: 0, count: 0, overdue: 0, oldestDue: l.dueDate };
      row.remain += r; row.count += 1;
      if (statusOf(l, today) === "OVERDUE") row.overdue += r;
      if (l.dueDate < row.oldestDue) row.oldestDue = l.dueDate;
      map.set(l.customer, row);
    }
    return Array.from(map.values()).sort((a, b) => b.remain - a.remain);
  }, [fyLines, today]);

  // ===== helpers =====
  const disp = (l: RevLine) => (taxView === "in" ? taxIn(l) : l.amount);
  function shift(d: number) { let f = fy, m = mi + d; if (m > 11) { f++; m = 0; } else if (m < 0) { f--; m = 11; } setFy(f); setMi(m); }
  function patch(id: string, p: Partial<RevLine>, action?: string) {
    setStore((prev) => ({ ...prev, lines: prev.lines.map((l) => l.id === id ? { ...l, ...p, updatedAt: nowIso(), updatedBy: op, history: action ? [...l.history, { at: nowIso(), by: op, action }] : l.history } : l) }));
  }
  function toggleStatus(l: RevLine) { patch(l.id, { status: l.status === "confirmed" ? "forecast" : "confirmed" }, l.status === "confirmed" ? "予定に戻す" : "確定"); }
  function confirmMonth() { if (!confirm(`${ym} の全明細を「確定」にしますか？`)) return; setStore((prev) => ({ ...prev, lines: prev.lines.map((l) => l.ym === ym && l.status !== "confirmed" ? { ...l, status: "confirmed", updatedAt: nowIso(), updatedBy: op, history: [...l.history, { at: nowIso(), by: op, action: "確定（一括）" }] } : l) })); }
  function addPayment() {
    if (!payFor) return; const amt = Number(payAmount) || 0; if (amt <= 0) { alert("入金額を入力してください。"); return; }
    const pay: Payment = { date: today, amount: amt, by: op, note: payNote.trim() || undefined };
    patch(payFor.id, { payments: [...payFor.payments, pay] }, `入金 ${yen(amt)}${payNote.trim() ? "（" + payNote.trim() + "）" : ""}`);
    setPayFor(null); setPayAmount(""); setPayNote("");
  }
  function adjustOverpay(l: RevLine) { const over = -balanceOf(l); if (over <= 0) return; if (!confirm(`過入金 ${yen(over)} を返金・調整として記録しますか？`)) return; patch(l.id, { payments: [...l.payments, { date: today, amount: -over, by: op }] }, `返金・調整 ${yen(over)}`); }
  function removeLine(l: RevLine) {
    if (!confirm("この明細を削除しますか？")) return;
    if (l.recurring && l.seriesId) { const all = confirm("定期明細です。\n［OK］今月以降の同系列をすべて削除\n［キャンセル］今月のみ削除"); if (all) { setStore((prev) => ({ ...prev, lines: prev.lines.filter((x) => !(x.seriesId === l.seriesId && x.ym >= l.ym)) })); return; } }
    setStore((prev) => ({ ...prev, lines: prev.lines.filter((x) => x.id !== l.id) }));
  }
  function addLine() {
    const rate = S.taxRate;
    const raw = Number(draft.amount) || 0;
    const amountEx = draft.taxMode === "in" ? Math.round(raw / (1 + rate / 100)) : raw;
    if (!draft.customer.trim() || !amountEx) { alert("会社名・金額は必須です。"); return; }
    const common = {
      customer: draft.customer.trim(), owner: draft.owner || S.owners[0], category: draft.category || S.categories[0],
      headcount: Number(draft.headcount) || 0, amount: amountEx, taxRate: rate, cost: Number(draft.cost) || 0,
      recurring: draft.recurring, status: "forecast" as const, payments: [] as Payment[],
      createdAt: nowIso(), createdBy: op, updatedAt: nowIso(), updatedBy: op, history: [{ at: nowIso(), by: op, action: "登録" }],
    };
    if (draft.recurring) {
      setStore((prev) => ({ ...prev, lines: [...prev.lines, ...expandRecurring(common, ym, "INV")] }));
    } else {
      setStore((prev) => ({ ...prev, lines: [...prev.lines, { ...common, id: uid(), ym, dueDate: draft.dueDate || endOfNextMonth(ym), invoiceNo: draft.invoiceNo.trim() || `INV-${ym.replace("-", "")}-S` }] }));
    }
    setDraft(emptyDraft); setShowNew(false);
  }
  function resetSample() { if (!confirm("サンプルデータに戻します。よろしいですか？")) return; setStore(sampleStore()); }
  function exportCsv() {
    const head = ["年月", "請求書番号", "会社名", "担当", "区分", "人数", "売上(税抜)", "請求額(税込)", "入金済", "残高", "期日", "種別", "状態", "登録者", "最終更新"];
    const data = rows.map((r) => [r.ym, r.invoiceNo, r.customer, r.owner, r.category, r.headcount, r.amount, taxIn(r), paidOf(r), remainOf(r), r.dueDate, r.recurring ? "定期" : "不定期", STATUS_LABEL[statusOf(r, today)], r.createdBy, fmtDT(r.updatedAt)]);
    const csv = [head, ...data].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `uriage_${ym}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }
  function printMonth() {
    const body = `<h1>売上・回収明細 — ${ym.replace("-", "年")}月（${fiscalLabel(fy)}）</h1>
      <div class="sub">予算 ${yen(budget[mi])} ／ 確定(税抜) ${yen(cur.confirmedEx)} ／ 見込(税抜) ${yen(cur.amountEx)} ／ 請求総額(税込) ${yen(cur.amountIn)}</div>
      <table><tr><th>請求書番号</th><th>会社名</th><th>担当</th><th>区分</th><th class="r">売上(税抜)</th><th class="r">税込</th><th class="r">残高</th><th>状態</th></tr>
      ${rows.map((r) => { const st = statusOf(r, today); return `<tr><td>${r.invoiceNo}</td><td>${r.customer}</td><td>${r.owner}</td><td>${r.category}</td><td class="r">${yen(r.amount)}</td><td class="r">${yen(taxIn(r))}</td><td class="r ${st === "OVERDUE" ? "red" : ""}">${yen(remainOf(r))}</td><td>${STATUS_LABEL[st]}</td></tr>`; }).join("")}
      <tr class="tot"><td colspan="4">合計（${rows.length}件）</td><td class="r">${yen(rowAgg.amountEx)}</td><td class="r">${yen(rowAgg.amountIn)}</td><td class="r"></td><td></td></tr></table>`;
    openPrint(`売上回収_${ym}`, body);
  }

  if (!today) return <div className="rounded-2xl border border-line bg-white p-12 text-center text-sm text-muted">読み込み中…</div>;

  const liveEx = (() => { const raw = Number(draft.amount) || 0; return draft.taxMode === "in" ? Math.round(raw / (1 + S.taxRate / 100)) : raw; })();
  const liveIn = Math.round(liveEx * (1 + S.taxRate / 100));

  return (
    <div className="space-y-5">
      {/* ===== 4 KPI hero — sạch, to ===== */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <p className="text-sm font-bold text-muted">年度売上（確定・税抜）</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-ink">{yen(kpi.confEx)}</p>
          <p className="mt-1 text-[11px] text-slate-400">見込含む {yen(kpi.seenEx)}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-card">
          <p className="text-sm font-bold text-amber-700">未回収残高（税込）</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-amber-600">{yen(kpi.unpaidIn)}</p>
          <p className="mt-1 text-[11px] text-amber-600/70">請求済みで未入金の合計</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50/40 p-5 shadow-card">
          <p className="text-sm font-bold text-red-700">延滞（税込）</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-red-600">{yen(kpi.overdueIn)}</p>
          <p className="mt-1 text-[11px] text-red-600/70">{kpi.overdueCnt}件・期日超過</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <p className="text-sm font-bold text-muted">回収率</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-emerald-600">{kpi.collectRate}%</p>
          <p className="mt-1 text-[11px] text-slate-400">確定請求のうち入金済み割合</p>
        </div>
      </div>

      {/* ===== Thanh điều hướng tháng (gọn) ===== */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-white p-3 shadow-card">
        <button onClick={() => shift(-1)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-muted hover:border-brand-500 hover:text-brand-600">◀</button>
        <div className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-black text-white">{ym.replace("-", "年")}月</div>
        <button onClick={() => shift(1)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-muted hover:border-brand-500 hover:text-brand-600">▶</button>
        <span className="ml-1 hidden text-xs font-bold text-muted sm:inline">{fiscalLabel(fy)}</span>

        {/* summary chip tháng */}
        <div className="ml-2 hidden items-center gap-3 rounded-xl bg-surface px-3 py-1.5 text-xs md:flex">
          <span className="text-muted">予算 <b className="text-ink">{yen(budget[mi])}</b></span>
          <span className="text-muted">確定 <b className="text-emerald-600">{yen(cur.confirmedEx)}</b></span>
          <span className="text-muted">見込 <b className="text-ink">{yen(cur.amountEx)}</b></span>
          <span className={`font-black ${curRate >= 100 ? "text-emerald-600" : curRate >= 80 ? "text-amber-600" : "text-rose-600"}`}>{budget[mi] ? curRate + "%" : "—"}</span>
        </div>

        {/* 税抜/税込 */}
        <div className="ml-auto flex overflow-hidden rounded-xl border border-line">
          <button onClick={() => setTaxView("ex")} className={`px-3 py-2 text-xs font-bold ${taxView === "ex" ? "bg-brand-600 text-white" : "bg-white text-muted hover:bg-surface"}`}>税抜</button>
          <button onClick={() => setTaxView("in")} className={`px-3 py-2 text-xs font-bold ${taxView === "in" ? "bg-brand-600 text-white" : "bg-white text-muted hover:bg-surface"}`}>税込</button>
        </div>
        <button onClick={() => setShowSettings(true)} className="flex h-9 items-center gap-1 rounded-xl border border-line px-3 text-xs font-bold text-muted hover:border-brand-500 hover:text-brand-600">⚙ 設定</button>
      </div>

      {/* ===== Dải 12 tháng ===== */}
      <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
        <div className="flex items-end gap-1.5 overflow-x-auto pb-1" style={{ height: 120 }}>
          {months.map((m, i) => {
            const a = monthAggs[i]; const b = budget[i];
            return (
              <button key={m} onClick={() => setMi(i)} className={`flex min-w-[40px] flex-1 flex-col items-center gap-1 rounded-lg pt-1 ${i === mi ? "bg-brand-50" : "hover:bg-surface"}`}>
                <div className="relative flex h-[78px] w-full items-end justify-center">
                  {b > 0 && <div className="absolute left-1 right-1 border-t-2 border-dashed border-amber-400" style={{ bottom: `${(b / stripMax) * 100}%` }} />}
                  <div className="flex w-3/4 flex-col justify-end">
                    <div className="w-full rounded-t bg-brand-200" style={{ height: `${(a.forecastEx / stripMax) * 100}%` }} />
                    <div className="w-full bg-brand-600" style={{ height: `${(a.confirmedEx / stripMax) * 100}%` }} />
                  </div>
                </div>
                <span className={`text-[10px] ${i === mi ? "font-black text-brand-700" : "text-slate-400"}`}>{FY_MONTH_LABELS[i]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== Danh sách明細 (core) ===== */}
      <Panel title={`売上・回収明細 — ${ym.replace("-", "年")}月（${rows.length}件・${taxView === "in" ? "税込" : "税抜"}表示）`}
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            <select value={ownerF} onChange={(e) => setOwnerF(e.target.value)} className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-bold outline-none focus:border-brand-500">
              <option value="">担当：すべて</option>
              {S.owners.map((o) => <option key={o}>{o}</option>)}
            </select>
            <button onClick={confirmMonth} className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">この月を確定</button>
            <button onClick={() => { setDraft({ ...emptyDraft, owner: S.owners[0], category: S.categories[0] }); setShowNew(true); }} className="rounded-xl bg-brand-600 px-3.5 py-1.5 text-sm font-bold text-white shadow-sm hover:bg-brand-700">＋ 登録</button>
          </div>
        }>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2.5 font-bold">請求書番号</th>
                <th className="py-2.5 font-bold">会社名</th>
                <th className="py-2.5 font-bold">担当</th>
                <th className="py-2.5 font-bold">区分</th>
                <th className="py-2.5 text-right font-bold">人数</th>
                <th className="py-2.5 text-right font-bold">{taxView === "in" ? "請求額(税込)" : "売上(税抜)"}</th>
                <th className="py-2.5 text-right font-bold">入金済</th>
                <th className="py-2.5 text-right font-bold">残高</th>
                <th className="py-2.5 font-bold">期日</th>
                <th className="py-2.5 text-center font-bold">状態</th>
                <th className="py-2.5 text-right font-bold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.length === 0 && <tr><td colSpan={11} className="py-10 text-center text-muted">この月の明細はありません。「＋ 登録」から追加してください。</td></tr>}
              {rows.map((r) => {
                const st = statusOf(r, today); const remain = remainOf(r);
                return (
                  <tr key={r.id} className={`hover:bg-surface ${r.status === "forecast" ? "bg-sky-50/40" : ""}`}>
                    <td className="py-2 font-mono text-[11px] text-muted">{r.invoiceNo}</td>
                    <td className="py-2"><button onClick={() => setDetail(r.customer)} className="font-bold text-ink hover:text-brand-600 hover:underline">{r.customer}</button></td>
                    <td className="py-2"><span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-muted">{r.owner}</span></td>
                    <td className="py-2"><span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">{r.category}</span></td>
                    <td className="py-2 text-right">
                      <input type="number" value={r.headcount || ""} placeholder="0" onChange={(e) => patch(r.id, { headcount: Number(e.target.value) || 0 })}
                        className="w-12 rounded-lg border border-transparent bg-transparent px-1 py-1 text-right font-semibold outline-none hover:border-line focus:border-brand-500 focus:bg-white" />
                    </td>
                    <td className="py-2 text-right">
                      {taxView === "in"
                        ? <span className="font-black tabular-nums text-ink">{yen(taxIn(r))}</span>
                        : <input type="number" value={r.amount || ""} placeholder="0" onChange={(e) => patch(r.id, { amount: Number(e.target.value) || 0 })}
                            className="w-24 rounded-lg border border-transparent bg-transparent px-1 py-1 text-right font-black text-ink outline-none hover:border-line focus:border-brand-500 focus:bg-white" />}
                    </td>
                    <td className="py-2 text-right text-emerald-600">{paidOf(r) ? yen(paidOf(r)) : "—"}</td>
                    <td className={`py-2 text-right font-black ${r.status === "forecast" ? "text-slate-300" : balanceOf(r) < 0 ? "text-violet-600" : remain ? "text-ink" : "text-slate-300"}`}>
                      {r.status === "forecast" ? "—" : balanceOf(r) < 0 ? `+${yen(-balanceOf(r))}` : remain ? yen(remain) : "—"}
                    </td>
                    <td className="py-2"><span className={st === "OVERDUE" ? "text-xs font-bold text-red-600" : "text-xs text-muted"}>{r.dueDate}{st === "OVERDUE" && <span className="ml-1 text-[10px] font-black">+{daysLate(r, today)}d</span>}</span></td>
                    <td className="py-2 text-center">
                      <button onClick={() => toggleStatus(r)} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[st]}`}>{STATUS_LABEL[st]}</button>
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-1">
                        {r.status === "confirmed" && remain > 0 && <button onClick={() => { setPayFor(r); setPayAmount(String(remain)); }} className="rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-700">入金</button>}
                        {st === "OVERPAID" && <button onClick={() => adjustOverpay(r)} className="rounded-lg bg-violet-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-violet-700">調整</button>}
                        <button onClick={() => setHistFor(r)} className="rounded-lg border border-line px-1.5 py-1 text-[11px] text-muted hover:border-brand-500 hover:text-brand-600" title="履歴">🕑</button>
                        <button onClick={() => removeLine(r)} className="rounded-lg border border-line px-1.5 py-1 text-[11px] text-muted hover:border-rose-400 hover:text-rose-500">✕</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-line bg-surface font-black">
                  <td className="py-2.5" colSpan={4}>合計（{rows.length}件）</td>
                  <td className="py-2.5 text-right">{rowAgg.headcount}名</td>
                  <td className="py-2.5 text-right text-ink">{yen(taxView === "in" ? rowAgg.amountIn : rowAgg.amountEx)}</td>
                  <td className="py-2.5 text-right text-emerald-600">{yen(rows.reduce((t, r) => t + paidOf(r), 0))}</td>
                  <td className="py-2.5 text-right text-amber-600">{yen(rows.reduce((t, r) => t + remainOf(r), 0))}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Panel>

      {/* ===== 未回収会社リスト (danh sách công ty còn nợ) ===== */}
      <Panel title="🔻 未回収・要回収リスト（会社別）"
        action={<span className="text-[11px] text-slate-400">{owingList.length}社 ・ 残高合計 {yen(owingList.reduce((t, r) => t + r.remain, 0))}</span>}>
        {owingList.length === 0 ? (
          <p className="rounded-2xl bg-emerald-50 px-4 py-8 text-center text-sm font-bold text-emerald-600">未回収はありません 🎉 全て回収済みです。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2.5 font-bold">会社名</th>
                  <th className="py-2.5 text-right font-bold">未回収残高（税込）</th>
                  <th className="py-2.5 text-right font-bold">うち延滞</th>
                  <th className="py-2.5 text-center font-bold">件数</th>
                  <th className="py-2.5 font-bold">最古期日</th>
                  <th className="py-2.5 text-right font-bold">明細</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {owingList.map((r) => (
                  <tr key={r.customer} className="cursor-pointer hover:bg-surface" onClick={() => setDetail(r.customer)}>
                    <td className="py-2.5 font-bold text-ink">{r.customer}</td>
                    <td className="py-2.5 text-right font-black tabular-nums text-amber-600">{yen(r.remain)}</td>
                    <td className={`py-2.5 text-right font-black tabular-nums ${r.overdue ? "text-red-600" : "text-slate-300"}`}>{r.overdue ? yen(r.overdue) : "—"}</td>
                    <td className="py-2.5 text-center text-muted">{r.count}件</td>
                    <td className={`py-2.5 ${r.oldestDue < today ? "font-bold text-red-600" : "text-muted"}`}>{r.oldestDue}</td>
                    <td className="py-2.5 text-right"><span className="rounded-lg border border-line px-2.5 py-1 text-xs font-bold text-brand-600">明細 →</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line bg-surface font-black">
                  <td className="py-2.5">合計</td>
                  <td className="py-2.5 text-right tabular-nums text-amber-600">{yen(owingList.reduce((t, r) => t + r.remain, 0))}</td>
                  <td className="py-2.5 text-right tabular-nums text-red-600">{yen(owingList.reduce((t, r) => t + r.overdue, 0))}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>

      {/* ===== Modal đăng ký ===== */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setShowNew(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="mb-1 text-base font-black text-ink">売上を登録 — {ym.replace("-", "年")}月</h3>
            <p className="mb-4 text-[11px] text-muted">登録者：{op} ・ {fmtDT(nowIso())}</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">種別</label>
                  <select value={draft.recurring ? "rec" : "spot"} onChange={(e) => setDraft((d) => ({ ...d, recurring: e.target.value === "rec" }))}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500">
                    <option value="rec">定期（毎月・年度末まで自動）</option>
                    <option value="spot">不定期（単発）</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">請求書番号</label>
                  <input value={draft.invoiceNo} onChange={(e) => setDraft((d) => ({ ...d, invoiceNo: e.target.value }))}
                    placeholder={`INV-${ym.replace("-", "")}-…`} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-muted">会社名 * <span className="font-normal text-slate-400">（顧客管理から選択・入力）</span></label>
                <div className="relative">
                  <input value={draft.customer}
                    onChange={(e) => { setDraft((d) => ({ ...d, customer: e.target.value })); setCustOpen(true); }}
                    onFocus={() => setCustOpen(true)}
                    placeholder="会社名を入力または選択" autoComplete="off"
                    className="w-full rounded-xl border border-line px-3 py-2 pr-9 text-sm outline-none focus:border-brand-500" />
                  <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m6 9 6 6 6-6" /></svg>
                  {custOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setCustOpen(false)} />
                      <div className="absolute left-0 right-0 z-20 mt-1.5 max-h-56 overflow-auto rounded-2xl border border-line bg-white p-1.5 shadow-card">
                        {names.filter((n) => !draft.customer.trim() || n.toLowerCase().includes(draft.customer.trim().toLowerCase())).slice(0, 40).map((n) => (
                          <button key={n} type="button" onClick={() => { setDraft((d) => ({ ...d, customer: n })); setCustOpen(false); }}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-surface">
                            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-lg bg-brand-50 text-[10px] font-black text-brand-700">{n.charAt(0)}</span>
                            <span className="truncate font-semibold text-ink">{n}</span>
                          </button>
                        ))}
                        {names.filter((n) => !draft.customer.trim() || n.toLowerCase().includes(draft.customer.trim().toLowerCase())).length === 0 && (
                          <p className="px-3 py-2 text-xs text-muted">「{draft.customer}」を新規登録します</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">担当</label>
                  <select value={draft.owner} onChange={(e) => setDraft((d) => ({ ...d, owner: e.target.value }))} className="w-full rounded-xl border border-line px-2 py-2 text-sm outline-none focus:border-brand-500">
                    {S.owners.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">区分</label>
                  <select value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} className="w-full rounded-xl border border-line px-2 py-2 text-sm outline-none focus:border-brand-500">
                    {S.categories.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">人数</label>
                  <input type="number" value={draft.headcount} onChange={(e) => setDraft((d) => ({ ...d, headcount: e.target.value }))} className="w-full rounded-xl border border-line px-2 py-2 text-right text-sm outline-none focus:border-brand-500" />
                </div>
              </div>
              {/* 金額 + 税抜/税込 */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-bold text-muted">請求金額 *</label>
                  <div className="flex overflow-hidden rounded-lg border border-line">
                    <button onClick={() => setDraft((d) => ({ ...d, taxMode: "ex" }))} className={`px-2 py-0.5 text-[11px] font-bold ${draft.taxMode === "ex" ? "bg-brand-600 text-white" : "bg-white text-muted"}`}>税抜で入力</button>
                    <button onClick={() => setDraft((d) => ({ ...d, taxMode: "in" }))} className={`px-2 py-0.5 text-[11px] font-bold ${draft.taxMode === "in" ? "bg-brand-600 text-white" : "bg-white text-muted"}`}>税込で入力</button>
                  </div>
                </div>
                <input type="number" value={draft.amount} onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                  placeholder={draft.taxMode === "in" ? "税込金額（請求総額）" : "税抜金額"} className="w-full rounded-xl border border-line px-3 py-2 text-right text-sm font-semibold outline-none focus:border-brand-500" />
                <p className="mt-1 text-right text-[11px] text-slate-400">
                  税抜 <b className="text-ink">{yen(liveEx)}</b> ／ 消費税{S.taxRate}% ／ <b className="text-brand-700">請求総額(税込) {yen(liveIn)}</b>
                </p>
              </div>
              {!draft.recurring && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-muted">入金期日</label>
                    <input type="date" value={draft.dueDate} onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-muted">原価（税抜）</label>
                    <input type="number" value={draft.cost} onChange={(e) => setDraft((d) => ({ ...d, cost: e.target.value }))} placeholder="0" className="w-full rounded-xl border border-line px-3 py-2 text-right text-sm outline-none focus:border-brand-500" />
                  </div>
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowNew(false)} className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-muted hover:bg-surface">キャンセル</button>
              <button onClick={addLine} className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white hover:bg-brand-700">登録する</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal 入金 ===== */}
      {payFor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setPayFor(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="mb-1 text-base font-black text-ink">入金を記録</h3>
            <p className="mb-4 text-xs text-muted">{payFor.customer} — {payFor.invoiceNo}</p>
            <div className="mb-3 rounded-xl bg-surface px-4 py-3 text-sm">
              <div className="flex justify-between"><span className="text-muted">請求総額(税込)</span><span className="font-bold">{yen(taxIn(payFor))}</span></div>
              <div className="flex justify-between"><span className="text-muted">入金済</span><span className="font-bold text-emerald-600">{yen(paidOf(payFor))}</span></div>
              <div className="mt-1.5 flex justify-between border-t border-line pt-1.5"><span className="font-bold text-ink">残高</span><span className="font-black text-ink">{yen(remainOf(payFor))}</span></div>
            </div>
            <label className="mb-1 block text-xs font-bold text-muted">入金額（円）— {today} ・ 操作者 {op}</label>
            <input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="w-full rounded-xl border border-line px-3 py-2 text-right text-sm font-semibold outline-none focus:border-brand-500" />
            <label className="mb-1 mt-3 block text-xs font-bold text-muted">メモ（任意）</label>
            <input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="例：銀行振込 / 一部入金 / 手渡し…"
              className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setPayFor(null)} className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-muted hover:bg-surface">キャンセル</button>
              <button onClick={addPayment} className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700">記録する</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal 履歴 (audit) ===== */}
      {histFor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setHistFor(null)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div><h3 className="text-base font-black text-ink">操作履歴</h3><p className="text-[11px] text-muted">{histFor.customer} — {histFor.invoiceNo}</p></div>
              <button onClick={() => setHistFor(null)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface">✕</button>
            </div>
            <div className="mb-3 rounded-xl bg-surface px-3.5 py-2.5 text-xs">
              <div className="flex justify-between"><span className="text-muted">登録者</span><span className="font-bold text-ink">{histFor.createdBy} ・ {fmtDT(histFor.createdAt)}</span></div>
              <div className="mt-1 flex justify-between"><span className="text-muted">最終更新</span><span className="font-bold text-ink">{histFor.updatedBy} ・ {fmtDT(histFor.updatedAt)}</span></div>
            </div>
            <ol className="space-y-2">
              {[...histFor.history].reverse().map((h, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-brand-500" />
                  <div><span className="font-bold text-ink">{h.action}</span><span className="text-muted"> — {h.by} ・ {fmtDT(h.at)}</span></div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {/* ===== Modal chi tiết khách ===== */}
      {detail && detailData && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setDetail(null)} />
          <div className="relative flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div><h3 className="text-base font-black text-ink">{detail}</h3><p className="text-[11px] text-muted">{fiscalLabel(fy)} ・ {detailData.ls.length}件</p></div>
              <button onClick={() => setDetail(null)} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface">✕</button>
            </div>
            <div className="space-y-4 overflow-auto p-5">
              <div className="grid grid-cols-3 gap-3">
                {[["請求済(税込)", yen(detailData.billed), "text-ink"], ["入金済", yen(detailData.paid), "text-emerald-600"], ["未回収残高", yen(detailData.remain), detailData.remain ? "text-amber-600" : "text-slate-400"]].map(([l, v, c]) => (
                  <div key={l} className="rounded-xl bg-surface px-3.5 py-3"><p className="text-[11px] font-bold text-muted">{l}</p><p className={`mt-0.5 text-lg font-black ${c}`}>{v}</p></div>
                ))}
              </div>
              <div>
                <p className="mb-1.5 text-sm font-black text-ink">請求・回収状況</p>
                <div className="overflow-x-auto rounded-xl border border-line">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead><tr className="border-b border-line bg-surface text-left text-xs text-muted"><th className="px-3 py-2 font-bold">年月</th><th className="px-3 py-2 font-bold">区分</th><th className="px-3 py-2 text-right font-bold">税込</th><th className="px-3 py-2 text-right font-bold">残高</th><th className="px-3 py-2 text-center font-bold">状態</th></tr></thead>
                    <tbody className="divide-y divide-line">
                      {detailData.ls.map((l) => { const st = statusOf(l, today); return (
                        <tr key={l.id}><td className="px-3 py-2 text-muted">{l.ym}</td><td className="px-3 py-2">{l.category}</td><td className="px-3 py-2 text-right font-bold">{yen(taxIn(l))}</td><td className={`px-3 py-2 text-right font-black ${remainOf(l) ? "text-amber-600" : "text-slate-300"}`}>{l.status === "confirmed" ? yen(remainOf(l)) : "—"}</td><td className="px-3 py-2 text-center"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[st]}`}>{STATUS_LABEL[st]}</span></td></tr>
                      ); })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 入金履歴 kèm ghi chú */}
              <div>
                <p className="mb-1.5 text-sm font-black text-ink">💰 入金履歴（各回の記録・メモ）</p>
                {detailData.pays.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-xs text-muted">まだ入金履歴はありません。</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-line">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead><tr className="border-b border-line bg-surface text-left text-xs text-muted"><th className="px-3 py-2 font-bold">入金日</th><th className="px-3 py-2 font-bold">請求書番号</th><th className="px-3 py-2 text-right font-bold">入金額</th><th className="px-3 py-2 font-bold">担当</th><th className="px-3 py-2 font-bold">メモ</th></tr></thead>
                      <tbody className="divide-y divide-line">
                        {detailData.pays.map((p, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 font-semibold text-ink">{p.date}</td>
                            <td className="px-3 py-2 font-mono text-[11px] text-muted">{p.invoiceNo}</td>
                            <td className={`px-3 py-2 text-right font-black ${p.amount < 0 ? "text-violet-600" : "text-emerald-600"}`}>{yen(p.amount)}</td>
                            <td className="px-3 py-2 text-xs text-muted">{p.by}</td>
                            <td className="px-3 py-2 text-xs text-muted">{p.note || "—"}</td>
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

      {/* ===== Modal ⚙ 設定 (gộp hết) ===== */}
      {showSettings && (
        <SettingsModal store={store} setStore={setStore} onClose={() => setShowSettings(false)}
          onCsv={exportCsv} onPrint={printMonth} onReset={resetSample} />
      )}
    </div>
  );
}

// ================= Settings modal =================
function SettingsModal({ store, setStore, onClose, onCsv, onPrint, onReset }: {
  store: RevStore; setStore: (fn: (p: RevStore) => RevStore) => void; onClose: () => void;
  onCsv: () => void; onPrint: () => void; onReset: () => void;
}) {
  const S = store.settings;
  const [newOwner, setNewOwner] = useState("");
  const [newCat, setNewCat] = useState("");
  const setS = (patch: Partial<typeof S>) => setStore((p) => ({ ...p, settings: { ...p.settings, ...patch } }));

  const chipList = (items: string[], onRemove: (v: string) => void) => (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <span key={it} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink">
          {it}<button onClick={() => onRemove(it)} className="text-slate-400 hover:text-rose-500">×</button>
        </span>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-base font-black text-ink">⚙ 設定</h3>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface">✕</button>
        </div>
        <div className="space-y-5 overflow-auto p-5">
          {/* 操作者 + 税率 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-muted">操作者（履歴に記録）</label>
              <input value={S.operator} onChange={(e) => setS({ operator: e.target.value })} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-muted">消費税率（%）</label>
              <input type="number" value={S.taxRate} onChange={(e) => setS({ taxRate: Number(e.target.value) || 0 })} className="w-full rounded-xl border border-line px-3 py-2 text-right text-sm font-semibold outline-none focus:border-brand-500" />
            </div>
          </div>
          {/* 担当マスタ */}
          <div>
            <p className="mb-2 text-sm font-black text-ink">担当マスタ</p>
            {chipList(S.owners, (v) => setS({ owners: S.owners.filter((x) => x !== v) }))}
            <div className="mt-2 flex gap-1.5">
              <input value={newOwner} onChange={(e) => setNewOwner(e.target.value)} placeholder="＋ 担当を追加" className="w-40 rounded-lg border border-dashed border-line px-2.5 py-1.5 text-xs outline-none focus:border-brand-500" />
              <button onClick={() => { if (newOwner.trim() && !S.owners.includes(newOwner.trim())) setS({ owners: [...S.owners, newOwner.trim()] }); setNewOwner(""); }} className="rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-bold text-white">追加</button>
            </div>
          </div>
          {/* 区分マスタ */}
          <div>
            <p className="mb-2 text-sm font-black text-ink">区分マスタ</p>
            {chipList(S.categories, (v) => setS({ categories: S.categories.filter((x) => x !== v) }))}
            <div className="mt-2 flex gap-1.5">
              <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="＋ 区分を追加" className="w-40 rounded-lg border border-dashed border-line px-2.5 py-1.5 text-xs outline-none focus:border-brand-500" />
              <button onClick={() => { if (newCat.trim() && !S.categories.includes(newCat.trim())) setS({ categories: [...S.categories, newCat.trim()] }); setNewCat(""); }} className="rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-bold text-white">追加</button>
            </div>
          </div>
          {/* データ操作 */}
          <div>
            <p className="mb-2 text-sm font-black text-ink">データ操作</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={onCsv} className="rounded-xl border border-line px-3 py-2 text-xs font-bold text-muted hover:border-brand-500 hover:text-brand-600">CSV出力（当月）</button>
              <button onClick={onPrint} className="rounded-xl border border-line px-3 py-2 text-xs font-bold text-muted hover:border-brand-500 hover:text-brand-600">印刷 / PDF（当月）</button>
              <button onClick={onReset} className="rounded-xl border border-line px-3 py-2 text-xs font-bold text-muted hover:border-rose-400 hover:text-rose-500">サンプルに戻す</button>
            </div>
          </div>
        </div>
        <div className="flex justify-end border-t border-line px-5 py-3">
          <button onClick={onClose} className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white hover:bg-brand-700">完了</button>
        </div>
      </div>
    </div>
  );
}
