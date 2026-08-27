"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Panel from "@/components/ui/Panel";
import Icon from "@/components/Icon";
import {
  STORAGE_KEY, OWNERS, CATEGORIES, sampleLines, aggregate, grossOf, expandRecurring,
  readBudgetSeries, uid, yen, type RevLine,
} from "@/lib/uriage";
import { fiscalMonths, fiscalLabel, fiscalYearOf, fiscalMonthIndex, FY_MONTH_LABELS, deltaPct } from "@/lib/fiscal";

const emptyDraft = { customer: "", owner: OWNERS[0], category: CATEGORIES[0], headcount: "", amount: "", cost: "", recurring: true };

function pct(cur: number, base: number): string {
  const d = deltaPct(cur, base);
  return d === null ? "—" : `${d >= 0 ? "+" : ""}${d.toFixed(0)}%`;
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
    td.r,th.r{text-align:right}.tot{font-weight:800;background:#f8fafc}
  </style></head><body>${body}</body></html>`);
  w.document.close(); w.focus();
  setTimeout(() => w.print(), 300);
}

export default function UriageManager() {
  const [lines, setLines] = useState<RevLine[]>([]);
  const [fy, setFy] = useState(2025);
  const [mi, setMi] = useState(0);          // 会計月インデックス (0=8月)
  const [ownerF, setOwnerF] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [customerNames, setCustomerNames] = useState<string[]>([]);
  const ready = useRef(false);

  useEffect(() => {
    const iso = new Date().toISOString().slice(0, 10);
    setFy(fiscalYearOf(iso));
    setMi(fiscalMonthIndex(iso));
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      setLines(raw ? (JSON.parse(raw) as RevLine[]) : sampleLines());
    } catch { setLines(sampleLines()); }
    // 顧客管理から会社名を候補として取得
    try {
      const raw = window.localStorage.getItem("bl_customers_v1");
      if (raw) setCustomerNames((JSON.parse(raw) as { name: string }[]).map((c) => c.name));
    } catch { /* ignore */ }
    ready.current = true;
  }, []);
  useEffect(() => {
    if (!ready.current) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines)); } catch { /* ignore */ }
  }, [lines]);

  const months = useMemo(() => fiscalMonths(fy), [fy]);
  const prevMonths = useMemo(() => fiscalMonths(fy - 1), [fy]);
  const ym = months[mi];
  const budget = useMemo(() => readBudgetSeries(fy), [fy, lines]); // lines依存 → 予実変更時に更新

  const monthAggs = useMemo(() => months.map((m) => aggregate(lines.filter((l) => l.ym === m))), [lines, months]);
  const prevAggs = useMemo(() => prevMonths.map((m) => aggregate(lines.filter((l) => l.ym === m))), [lines, prevMonths]);
  const stripMax = Math.max(1, ...monthAggs.map((a) => a.amount), ...budget);

  const sumTo = (arr: number[], i: number) => arr.slice(0, i + 1).reduce((t, v) => t + v, 0);
  const cur = monthAggs[mi], prev = prevAggs[mi];
  const budCum = sumTo(budget, mi);
  const confCum = monthAggs.slice(0, mi + 1).reduce((t, a) => t + a.confirmed, 0);
  const seenCum = monthAggs.slice(0, mi + 1).reduce((t, a) => t + a.amount, 0);
  const prevSeenCum = prevAggs.slice(0, mi + 1).reduce((t, a) => t + a.amount, 0);

  const summary = [
    { label: "当月", bud: budget[mi], conf: cur.confirmed, seen: cur.amount, gross: cur.gross, hc: cur.headcount, prevSeen: prev.amount },
    { label: "累計", bud: budCum, conf: confCum, seen: seenCum, gross: monthAggs.slice(0, mi + 1).reduce((t, a) => t + a.gross, 0), hc: 0, prevSeen: prevSeenCum },
  ];

  // 表示中の月の明細一覧。
  const rows = useMemo(() => lines
    .filter((l) => l.ym === ym)
    .filter((l) => !ownerF || l.owner === ownerF)
    .sort((a, b) => a.owner.localeCompare(b.owner) || b.amount - a.amount),
  [lines, ym, ownerF]);
  const rowAgg = aggregate(rows);

  const names = useMemo(() => Array.from(new Set([...customerNames, ...lines.map((l) => l.customer)])).sort(), [customerNames, lines]);

  // ===== 操作 =====
  function shift(delta: number) {
    let f = fy, m = mi + delta;
    if (m > 11) { f++; m = 0; } else if (m < 0) { f--; m = 11; }
    setFy(f); setMi(m);
  }
  function updateLine(id: string, patch: Partial<RevLine>) {
    setLines((prev) => prev.map((l) => l.id === id ? { ...l, ...patch } : l));
  }
  function toggleStatus(id: string) {
    setLines((prev) => prev.map((l) => l.id === id ? { ...l, status: l.status === "confirmed" ? "forecast" : "confirmed" } : l));
  }
  function confirmMonth() {
    if (!confirm(`${ym} の全明細を「確定」にしますか？`)) return;
    setLines((prev) => prev.map((l) => l.ym === ym ? { ...l, status: "confirmed" } : l));
  }
  function forecastMonth() {
    setLines((prev) => prev.map((l) => l.ym === ym ? { ...l, status: "forecast" } : l));
  }
  function removeLine(l: RevLine) {
    if (!confirm("この明細を削除しますか？")) return;
    if (l.recurring && l.seriesId) {
      const all = confirm("定期明細です。\n［OK］今月以降の同系列をすべて削除\n［キャンセル］今月のみ削除");
      if (all) { setLines((prev) => prev.filter((x) => !(x.seriesId === l.seriesId && x.ym >= l.ym))); return; }
    }
    setLines((prev) => prev.filter((x) => x.id !== l.id));
  }
  function addLine() {
    if (!draft.customer.trim() || !draft.amount) { alert("会社名・売上は必須です。"); return; }
    const base = {
      customer: draft.customer.trim(), owner: draft.owner, category: draft.category,
      headcount: Number(draft.headcount) || 0, amount: Number(draft.amount) || 0, cost: Number(draft.cost) || 0,
      recurring: draft.recurring, status: "forecast" as const,
    };
    if (draft.recurring) {
      setLines((prev) => [...prev, ...expandRecurring(base, ym)]);
    } else {
      setLines((prev) => [...prev, { ...base, id: uid(), ym }]);
    }
    setDraft(emptyDraft); setShowNew(false);
  }
  function copyPrevMonth() {
    const pYm = mi > 0 ? months[mi - 1] : prevMonths[11];
    const prevRows = lines.filter((l) => l.ym === pYm);
    const existing = new Set(rows.map((r) => r.customer + "|" + r.category));
    const copies = prevRows
      .filter((r) => !existing.has(r.customer + "|" + r.category))
      .map((r) => ({ ...r, id: uid(), ym, recurring: false, status: "forecast" as const, seriesId: undefined }));
    if (copies.length === 0) { alert("前月からコピーする新規明細はありません。"); return; }
    setLines((prev) => [...prev, ...copies]);
  }
  function resetSample() {
    if (!confirm("サンプルデータに戻します。よろしいですか？")) return;
    setLines(sampleLines());
  }
  function exportCsv() {
    const head = ["年月", "会社名", "担当", "区分", "人数", "売上", "粗利", "定期", "状態"];
    const data = rows.map((r) => [r.ym, r.customer, r.owner, r.category, r.headcount, r.amount, grossOf(r), r.recurring ? "定期" : "不定期", r.status === "confirmed" ? "確定" : "予定"]);
    const csv = [head, ...data].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `uriage_${ym}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }
  function printMonth() {
    const body = `<h1>売上明細 — ${ym}（${fiscalLabel(fy)}）</h1>
      <div class="sub">予算 ${yen(budget[mi])} ／ 確定 ${yen(cur.confirmed)} ／ 見込 ${yen(cur.amount)} ／ 達成率 ${budget[mi] ? Math.round((cur.amount / budget[mi]) * 100) : 0}% ／ 粗利 ${yen(cur.gross)}</div>
      <table><tr><th>会社名</th><th>担当</th><th>区分</th><th class="r">人数</th><th class="r">売上</th><th class="r">粗利</th><th>定期</th><th>状態</th></tr>
      ${rows.map((r) => `<tr><td>${r.customer}</td><td>${r.owner}</td><td>${r.category}</td><td class="r">${r.headcount}</td><td class="r">${yen(r.amount)}</td><td class="r">${yen(grossOf(r))}</td><td>${r.recurring ? "定期" : "不定期"}</td><td>${r.status === "confirmed" ? "確定" : "予定"}</td></tr>`).join("")}
      <tr class="tot"><td colspan="3">合計（${rows.length}件）</td><td class="r">${rowAgg.headcount}</td><td class="r">${yen(rowAgg.amount)}</td><td class="r">${yen(rowAgg.gross)}</td><td></td><td></td></tr></table>`;
    openPrint(`売上明細_${ym}`, body);
  }

  return (
    <div className="space-y-5">
      {/* ===== 月ナビゲーション ===== */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-white p-3 shadow-card">
        <button onClick={() => shift(-1)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-muted hover:border-brand-500 hover:text-brand-600" aria-label="前月"><Icon name="chevronRight" size={14} className="rotate-180" /></button>
        <div className="rounded-xl bg-brand-600 px-4 py-2 text-center text-white">
          <span className="text-sm font-black">{ym.replace("-", "年")}月</span>
        </div>
        <button onClick={() => shift(1)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-muted hover:border-brand-500 hover:text-brand-600" aria-label="翌月"><Icon name="chevronRight" size={14} /></button>
        <span className="ml-1 text-xs font-bold text-muted">{fiscalLabel(fy)}</span>

        <select value={ownerF} onChange={(e) => setOwnerF(e.target.value)}
          className="ml-3 rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-brand-500">
          <option value="">担当：すべて</option>
          {OWNERS.map((o) => <option key={o}>{o}</option>)}
        </select>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button onClick={copyPrevMonth} className="rounded-xl border border-line px-3 py-2 text-xs font-bold text-muted hover:border-brand-500 hover:text-brand-600">前月コピー</button>
          <button onClick={exportCsv} className="rounded-xl border border-line px-3 py-2 text-xs font-bold text-muted hover:border-brand-500 hover:text-brand-600">CSV</button>
          <button onClick={printMonth} className="rounded-xl border border-line px-3 py-2 text-xs font-bold text-muted hover:border-brand-500 hover:text-brand-600">印刷 / PDF（A4）</button>
          <button onClick={resetSample} className="rounded-xl border border-line px-3 py-2 text-xs font-bold text-muted hover:border-rose-400 hover:text-rose-500">サンプルに戻す</button>
        </div>
      </div>

      {/* ===== サマリー 当月 + 累計（ミーティング報告書形式） ===== */}
      <Panel icon="chart" title={`サマリー（${ym.replace("-", "年")}月）`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b-2 border-line text-[11px] text-muted">
                <th className="py-2 pr-2 text-left font-bold">区分</th>
                <th className="py-2 text-right font-bold">予算</th>
                <th className="py-2 text-right font-bold">確定売上</th>
                <th className="py-2 text-right font-bold">見込売上</th>
                <th className="py-2 text-right font-bold">達成率</th>
                <th className="py-2 text-right font-bold">対前年</th>
                <th className="py-2 text-right font-bold">粗利</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => {
                const rate = s.bud ? Math.round((s.seen / s.bud) * 100) : 0;
                return (
                  <tr key={s.label} className={`border-b border-line/60 ${s.label === "累計" ? "bg-surface font-black" : ""}`}>
                    <td className="py-2.5 pr-2 text-left font-bold text-ink">{s.label}</td>
                    <td className="py-2.5 text-right tabular-nums text-muted">{yen(s.bud)}</td>
                    <td className="py-2.5 text-right font-black tabular-nums text-emerald-600">{yen(s.conf)}</td>
                    <td className="py-2.5 text-right font-black tabular-nums text-ink">{yen(s.seen)}</td>
                    <td className={`py-2.5 text-right font-black tabular-nums ${rate >= 100 ? "text-emerald-600" : rate >= 80 ? "text-amber-600" : "text-rose-600"}`}>{s.bud ? rate + "%" : "—"}</td>
                    <td className={`py-2.5 text-right font-bold tabular-nums ${deltaPct(s.seen, s.prevSeen) !== null && s.seen >= s.prevSeen ? "text-emerald-600" : "text-rose-600"}`}>{pct(s.seen, s.prevSeen)}</td>
                    <td className="py-2.5 text-right tabular-nums text-ink">{yen(s.gross)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-slate-400">予算は「予実管理」から自動連携 ・ 見込売上＝確定＋予定 ・ 対前年は同月の見込比較</p>
      </Panel>

      {/* ===== 12か月バー — クリックで月移動 ===== */}
      <Panel title="年間ビュー（クリックで月移動）">
        <div className="flex items-end gap-1.5 overflow-x-auto pb-1" style={{ height: 150 }}>
          {months.map((m, i) => {
            const a = monthAggs[i];
            const b = budget[i];
            return (
              <button key={m} onClick={() => setMi(i)}
                className={`flex min-w-[42px] flex-1 flex-col items-center gap-1 rounded-lg pt-1 transition ${i === mi ? "bg-brand-50" : "hover:bg-surface"}`}>
                <div className="relative flex h-[100px] w-full items-end justify-center">
                  {/* 予算ライン */}
                  {b > 0 && <div className="absolute left-1 right-1 border-t-2 border-dashed border-amber-400" style={{ bottom: `${(b / stripMax) * 100}%` }} title={`予算 ${yen(b)}`} />}
                  <div className="flex w-3/4 flex-col justify-end">
                    <div className="w-full rounded-t bg-brand-200" style={{ height: `${(a.forecast / stripMax) * 100}%` }} title={`予定 ${yen(a.forecast)}`} />
                    <div className="w-full bg-brand-600" style={{ height: `${(a.confirmed / stripMax) * 100}%` }} title={`確定 ${yen(a.confirmed)}`} />
                  </div>
                </div>
                <span className={`text-[10px] ${i === mi ? "font-black text-brand-700" : "text-slate-400"}`}>{FY_MONTH_LABELS[i]}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-brand-600" />確定</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-brand-200" />予定</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-0 w-3 border-t-2 border-dashed border-amber-400" />予算</span>
          <span>年度見込累計 <b className="text-ink">{yen(monthAggs.reduce((t, a) => t + a.amount, 0))}</b></span>
        </div>
      </Panel>

      {/* ===== 月別明細一覧 ===== */}
      <Panel title={`売上明細一覧 — ${ym.replace("-", "年")}月（${rows.length}件）`}
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={forecastMonth} className="rounded-xl border border-line px-3 py-1.5 text-xs font-bold text-muted hover:border-sky-400 hover:text-sky-600">全て予定に</button>
            <button onClick={confirmMonth} className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">この月を全確定</button>
            <button onClick={() => { setDraft(emptyDraft); setShowNew(true); }} className="rounded-xl bg-brand-600 px-3.5 py-1.5 text-sm font-bold text-white shadow-sm hover:bg-brand-700">＋ 明細を追加</button>
          </div>
        }>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2.5 font-bold">会社名</th>
                <th className="py-2.5 font-bold">担当</th>
                <th className="py-2.5 font-bold">区分</th>
                <th className="py-2.5 text-right font-bold">人数</th>
                <th className="py-2.5 text-right font-bold">売上</th>
                <th className="py-2.5 text-right font-bold">粗利</th>
                <th className="py-2.5 text-center font-bold">種別</th>
                <th className="py-2.5 text-center font-bold">状態</th>
                <th className="py-2.5 text-right font-bold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-muted">この月の明細はありません。「＋ 明細を追加」または「前月コピー」から登録してください。</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className={`hover:bg-surface ${r.status === "forecast" ? "bg-sky-50/40" : ""}`}>
                  <td className="py-2 font-bold text-ink">{r.customer}</td>
                  <td className="py-2"><span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-muted">{r.owner}</span></td>
                  <td className="py-2"><span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">{r.category}</span></td>
                  <td className="py-2 text-right">
                    <input type="number" value={r.headcount || ""} placeholder="0"
                      onChange={(e) => updateLine(r.id, { headcount: Number(e.target.value) || 0 })}
                      className="w-14 rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-right font-semibold outline-none hover:border-line focus:border-brand-500 focus:bg-white" />
                  </td>
                  <td className="py-2 text-right">
                    <input type="number" value={r.amount || ""} placeholder="0"
                      onChange={(e) => updateLine(r.id, { amount: Number(e.target.value) || 0 })}
                      className="w-28 rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-right font-black text-ink outline-none hover:border-line focus:border-brand-500 focus:bg-white" />
                  </td>
                  <td className="py-2 text-right font-bold tabular-nums text-emerald-600">{yen(grossOf(r))}</td>
                  <td className="py-2 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${r.recurring ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500"}`}>{r.recurring ? "定期" : "不定期"}</span>
                  </td>
                  <td className="py-2 text-center">
                    <button onClick={() => toggleStatus(r.id)}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${r.status === "confirmed" ? "bg-emerald-600 text-white" : "bg-sky-100 text-sky-700"}`}>
                      {r.status === "confirmed" ? "確定" : "予定"}
                    </button>
                  </td>
                  <td className="py-2 text-right">
                    <button onClick={() => removeLine(r)} className="rounded-lg border border-line px-2 py-1 text-xs text-muted hover:border-rose-400 hover:text-rose-500">削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-line bg-surface font-black">
                  <td className="py-2.5" colSpan={3}>合計（{rows.length}件）</td>
                  <td className="py-2.5 text-right">{rowAgg.headcount}名</td>
                  <td className="py-2.5 text-right text-ink">{yen(rowAgg.amount)}</td>
                  <td className="py-2.5 text-right text-emerald-600">{yen(rowAgg.gross)}</td>
                  <td className="py-2.5 text-center text-[11px] text-muted" colSpan={3}>確定 {yen(rowAgg.confirmed)} ／ 予定 {yen(rowAgg.forecast)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Panel>

      {/* ===== 明細追加モーダル ===== */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setShowNew(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="mb-1 text-base font-black text-ink">売上明細を追加 — {ym.replace("-", "年")}月</h3>
            <p className="mb-4 text-[11px] text-muted">定期＝この月から年度末(7月)まで自動で毎月追加。不定期＝この月のみ。</p>
            <div className="space-y-3">
              {/* 定期/不定期 */}
              <div className="flex overflow-hidden rounded-xl border border-line">
                <button onClick={() => setDraft((d) => ({ ...d, recurring: true }))}
                  className={`flex-1 py-2 text-sm font-bold ${draft.recurring ? "bg-brand-600 text-white" : "bg-white text-muted"}`}>定期（毎月・自動）</button>
                <button onClick={() => setDraft((d) => ({ ...d, recurring: false }))}
                  className={`flex-1 py-2 text-sm font-bold ${!draft.recurring ? "bg-sky-600 text-white" : "bg-white text-muted"}`}>不定期（単発）</button>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-muted">会社名 * <span className="font-normal text-slate-400">（顧客管理から選択可）</span></label>
                <input list="uriage-cust" value={draft.customer} onChange={(e) => setDraft((d) => ({ ...d, customer: e.target.value }))}
                  placeholder="株式会社〇〇" className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
                <datalist id="uriage-cust">{names.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">担当</label>
                  <select value={draft.owner} onChange={(e) => setDraft((d) => ({ ...d, owner: e.target.value }))}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500">
                    {OWNERS.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">区分</label>
                  <select value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500">
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">人数</label>
                  <input type="number" value={draft.headcount} onChange={(e) => setDraft((d) => ({ ...d, headcount: e.target.value }))}
                    className="w-full rounded-xl border border-line px-3 py-2 text-right text-sm outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">売上（円）*</label>
                  <input type="number" value={draft.amount} onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                    className="w-full rounded-xl border border-line px-3 py-2 text-right text-sm font-semibold outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">原価（円）</label>
                  <input type="number" value={draft.cost} onChange={(e) => setDraft((d) => ({ ...d, cost: e.target.value }))}
                    placeholder="0" className="w-full rounded-xl border border-line px-3 py-2 text-right text-sm outline-none focus:border-brand-500" />
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowNew(false)} className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-muted hover:bg-surface">キャンセル</button>
              <button onClick={addLine} className={`rounded-xl px-5 py-2 text-sm font-bold text-white ${draft.recurring ? "bg-brand-600 hover:bg-brand-700" : "bg-sky-600 hover:bg-sky-700"}`}>登録する</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}