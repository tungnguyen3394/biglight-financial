"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Panel from "@/components/ui/Panel";
import {
  STORAGE_KEY, PAY_METHODS, sampleCollect, itemReport, leafTargets, nameOfTarget,
  collectedOfTarget, addChild, patchNode, deleteNode, moveNode, newTarget, history, uid, yen,
  type CollectStore, type Target, type CollectRecord, type PayMethod,
} from "@/lib/collection";
import { loadAccounts, accountLeaves } from "@/lib/accounts";
import { fiscalLabel, fiscalYearOf, FY_MONTH_LABELS } from "@/lib/fiscal";

const emptyCol = { itemId: "", targetId: "", amount: "", date: "", method: "振込" as PayMethod, memo: "" };

// マスタ用の対象ツリー（再帰）をレンダリング — その場で編集。
function NodeRows({ nodes, itemId, path, onPatch, onAdd, onDel, onMove }: {
  nodes: Target[]; itemId: string; path: string[];
  onPatch: (p: string[], patch: Partial<Target>) => void; onAdd: (p: string[]) => void; onDel: (p: string[]) => void; onMove: (p: string[], d: -1 | 1) => void;
}) {
  const sorted = [...nodes].sort((a, b) => a.order - b.order);
  return (
    <>
      {sorted.map((n, i) => {
        const np = [...path, n.id];
        return (
          <div key={n.id}>
            <div className="flex items-center gap-1.5 border-b border-line/50 py-1.5" style={{ paddingLeft: path.length * 20 }}>
              <div className="flex flex-col">
                <button onClick={() => onMove(np, -1)} disabled={i === 0} className="text-[8px] text-slate-400 hover:text-brand-600 disabled:opacity-30">▲</button>
                <button onClick={() => onMove(np, 1)} disabled={i === sorted.length - 1} className="text-[8px] text-slate-400 hover:text-brand-600 disabled:opacity-30">▼</button>
              </div>
              <input value={n.name} onChange={(e) => onPatch(np, { name: e.target.value })}
                className="w-36 rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-sm font-semibold text-ink outline-none hover:border-line focus:border-brand-500 focus:bg-white" />
              <span className="text-[10px] text-slate-400">支出</span>
              <input type="number" value={n.paidOut || ""} placeholder="0" onChange={(e) => onPatch(np, { paidOut: Number(e.target.value) || 0 })}
                className="w-24 rounded-lg border border-line px-1.5 py-1 text-right text-xs outline-none focus:border-brand-500" />
              <span className="text-[10px] text-slate-400">予定回収</span>
              <input type="number" value={n.expected || ""} placeholder="0" onChange={(e) => onPatch(np, { expected: Number(e.target.value) || 0 })}
                className="w-24 rounded-lg border border-line px-1.5 py-1 text-right text-xs outline-none focus:border-brand-500" />
              <button onClick={() => onAdd(np)} className="rounded-md bg-brand-50 px-2 py-1 text-[10px] font-bold text-brand-700 hover:bg-brand-100">＋子対象</button>
              <button onClick={() => onDel(np)} className="rounded-md border border-line px-1.5 py-1 text-[10px] text-muted hover:border-rose-400 hover:text-rose-500">削除</button>
            </div>
            {n.children.length > 0 && <NodeRows nodes={n.children} itemId={itemId} path={np} onPatch={onPatch} onAdd={onAdd} onDel={onDel} onMove={onMove} />}
          </div>
        );
      })}
    </>
  );
}

// レポート用の対象ツリー（読み取り専用）：名称 · 予定 · 実回収 · 未回収。
function ReportTree({ nodes, path, store, ym }: { nodes: Target[]; path: string[]; store: CollectStore; ym: string }) {
  return (
    <>
      {[...nodes].sort((a, b) => a.order - b.order).map((n) => {
        const col = collectedOfTarget(store, n.id, ym);
        const leaf = n.children.length === 0;
        return (
          <div key={n.id}>
            <div className="flex items-center gap-2 border-b border-line/40 py-1.5 text-xs" style={{ paddingLeft: path.length * 18 + 6 }}>
              <span className={`flex-1 truncate ${path.length === 0 ? "font-bold text-ink" : "font-semibold text-muted"}`}>{n.name}</span>
              {n.paidOut > 0 && <span className="w-24 text-right tabular-nums text-rose-600">支出 {yen(n.paidOut)}</span>}
              {leaf && <span className="w-24 text-right tabular-nums text-slate-500">予定 {yen(n.expected)}</span>}
              {leaf && <span className="w-24 text-right tabular-nums text-emerald-600">回収 {col ? yen(col) : "—"}</span>}
              {leaf && <span className={`w-24 text-right font-bold tabular-nums ${n.expected - col > 0 ? "text-amber-600" : "text-slate-300"}`}>未 {yen(Math.max(0, n.expected - col))}</span>}
            </div>
            {n.children.length > 0 && <ReportTree nodes={n.children} path={[...path, n.id]} store={store} ym={ym} />}
          </div>
        );
      })}
    </>
  );
}

export default function CollectionManager() {
  const [store, setStore] = useState<CollectStore>({ items: [], records: [] });
  const [ym, setYm] = useState("");
  const [fy, setFy] = useState(2025);
  const [accOptions, setAccOptions] = useState<{ keys: string[]; label: string }[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showCol, setShowCol] = useState(false);
  const [cDraft, setCDraft] = useState(emptyCol);
  const [newAcc, setNewAcc] = useState("");        // 項目追加用に選択する勘定科目（index）
  const [newMonthly, setNewMonthly] = useState(true);
  const ready = useRef(false);

  useEffect(() => {
    const iso = new Date().toISOString().slice(0, 10);
    setYm(iso.slice(0, 7)); setFy(fiscalYearOf(iso));
    try { const raw = window.localStorage.getItem(STORAGE_KEY); setStore(raw ? JSON.parse(raw) : sampleCollect()); } catch { setStore(sampleCollect()); }
    setAccOptions(accountLeaves(loadAccounts()));
    ready.current = true;
  }, []);
  useEffect(() => { if (!ready.current) return; try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* ignore */ } }, [store]);

  const report = useMemo(() => itemReport(store, ym), [store, ym]);
  const leaves = useMemo(() => leafTargets(store.items), [store.items]);
  const hist = useMemo(() => history(store, fy), [store, fy]);
  const selBalance = hist.find((h) => h.targetId === cDraft.targetId)?.balance;
  const tot = report.reduce((t, r) => ({ paidOut: t.paidOut + r.paidOut, expected: t.expected + r.expected, collected: t.collected + r.collected, uncollected: t.uncollected + r.uncollected, net: t.net + r.net }), { paidOut: 0, expected: 0, collected: 0, uncollected: 0, net: 0 });

  // ---- master ops ----
  const upItem = (itemId: string, fn: (t: Target[]) => Target[]) =>
    setStore((prev) => ({ ...prev, items: prev.items.map((it) => it.id === itemId ? { ...it, targets: fn(it.targets) } : it) }));
  const onPatch = (itemId: string) => (p: string[], patch: Partial<Target>) => upItem(itemId, (t) => patchNode(t, p, patch));
  const onAdd = (itemId: string) => (p: string[]) => upItem(itemId, (t) => addChild(t, p));
  const onDel = (itemId: string) => (p: string[]) => { if (confirm("この対象を削除しますか？（配下も削除）")) upItem(itemId, (t) => deleteNode(t, p)); };
  const onMove = (itemId: string) => (p: string[], d: -1 | 1) => upItem(itemId, (t) => moveNode(t, p, d));
  function addRootTarget(itemId: string) { upItem(itemId, (t) => [...t, newTarget(Math.max(0, ...t.map((x) => x.order)) + 1)]); }
  function renameItem(itemId: string, name: string) { setStore((prev) => ({ ...prev, items: prev.items.map((it) => it.id === itemId ? { ...it, name } : it) })); }
  function addItem() {
    const acc = accOptions[Number(newAcc)];
    if (!acc) { alert("勘定科目を選択してください（設定で定義）。"); return; }
    const name = acc.label.split(" › ").pop() || acc.label;
    setStore((prev) => ({ ...prev, items: [...prev.items, { id: "it" + uid(), name, accountKeys: acc.keys, monthly: newMonthly, order: Math.max(0, ...prev.items.map((x) => x.order)) + 1, targets: [] }] }));
    setNewAcc("");
  }
  function setItemMonthly(itemId: string, monthly: boolean) { setStore((prev) => ({ ...prev, items: prev.items.map((it) => it.id === itemId ? { ...it, monthly } : it) })); }
  function delItem(itemId: string) { if (!confirm("この回収項目を削除しますか？")) return; setStore((prev) => ({ ...prev, items: prev.items.filter((it) => it.id !== itemId) })); }

  // ---- collection ----
  function openCol() { setCDraft({ ...emptyCol, itemId: leaves[0]?.itemId ?? "", targetId: leaves[0]?.targetId ?? "", date: ym + "-05" }); setShowCol(true); }
  function saveCol() {
    if (!cDraft.targetId || !cDraft.amount || !cDraft.date) { alert("対象・金額・回収日は必須です。"); return; }
    const lf = leaves.find((l) => l.targetId === cDraft.targetId);
    const rec: CollectRecord = { id: uid(), itemId: lf?.itemId ?? cDraft.itemId, targetId: cDraft.targetId, ym: cDraft.date.slice(0, 7), amount: Number(cDraft.amount) || 0, date: cDraft.date, method: cDraft.method, memo: cDraft.memo.trim() };
    setStore((prev) => ({ ...prev, records: [...prev.records, rec] }));
    setShowCol(false);
  }
  function delRec(id: string) { if (!confirm("この回収記録を削除しますか？")) return; setStore((prev) => ({ ...prev, records: prev.records.filter((r) => r.id !== id) })); }
  function resetSample() { if (!confirm("サンプルに戻しますか？")) return; setStore(sampleCollect()); }
  const toggle = (id: string) => setExpanded((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  if (!ym) return <div className="rounded-3xl border border-line bg-white p-12 text-center text-sm text-muted">読み込み中…</div>;

  return (
    <div className="space-y-6">
      {/* 用語の説明 */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-3xl border border-line/70 bg-white px-5 py-3.5 text-sm shadow-card">
        <span className="font-black text-ink">仕組み：</span>
        <span className="text-muted"><b className="text-rose-600">支出</b> = 会社が立替えた金額</span>
        <span className="text-muted"><b className="text-slate-600">予定回収</b> = 対象から回収する予定額</span>
        <span className="text-muted"><b className="text-emerald-600">実回収</b> = 実際に回収した額</span>
        <span className="text-muted"><b className="text-amber-600">未回収</b> = 予定 − 実回収</span>
        <span className="hidden text-slate-400 lg:inline">例：地代家賃 → 物件A → Aさん(20,000)・Bさん(30,000)…</span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-3xl border border-line/70 bg-white p-3.5 shadow-card">
        <input type="month" value={ym} onChange={(e) => setYm(e.target.value)} className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-bold text-ink outline-none focus:border-brand-500" />
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={openCol} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700">＋ 回収記録</button>
          <button onClick={resetSample} className="rounded-xl border border-line px-3 py-2 text-xs font-bold text-muted hover:border-rose-400 hover:text-rose-500">サンプル</button>
        </div>
      </div>

      {/* ===== レポート ===== */}
      <Panel title={`📊 回収サマリー（${ym}）`} action={<span className="text-[11px] text-slate-400">行をクリックで対象の内訳を表示</span>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b-2 border-line text-left text-xs text-muted">
                <th className="py-2.5 font-bold">回収項目（勘定科目）</th>
                <th className="py-2.5 text-right font-bold text-rose-600">支出</th>
                <th className="py-2.5 text-right font-bold">予定回収</th>
                <th className="py-2.5 text-right font-bold text-emerald-600">実回収</th>
                <th className="py-2.5 text-right font-bold text-amber-600">未回収</th>
                <th className="py-2.5 text-right font-bold">実質負担</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {report.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted">回収項目がありません。下の「項目マスタ」で追加してください。</td></tr>}
              {report.map((r) => (
                <Fragment key={r.item.id}>
                  <tr className="cursor-pointer hover:bg-surface" onClick={() => toggle(r.item.id)}>
                    <td className="py-3 font-bold text-ink"><span className={`mr-1.5 inline-block text-[10px] text-slate-400 transition ${expanded.has(r.item.id) ? "rotate-90" : ""}`}>▶</span>{r.item.name}</td>
                    <td className="py-3 text-right font-bold tabular-nums text-rose-600">{yen(r.paidOut)}</td>
                    <td className="py-3 text-right tabular-nums text-muted">{yen(r.expected)}</td>
                    <td className="py-3 text-right font-bold tabular-nums text-emerald-600">{yen(r.collected)}</td>
                    <td className={`py-3 text-right font-black tabular-nums ${r.uncollected ? "text-amber-600" : "text-slate-300"}`}>{yen(r.uncollected)}</td>
                    <td className={`py-3 text-right font-black tabular-nums ${r.net > 0 ? "text-ink" : "text-emerald-600"}`}>{yen(r.net)}</td>
                  </tr>
                  {expanded.has(r.item.id) && (
                    <tr><td colSpan={6} className="bg-surface/60 px-3 py-2">
                      <ReportTree nodes={r.item.targets} path={[]} store={store} ym={ym} />
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line bg-surface font-black">
                <td className="py-3">合計</td>
                <td className="py-3 text-right tabular-nums text-rose-600">{yen(tot.paidOut)}</td>
                <td className="py-3 text-right tabular-nums text-muted">{yen(tot.expected)}</td>
                <td className="py-3 text-right tabular-nums text-emerald-600">{yen(tot.collected)}</td>
                <td className="py-3 text-right tabular-nums text-amber-600">{yen(tot.uncollected)}</td>
                <td className="py-3 text-right tabular-nums text-ink">{yen(tot.net)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      {/* ===== MASTER 項目・対象 ===== */}
      <Panel title="🗂 回収項目マスタ（多階層の対象を設定）">
        <div className="space-y-4">
          {store.items.sort((a, b) => a.order - b.order).map((it) => (
            <div key={it.id} className="rounded-2xl border border-line p-3.5">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-brand-50 px-2.5 py-1 text-sm font-black text-brand-700">{it.name}</span>
                <select value={it.monthly ? "m" : "o"} onChange={(e) => setItemMonthly(it.id, e.target.value === "m")}
                  className="rounded-lg border border-line px-2 py-1 text-xs font-bold text-ink outline-none focus:border-brand-500">
                  <option value="m">毎月（予定が毎月）</option>
                  <option value="o">一括（予定は総額）</option>
                </select>
                <button onClick={() => addRootTarget(it.id)} className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-brand-700">＋ 対象追加</button>
                <button onClick={() => delItem(it.id)} className="ml-auto rounded-lg border border-line px-2 py-1 text-xs text-muted hover:border-rose-400 hover:text-rose-500">項目削除</button>
              </div>
              {it.targets.length === 0 ? <p className="py-2 text-xs text-slate-400">対象がありません。「＋ 対象追加」から追加。</p>
                : <NodeRows nodes={it.targets} itemId={it.id} path={[]} onPatch={onPatch(it.id)} onAdd={onAdd(it.id)} onDel={onDel(it.id)} onMove={onMove(it.id)} />}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line p-2.5">
            <span className="text-xs font-bold text-muted">＋ 回収項目を追加：</span>
            <select value={newAcc} onChange={(e) => setNewAcc(e.target.value)}
              className="min-w-[220px] rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-500">
              <option value="">勘定科目を選択（設定で定義）</option>
              {accOptions.map((a, i) => <option key={i} value={i}>{a.label}</option>)}
            </select>
            <select value={newMonthly ? "m" : "o"} onChange={(e) => setNewMonthly(e.target.value === "m")}
              className="rounded-lg border border-line px-2 py-2 text-sm outline-none focus:border-brand-500">
              <option value="m">毎月</option><option value="o">一括</option>
            </select>
            <button onClick={addItem} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700">追加</button>
          </div>
        </div>
      </Panel>

      {/* ===== 12ヶ月 回収履歴 + 残高 ===== */}
      <Panel title="📅 回収履歴・残高（12ヶ月）"
        action={
          <div className="flex items-center gap-2">
            <select value={fy} onChange={(e) => setFy(Number(e.target.value))} className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-bold outline-none focus:border-brand-500">
              {[fy - 1, fy, fy + 1].filter((v, i, a) => a.indexOf(v) === i).map((y) => <option key={y} value={y}>{fiscalLabel(y)}</option>)}
            </select>
            <span className="text-[11px] text-slate-400">残高 = 予定 − 実回収</span>
          </div>
        }>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-xs">
            <thead>
              <tr className="border-b-2 border-line text-muted">
                <th className="sticky left-0 z-10 bg-white py-2 pr-2 text-left font-bold">項目 › 対象</th>
                {FY_MONTH_LABELS.map((l) => <th key={l} className="px-1.5 py-2 text-right font-bold">{l}</th>)}
                <th className="px-2 py-2 text-right font-bold">予定</th>
                <th className="px-2 py-2 text-right font-bold text-emerald-600">年間回収</th>
                <th className="px-2 py-2 text-right font-bold text-amber-600">残高</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {hist.length === 0 && <tr><td colSpan={16} className="py-8 text-center text-muted">対象がありません。</td></tr>}
              {hist.map((h) => (
                <tr key={h.targetId} className="hover:bg-surface">
                  <td className="sticky left-0 z-10 bg-white py-2 pr-2 text-left"><span className="font-bold text-ink">{h.itemName}</span> <span className="text-muted">› {h.label}</span></td>
                  {h.months.map((m, i) => <td key={i} className={`px-1.5 py-2 text-right tabular-nums ${m ? "text-ink" : "text-slate-300"}`}>{m ? yen(m).replace("¥", "") : "—"}</td>)}
                  <td className="px-2 py-2 text-right tabular-nums text-muted">{yen(h.expectedYear).replace("¥", "")}{h.monthly ? "" : "*"}</td>
                  <td className="px-2 py-2 text-right font-bold tabular-nums text-emerald-600">{yen(h.collectedYear).replace("¥", "")}</td>
                  <td className={`px-2 py-2 text-right font-black tabular-nums ${h.balance > 0 ? "text-amber-600" : h.balance < 0 ? "text-violet-600" : "text-slate-300"}`}>{yen(h.balance).replace("¥", "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-slate-400">単位：円 ・ 「毎月」項目は 予定＝月額×12 ／ 「一括(*)」は予定＝総額 ・ 残高＞0 = まだ回収できていない金額</p>
      </Panel>

      {/* ===== 回収記録 ===== */}
      <Panel title={`💴 回収記録一覧（${ym}）`} action={<button onClick={openCol} className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-sm font-bold text-white hover:bg-emerald-700">＋ 回収記録</button>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2.5 font-bold">項目 › 対象</th>
                <th className="py-2.5 text-right font-bold">回収額</th>
                <th className="py-2.5 font-bold">回収日</th>
                <th className="py-2.5 font-bold">方法</th>
                <th className="py-2.5 font-bold">メモ</th>
                <th className="py-2.5 text-right font-bold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {store.records.filter((r) => r.ym === ym).length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted">この月の回収記録はありません。</td></tr>}
              {store.records.filter((r) => r.ym === ym).map((r) => (
                <tr key={r.id} className="hover:bg-surface">
                  <td className="py-2.5"><span className="font-bold text-ink">{store.items.find((i) => i.id === r.itemId)?.name}</span> <span className="text-muted">› {nameOfTarget(store.items, r.itemId, r.targetId)}</span></td>
                  <td className="py-2.5 text-right font-black tabular-nums text-emerald-600">{yen(r.amount)}</td>
                  <td className="py-2.5 text-muted">{r.date}</td>
                  <td className="py-2.5"><span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-muted">{r.method}</span></td>
                  <td className="py-2.5 text-xs text-muted">{r.memo || "—"}</td>
                  <td className="py-2.5 text-right"><button onClick={() => delRec(r.id)} className="rounded-lg border border-line px-2 py-1 text-xs text-muted hover:border-rose-400 hover:text-rose-500">削除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Modal 回収記録 */}
      {showCol && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setShowCol(false)} />
          <div className="relative w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <h3 className="mb-1 text-base font-black text-ink">回収を記録</h3>
            <p className="mb-4 text-[11px] text-muted">対象は項目マスタから選択（ここでは新規作成しません）</p>
            <div className="space-y-3">
              <div><label className="mb-1 block text-xs font-bold text-muted">対象（項目 › …）*</label>
                <select value={cDraft.targetId} onChange={(e) => setCDraft((d) => ({ ...d, targetId: e.target.value }))} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500">
                  <option value="">選択してください</option>
                  {leaves.map((l) => <option key={l.targetId} value={l.targetId}>{l.itemName} › {l.label}{l.expected ? `（予定 ${yen(l.expected)}）` : ""}</option>)}
                </select>
                {cDraft.targetId && selBalance !== undefined && (
                  <p className="mt-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">現在の残高（未回収）：{yen(selBalance)}</p>
                )}
              </div>
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
