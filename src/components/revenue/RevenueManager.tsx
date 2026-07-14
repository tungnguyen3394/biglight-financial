"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Panel from "@/components/ui/Panel";
import {
  STORAGE_KEY, DEFAULT_SETTINGS, STATUS_LABEL, STATUS_TONE,
  sampleStore, migrateStore, statusOf, taxIn, paidOf, remainOf, balanceOf, daysLate,
  aggregate, expandRecurring, readBudgetSeries, endOfNextMonth, uid, yen,
  type RevStore, type RevLine, type Payment, type PayMethod,
} from "@/lib/revenue";

const PAY_METHODS: PayMethod[] = ["銀行振込", "現金", "その他"];

// 金額セルの表示・色: 過不足なし(=完了)=緑 / 不足=赤(-) / 過入金=紫(+) / 予定=グレー
function moneyCells(l: RevLine) {
  const paid = paidOf(l); const bal = balanceOf(l);
  if (l.status === "forecast") return { paidText: "—", paidClass: "text-slate-300", balText: "—", balClass: "text-slate-300", fully: false };
  const fully = bal === 0;
  const paidText = paid ? yen(paid) : "—";
  const paidClass = fully ? "text-emerald-600" : bal < 0 ? "text-violet-600" : paid ? "text-red-600" : "text-slate-300";
  let balText: string, balClass: string;
  if (bal < 0) { balText = `+${yen(-bal)}`; balClass = "text-violet-600"; }   // 過入金 = 紫
  else if (bal > 0) { balText = `-${yen(bal)}`; balClass = "text-red-600"; }  // 不足 = 赤
  else { balText = "¥0"; balClass = "text-emerald-600"; }                      // 完了 = 緑
  return { paidText, paidClass, balText, balClass, fully };
}
import { fiscalMonths, fiscalLabel, fiscalYearOf, fiscalMonthIndex, FY_MONTH_LABELS } from "@/lib/fiscal";

const nowIso = () => new Date().toISOString();
const fmtDT = (iso: string) => { try { return iso.replace("T", " ").slice(0, 16); } catch { return iso; } };

/* ===== 線アイコン（外部ライブラリ非依存・SVG line） ===== */
const ICONS: Record<string, React.ReactNode> = {
  left: <path d="m15 6-6 6 6 6" />,
  right: <path d="m9 6 6 6-6 6" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  coins: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
  alert: <><path d="M12 3 21 19H3z" /><path d="M12 10v4M12 17h.01" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  pencil: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  trash: <><path d="M3 6h18" /><path d="M8 6V4h8v2M6 6l1 14h10l1-14" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  in: <><path d="M12 4v11" /><path d="M7 10l5 5 5-5" /><path d="M5 20h14" /></>,
  out: <><path d="M12 20V9" /><path d="M7 14l5-5 5 5" /><path d="M5 4h14" /></>,
  printer: <><path d="M6 9V3h12v6" /><rect x="4" y="9" width="16" height="8" rx="1.5" /><path d="M8 17h8v4H8z" /></>,
};
function Ic({ n, size = 16, className = "" }: { n: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {ICONS[n]}
    </svg>
  );
}

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

const emptyDraft = { customer: "", owner: "", category: "", amount: "", note: "", invoiceNo: "", recognitionDate: "", recurring: true, taxMode: "ex" as "ex" | "in" };
type EDraft = { customer: string; owner: string; category: string; amount: string; invoiceNo: string; dueDate: string; status: "forecast" | "confirmed"; recognitionDate: string; note: string };

export default function RevenueManager() {
  const [store, setStore] = useState<RevStore>({ lines: [], settings: DEFAULT_SETTINGS });
  const [today, setToday] = useState("");
  const [fy, setFy] = useState(2025);
  const [mi, setMi] = useState(0);
  const [taxView, setTaxView] = useState<"ex" | "in">("in");
  const [ownerF, setOwnerF] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [payFor, setPayFor] = useState<RevLine | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payMethod, setPayMethod] = useState<PayMethod>("銀行振込");
  const [payFee, setPayFee] = useState("");
  const [editPay, setEditPay] = useState<{ line: RevLine; pi: number } | null>(null);
  const [paysForId, setPaysForId] = useState<string | null>(null);
  const [custOpen, setCustOpen] = useState(false);
  const [histFor, setHistFor] = useState<RevLine | null>(null);
  const [editFor, setEditFor] = useState<RevLine | null>(null);
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
      setStore(raw ? migrateStore(JSON.parse(raw) as RevStore) : sampleStore());
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

  // 年度 KPI
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

  // 明細は「登録が新しい順」で表示
  const rows = useMemo(() => store.lines
    .filter((l) => l.ym === ym)
    .filter((l) => !ownerF || l.owner === ownerF)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.amount - a.amount),
  [store.lines, ym, ownerF]);
  const rowAgg = aggregate(rows);

  const names = useMemo(() => Array.from(new Set([...customerNames, ...store.lines.map((l) => l.customer)])).sort(), [customerNames, store.lines]);

  // 会社詳細（年度）— 売上履歴 + 入出金履歴
  const detailData = useMemo(() => {
    if (!detail) return null;
    const ls = fyLines.filter((l) => l.customer === detail).sort((a, b) => b.recognitionDate.localeCompare(a.recognitionDate));
    const conf = ls.filter((l) => l.status === "confirmed");
    const billed = ls.reduce((t, l) => t + taxIn(l), 0);
    const paid = ls.reduce((t, l) => t + paidOf(l), 0);
    const remain = conf.reduce((t, l) => t + remainOf(l), 0);                         // 未回収は確定分のみ
    const over = conf.reduce((t, l) => t + Math.max(0, -balanceOf(l)), 0);            // 過入金
    const overdue = conf.filter((l) => statusOf(l, today) === "OVERDUE").reduce((t, l) => t + remainOf(l), 0);
    const owingLines = conf.filter((l) => remainOf(l) > 0).sort((a, b) => a.recognitionDate.localeCompare(b.recognitionDate));
    const pays = ls.flatMap((l) => l.payments.map((p, pi) => ({ ...p, invoiceNo: l.invoiceNo, ym: l.ym, lineId: l.id, pi })))
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || ""));
    return { ls, billed, paid, remain, over, overdue, owingLines, pays };
  }, [detail, fyLines, today]);

  // 未回収リスト（会社別）
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

  function shift(d: number) { let f = fy, m = mi + d; if (m > 11) { f++; m = 0; } else if (m < 0) { f--; m = 11; } setFy(f); setMi(m); }
  function patch(id: string, p: Partial<RevLine>, action?: string) {
    setStore((prev) => ({ ...prev, lines: prev.lines.map((l) => l.id === id ? { ...l, ...p, updatedAt: nowIso(), updatedBy: op, history: action ? [...l.history, { at: nowIso(), by: op, action }] : l.history } : l) }));
  }
  function toggleStatus(l: RevLine) { patch(l.id, { status: l.status === "confirmed" ? "forecast" : "confirmed" }, l.status === "confirmed" ? "予定に戻す" : "確定"); }
  function confirmMonth() { if (!confirm(`${ym} の全明細を「確定」にしますか？`)) return; setStore((prev) => ({ ...prev, lines: prev.lines.map((l) => l.ym === ym && l.status !== "confirmed" ? { ...l, status: "confirmed", updatedAt: nowIso(), updatedBy: op, history: [...l.history, { at: nowIso(), by: op, action: "確定（一括）" }] } : l) })); }
  function addPayment() {
    if (!payFor) return;
    const amt = Number(payAmount) || 0;
    const fee = Number(payFee) || 0;
    if (amt <= 0) { alert("入金額を入力してください。"); return; }
    if (!payDate) { alert("入金日を入力してください。"); return; }
    // 過入金（残高超過）も許可する
    const pay: Payment = { date: payDate, amount: amt, fee: fee || undefined, by: op, method: payMethod, note: payNote.trim() || undefined, createdAt: nowIso() };
    const patchObj: Partial<RevLine> = { payments: [...payFor.payments, pay] };
    if (payFor.status === "forecast") patchObj.status = "confirmed";  // 予定明細は入金時に確定
    patch(payFor.id, patchObj, `入金 ${yen(amt)}・${payMethod}${fee ? `／手数料当社負担 ${yen(fee)}` : ""}${payNote.trim() ? "（" + payNote.trim() + "）" : ""}`);
    setPayFor(null); setPayAmount(""); setPayNote(""); setPayDate(""); setPayMethod("銀行振込"); setPayFee("");
  }
  function adjustOverpay(l: RevLine) { const over = -balanceOf(l); if (over <= 0) return; if (!confirm(`過入金 ${yen(over)} を返金・調整として記録しますか？`)) return; patch(l.id, { payments: [...l.payments, { date: today, amount: -over, by: op, method: "その他", note: "返金・調整", createdAt: nowIso() }] }, `返金・調整 ${yen(over)}`); }
  // 入金履歴の1件を修正／削除（監査履歴に記録）
  function savePayEdit(lineId: string, pi: number, np: Payment) {
    setStore((prev) => ({ ...prev, lines: prev.lines.map((l) => l.id === lineId ? {
      ...l, payments: l.payments.map((p, i) => (i === pi ? np : p)),
      updatedAt: nowIso(), updatedBy: op,
      history: [...l.history, { at: nowIso(), by: op, action: `入金修正 ${yen(np.amount)}${np.fee ? `／手数料 ${yen(np.fee)}` : ""}` }],
    } : l) }));
    setEditPay(null);
  }
  function deletePay(lineId: string, pi: number, amount: number) {
    if (!confirm("この入金記録を削除しますか？")) return;
    setStore((prev) => ({ ...prev, lines: prev.lines.map((l) => l.id === lineId ? {
      ...l, payments: l.payments.filter((_, i) => i !== pi),
      updatedAt: nowIso(), updatedBy: op,
      history: [...l.history, { at: nowIso(), by: op, action: `入金削除 ${yen(amount)}` }],
    } : l) }));
    setEditPay(null);
  }
  // 入金モーダルを開く（残高を初期値に）
  function openPay(l: RevLine) {
    const rem = remainOf(l);
    setPayFor(l); setPayAmount(rem > 0 ? String(rem) : ""); setPayDate(today); setPayMethod("銀行振込"); setPayNote(""); setPayFee("");
  }
  function removeLine(l: RevLine) {
    if (!confirm("この明細を削除しますか？")) return;
    if (l.recurring && l.seriesId) { const all = confirm("定期明細です。\n［OK］今月以降の同系列をすべて削除\n［キャンセル］今月のみ削除"); if (all) { setStore((prev) => ({ ...prev, lines: prev.lines.filter((x) => !(x.seriesId === l.seriesId && x.ym >= l.ym)) })); return; } }
    setStore((prev) => ({ ...prev, lines: prev.lines.filter((x) => x.id !== l.id) }));
  }
  function saveEdit(id: string, e: EDraft) {
    const amount = Number(e.amount) || 0;
    if (!e.customer.trim() || !amount) { alert("会社名・金額は必須です。"); return; }
    if (!e.recognitionDate) { alert("売上計上日を入力してください。"); return; }
    patch(id, {
      customer: e.customer.trim(), owner: e.owner, category: e.category,
      amount, invoiceNo: e.invoiceNo.trim(), dueDate: e.dueDate, status: e.status,
      recognitionDate: e.recognitionDate, ym: e.recognitionDate.slice(0, 7), note: e.note.trim() || undefined,
    }, "編集");
    setEditFor(null);
  }
  function addLine() {
    const rate = S.taxRate;
    const raw = Number(draft.amount) || 0;
    const amountEx = draft.taxMode === "in" ? Math.round(raw / (1 + rate / 100)) : raw;
    if (!draft.customer.trim() || !amountEx) { alert("会社名・金額は必須です。"); return; }
    if (!draft.recognitionDate) { alert("売上計上日を入力してください。"); return; }
    const recog = draft.recognitionDate;
    const lineYm = recog.slice(0, 7);
    const common = {
      customer: draft.customer.trim(), owner: draft.owner || S.owners[0], category: draft.category || S.categories[0],
      amount: amountEx, taxRate: rate, cost: 0, note: draft.note.trim() || undefined,
      recurring: draft.recurring, status: "forecast" as const, payments: [] as Payment[],
      createdAt: nowIso(), createdBy: op, updatedAt: nowIso(), updatedBy: op, history: [{ at: nowIso(), by: op, action: "登録" }],
    };
    if (draft.recurring) {
      setStore((prev) => ({ ...prev, lines: [...prev.lines, ...expandRecurring(common, recog, "INV")] }));
    } else {
      setStore((prev) => ({ ...prev, lines: [...prev.lines, { ...common, id: uid(), ym: lineYm, recognitionDate: recog, dueDate: endOfNextMonth(lineYm), invoiceNo: draft.invoiceNo.trim() || `INV-${lineYm.replace("-", "")}-S` }] }));
    }
    setDraft(emptyDraft); setShowNew(false);
  }
  function openNew(customer?: string) {
    setDraft({ ...emptyDraft, owner: S.owners[0], category: S.categories[0], recognitionDate: today, customer: customer ?? "" });
    setShowNew(true);
  }
  function resetSample() { if (!confirm("サンプルデータに戻します。よろしいですか？")) return; setStore(sampleStore()); }
  function exportCsv() {
    const head = ["売上計上日", "請求書番号", "会社名", "担当", "区分", "種別", "売上(税抜)", "請求額(税込)", "入金済", "残高", "期日", "状態", "登録者", "最終更新"];
    const data = rows.map((r) => [r.recognitionDate, r.invoiceNo, r.customer, r.owner, r.category, r.recurring ? "定期" : "不定期", r.amount, taxIn(r), paidOf(r), remainOf(r), r.dueDate, STATUS_LABEL[statusOf(r, today)], r.createdBy, fmtDT(r.updatedAt)]);
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
  function printCustomer() {
    if (!detail || !detailData) return;
    const d = detailData;
    const body = `<h1>取引明細書 — ${detail}</h1><div class="sub">${fiscalLabel(fy)} ／ 出力日 ${today}</div>
      <table><tr><th>請求済(税込)</th><th>入金済</th><th>未回収残高</th><th>うち延滞</th></tr>
      <tr><td class="r">${yen(d.billed)}</td><td class="r">${yen(d.paid)}</td><td class="r">${yen(d.remain)}</td><td class="r ${d.overdue ? "red" : ""}">${yen(d.overdue)}</td></tr></table>
      <h1 style="font-size:13px">売上履歴</h1>
      <table><tr><th>年月</th><th>請求書番号</th><th>区分</th><th class="r">税込</th><th class="r">残高</th><th>状態</th></tr>
      ${d.ls.map((l) => { const st = statusOf(l, today); return `<tr><td>${l.ym}</td><td>${l.invoiceNo}</td><td>${l.category}</td><td class="r">${yen(taxIn(l))}</td><td class="r ${st === "OVERDUE" ? "red" : ""}">${l.status === "confirmed" ? yen(remainOf(l)) : "—"}</td><td>${STATUS_LABEL[st]}</td></tr>`; }).join("")}</table>
      <h1 style="font-size:13px">入出金履歴</h1>
      <table><tr><th>入金日</th><th>請求書番号</th><th class="r">金額</th><th>担当</th><th>メモ</th></tr>
      ${d.pays.length ? d.pays.map((p) => `<tr><td>${p.date}</td><td>${p.invoiceNo}</td><td class="r">${yen(p.amount)}</td><td>${p.by}</td><td>${p.note || ""}</td></tr>`).join("") : `<tr><td colspan="5">入金履歴なし</td></tr>`}</table>`;
    openPrint(`取引明細_${detail}`, body);
  }

  if (!today) return <div className="rounded-2xl border border-line bg-white p-12 text-center text-sm text-muted">読み込み中…</div>;

  const liveEx = (() => { const raw = Number(draft.amount) || 0; return draft.taxMode === "in" ? Math.round(raw / (1 + S.taxRate / 100)) : raw; })();
  const liveIn = Math.round(liveEx * (1 + S.taxRate / 100));
  const nextYm = (() => { const [y, m] = today.slice(0, 7).split("-").map(Number); const nm = m === 12 ? 1 : m + 1; const ny = m === 12 ? y + 1 : y; return `${ny}-${String(nm).padStart(2, "0")}`; })();
  const paysLine = paysForId ? store.lines.find((l) => l.id === paysForId) ?? null : null;

  return (
    <div className="space-y-5">
      {/* ===== KPI ===== */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <p className="text-sm font-bold text-muted">年度売上（確定・税抜）</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-ink">{yen(kpi.confEx)}</p>
          <p className="mt-1 text-[11px] text-slate-400">見込含む {yen(kpi.seenEx)}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-card">
          <p className="text-sm font-bold text-amber-700">未回収残高（税込）</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-amber-600">{yen(kpi.unpaidIn)}</p>
          <p className="mt-1 text-[11px] text-amber-600/70">請求済・未入金</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50/40 p-5 shadow-card">
          <p className="text-sm font-bold text-red-700">延滞（税込）</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-red-600">{yen(kpi.overdueIn)}</p>
          <p className="mt-1 text-[11px] text-red-600/70">{kpi.overdueCnt}件・期日超過</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <p className="text-sm font-bold text-muted">回収率</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-emerald-600">{kpi.collectRate}%</p>
          <p className="mt-1 text-[11px] text-slate-400">確定請求のうち入金済み</p>
        </div>
      </div>

      {/* ===== 月ナビ ===== */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-white p-3 shadow-card">
        <button onClick={() => shift(-1)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-muted hover:border-brand-500 hover:text-brand-600" aria-label="前月"><Ic n="left" size={18} /></button>
        <div className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-black text-white">{ym.replace("-", "年")}月</div>
        <button onClick={() => shift(1)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-muted hover:border-brand-500 hover:text-brand-600" aria-label="翌月"><Ic n="right" size={18} /></button>
        <span className="ml-1 hidden text-xs font-bold text-muted sm:inline">{fiscalLabel(fy)}</span>

        <div className="ml-2 hidden items-center gap-3 rounded-xl bg-surface px-3 py-1.5 text-xs md:flex">
          <span className="text-muted">予算 <b className="text-ink">{yen(budget[mi])}</b></span>
          <span className="text-muted">確定 <b className="text-emerald-600">{yen(cur.confirmedEx)}</b></span>
          <span className="text-muted">見込 <b className="text-ink">{yen(cur.amountEx)}</b></span>
          <span className={`font-black ${curRate >= 100 ? "text-emerald-600" : curRate >= 80 ? "text-amber-600" : "text-rose-600"}`}>{budget[mi] ? curRate + "%" : "—"}</span>
        </div>

        <div className="ml-auto flex overflow-hidden rounded-xl border border-line">
          <button onClick={() => setTaxView("ex")} className={`px-3 py-2 text-xs font-bold ${taxView === "ex" ? "bg-brand-600 text-white" : "bg-white text-muted hover:bg-surface"}`}>税抜</button>
          <button onClick={() => setTaxView("in")} className={`px-3 py-2 text-xs font-bold ${taxView === "in" ? "bg-brand-600 text-white" : "bg-white text-muted hover:bg-surface"}`}>税込</button>
        </div>
        <button onClick={() => setShowSettings(true)} className="flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-xs font-bold text-muted hover:border-brand-500 hover:text-brand-600"><Ic n="gear" size={15} />設定</button>
      </div>

      {/* ===== 12ヶ月ストリップ ===== */}
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

      {/* ===== 明細 ===== */}
      <Panel title={`売上・回収明細 — ${ym.replace("-", "年")}月（${rows.length}件・${taxView === "in" ? "税込" : "税抜"}）`}
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            <select value={ownerF} onChange={(e) => setOwnerF(e.target.value)} className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-bold outline-none focus:border-brand-500">
              <option value="">担当：すべて</option>
              {S.owners.map((o) => <option key={o}>{o}</option>)}
            </select>
            <button onClick={confirmMonth} className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">この月を確定</button>
            <button onClick={() => openNew()} className="flex items-center gap-1 rounded-xl bg-brand-600 px-3.5 py-1.5 text-sm font-bold text-white shadow-sm hover:bg-brand-700"><Ic n="plus" size={15} />登録</button>
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
                <th className="py-2.5 text-right font-bold">{taxView === "in" ? "請求額(税込)" : "売上(税抜)"}</th>
                <th className="py-2.5 text-right font-bold">入金済</th>
                <th className="py-2.5 text-right font-bold">残高</th>
                <th className="py-2.5 font-bold">期日</th>
                <th className="py-2.5 text-center font-bold">状態</th>
                <th className="py-2.5 text-right font-bold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.length === 0 && <tr><td colSpan={10} className="py-10 text-center text-muted">この月の明細はありません。「登録」から追加してください。</td></tr>}
              {rows.map((r) => {
                const st = statusOf(r, today);
                return (
                  <tr key={r.id} className={`hover:bg-surface ${r.status === "forecast" ? "bg-sky-50/40" : ""}`}>
                    <td className="py-2 font-mono text-[11px] text-muted">{r.invoiceNo}</td>
                    <td className="py-2"><button onClick={() => setDetail(r.customer)} className="font-bold text-ink hover:text-brand-600 hover:underline">{r.customer}</button></td>
                    <td className="py-2"><span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-muted">{r.owner}</span></td>
                    <td className="py-2"><span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">{r.category}</span></td>
                    <td className="py-2 text-right font-black tabular-nums text-ink">{yen(taxView === "in" ? taxIn(r) : r.amount)}</td>
                    <td className={`py-2 text-right font-bold ${moneyCells(r).paidClass}`}>{moneyCells(r).paidText}</td>
                    <td className={`py-2 text-right font-black ${moneyCells(r).balClass}`}>{moneyCells(r).balText}</td>
                    <td className="py-2"><span className={st === "OVERDUE" ? "text-xs font-bold text-red-600" : "text-xs text-muted"}>{r.dueDate}{st === "OVERDUE" && <span className="ml-1 text-[10px] font-black">+{daysLate(r, today)}d</span>}</span></td>
                    <td className="py-2 text-center">
                      <button onClick={() => toggleStatus(r)} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[st]}`}>{STATUS_LABEL[st]}</button>
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openPay(r)} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700">入金</button>
                        <button onClick={() => setPaysForId(r.id)} className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-muted hover:border-brand-500 hover:text-brand-600" title="入金明細・修正"><Ic n="coins" size={14} /></button>
                        <button onClick={() => setEditFor(r)} className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-muted hover:border-brand-500 hover:text-brand-600" title="売上を編集"><Ic n="pencil" size={14} /></button>
                        <button onClick={() => setHistFor(r)} className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-muted hover:border-brand-500 hover:text-brand-600" title="変更履歴"><Ic n="clock" size={14} /></button>
                        <button onClick={() => removeLine(r)} className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-muted hover:border-rose-400 hover:text-rose-500" title="削除"><Ic n="trash" size={14} /></button>
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

      {/* ===== 未回収リスト（会社別） ===== */}
      <Panel title={<span className="flex items-center gap-1.5"><Ic n="alert" size={16} className="text-amber-500" />未回収・要回収リスト（会社別）</span>}
        action={<span className="text-[11px] text-slate-400">{owingList.length}社 ・ 残高合計 {yen(owingList.reduce((t, r) => t + r.remain, 0))}</span>}>
        {owingList.length === 0 ? (
          <p className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-50 px-4 py-8 text-center text-sm font-bold text-emerald-600"><Ic n="check" size={18} />未回収はありません。全て回収済みです。</p>
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
                    <td className="py-2.5 text-right"><span className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-bold text-brand-600">明細<Ic n="arrow" size={13} /></span></td>
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

      {/* ===== 登録モーダル ===== */}
      {showNew && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setShowNew(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="mb-1 text-base font-black text-ink">売上を登録</h3>
            <p className="mb-4 text-[11px] text-muted">登録者：{op} ・ {fmtDT(nowIso())}</p>
            <div className="space-y-3">
              {/* 種別 / 区分 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">種別</label>
                  <select value={draft.recurring ? "rec" : "spot"} onChange={(e) => setDraft((d) => ({ ...d, recurring: e.target.value === "rec" }))}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500">
                    <option value="rec">定期</option>
                    <option value="spot">不定期</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">区分</label>
                  <select value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500">
                    {S.categories.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              {/* 売上計上日 / 請求書番号 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">売上計上日 *</label>
                  <input type="date" value={draft.recognitionDate} onChange={(e) => setDraft((d) => ({ ...d, recognitionDate: e.target.value }))}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">請求書番号</label>
                  <input value={draft.invoiceNo} onChange={(e) => setDraft((d) => ({ ...d, invoiceNo: e.target.value }))}
                    placeholder={`INV-${(draft.recognitionDate || "").slice(0, 7).replace("-", "")}-…`} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-muted">会社名 *</label>
                <div className="relative">
                  <input value={draft.customer}
                    onChange={(e) => { setDraft((d) => ({ ...d, customer: e.target.value })); setCustOpen(true); }}
                    onFocus={() => setCustOpen(true)}
                    placeholder="会社名を入力または選択" autoComplete="off"
                    className="w-full rounded-xl border border-line px-3 py-2 pr-9 text-sm outline-none focus:border-brand-500" />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><Ic n="right" size={14} className="rotate-90" /></span>
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
              {/* 担当 / 請求金額 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">担当</label>
                  <select value={draft.owner} onChange={(e) => setDraft((d) => ({ ...d, owner: e.target.value }))} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500">
                    {S.owners.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between gap-1">
                    <label className="text-xs font-bold text-muted">請求金額 *</label>
                    <div className="flex overflow-hidden rounded-lg border border-line">
                      <button onClick={() => setDraft((d) => ({ ...d, taxMode: "ex" }))} className={`px-1.5 py-0.5 text-[10px] font-bold ${draft.taxMode === "ex" ? "bg-brand-600 text-white" : "bg-white text-muted"}`}>税抜</button>
                      <button onClick={() => setDraft((d) => ({ ...d, taxMode: "in" }))} className={`px-1.5 py-0.5 text-[10px] font-bold ${draft.taxMode === "in" ? "bg-brand-600 text-white" : "bg-white text-muted"}`}>税込</button>
                    </div>
                  </div>
                  <input type="number" value={draft.amount} onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                    placeholder={draft.taxMode === "in" ? "税込金額" : "税抜金額"} className="w-full rounded-xl border border-line px-3 py-2 text-right text-sm font-semibold outline-none focus:border-brand-500" />
                </div>
              </div>
              <p className="text-right text-[11px] text-slate-400">
                税抜 <b className="text-ink">{yen(liveEx)}</b> ／ 税{S.taxRate}% ／ <b className="text-brand-700">税込 {yen(liveIn)}</b>
              </p>
              {/* メモ */}
              <div>
                <label className="mb-1 block text-xs font-bold text-muted">メモ（任意）</label>
                <input value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} placeholder="備考・補足など" className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowNew(false)} className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-muted hover:bg-surface">キャンセル</button>
              <button onClick={addLine} className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white hover:bg-brand-700">登録する</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 編集モーダル ===== */}
      {editFor && (
        <EditModal line={editFor} owners={S.owners} categories={S.categories} taxRate={S.taxRate}
          onClose={() => setEditFor(null)} onSave={(e) => saveEdit(editFor.id, e)} />
      )}

      {/* ===== 入金モーダル ===== */}
      {payFor && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setPayFor(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="mb-1 text-base font-black text-ink">入金を記録</h3>
            <p className="mb-4 text-xs text-muted">{payFor.customer} — {payFor.invoiceNo}</p>
            <div className="mb-3 rounded-xl bg-surface px-4 py-3 text-sm">
              <div className="flex justify-between"><span className="text-muted">請求総額(税込)</span><span className="font-bold">{yen(taxIn(payFor))}</span></div>
              <div className="flex justify-between"><span className="text-muted">入金済</span><span className="font-bold text-emerald-600">{yen(paidOf(payFor))}</span></div>
              <div className="mt-1.5 flex justify-between border-t border-line pt-1.5"><span className="font-bold text-ink">残高</span><span className="font-black text-ink">{yen(remainOf(payFor))}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-muted">入金日 *</label>
                <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-muted">入金額（円）*</label>
                <input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="w-full rounded-xl border border-line px-3 py-2 text-right text-sm font-semibold outline-none focus:border-brand-500" />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-muted">入金方法</label>
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as PayMethod)} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500">
                  {PAY_METHODS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between gap-1">
                  <label className="text-xs font-bold text-muted">手数料（当社負担）</label>
                  <button type="button" onClick={() => setPayFee(String(Math.max(0, remainOf(payFor) - (Number(payAmount) || 0))))}
                    className="text-[10px] font-bold text-brand-600 hover:underline">不足分を手数料に</button>
                </div>
                <input type="number" value={payFee} onChange={(e) => setPayFee(e.target.value)} placeholder="0"
                  className="w-full rounded-xl border border-line px-3 py-2 text-right text-sm outline-none focus:border-brand-500" />
              </div>
            </div>
            <p className="mt-1 text-[10px] text-slate-400">お客様が振込手数料を差し引いた場合、「入金額」に実際に入金された額を、「手数料（当社負担）」に差し引かれた額を入力すると、合算で残高が消し込まれます。<br />例：請求 ¥100,000 → 入金 ¥99,500 ＋ 手数料 ¥500 ＝ 完了。</p>
            {(() => {
              const rem = remainOf(payFor); const amt = Number(payAmount) || 0; const fee = Number(payFee) || 0; const settle = amt + fee; const after = rem - settle;
              return (
                <div className="mt-2 rounded-xl bg-surface px-3 py-2 text-[11px]">
                  <div className="flex justify-between text-muted"><span>消込合計（入金＋手数料）</span><span className="font-bold text-ink">{yen(amt)} ＋ {yen(fee)} ＝ {yen(settle)}</span></div>
                  <div className="mt-1 flex justify-between border-t border-line pt-1">
                    <span className="font-bold text-ink">この入金後の残高</span>
                    <span className={`font-black ${after === 0 ? "text-emerald-600" : after < 0 ? "text-violet-600" : "text-red-600"}`}>{after < 0 ? `過入金 +${yen(-after)}` : after > 0 ? `不足 -${yen(after)}` : "¥0（完了）"}</span>
                  </div>
                </div>
              );
            })()}
            <label className="mb-1 mt-2 block text-xs font-bold text-muted">メモ（任意）</label>
            <input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="備考・補足など"
              className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
            <p className="mt-2 text-[10px] text-slate-400">操作者：{op} ・ 登録日時：{fmtDT(nowIso())}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setPayFor(null)} className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-muted hover:bg-surface">キャンセル</button>
              <button onClick={addPayment} className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700">記録する</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 履歴モーダル ===== */}
      {histFor && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setHistFor(null)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div><h3 className="text-base font-black text-ink">操作履歴</h3><p className="text-[11px] text-muted">{histFor.customer} — {histFor.invoiceNo}</p></div>
              <button onClick={() => setHistFor(null)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface"><Ic n="x" size={16} /></button>
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

      {/* ===== 会社詳細モーダル ===== */}
      {detail && detailData && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/50 backdrop-blur-sm" onClick={() => setDetail(null)} />
          <div className="relative flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            {/* ヘッダー */}
            <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-brand-600 text-base font-black text-white">{detail.charAt(0)}</span>
                <div>
                  <h3 className="text-lg font-black tracking-tight text-ink">{detail}</h3>
                  <p className="text-[11px] text-muted">{fiscalLabel(fy)} ・ 取引 {detailData.ls.length}件</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => openNew(detail)} className="flex items-center gap-1 rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700"><Ic n="plus" size={14} />月を追加</button>
                <button onClick={printCustomer} className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-muted hover:border-brand-500 hover:text-brand-600" title="印刷 / PDF"><Ic n="printer" size={16} /></button>
                <button onClick={() => setDetail(null)} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface" title="閉じる"><Ic n="x" size={16} /></button>
              </div>
            </div>

            <div className="space-y-6 overflow-auto p-6">
              {/* サマリー */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {[["売上(税込)", yen(detailData.billed), "text-ink"], ["入金済", yen(detailData.paid), detailData.remain > 0 ? "text-red-600" : detailData.over > 0 ? "text-violet-600" : detailData.paid ? "text-emerald-600" : "text-slate-300"], [detailData.over > 0 ? "過入金" : "未回収残高", detailData.over > 0 ? `+${yen(detailData.over)}` : detailData.remain > 0 ? `-${yen(detailData.remain)}` : "¥0", detailData.over > 0 ? "text-violet-600" : detailData.remain > 0 ? "text-red-600" : "text-emerald-600"], ["うち延滞", detailData.overdue > 0 ? `-${yen(detailData.overdue)}` : "¥0", detailData.overdue > 0 ? "text-red-600" : "text-slate-300"]].map(([l, v, c]) => (
                  <div key={l} className="rounded-2xl border border-line bg-surface/60 px-4 py-3"><p className="text-[11px] font-bold text-muted">{l}</p><p className={`mt-1 text-lg font-black tabular-nums ${c}`}>{v}</p></div>
                ))}
              </div>

              {/* 売上履歴（月ごと・編集/入金） */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-sm font-black text-ink"><Ic n="out" size={15} className="text-brand-600" />売上履歴</p>
                  <button onClick={() => openNew(detail)} className="flex items-center gap-1 rounded-lg border border-dashed border-brand-300 px-2.5 py-1 text-[11px] font-bold text-brand-600 hover:bg-brand-50"><Ic n="plus" size={13} />月を追加</button>
                </div>
                <div className="overflow-x-auto rounded-2xl border border-line">
                  <table className="w-full min-w-[820px] text-sm">
                    <thead><tr className="border-b border-line bg-surface text-left text-[11px] text-muted"><th className="px-4 py-2.5 font-bold">売上計上日</th><th className="px-2 py-2.5 font-bold">種別</th><th className="px-2 py-2.5 font-bold">区分</th><th className="px-2 py-2.5 font-bold">請求書番号</th><th className="px-2 py-2.5 text-right font-bold">請求金額</th><th className="px-2 py-2.5 text-right font-bold">入金済</th><th className="px-2 py-2.5 text-right font-bold">残高</th><th className="px-2 py-2.5 text-center font-bold">入金状況</th><th className="px-2 py-2.5 font-bold">担当</th><th className="sticky right-0 bg-surface px-4 py-2.5 text-right font-bold">操作</th></tr></thead>
                    <tbody className="divide-y divide-line">
                      {detailData.ls.map((l) => { const st = statusOf(l, today); const mc = moneyCells(l); return (
                        <tr key={l.id} className="hover:bg-surface/60">
                          <td className="px-4 py-2.5 font-bold text-ink">{l.recognitionDate}</td>
                          <td className="px-2 py-2.5"><span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold text-muted">{l.recurring ? "定期" : "不定期"}</span></td>
                          <td className="px-2 py-2.5"><span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700">{l.category}</span></td>
                          <td className="px-2 py-2.5 font-mono text-[10px] text-slate-400">{l.invoiceNo}</td>
                          <td className="px-2 py-2.5 text-right font-bold tabular-nums">{yen(taxIn(l))}</td>
                          <td className={`px-2 py-2.5 text-right tabular-nums font-bold ${mc.paidClass}`}>{mc.paidText}</td>
                          <td className={`px-2 py-2.5 text-right font-black tabular-nums ${mc.balClass}`}>{mc.balText}</td>
                          <td className="px-2 py-2.5 text-center"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_TONE[st]}`}>{STATUS_LABEL[st]}</span></td>
                          <td className="px-2 py-2.5"><span className="text-[11px] text-muted">{l.owner}</span></td>
                          <td className="sticky right-0 bg-white px-4 py-2.5 text-right shadow-[-8px_0_10px_-8px_rgba(15,23,42,0.15)]">
                            <div className="flex justify-end gap-1">
                              <button onClick={() => openPay(l)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-black text-white shadow-sm hover:bg-emerald-700">入金</button>
                              <button onClick={() => setPaysForId(l.id)} className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-muted hover:border-brand-500 hover:text-brand-600" title="入金明細・修正"><Ic n="coins" size={13} /></button>
                              <button onClick={() => setEditFor(l)} className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-muted hover:border-brand-500 hover:text-brand-600" title="売上を編集"><Ic n="pencil" size={13} /></button>
                              <button onClick={() => setHistFor(l)} className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-muted hover:border-brand-500 hover:text-brand-600" title="変更履歴"><Ic n="clock" size={13} /></button>
                            </div>
                          </td>
                        </tr>
                      ); })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 入出金履歴 */}
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-black text-ink"><Ic n="in" size={15} className="text-emerald-600" />入出金履歴</p>
                  <span className="text-[11px] text-muted">各入金は「修正」で編集・「削除」で取消できます</span>
                </div>
                {detailData.pays.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-xs text-muted">入金の記録はまだありません。</p>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-line">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-line bg-surface text-left text-[11px] text-muted"><th className="px-4 py-2.5 font-bold">入金日</th><th className="px-2 py-2.5 font-bold">請求書番号</th><th className="px-2 py-2.5 font-bold">入金方法</th><th className="px-2 py-2.5 text-right font-bold">入金額</th><th className="px-2 py-2.5 text-right font-bold">手数料(当社負担)</th><th className="px-2 py-2.5 font-bold">操作者</th><th className="px-2 py-2.5 font-bold">メモ</th><th className="px-4 py-2.5 text-right font-bold">操作</th></tr></thead>
                      <tbody className="divide-y divide-line">
                        {detailData.pays.map((p, i) => (
                          <tr key={i} className="hover:bg-surface/60">
                            <td className="px-4 py-2.5 font-semibold text-ink">{p.date}</td>
                            <td className="px-2 py-2.5 font-mono text-[10px] text-slate-400">{p.invoiceNo}</td>
                            <td className="px-2 py-2.5 text-xs text-muted">{p.method || "—"}</td>
                            <td className={`px-2 py-2.5 text-right font-black tabular-nums ${p.amount < 0 ? "text-violet-600" : "text-emerald-600"}`}>
                              <span className="inline-flex items-center justify-end gap-1"><Ic n={p.amount < 0 ? "out" : "in"} size={13} />{yen(p.amount)}</span>
                            </td>
                            <td className={`px-2 py-2.5 text-right tabular-nums ${p.fee ? "text-amber-600" : "text-slate-300"}`}>{p.fee ? yen(p.fee) : "—"}</td>
                            <td className="px-2 py-2.5 text-xs text-muted">{p.by}</td>
                            <td className="px-2 py-2.5 text-xs text-muted">{p.note || "—"}</td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex justify-end gap-1.5">
                                <button onClick={() => { const ln = store.lines.find((x) => x.id === p.lineId); if (ln) setEditPay({ line: ln, pi: p.pi }); }} className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-[11px] font-bold text-muted hover:border-brand-500 hover:text-brand-600"><Ic n="pencil" size={12} />修正</button>
                                <button onClick={() => deletePay(p.lineId, p.pi, p.amount)} className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-[11px] font-bold text-muted hover:border-rose-400 hover:text-rose-500"><Ic n="trash" size={12} />削除</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 翌月請求の対応 */}
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink"><Ic n="alert" size={15} className="text-amber-500" />翌月請求の対応</p>
                {detailData.remain === 0 && detailData.over === 0 ? (
                  <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-4 text-sm font-bold text-emerald-600"><Ic n="check" size={16} />未回収なし。翌月の特別な対応は不要です。</p>
                ) : (
                  <div className="space-y-2.5 rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
                    {detailData.remain > 0 && (
                      <>
                        <p className="text-sm font-bold text-red-700">未回収 <span className="font-black">-{yen(detailData.remain)}</span>（{detailData.owingLines.length}件）— 翌月（{nextYm}）の請求書へ繰り越すか、督促してください。</p>
                        <ul className="space-y-1.5">
                          {detailData.owingLines.map((l) => { const st = statusOf(l, today); return (
                            <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs">
                              <span className="font-bold text-ink">{l.recognitionDate}</span>
                              <span className="font-mono text-[10px] text-slate-400">{l.invoiceNo}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_TONE[st]}`}>{STATUS_LABEL[st]}{st === "OVERDUE" ? `・${daysLate(l, today)}日超過` : ""}</span>
                              <span className="ml-auto font-black text-red-600">-{yen(remainOf(l))}</span>
                              <button onClick={() => openPay(l)} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700">入金</button>
                            </li>
                          ); })}
                        </ul>
                      </>
                    )}
                    {detailData.over > 0 && (
                      <p className="text-sm font-bold text-violet-700">過入金 <span className="font-black">+{yen(detailData.over)}</span> — お客様が請求額より多く入金しています。翌月（{nextYm}）の請求で相殺、または返金・調整してください。</p>
                    )}
                    <div className="pt-1">
                      <button onClick={() => openNew(detail)} className="inline-flex items-center gap-1 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700"><Ic n="plus" size={13} />翌月分の請求を登録</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== 請求書ごとの入金明細モーダル ===== */}
      {paysLine && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setPaysForId(null)} />
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-ink">入金明細・修正</h3>
                <p className="text-[11px] text-muted">{paysLine.customer} — {paysLine.invoiceNo}</p>
              </div>
              <button onClick={() => setPaysForId(null)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface"><Ic n="x" size={16} /></button>
            </div>
            <div className="mb-3 grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-xl bg-surface px-3 py-2"><p className="text-[10px] font-bold text-muted">請求(税込)</p><p className="font-black text-ink">{yen(taxIn(paysLine))}</p></div>
              <div className="rounded-xl bg-surface px-3 py-2"><p className="text-[10px] font-bold text-muted">入金済</p><p className={`font-black ${moneyCells(paysLine).paidClass}`}>{yen(paidOf(paysLine))}</p></div>
              <div className="rounded-xl bg-surface px-3 py-2"><p className="text-[10px] font-bold text-muted">残高</p><p className={`font-black ${moneyCells(paysLine).balClass}`}>{moneyCells(paysLine).balText}</p></div>
            </div>
            <div className="max-h-[46vh] space-y-1.5 overflow-auto">
              {paysLine.payments.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-xs text-muted">入金の記録はまだありません。「＋ 入金を追加」から登録してください。</p>
              ) : (
                paysLine.payments.map((p, pi) => (
                  <div key={pi} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs">
                    <span className="font-bold text-ink">{p.date}</span>
                    <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold text-muted">{p.method || "—"}</span>
                    {p.fee ? <span className="text-[10px] text-amber-600">手数料 {yen(p.fee)}</span> : null}
                    {p.note ? <span className="truncate text-[10px] text-muted">{p.note}</span> : null}
                    <span className={`ml-auto font-black tabular-nums ${p.amount < 0 ? "text-violet-600" : "text-emerald-600"}`}>{yen(p.amount)}</span>
                    <button onClick={() => setEditPay({ line: paysLine, pi })} className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[10px] font-bold text-muted hover:border-brand-500 hover:text-brand-600"><Ic n="pencil" size={11} />修正</button>
                    <button onClick={() => deletePay(paysLine.id, pi, p.amount)} className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[10px] font-bold text-muted hover:border-rose-400 hover:text-rose-500"><Ic n="trash" size={11} />削除</button>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {balanceOf(paysLine) < 0 && <button onClick={() => adjustOverpay(paysLine)} className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-bold text-white hover:bg-violet-700">過入金を調整</button>}
              <button onClick={() => openPay(paysLine)} className="flex items-center gap-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"><Ic n="plus" size={14} />入金を追加</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 入金修正モーダル ===== */}
      {editPay && (
        <PayEditModal line={editPay.line} pi={editPay.pi} methods={PAY_METHODS}
          onClose={() => setEditPay(null)}
          onSave={(np) => savePayEdit(editPay.line.id, editPay.pi, np)}
          onDelete={() => deletePay(editPay.line.id, editPay.pi, editPay.line.payments[editPay.pi].amount)} />
      )}

      {/* ===== 設定モーダル ===== */}
      {showSettings && (
        <SettingsModal store={store} setStore={setStore} onClose={() => setShowSettings(false)}
          onCsv={exportCsv} onPrint={printMonth} onReset={resetSample} />
      )}
    </div>
  );
}

/* ================= 編集モーダル ================= */
function EditModal({ line, owners, categories, taxRate, onClose, onSave }: {
  line: RevLine; owners: string[]; categories: string[]; taxRate: number;
  onClose: () => void; onSave: (e: EDraft) => void;
}) {
  const [e, setE] = useState<EDraft>({
    customer: line.customer, owner: line.owner, category: line.category,
    amount: String(line.amount || ""), invoiceNo: line.invoiceNo, dueDate: line.dueDate, status: line.status,
    recognitionDate: line.recognitionDate, note: line.note || "",
  });
  const ex = Number(e.amount) || 0;
  const inc = Math.round(ex * (1 + taxRate / 100));
  const catOptions = categories.includes(e.category) ? categories : [e.category, ...categories];

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div><h3 className="text-base font-black text-ink">明細を編集</h3><p className="text-[11px] text-muted">{line.recurring ? "定期" : "不定期"} ・ {line.invoiceNo}</p></div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface"><Ic n="x" size={16} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-muted">会社名 *</label>
            <input value={e.customer} onChange={(ev) => setE((d) => ({ ...d, customer: ev.target.value }))} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-muted">担当</label>
              <select value={e.owner} onChange={(ev) => setE((d) => ({ ...d, owner: ev.target.value }))} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500">
                {owners.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-muted">区分</label>
              <select value={e.category} onChange={(ev) => setE((d) => ({ ...d, category: ev.target.value }))} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500">
                {catOptions.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-muted">売上計上日 *</label>
              <input type="date" value={e.recognitionDate} onChange={(ev) => setE((d) => ({ ...d, recognitionDate: ev.target.value }))} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-muted">請求書番号</label>
              <input value={e.invoiceNo} onChange={(ev) => setE((d) => ({ ...d, invoiceNo: ev.target.value }))} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-muted">売上（税抜）*</label>
            <input type="number" value={e.amount} onChange={(ev) => setE((d) => ({ ...d, amount: ev.target.value }))} className="w-full rounded-xl border border-line px-3 py-2 text-right text-sm font-semibold outline-none focus:border-brand-500" />
            <p className="mt-1 text-right text-[11px] text-slate-400">税込 <b className="text-brand-700">{yen(inc)}</b></p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-muted">入金期日</label>
              <input type="date" value={e.dueDate} onChange={(ev) => setE((d) => ({ ...d, dueDate: ev.target.value }))} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-muted">状態</label>
              <select value={e.status} onChange={(ev) => setE((d) => ({ ...d, status: ev.target.value as "forecast" | "confirmed" }))} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500">
                <option value="forecast">予定（見込）</option>
                <option value="confirmed">確定</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-muted">メモ（任意）</label>
            <input value={e.note} onChange={(ev) => setE((d) => ({ ...d, note: ev.target.value }))} placeholder="備考・補足など" className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-muted hover:bg-surface">キャンセル</button>
          <button onClick={() => onSave(e)} className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white hover:bg-brand-700">保存する</button>
        </div>
      </div>
    </div>
  );
}

/* ================= 入金修正モーダル ================= */
function PayEditModal({ line, pi, methods, onClose, onSave, onDelete }: {
  line: RevLine; pi: number; methods: PayMethod[];
  onClose: () => void; onSave: (p: Payment) => void; onDelete: () => void;
}) {
  const p = line.payments[pi];
  const [d, setD] = useState({ date: p.date, amount: String(p.amount), fee: String(p.fee || ""), method: (p.method || "銀行振込") as PayMethod, note: p.note || "" });
  function save() {
    const amount = Number(d.amount) || 0;
    const fee = Number(d.fee) || 0;
    if (amount === 0) { alert("入金額を入力してください。"); return; }
    if (!d.date) { alert("入金日を入力してください。"); return; }
    onSave({ ...p, date: d.date, amount, fee: fee || undefined, method: d.method, note: d.note.trim() || undefined });
  }
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-base font-black text-ink">入金を修正</h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface"><Ic n="x" size={16} /></button>
        </div>
        <p className="mb-3 text-xs text-muted">{line.customer} — {line.invoiceNo}</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-muted">入金日 *</label>
            <input type="date" value={d.date} onChange={(e) => setD((s) => ({ ...s, date: e.target.value }))} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-muted">入金額（円）*</label>
            <input type="number" value={d.amount} onChange={(e) => setD((s) => ({ ...s, amount: e.target.value }))} className="w-full rounded-xl border border-line px-3 py-2 text-right text-sm font-semibold outline-none focus:border-brand-500" />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-muted">入金方法</label>
            <select value={d.method} onChange={(e) => setD((s) => ({ ...s, method: e.target.value as PayMethod }))} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500">
              {methods.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-muted">手数料（当社負担）</label>
            <input type="number" value={d.fee} onChange={(e) => setD((s) => ({ ...s, fee: e.target.value }))} placeholder="0" className="w-full rounded-xl border border-line px-3 py-2 text-right text-sm outline-none focus:border-brand-500" />
          </div>
        </div>
        <label className="mb-1 mt-3 block text-xs font-bold text-muted">メモ（任意）</label>
        <input value={d.note} onChange={(e) => setD((s) => ({ ...s, note: e.target.value }))} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
        {(() => {
          const otherSettle = line.payments.filter((_, i) => i !== pi).reduce((t, x) => t + x.amount + (x.fee || 0), 0);
          const after = taxIn(line) - otherSettle - (Number(d.amount) || 0) - (Number(d.fee) || 0);
          return (
            <p className={`mt-2 text-right text-[11px] font-black ${after === 0 ? "text-emerald-600" : after < 0 ? "text-violet-600" : "text-red-600"}`}>
              修正後の残高：{after < 0 ? `過入金 +${yen(-after)}` : after > 0 ? `不足 -${yen(after)}` : "¥0（完了）"}
            </p>
          );
        })()}
        <div className="mt-4 flex items-center justify-between gap-2">
          <button onClick={onDelete} className="flex items-center gap-1 rounded-xl border border-rose-200 px-3 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50"><Ic n="trash" size={14} />削除</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-muted hover:bg-surface">キャンセル</button>
            <button onClick={save} className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white hover:bg-brand-700">保存する</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= 設定モーダル ================= */
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
          {it}<button onClick={() => onRemove(it)} className="text-slate-400 hover:text-rose-500"><Ic n="x" size={12} /></button>
        </span>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="flex items-center gap-1.5 text-base font-black text-ink"><Ic n="gear" size={16} />設定</h3>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface"><Ic n="x" size={16} /></button>
        </div>
        <div className="space-y-5 overflow-auto p-5">
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
          <div>
            <p className="mb-2 text-sm font-black text-ink">担当マスタ</p>
            {chipList(S.owners, (v) => setS({ owners: S.owners.filter((x) => x !== v) }))}
            <div className="mt-2 flex gap-1.5">
              <input value={newOwner} onChange={(e) => setNewOwner(e.target.value)} placeholder="担当を追加" className="w-40 rounded-lg border border-dashed border-line px-2.5 py-1.5 text-xs outline-none focus:border-brand-500" />
              <button onClick={() => { if (newOwner.trim() && !S.owners.includes(newOwner.trim())) setS({ owners: [...S.owners, newOwner.trim()] }); setNewOwner(""); }} className="rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-bold text-white">追加</button>
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-black text-ink">区分マスタ</p>
            {chipList(S.categories, (v) => setS({ categories: S.categories.filter((x) => x !== v) }))}
            <div className="mt-2 flex gap-1.5">
              <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="区分を追加" className="w-40 rounded-lg border border-dashed border-line px-2.5 py-1.5 text-xs outline-none focus:border-brand-500" />
              <button onClick={() => { if (newCat.trim() && !S.categories.includes(newCat.trim())) setS({ categories: [...S.categories, newCat.trim()] }); setNewCat(""); }} className="rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-bold text-white">追加</button>
            </div>
          </div>
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
