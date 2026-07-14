"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Panel from "@/components/ui/Panel";
import {
  STORAGE_KEY, QUARTERS, DEPARTMENTS, EMPLOYEES,
  sampleOkrs, krProgress, objProgress, groupProgress, statusOf,
  type Objective, type KR, type Level,
} from "@/lib/okr";

const emptyDraft = { title: "", level: "user" as Level, owner: EMPLOYEES[1].name };

function Bar({ value, small }: { value: number; small?: boolean }) {
  const tone = value >= 70 ? "bg-emerald-500" : value >= 40 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className={`w-full overflow-hidden rounded-full bg-surface ${small ? "h-1.5" : "h-2"}`}>
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${value}%` }} />
    </div>
  );
}

// Objective 1件（展開して KR を編集可能）。
function ObjectiveCard({ o, onUpdateKr, onAddKr, onRemove }: {
  o: Objective;
  onUpdateKr: (krId: string, current: number) => void;
  onAddKr: (title: string, target: number, unit: string) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [krTitle, setKrTitle] = useState("");
  const [krTarget, setKrTarget] = useState("");
  const [krUnit, setKrUnit] = useState("");
  const p = objProgress(o);
  const st = statusOf(p);

  return (
    <div className="rounded-2xl border border-line bg-white shadow-card">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`flex-none rounded-full px-2 py-0.5 text-[10px] font-bold ${st.tone}`}>{st.label}</span>
            <p className="truncate text-sm font-black text-ink">{o.title}</p>
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            <div className="flex-1"><Bar value={p} /></div>
            <span className="flex-none text-sm font-black text-ink">{p}%</span>
          </div>
        </div>
        <span className={`flex-none text-slate-400 transition ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div className="border-t border-line px-4 py-3.5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-muted">
                <th className="pb-1.5 font-bold">Key Result</th>
                <th className="pb-1.5 text-right font-bold">実績 / 目標</th>
                <th className="pb-1.5 w-32 text-right font-bold">進捗</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {o.krs.map((k) => (
                <tr key={k.id}>
                  <td className="py-2 text-xs font-semibold text-ink">{k.title}</td>
                  <td className="py-2 text-right text-xs">
                    <input type="number" value={k.current || ""} placeholder="0"
                      onChange={(e) => onUpdateKr(k.id, Number(e.target.value) || 0)}
                      className="w-24 rounded-lg border border-line px-2 py-1 text-right font-semibold outline-none focus:border-brand-500" />
                    <span className="ml-1 text-muted">/ {k.target.toLocaleString("ja-JP")} {k.unit}</span>
                  </td>
                  <td className="py-2 pl-3">
                    <div className="flex items-center gap-2">
                      <Bar value={krProgress(k)} small />
                      <span className="w-9 flex-none text-right text-[11px] font-black text-ink">{krProgress(k)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* KRを追加 */}
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-surface p-2">
            <input value={krTitle} onChange={(e) => setKrTitle(e.target.value)} placeholder="KR名（例：新規契約）"
              className="min-w-0 flex-1 rounded-lg border border-line px-2.5 py-1.5 text-xs outline-none focus:border-brand-500" />
            <input type="number" value={krTarget} onChange={(e) => setKrTarget(e.target.value)} placeholder="目標値"
              className="w-20 rounded-lg border border-line px-2 py-1.5 text-right text-xs outline-none focus:border-brand-500" />
            <input value={krUnit} onChange={(e) => setKrUnit(e.target.value)} placeholder="単位"
              className="w-16 rounded-lg border border-line px-2 py-1.5 text-xs outline-none focus:border-brand-500" />
            <button onClick={() => { if (!krTitle.trim() || !Number(krTarget)) return; onAddKr(krTitle.trim(), Number(krTarget), krUnit.trim()); setKrTitle(""); setKrTarget(""); setKrUnit(""); }}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700">＋ KR</button>
            <button onClick={onRemove} className="rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted hover:border-rose-400 hover:text-rose-500">目標を削除</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OkrManager() {
  const [objs, setObjs] = useState<Objective[]>([]);
  const [quarter, setQuarter] = useState("2026-Q3");
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState<{ title: string; level: Level; owner: string }>(emptyDraft);
  const ready = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      setObjs(raw ? (JSON.parse(raw) as Objective[]) : sampleOkrs());
    } catch { setObjs(sampleOkrs()); }
    ready.current = true;
  }, []);
  useEffect(() => {
    if (!ready.current) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(objs)); } catch { /* ignore */ }
  }, [objs]);

  const inQuarter = useMemo(() => objs.filter((o) => o.quarter === quarter), [objs, quarter]);
  const orgObjs = inQuarter.filter((o) => o.level === "org");
  const orgProgress = groupProgress(inQuarter); // 当四半期の全目標 = 組織全体の進捗

  function updateKr(objId: string, krId: string, current: number) {
    setObjs((prev) => prev.map((o) => o.id === objId
      ? { ...o, krs: o.krs.map((k) => k.id === krId ? { ...k, current } : k) } : o));
  }
  function addKr(objId: string, title: string, target: number, unit: string) {
    const kr: KR = { id: "k" + Date.now(), title, target, current: 0, unit };
    setObjs((prev) => prev.map((o) => o.id === objId ? { ...o, krs: [...o.krs, kr] } : o));
  }
  function removeObj(objId: string) {
    if (!confirm("この目標を削除しますか？")) return;
    setObjs((prev) => prev.filter((o) => o.id !== objId));
  }
  function addObjective() {
    if (!draft.title.trim()) { alert("目標タイトルは必須です。"); return; }
    const owner = draft.level === "org" ? "全社" : draft.owner;
    setObjs((prev) => [...prev, { id: "o" + Date.now(), title: draft.title.trim(), quarter, level: draft.level, owner, krs: [] }]);
    setDraft(emptyDraft); setShowNew(false);
  }
  function resetSample() {
    if (!confirm("サンプルデータに戻します。よろしいですか？")) return;
    setObjs(sampleOkrs());
  }

  const section = (title: string, items: Objective[]) => items.length > 0 && (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <h4 className="text-sm font-black text-ink">{title}</h4>
        <span className="text-xs font-bold text-muted">{groupProgress(items)}%</span>
        <div className="w-40"><Bar value={groupProgress(items)} small /></div>
      </div>
      <div className="space-y-3">
        {items.map((o) => (
          <ObjectiveCard key={o.id} o={o}
            onUpdateKr={(krId, v) => updateKr(o.id, krId, v)}
            onAddKr={(t, tg, u) => addKr(o.id, t, tg, u)}
            onRemove={() => removeObj(o.id)} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white p-3 shadow-card">
        <select value={quarter} onChange={(e) => setQuarter(e.target.value)}
          className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-bold text-ink outline-none focus:border-brand-500">
          {QUARTERS.map((qt) => <option key={qt}>{qt}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowNew(true)} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-brand-700">＋ 目標を追加</button>
          <button onClick={resetSample} className="rounded-xl border border-line px-3 py-2 text-xs font-bold text-muted hover:border-rose-400 hover:text-rose-500">サンプルに戻す</button>
        </div>
      </div>

      {/* 組織全体サマリーカード */}
      <div className="rounded-2xl border border-line bg-gradient-to-br from-brand-600 to-brand-700 p-6 text-white shadow-card">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-sm font-bold opacity-90">🏢 組織全体の進捗（{quarter}）</p>
            <p className="mt-1 text-4xl font-black">{orgProgress}%</p>
          </div>
          <div className="min-w-[220px] flex-1">
            <div className="h-3 w-full overflow-hidden rounded-full bg-white/25">
              <div className="h-full rounded-full bg-white" style={{ width: `${orgProgress}%` }} />
            </div>
            <p className="mt-2 text-xs opacity-80">{inQuarter.length}個の目標 ・ 全社 {orgObjs.length} ／ 部署 {inQuarter.filter((o) => o.level === "dept").length} ／ 個人 {inQuarter.filter((o) => o.level === "user").length}</p>
          </div>
        </div>
      </div>

      {/* 全社 */}
      {section("🏢 全社目標", orgObjs)}

      {/* 部署 */}
      {DEPARTMENTS.map((d) => section(`👥 ${d}`, inQuarter.filter((o) => o.level === "dept" && o.owner === d)))}

      {/* 個人（メンバー別） */}
      <Panel title="👤 個人目標（メンバー別）">
        <div className="space-y-6">
          {EMPLOYEES.map((emp) => {
            const mine = inQuarter.filter((o) => o.level === "user" && o.owner === emp.name);
            if (mine.length === 0) return null;
            return (
              <div key={emp.name}>
                <div className="mb-2 flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-black text-brand-700">{emp.name.charAt(0)}</span>
                  <div>
                    <p className="text-sm font-bold text-ink">{emp.name}</p>
                    <p className="text-[10px] text-muted">{emp.dept}</p>
                  </div>
                  <span className="ml-2 text-xs font-black text-ink">{groupProgress(mine)}%</span>
                  <div className="w-32"><Bar value={groupProgress(mine)} small /></div>
                </div>
                <div className="space-y-3 pl-10">
                  {mine.map((o) => (
                    <ObjectiveCard key={o.id} o={o}
                      onUpdateKr={(krId, v) => updateKr(o.id, krId, v)}
                      onAddKr={(t, tg, u) => addKr(o.id, t, tg, u)}
                      onRemove={() => removeObj(o.id)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* モーダル：Objective追加 */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setShowNew(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="mb-4 text-base font-black text-ink">目標（Objective）を追加 — {quarter}</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-muted">目標タイトル *</label>
                <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  placeholder="例：新規顧客の開拓で売上基盤を広げる"
                  className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">レベル</label>
                  <select value={draft.level} onChange={(e) => { const level = e.target.value as Level; setDraft((d) => ({ ...d, level, owner: level === "dept" ? DEPARTMENTS[0] : level === "user" ? EMPLOYEES[1].name : "全社" })); }}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500">
                    <option value="org">全社</option><option value="dept">部署</option><option value="user">個人</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">担当</label>
                  {draft.level === "org" ? (
                    <input value="全社" disabled className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-muted" />
                  ) : draft.level === "dept" ? (
                    <select value={draft.owner} onChange={(e) => setDraft((d) => ({ ...d, owner: e.target.value }))}
                      className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500">
                      {DEPARTMENTS.map((dp) => <option key={dp}>{dp}</option>)}
                    </select>
                  ) : (
                    <select value={draft.owner} onChange={(e) => setDraft((d) => ({ ...d, owner: e.target.value }))}
                      className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500">
                      {EMPLOYEES.map((emp) => <option key={emp.name}>{emp.name}</option>)}
                    </select>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-slate-400">※ 目標を作成した後、カードを開いて Key Result を追加してください。</p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowNew(false)} className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-muted hover:bg-surface">キャンセル</button>
              <button onClick={addObjective} className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white hover:bg-brand-700">追加する</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
