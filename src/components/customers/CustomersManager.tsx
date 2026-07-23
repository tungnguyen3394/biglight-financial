"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Panel from "@/components/ui/Panel";
import Icon from "@/components/Icon";
import {
  STORAGE_KEY, CONTRACT_TYPES, CUSTOMER_GROUPS, CONTRACT_TONE, sampleCustomers, yen,
  type Customer, type Contract,
} from "@/lib/customers";

const emptyCust = { name: "", group: CUSTOMER_GROUPS[0], contact: "", phone: "", email: "", note: "" };
const emptyCon = { title: "", type: CONTRACT_TYPES[0], amount: "", startDate: "", endDate: "" };

export default function CustomersManager() {
  const [items, setItems] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState(emptyCust);
  const [conDraft, setConDraft] = useState(emptyCon);
  const [showCon, setShowCon] = useState(false);
  const ready = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      setItems(raw ? (JSON.parse(raw) as Customer[]) : sampleCustomers());
    } catch { setItems(sampleCustomers()); }
    ready.current = true;
  }, []);
  useEffect(() => {
    if (!ready.current) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* ignore */ }
  }, [items]);

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return items
      .filter((c) => !group || c.group === group)
      .filter((c) => !kw || `${c.code} ${c.name} ${c.contact}`.toLowerCase().includes(kw));
  }, [items, q, group]);

  const detail = items.find((c) => c.id === detailId) ?? null;

  function addCustomer() {
    if (!draft.name.trim()) { alert("顧客名は必須です。"); return; }
    const code = "C" + String(items.length + 1).padStart(3, "0");
    setItems((prev) => [...prev, { id: "c" + Date.now(), code, ...draft, name: draft.name.trim(), active: true, contracts: [] }]);
    setDraft(emptyCust); setShowNew(false);
  }
  function addContract() {
    if (!detail) return;
    if (!conDraft.title.trim() || !conDraft.amount || !conDraft.startDate) { alert("契約名・金額・開始日は必須です。"); return; }
    const con: Contract = {
      id: "k" + Date.now(), title: conDraft.title.trim(), type: conDraft.type,
      amount: Number(conDraft.amount) || 0, startDate: conDraft.startDate, endDate: conDraft.endDate, status: "有効",
    };
    setItems((prev) => prev.map((c) => c.id === detail.id ? { ...c, contracts: [...c.contracts, con] } : c));
    setConDraft(emptyCon); setShowCon(false);
  }
  function endContract(cid: string, kid: string) {
    if (!confirm("この契約を「終了」にしますか？")) return;
    setItems((prev) => prev.map((c) => c.id === cid
      ? { ...c, contracts: c.contracts.map((k) => k.id === kid ? { ...k, status: "終了" as const } : k) } : c));
  }
  function toggleActive(id: string) {
    setItems((prev) => prev.map((c) => c.id === id ? { ...c, active: !c.active } : c));
  }
  function resetSample() {
    if (!confirm("サンプルデータに戻します。よろしいですか？")) return;
    setItems(sampleCustomers());
  }

  const activeContracts = (c: Customer) => c.contracts.filter((k) => k.status === "有効");
  const monthlyOf = (c: Customer) => activeContracts(c).filter((k) => k.type === "月額").reduce((t, k) => t + k.amount, 0);

  return (
    <div className="space-y-6">
      <Panel title="顧客一覧"
        action={
          <button onClick={() => setShowNew(true)} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-brand-700">＋ 顧客を登録</button>
        }>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select value={group} onChange={(e) => setGroup(e.target.value)}
            className="rounded-xl border border-line bg-white px-3 py-1.5 text-sm font-semibold outline-none focus:border-brand-500">
            <option value="">すべての分類</option>
            {CUSTOMER_GROUPS.map((g) => <option key={g}>{g}</option>)}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="顧客名・コード・担当で検索…"
            className="w-56 rounded-xl border border-line bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-500" />
          <button onClick={resetSample} className="ml-auto rounded-xl border border-line px-3 py-1.5 text-xs font-bold text-muted hover:border-rose-400 hover:text-rose-500">サンプルに戻す</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2.5 font-bold">コード</th>
                <th className="py-2.5 font-bold">顧客名</th>
                <th className="py-2.5 font-bold">分類</th>
                <th className="py-2.5 font-bold">担当</th>
                <th className="py-2.5 text-center font-bold">有効契約</th>
                <th className="py-2.5 text-right font-bold">月額合計</th>
                <th className="py-2.5 text-center font-bold">状態</th>
                <th className="py-2.5 text-right font-bold">詳細</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-surface" onClick={() => setDetailId(c.id)}>
                  <td className="py-3 font-mono text-xs font-bold text-muted">{c.code}</td>
                  <td className="py-3"><p className="font-bold text-ink">{c.name}</p>{c.note && <p className="text-[11px] text-amber-600">{c.note}</p>}</td>
                  <td className="py-3"><span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-muted">{c.group}</span></td>
                  <td className="py-3 text-muted">{c.contact || "—"}</td>
                  <td className="py-3 text-center font-bold text-ink">{activeContracts(c).length}件</td>
                  <td className="py-3 text-right font-bold text-ink">{monthlyOf(c) ? yen(monthlyOf(c)) + "/月" : "—"}</td>
                  <td className="py-3 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${c.active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>{c.active ? "取引中" : "休止"}</span>
                  </td>
                  <td className="py-3 text-right"><span className="rounded-lg border border-line px-2.5 py-1 text-xs font-bold text-brand-600">詳細 →</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ===== 顧客詳細・契約モーダル ===== */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setDetailId(null)} />
          <div className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h3 className="text-base font-black text-ink">{detail.name}</h3>
                <p className="text-[11px] text-muted">{detail.code} ・ {detail.group}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleActive(detail.id)}
                  className="rounded-xl border border-line px-3 py-1.5 text-xs font-bold text-muted hover:border-brand-500 hover:text-brand-600">
                  {detail.active ? "休止にする" : "取引再開"}
                </button>
                <button onClick={() => setDetailId(null)} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface" aria-label="閉じる"><Icon name="close" size={16} /></button>
              </div>
            </div>

            <div className="space-y-5 overflow-auto p-5">
              {/* 連絡先情報 */}
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                {[["担当", detail.contact], ["電話", detail.phone], ["メール", detail.email], ["メモ", detail.note]].map(([l, v]) => (
                  <div key={l} className="rounded-xl bg-surface px-3.5 py-3">
                    <p className="text-[11px] font-bold text-muted">{l}</p>
                    <p className="mt-0.5 truncate text-sm font-semibold text-ink">{v || "—"}</p>
                  </div>
                ))}
              </div>

              {/* 契約 */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-black text-ink">契約一覧（{detail.contracts.length}件）</h4>
                  <button onClick={() => { setConDraft(emptyCon); setShowCon(true); }}
                    className="rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700">＋ 契約を追加</button>
                </div>
                {detail.contracts.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-xs text-muted">契約はまだ登録されていません。</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-line">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="border-b border-line bg-surface text-left text-xs text-muted">
                          <th className="px-3 py-2 font-bold">契約名</th>
                          <th className="px-3 py-2 font-bold">区分</th>
                          <th className="px-3 py-2 text-right font-bold">金額</th>
                          <th className="px-3 py-2 font-bold">期間</th>
                          <th className="px-3 py-2 text-center font-bold">状態</th>
                          <th className="px-3 py-2 text-right font-bold">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {detail.contracts.map((k) => (
                          <tr key={k.id}>
                            <td className="px-3 py-2.5 font-semibold text-ink">{k.title}</td>
                            <td className="px-3 py-2.5"><span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">{k.type}</span></td>
                            <td className="px-3 py-2.5 text-right font-bold">{yen(k.amount)}{k.type === "月額" ? "/月" : ""}</td>
                            <td className="px-3 py-2.5 text-xs text-muted">{k.startDate} 〜 {k.endDate || "（無期限）"}</td>
                            <td className="px-3 py-2.5 text-center"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${CONTRACT_TONE[k.status]}`}>{k.status}</span></td>
                            <td className="px-3 py-2.5 text-right">
                              {k.status === "有効" && (
                                <button onClick={() => endContract(detail.id, k.id)}
                                  className="rounded-lg border border-line px-2 py-1 text-[11px] text-muted hover:border-rose-400 hover:text-rose-500">終了</button>
                              )}
                            </td>
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

      {/* ===== 顧客登録モーダル ===== */}
      {showNew && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setShowNew(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="mb-4 text-base font-black text-ink">顧客を登録</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-muted">顧客名 *</label>
                <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">分類</label>
                  <select value={draft.group} onChange={(e) => setDraft((d) => ({ ...d, group: e.target.value }))}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500">
                    {CUSTOMER_GROUPS.map((g) => <option key={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">担当者</label>
                  <input value={draft.contact} onChange={(e) => setDraft((d) => ({ ...d, contact: e.target.value }))}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">電話</label>
                  <input value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">メール</label>
                  <input value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-muted">メモ</label>
                <input value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                  className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowNew(false)} className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-muted hover:bg-surface">キャンセル</button>
              <button onClick={addCustomer} className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white hover:bg-brand-700">登録する</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 契約追加モーダル ===== */}
      {showCon && detail && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setShowCon(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="mb-1 text-base font-black text-ink">契約を追加</h3>
            <p className="mb-4 text-xs text-muted">{detail.name}</p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-muted">契約名 *</label>
                <input value={conDraft.title} onChange={(e) => setConDraft((d) => ({ ...d, title: e.target.value }))}
                  placeholder="登録支援委託契約" className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">区分</label>
                  <select value={conDraft.type} onChange={(e) => setConDraft((d) => ({ ...d, type: e.target.value }))}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500">
                    {CONTRACT_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">金額（円） *</label>
                  <input type="number" value={conDraft.amount} onChange={(e) => setConDraft((d) => ({ ...d, amount: e.target.value }))}
                    className="w-full rounded-xl border border-line px-3 py-2 text-right text-sm font-semibold outline-none focus:border-brand-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">開始日 *</label>
                  <input type="date" value={conDraft.startDate} onChange={(e) => setConDraft((d) => ({ ...d, startDate: e.target.value }))}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">終了日（空欄＝無期限）</label>
                  <input type="date" value={conDraft.endDate} onChange={(e) => setConDraft((d) => ({ ...d, endDate: e.target.value }))}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowCon(false)} className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-muted hover:bg-surface">キャンセル</button>
              <button onClick={addContract} className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white hover:bg-brand-700">追加する</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
