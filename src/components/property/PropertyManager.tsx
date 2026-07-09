"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Panel from "@/components/ui/Panel";
import {
  STORAGE_KEY, PAY_METHODS, PROP_STATUS, STATUS_TONE, propertyReport, sampleProperties, uid, yen,
  type PropertyStore, type Property, type RentCollection, type PayMethod, type PropStatus,
} from "@/lib/property";

const EXP_KEY = "bl_expenses_v2";
type ExpLite = { propertyId?: string; date: string; amount: number };

const emptyProp = { name: "", address: "", ownerName: "", monthlyRent: "", paymentDay: "27", paymentMethod: "自動引き落とし" as PayMethod, contractStart: "", contractEnd: "", status: "契約中" as PropStatus, memo: "" };
const emptyCol = { propertyId: "", tenant: "", amount: "", date: "", method: "振込" as PayMethod, memo: "" };

export default function PropertyManager() {
  const [store, setStore] = useState<PropertyStore>({ properties: [], collections: [] });
  const [expenses, setExpenses] = useState<ExpLite[]>([]);
  const [ym, setYm] = useState("");
  const [showProp, setShowProp] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [pDraft, setPDraft] = useState(emptyProp);
  const [showCol, setShowCol] = useState(false);
  const [cDraft, setCDraft] = useState(emptyCol);
  const ready = useRef(false);

  useEffect(() => {
    setYm(new Date().toISOString().slice(0, 7));
    try { const raw = window.localStorage.getItem(STORAGE_KEY); setStore(raw ? JSON.parse(raw) : sampleProperties()); } catch { setStore(sampleProperties()); }
    try { const raw = window.localStorage.getItem(EXP_KEY); if (raw) setExpenses((JSON.parse(raw).records ?? []) as ExpLite[]); } catch { /* ignore */ }
    ready.current = true;
  }, []);
  useEffect(() => { if (!ready.current) return; try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* ignore */ } }, [store]);

  const props = useMemo(() => [...store.properties].sort((a, b) => a.order - b.order), [store.properties]);
  const report = useMemo(() => propertyReport(store.properties, expenses, store.collections, ym), [store.properties, expenses, store.collections, ym]);
  const tot = report.reduce((t, r) => ({ paid: t.paid + r.paid, collected: t.collected + r.collected, net: t.net + r.net }), { paid: 0, collected: 0, net: 0 });

  // ---- master ----
  function openNewProp() { setEditId(null); setPDraft(emptyProp); setShowProp(true); }
  function openEditProp(p: Property) { setEditId(p.id); setPDraft({ name: p.name, address: p.address, ownerName: p.ownerName, monthlyRent: String(p.monthlyRent), paymentDay: String(p.paymentDay), paymentMethod: p.paymentMethod, contractStart: p.contractStart, contractEnd: p.contractEnd, status: p.status, memo: p.memo }); setShowProp(true); }
  function saveProp() {
    if (!pDraft.name.trim()) { alert("物件名は必須です。"); return; }
    const base = { name: pDraft.name.trim(), address: pDraft.address.trim(), ownerName: pDraft.ownerName.trim(), monthlyRent: Number(pDraft.monthlyRent) || 0, paymentDay: Number(pDraft.paymentDay) || 27, paymentMethod: pDraft.paymentMethod, contractStart: pDraft.contractStart, contractEnd: pDraft.contractEnd, status: pDraft.status, memo: pDraft.memo.trim() };
    setStore((prev) => {
      if (editId) return { ...prev, properties: prev.properties.map((p) => p.id === editId ? { ...p, ...base } : p) };
      const order = Math.max(0, ...prev.properties.map((p) => p.order)) + 1;
      return { ...prev, properties: [...prev.properties, { id: uid(), order, ...base }] };
    });
    setShowProp(false);
  }
  function removeProp(id: string) {
    if (!confirm("この物件を削除しますか？（この物件への支出データは残ります）")) return;
    setStore((prev) => ({ ...prev, properties: prev.properties.filter((p) => p.id !== id) }));
  }
  function move(id: string, dir: -1 | 1) {
    setStore((prev) => {
      const sorted = [...prev.properties].sort((a, b) => a.order - b.order);
      const i = sorted.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= sorted.length) return prev;
      const a = sorted[i], b = sorted[j];
      return { ...prev, properties: prev.properties.map((p) => p.id === a.id ? { ...p, order: b.order } : p.id === b.id ? { ...p, order: a.order } : p) };
    });
  }
  function setOrder(id: string, order: number) {
    setStore((prev) => ({ ...prev, properties: prev.properties.map((p) => p.id === id ? { ...p, order } : p) }));
  }

  // ---- collection ----
  function openNewCol() { setCDraft({ ...emptyCol, propertyId: props[0]?.id ?? "", date: ym + "-05" }); setShowCol(true); }
  function saveCol() {
    if (!cDraft.propertyId || !cDraft.amount || !cDraft.date) { alert("物件・金額・回収日は必須です。"); return; }
    const col: RentCollection = { id: uid(), propertyId: cDraft.propertyId, tenant: cDraft.tenant.trim(), ym: cDraft.date.slice(0, 7), amount: Number(cDraft.amount) || 0, date: cDraft.date, method: cDraft.method, memo: cDraft.memo.trim() };
    setStore((prev) => ({ ...prev, collections: [...prev.collections, col] }));
    setShowCol(false);
  }
  function removeCol(id: string) {
    if (!confirm("この回収記録を削除しますか？")) return;
    setStore((prev) => ({ ...prev, collections: prev.collections.filter((c) => c.id !== id) }));
  }
  function resetSample() { if (!confirm("サンプルに戻しますか？")) return; setStore(sampleProperties()); }

  const nameOf = (id: string) => props.find((p) => p.id === id)?.name ?? "—";

  if (!ym) return <div className="rounded-3xl border border-line bg-white p-12 text-center text-sm text-muted">読み込み中…</div>;

  return (
    <div className="space-y-6">
      {/* Cấu trúc */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-3xl border border-line/70 bg-white px-5 py-3.5 text-sm shadow-card">
        <span className="rounded-lg bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">管理費</span><span className="text-slate-300">›</span>
        <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-600">オフィス</span><span className="text-slate-300">›</span>
        <span className="rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-600">地代家賃</span><span className="text-slate-300">›</span>
        <span className="rounded-lg bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-600">物件（A寮・B寮…）</span>
        <span className="ml-2 text-xs text-muted">支出（会社が支払う家賃）− 回収（入居者から）= <b className="text-ink">実質負担</b></span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-3xl border border-line/70 bg-white p-3.5 shadow-card">
        <input type="month" value={ym} onChange={(e) => setYm(e.target.value)} className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-bold text-ink outline-none focus:border-brand-500" />
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={openNewCol} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700">＋ 家賃回収</button>
          <button onClick={openNewProp} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-brand-700">＋ 物件登録</button>
          <button onClick={resetSample} className="rounded-xl border border-line px-3 py-2 text-xs font-bold text-muted hover:border-rose-400 hover:text-rose-500">サンプル</button>
        </div>
      </div>

      {/* ===== BÁO CÁO 実質負担 (deliverable chính) ===== */}
      <Panel title={`📊 地代家賃 実質負担レポート（${ym}）`}
        action={<span className="text-[11px] text-slate-400">支出 − 回収 = 会社の実質負担</span>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b-2 border-line text-left text-xs text-muted">
                <th className="py-2.5 font-bold">物件</th>
                <th className="py-2.5 text-right font-bold">月額家賃</th>
                <th className="py-2.5 text-right font-bold text-rose-600">支出（会社）</th>
                <th className="py-2.5 text-right font-bold text-emerald-600">回収（入居者）</th>
                <th className="py-2.5 text-right font-bold">実質負担</th>
                <th className="py-2.5 text-center font-bold">状態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {report.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted">物件がありません。「＋ 物件登録」から追加してください。</td></tr>}
              {report.map((r) => (
                <tr key={r.p.id} className="hover:bg-surface">
                  <td className="py-3">
                    <p className="font-bold text-ink">{r.p.name}</p>
                    <p className="text-[11px] text-muted">{r.p.ownerName} ・ {r.collectors.length}名入居</p>
                  </td>
                  <td className="py-3 text-right tabular-nums text-muted">{yen(r.p.monthlyRent)}</td>
                  <td className="py-3 text-right font-bold tabular-nums text-rose-600">{r.paid ? yen(r.paid) : "—"}</td>
                  <td className="py-3 text-right font-bold tabular-nums text-emerald-600">{r.collected ? yen(r.collected) : "—"}</td>
                  <td className={`py-3 text-right font-black tabular-nums ${r.net > 0 ? "text-amber-600" : r.net < 0 ? "text-emerald-600" : "text-slate-400"}`}>{yen(r.net)}</td>
                  <td className="py-3 text-center"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[r.p.status]}`}>{r.p.status}</span></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line bg-surface font-black">
                <td className="py-3">合計（{report.length}件）</td>
                <td className="py-3 text-right tabular-nums text-muted">{yen(report.reduce((t, r) => t + r.p.monthlyRent, 0))}</td>
                <td className="py-3 text-right tabular-nums text-rose-600">{yen(tot.paid)}</td>
                <td className="py-3 text-right tabular-nums text-emerald-600">{yen(tot.collected)}</td>
                <td className={`py-3 text-right tabular-nums ${tot.net > 0 ? "text-amber-600" : "text-ink"}`}>{yen(tot.net)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      {/* ===== 物件マスタ (master, sắp thứ tự) ===== */}
      <Panel title="🏠 物件マスタ（表示順を管理）"
        action={<span className="text-[11px] text-slate-400">▲▼ または 番号入力で並び替え</span>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2.5 font-bold">順</th>
                <th className="py-2.5 font-bold">物件名</th>
                <th className="py-2.5 font-bold">大家</th>
                <th className="py-2.5 text-right font-bold">月額家賃</th>
                <th className="py-2.5 text-center font-bold">支払日</th>
                <th className="py-2.5 font-bold">支払方法</th>
                <th className="py-2.5 font-bold">契約期間</th>
                <th className="py-2.5 text-center font-bold">状態</th>
                <th className="py-2.5 text-right font-bold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {props.map((p, i) => (
                <tr key={p.id} className="hover:bg-surface">
                  <td className="py-2">
                    <div className="flex items-center gap-1">
                      <input type="number" value={p.order} onChange={(e) => setOrder(p.id, Number(e.target.value) || 0)}
                        className="w-12 rounded-lg border border-line px-1.5 py-1 text-center text-xs font-bold outline-none focus:border-brand-500" />
                      <div className="flex flex-col">
                        <button onClick={() => move(p.id, -1)} disabled={i === 0} className="text-[9px] text-slate-400 hover:text-brand-600 disabled:opacity-30">▲</button>
                        <button onClick={() => move(p.id, 1)} disabled={i === props.length - 1} className="text-[9px] text-slate-400 hover:text-brand-600 disabled:opacity-30">▼</button>
                      </div>
                    </div>
                  </td>
                  <td className="py-2"><p className="font-bold text-ink">{p.name}</p>{p.memo && <p className="text-[11px] text-muted">{p.memo}</p>}</td>
                  <td className="py-2 text-muted">{p.ownerName || "—"}</td>
                  <td className="py-2 text-right font-bold tabular-nums text-ink">{yen(p.monthlyRent)}</td>
                  <td className="py-2 text-center text-muted">{p.paymentDay}日</td>
                  <td className="py-2"><span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-muted">{p.paymentMethod}</span></td>
                  <td className="py-2 text-xs text-muted">{p.contractStart || "—"}〜{p.contractEnd || ""}</td>
                  <td className="py-2 text-center"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[p.status]}`}>{p.status}</span></td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEditProp(p)} className="rounded-lg border border-line px-2 py-1 text-xs font-bold text-muted hover:border-brand-500 hover:text-brand-600">編集</button>
                      <button onClick={() => removeProp(p.id)} className="rounded-lg border border-line px-2 py-1 text-xs text-muted hover:border-rose-400 hover:text-rose-500">削除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ===== 家賃回収 (từ 入居者) ===== */}
      <Panel title={`💴 家賃回収一覧（${ym}・入居者から）`}
        action={<button onClick={openNewCol} className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-sm font-bold text-white hover:bg-emerald-700">＋ 家賃回収</button>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2.5 font-bold">物件</th>
                <th className="py-2.5 font-bold">入居者</th>
                <th className="py-2.5 text-right font-bold">回収額</th>
                <th className="py-2.5 font-bold">回収日</th>
                <th className="py-2.5 font-bold">方法</th>
                <th className="py-2.5 font-bold">メモ</th>
                <th className="py-2.5 text-right font-bold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {store.collections.filter((c) => c.ym === ym).length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted">この月の回収記録はありません。</td></tr>}
              {store.collections.filter((c) => c.ym === ym).map((c) => (
                <tr key={c.id} className="hover:bg-surface">
                  <td className="py-2.5 font-bold text-ink">{nameOf(c.propertyId)}</td>
                  <td className="py-2.5">{c.tenant || "—"}</td>
                  <td className="py-2.5 text-right font-black tabular-nums text-emerald-600">{yen(c.amount)}</td>
                  <td className="py-2.5 text-muted">{c.date}</td>
                  <td className="py-2.5"><span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-muted">{c.method}</span></td>
                  <td className="py-2.5 text-xs text-muted">{c.memo || "—"}</td>
                  <td className="py-2.5 text-right"><button onClick={() => removeCol(c.id)} className="rounded-lg border border-line px-2 py-1 text-xs text-muted hover:border-rose-400 hover:text-rose-500">削除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ===== Modal 物件 ===== */}
      {showProp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setShowProp(false)} />
          <div className="relative w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl">
            <h3 className="mb-4 text-base font-black text-ink">{editId ? "物件を編集" : "物件を登録"}<span className="ml-2 text-[11px] font-normal text-muted">管理費 › オフィス › 地代家賃</span></h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="mb-1 block text-xs font-bold text-muted">物件名 *</label><input value={pDraft.name} onChange={(e) => setPDraft((d) => ({ ...d, name: e.target.value }))} placeholder="A寮" className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
              <div><label className="mb-1 block text-xs font-bold text-muted">大家 / オーナー</label><input value={pDraft.ownerName} onChange={(e) => setPDraft((d) => ({ ...d, ownerName: e.target.value }))} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
              <div><label className="mb-1 block text-xs font-bold text-muted">月額家賃（円）</label><input type="number" value={pDraft.monthlyRent} onChange={(e) => setPDraft((d) => ({ ...d, monthlyRent: e.target.value }))} className="w-full rounded-xl border border-line px-3 py-2 text-right text-sm font-semibold outline-none focus:border-brand-500" /></div>
              <div className="col-span-2"><label className="mb-1 block text-xs font-bold text-muted">住所</label><input value={pDraft.address} onChange={(e) => setPDraft((d) => ({ ...d, address: e.target.value }))} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
              <div><label className="mb-1 block text-xs font-bold text-muted">支払日</label><select value={pDraft.paymentDay} onChange={(e) => setPDraft((d) => ({ ...d, paymentDay: e.target.value }))} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500">{Array.from({ length: 31 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}日</option>)}</select></div>
              <div><label className="mb-1 block text-xs font-bold text-muted">支払方法</label><select value={pDraft.paymentMethod} onChange={(e) => setPDraft((d) => ({ ...d, paymentMethod: e.target.value as PayMethod }))} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500">{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
              <div><label className="mb-1 block text-xs font-bold text-muted">契約開始</label><input type="date" value={pDraft.contractStart} onChange={(e) => setPDraft((d) => ({ ...d, contractStart: e.target.value }))} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
              <div><label className="mb-1 block text-xs font-bold text-muted">契約終了</label><input type="date" value={pDraft.contractEnd} onChange={(e) => setPDraft((d) => ({ ...d, contractEnd: e.target.value }))} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
              <div><label className="mb-1 block text-xs font-bold text-muted">状態</label><select value={pDraft.status} onChange={(e) => setPDraft((d) => ({ ...d, status: e.target.value as PropStatus }))} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500">{PROP_STATUS.map((s) => <option key={s}>{s}</option>)}</select></div>
              <div className="col-span-2"><label className="mb-1 block text-xs font-bold text-muted">メモ</label><input value={pDraft.memo} onChange={(e) => setPDraft((d) => ({ ...d, memo: e.target.value }))} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowProp(false)} className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-muted hover:bg-surface">キャンセル</button>
              <button onClick={saveProp} className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white hover:bg-brand-700">保存する</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal 家賃回収 ===== */}
      {showCol && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setShowCol(false)} />
          <div className="relative w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <h3 className="mb-1 text-base font-black text-ink">家賃回収を記録</h3>
            <p className="mb-4 text-[11px] text-muted">入居者から回収した家賃（物件はマスタから選択）</p>
            <div className="space-y-3">
              <div><label className="mb-1 block text-xs font-bold text-muted">物件 * <span className="font-normal text-slate-400">（マスタから選択）</span></label>
                <select value={cDraft.propertyId} onChange={(e) => setCDraft((d) => ({ ...d, propertyId: e.target.value }))} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500">
                  <option value="">選択してください</option>
                  {props.map((p) => <option key={p.id} value={p.id}>{p.name}（家賃 {yen(p.monthlyRent)}）</option>)}
                </select>
              </div>
              <div><label className="mb-1 block text-xs font-bold text-muted">入居者</label><input value={cDraft.tenant} onChange={(e) => setCDraft((d) => ({ ...d, tenant: e.target.value }))} placeholder="Nguyễn Văn A" className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="mb-1 block text-xs font-bold text-muted">回収額（円）*</label><input type="number" value={cDraft.amount} onChange={(e) => setCDraft((d) => ({ ...d, amount: e.target.value }))} className="w-full rounded-xl border border-line px-3 py-2 text-right text-sm font-semibold outline-none focus:border-brand-500" /></div>
                <div><label className="mb-1 block text-xs font-bold text-muted">回収日 *</label><input type="date" value={cDraft.date} onChange={(e) => setCDraft((d) => ({ ...d, date: e.target.value }))} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="mb-1 block text-xs font-bold text-muted">方法</label><select value={cDraft.method} onChange={(e) => setCDraft((d) => ({ ...d, method: e.target.value as PayMethod }))} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500">{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
                <div><label className="mb-1 block text-xs font-bold text-muted">メモ</label><input value={cDraft.memo} onChange={(e) => setCDraft((d) => ({ ...d, memo: e.target.value }))} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowCol(false)} className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-muted hover:bg-surface">キャンセル</button>
              <button onClick={saveCol} className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700">記録する</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
