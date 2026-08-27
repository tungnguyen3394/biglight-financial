"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Panel from "@/components/ui/Panel";
import Icon from "@/components/Icon";
import {
  STORAGE_KEY, LEGACY_KEY, TIER_LABELS, MAX_DEPTH, PAY_METHODS, METHOD_TONE,
  defaultTree, sampleExpenses, migrateV1, childrenAt, labelsOf, underPath,
  addChildAt, renameAt, deleteAt, yen,
  type CatNode, type Expense, type ExpenseStore, type PayMethod,
} from "@/lib/expenses";

type RecFilter = "" | "REC" | "ONCE";

const emptyDraft = {
  date: "", path: [] as string[], vendor: "", amount: "",
  method: "振込" as PayMethod, recurring: false, recurringDay: 25, note: "", propertyId: "",
};

function openPrint(title: string, bodyHtml: string) {
  const w = window.open("", "_blank", "width=1000,height=720");
  if (!w) return;
  w.document.write(`<html><head><meta charset="utf-8"><title>${title}</title><style>
    body{font-family:'Hiragino Sans','Noto Sans JP',Meiryo,sans-serif;padding:24px;color:#0f172a}
    h1{font-size:18px;margin:0 0 4px}.sub{color:#64748b;font-size:11px;margin-bottom:16px}
    table{border-collapse:collapse;width:100%;font-size:12px;margin-bottom:18px}
    th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}th{background:#f1f5f9}
    td.r,th.r{text-align:right}.tot{font-weight:800;background:#f8fafc}.red{color:#dc2626;font-weight:700}
  </style></head><body>${bodyHtml}</body></html>`);
  w.document.close(); w.focus();
  setTimeout(() => w.print(), 300);
}

// 既定パス：常に先頭の子をたどって末端まで展開する。
function autoExtend(tree: CatNode[], path: string[]): string[] {
  const out = [...path];
  while (out.length < MAX_DEPTH) {
    const kids = childrenAt(tree, out);
    if (kids.length === 0) break;
    out.push(kids[0].key);
  }
  return out;
}

// ==================================================================
// 分類ツリー編集（再帰・最大4階層）— 分類設定で使用
// ==================================================================
function CatEditor({ nodes, path, tree, onChange }: {
  nodes: CatNode[]; path: string[]; tree: CatNode[];
  onChange: (tree: CatNode[]) => void;
}) {
  const depth = path.length; // 0 = 大分類を列挙中
  const [adding, setAdding] = useState("");

  return (
    <div className={depth > 0 ? "ml-5 border-l border-line pl-3" : ""}>
      {nodes.map((n) => (
        <CatRow key={n.key} node={n} path={[...path, n.key]} tree={tree} onChange={onChange} />
      ))}
      {/* この階層に項目を追加 */}
      <div className="mt-1.5 flex items-center gap-1.5">
        <input value={adding} onChange={(e) => setAdding(e.target.value)}
          placeholder={`＋ ${TIER_LABELS[depth]}を追加`}
          className="w-44 rounded-lg border border-dashed border-line px-2.5 py-1.5 text-xs outline-none focus:border-brand-500" />
        <button onClick={() => { if (!adding.trim()) return; onChange(addChildAt(tree, path, adding.trim())); setAdding(""); }}
          className="rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-brand-700">追加</button>
      </div>
    </div>
  );
}

function CatRow({ node, path, tree, onChange }: {
  node: CatNode; path: string[]; tree: CatNode[];
  onChange: (tree: CatNode[]) => void;
}) {
  const [open, setOpen] = useState(path.length === 1); // 大分類は初期展開
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(node.label);
  const depth = path.length;
  const canHaveChildren = depth < MAX_DEPTH;
  const kids = node.children ?? [];

  return (
    <div className="py-0.5">
      <div className="flex items-center gap-1.5">
        {canHaveChildren ? (
          <button onClick={() => setOpen(!open)} className="flex h-5 w-5 flex-none items-center justify-center rounded text-slate-400 hover:bg-surface">
            <Icon name="chevronRight" size={11} className={`transition-transform ${open ? "rotate-90" : ""}`} />
          </button>
        ) : <span className="h-5 w-5 flex-none" />}
        <span className={`rounded px-1.5 py-0.5 text-[9px] font-black ${depth === 1 ? "bg-brand-50 text-brand-700" : depth === 2 ? "bg-emerald-50 text-emerald-600" : depth === 3 ? "bg-amber-50 text-amber-600" : "bg-violet-50 text-violet-600"}`}>
          {TIER_LABELS[depth - 1]}
        </span>
        {editing ? (
          <>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
              className="w-40 rounded-lg border border-brand-500 px-2 py-1 text-xs outline-none" />
            <button onClick={() => { if (name.trim()) onChange(renameAt(tree, path, name.trim())); setEditing(false); }}
              className="rounded bg-brand-600 px-2 py-1 text-[10px] font-bold text-white">保存</button>
          </>
        ) : (
          <>
            <span className="text-sm font-semibold text-ink">{node.label}</span>
            <button onClick={() => { setName(node.label); setEditing(true); }} className="flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-brand-600"><Icon name="pencil" size={10} />名称</button>
            <button onClick={() => { if (confirm(`「${node.label}」を削除しますか？（配下の分類も削除されます。既存の支出データは残ります）`)) onChange(deleteAt(tree, path)); }}
              className="flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-rose-500"><Icon name="close" size={10} />削除</button>
          </>
        )}
      </div>
      {open && canHaveChildren && (
        <CatEditor nodes={kids} path={path} tree={tree} onChange={onChange} />
      )}
    </div>
  );
}

// ==================================================================
// 分類別ビュー用の展開ツリー行
// ==================================================================
function TreeRows({ nodes, path, records, tree, expanded, toggle }: {
  nodes: CatNode[]; path: string[]; records: Expense[]; tree: CatNode[];
  expanded: Set<string>; toggle: (k: string) => void;
}) {
  return (
    <>
      {nodes.map((n) => {
        const p = [...path, n.key];
        const pk = p.join("/");
        const total = records.filter((r) => underPath(r, p)).reduce((t, r) => t + r.amount, 0);
        const count = records.filter((r) => underPath(r, p)).length;
        const kids = n.children ?? [];
        const exact = records.filter((r) => r.path.join("/") === pk); // このノードに一致する明細
        const isOpen = expanded.has(pk);
        const depth = p.length;
        return (
          <div key={n.key}>
            <button onClick={() => toggle(pk)}
              className={`flex w-full items-center gap-2 border-b border-line/60 py-2.5 pr-2 text-left hover:bg-surface ${depth === 1 ? "bg-surface/60" : ""}`}
              style={{ paddingLeft: (depth - 1) * 22 + 8 }}>
              <span className={`flex h-5 w-5 flex-none items-center justify-center text-slate-400 transition ${isOpen ? "rotate-90" : ""}`}>
                {(kids.length > 0 || exact.length > 0) ? <Icon name="chevronRight" size={11} /> : null}
              </span>
              <span className={`flex-1 truncate text-sm ${depth === 1 ? "font-black text-ink" : depth === 2 ? "font-bold text-ink" : "font-semibold text-muted"}`}>{n.label}</span>
              {count > 0 && <span className="flex-none rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold text-muted">{count}件</span>}
              <span className={`w-28 flex-none text-right text-sm font-black tabular-nums ${total ? "text-ink" : "text-slate-300"}`}>{total ? yen(total) : "—"}</span>
            </button>
            {isOpen && (
              <>
                {/* このノードに一致する明細 */}
                {exact.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 border-b border-line/40 py-2 pr-2 text-xs"
                    style={{ paddingLeft: depth * 22 + 8 }}>
                    <span className="w-20 flex-none text-slate-400">{r.date.slice(5)}</span>
                    <span className="flex-1 truncate font-semibold text-ink">{r.vendor || "—"}</span>
                    <span className={`flex-none rounded-full px-1.5 py-0.5 text-[9px] font-bold ${METHOD_TONE[r.method]}`}>{r.method}</span>
                    <span className={`flex-none rounded-full px-1.5 py-0.5 text-[9px] font-bold ${r.recurring ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500"}`}>
                      {r.recurring ? `定期${r.recurringDay ? `・${r.recurringDay}日` : ""}` : "不定期"}
                    </span>
                    <span className="w-28 flex-none text-right font-bold tabular-nums text-ink">{yen(r.amount)}</span>
                  </div>
                ))}
                {kids.length > 0 && (
                  <TreeRows nodes={kids} path={p} records={records} tree={tree} expanded={expanded} toggle={toggle} />
                )}
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

// ==================================================================
// メイン画面
// ==================================================================
export default function ExpensesManager() {
  const [store, setStore] = useState<ExpenseStore>({ version: 2, tree: [], records: [], budgets: {} });
  const [month, setMonth] = useState("");
  const [view, setView] = useState<"list" | "tree">("list");
  const [majorF, setMajorF] = useState("");
  const [recF, setRecF] = useState<RecFilter>("");
  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [editBudget, setEditBudget] = useState(false);
  const [showCats, setShowCats] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const ready = useRef(false);

  useEffect(() => {
    setMonth(new Date().toISOString().slice(0, 7));
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) { setStore(JSON.parse(raw) as ExpenseStore); }
      else {
        const legacy = window.localStorage.getItem(LEGACY_KEY);
        setStore(legacy ? migrateV1(JSON.parse(legacy)) : sampleExpenses());
      }
    } catch { setStore(sampleExpenses()); }
    ready.current = true;
  }, []);
  useEffect(() => {
    if (!ready.current) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* ignore */ }
  }, [store]);

  const tree = store.tree;

  const monthRecords = useMemo(() => store.records.filter((r) => r.date.slice(0, 7) === month), [store.records, month]);

  // 両ビュー共通のフィルタ。
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return monthRecords
      .filter((r) => !majorF || r.path[0] === majorF)
      .filter((r) => recF === "" ? true : recF === "REC" ? r.recurring : !r.recurring)
      .filter((r) => {
        if (!kw) return true;
        const labels = labelsOf(tree, r.path).join(" ");
        return `${r.vendor} ${r.note} ${labels}`.toLowerCase().includes(kw);
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [monthRecords, majorF, recF, q, tree]);

  const majorTotals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of monthRecords) out[r.path[0]] = (out[r.path[0]] ?? 0) + r.amount;
    return out;
  }, [monthRecords]);

  const totalMonth = monthRecords.reduce((t, r) => t + r.amount, 0);
  const totalBudget = tree.reduce((t, m) => t + (store.budgets[m.key] ?? 0), 0);

  const warnings = tree
    .map((m) => ({ key: m.key, label: m.label, spent: majorTotals[m.key] ?? 0, budget: store.budgets[m.key] ?? 0 }))
    .filter((x) => x.budget > 0 && x.spent > x.budget);

  // 当月の定期支払スケジュール（支払日順）。
  const schedule = useMemo(() =>
    monthRecords.filter((r) => r.recurring).sort((a, b) => (a.recurringDay ?? 99) - (b.recurringDay ?? 99)),
  [monthRecords]);

  function openNew(recurring: boolean) {
    setDraft({ ...emptyDraft, date: month + "-01", path: autoExtend(tree, []), recurring, recurringDay: 25 });
    setShowNew(true);
  }
  function addExpense() {
    if (!draft.date || !draft.amount || draft.path.length === 0) { alert("日付・金額・分類は必須です。"); return; }
    setStore((prev) => ({
      ...prev,
      records: [{
        id: "e" + Date.now(), date: draft.date, path: draft.path, vendor: draft.vendor.trim(),
        amount: Number(draft.amount) || 0, method: draft.method,
        recurring: draft.recurring, recurringDay: draft.recurring ? draft.recurringDay : undefined,
        note: draft.note.trim(),
      }, ...prev.records],
    }));
    setDraft(emptyDraft); setShowNew(false);
  }
  function removeExpense(id: string) {
    if (!confirm("この支出を削除しますか？")) return;
    setStore((prev) => ({ ...prev, records: prev.records.filter((r) => r.id !== id) }));
  }
  function setBudget(major: string, v: number) {
    setStore((prev) => ({ ...prev, budgets: { ...prev.budgets, [major]: v } }));
  }
  function setTree(t: CatNode[]) {
    setStore((prev) => ({ ...prev, tree: t }));
  }
  function resetSample() {
    if (!confirm("サンプルデータに戻します。よろしいですか？（分類ツリーもリセットされます）")) return;
    setStore(sampleExpenses());
  }
  function resetTreeOnly() {
    if (!confirm("分類ツリーを初期状態に戻しますか？（支出データは残ります）")) return;
    setTree(defaultTree());
  }
  function toggleExpand(k: string) {
    setExpanded((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }
  function printList() {
    const body = `<h1>支出一覧（${month}）</h1><div class="sub">${filtered.length}件 ・ 合計 ${yen(filtered.reduce((t, r) => t + r.amount, 0))}</div>
      <table><tr><th>日付</th><th>分類</th><th>支払先</th><th>支払方法</th><th>区分</th><th class="r">金額</th><th>メモ</th></tr>
      ${filtered.map((r) => `<tr><td>${r.date}</td><td>${labelsOf(tree, r.path).join(" › ")}</td><td>${r.vendor}</td><td>${r.method}</td><td>${r.recurring ? `定期（毎月${r.recurringDay ?? "?"}日）` : "不定期"}</td><td class="r">${yen(r.amount)}</td><td>${r.note}</td></tr>`).join("")}
      <tr class="tot"><td colspan="5">合計</td><td class="r">${yen(filtered.reduce((t, r) => t + r.amount, 0))}</td><td></td></tr></table>
      <h1 style="font-size:14px">予算対比（${month}）</h1>
      <table><tr><th>大分類</th><th class="r">予算</th><th class="r">実績</th><th class="r">残予算</th></tr>
      ${tree.map((m) => { const spent = majorTotals[m.key] ?? 0; const b = store.budgets[m.key] ?? 0; const left = b - spent; return `<tr><td>${m.label}</td><td class="r">${yen(b)}</td><td class="r">${yen(spent)}</td><td class="r ${left < 0 ? "red" : ""}">${yen(left)}</td></tr>`; }).join("")}</table>`;
    openPrint(`支出一覧_${month}`, body);
  }

  // 登録モーダルの連動セレクト（最大4階層・子がある階層のみ表示）。
  const levels: { options: CatNode[]; value: string }[] = [];
  for (let i = 0; i < MAX_DEPTH; i++) {
    const options = childrenAt(tree, draft.path.slice(0, i));
    if (options.length === 0) break;
    levels.push({ options, value: draft.path[i] ?? "" });
  }
  function pickLevel(i: number, key: string) {
    setDraft((d) => ({ ...d, path: autoExtend(tree, [...d.path.slice(0, i), key]) }));
  }

  if (!month) return <div className="rounded-2xl border border-line bg-white p-12 text-center text-sm text-muted">読み込み中…</div>;

  return (
    <div className="space-y-6">
      {/* ===== 予算超過アラート ===== */}
      {warnings.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="flex items-center gap-1.5 text-sm font-black text-red-600"><Icon name="warning" size={15} />予算超過アラート（{month}）</p>
          <ul className="mt-1.5 space-y-0.5 text-xs text-red-600">
            {warnings.map((w) => (
              <li key={w.key}><b>{w.label}</b>：実績 {yen(w.spent)} ／ 予算 {yen(w.budget)} → <b>{yen(w.spent - w.budget)} 超過（{Math.round((w.spent / w.budget) * 100)}%）</b></li>
            ))}
          </ul>
        </div>
      )}

      {/* ===== Toolbar ===== */}
      <div className="space-y-3 rounded-3xl border border-line/70 bg-white p-3.5 shadow-card">
        <div className="flex flex-wrap items-center gap-2.5">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
            className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-bold text-ink outline-none focus:border-brand-500" />
          <select value={view} onChange={(e) => setView(e.target.value as "list" | "tree")}
            className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold text-ink outline-none focus:border-brand-500">
            <option value="list">一覧表示</option>
            <option value="tree">分類別（ツリー）</option>
          </select>
          <select value={recF} onChange={(e) => setRecF(e.target.value as RecFilter)}
            className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold text-ink outline-none focus:border-brand-500">
            <option value="">種別：すべて</option>
            <option value="REC">定期のみ</option>
            <option value="ONCE">不定期のみ</option>
          </select>
          <select value={majorF} onChange={(e) => setMajorF(e.target.value)}
            className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-brand-500">
            <option value="">すべての大分類</option>
            {tree.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="支払先・分類・メモで検索…"
            className="min-w-[180px] flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand-500" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">合計 <b className="text-ink">{yen(totalMonth)}</b> ／ 予算 <b className="text-ink">{yen(totalBudget)}</b>
            <span className={`ml-1 font-black ${totalMonth > totalBudget && totalBudget > 0 ? "text-red-600" : "text-emerald-600"}`}>({totalBudget ? Math.round((totalMonth / totalBudget) * 100) : 0}%)</span>
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <button onClick={() => openNew(true)} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-brand-700">＋ 支出を登録</button>
            {/* 補助ボタンのメニュー */}
            <div className="relative">
              <button onClick={() => setMenuOpen((o) => !o)} className="flex h-9 items-center gap-1 rounded-xl border border-line px-3 text-xs font-bold text-muted hover:border-brand-500 hover:text-brand-600"><Icon name="gear" size={13} />設定</button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 z-50 mt-1.5 w-44 rounded-2xl border border-line bg-white p-1.5 shadow-card">
                    {[
                      { l: "分類設定", fn: () => setShowCats(true) },
                      { l: "予算を設定", fn: () => setEditBudget(true) },
                      { l: "印刷 / PDF", fn: printList },
                    ].map((it) => (
                      <button key={it.l} onClick={() => { it.fn(); setMenuOpen(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-ink hover:bg-surface">{it.l}</button>
                    ))}
                    <div className="my-1 border-t border-line/70" />
                    <button onClick={() => { resetSample(); setMenuOpen(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-rose-500 hover:bg-rose-50">サンプルに戻す</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===== 大分類カード + 定期スケジュール ===== */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {tree.map((m) => {
          const spent = majorTotals[m.key] ?? 0;
          const budget = store.budgets[m.key] ?? 0;
          const rate = budget ? Math.round((spent / budget) * 100) : 0;
          const over = budget > 0 && spent > budget;
          return (
            <div key={m.key} className={`rounded-2xl border bg-white p-5 shadow-card ${over ? "border-red-300" : "border-line"}`}>
              <div className="flex items-start justify-between">
                <p className="text-sm font-black text-ink">{m.label}</p>
                {budget > 0 && <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${over ? "bg-red-50 text-red-600" : rate >= 80 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>{rate}%</span>}
              </div>
              <p className={`mt-1 text-xl font-black ${over ? "text-red-600" : "text-ink"}`}>{yen(spent)}</p>
              <p className="text-[11px] text-slate-400">予算 {budget ? yen(budget) : "未設定"}</p>
              {budget > 0 && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface">
                  <div className={`h-full rounded-full ${over ? "bg-red-500" : rate >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(rate, 100)}%` }} />
                </div>
              )}
            </div>
          );
        })}

        {/* 定期支払スケジュール */}
        <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink"><Icon name="calendar" size={15} className="text-brand-600" />定期支払（{month}）</p>
          {schedule.length === 0 ? (
            <p className="text-xs text-slate-400">定期支出はありません。</p>
          ) : (
            <ul className="space-y-1.5">
              {schedule.slice(0, 6).map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-xs">
                  <span className="flex h-6 w-8 flex-none items-center justify-center rounded-lg bg-brand-50 font-black text-brand-700">{r.recurringDay ?? "?"}日</span>
                  <span className="flex-1 truncate font-semibold text-ink">{r.vendor || labelsOf(tree, r.path).pop()}</span>
                  <span className="flex-none font-bold text-ink">{yen(r.amount)}</span>
                </li>
              ))}
              {schedule.length > 6 && <li className="text-[10px] text-slate-400">…他 {schedule.length - 6}件（定期フィルタで表示）</li>}
            </ul>
          )}
        </div>
      </div>

      {/* ===== 本体：一覧 または 分類別ツリー ===== */}
      {view === "list" ? (
        <Panel title={`支出一覧（${month}）`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2.5 font-bold">日付</th>
                  <th className="py-2.5 font-bold">分類（大 › 中 › 小 › 細）</th>
                  <th className="py-2.5 font-bold">支払先</th>
                  <th className="py-2.5 text-center font-bold">支払方法</th>
                  <th className="py-2.5 text-center font-bold">区分</th>
                  <th className="py-2.5 text-right font-bold">金額</th>
                  <th className="py-2.5 font-bold">メモ</th>
                  <th className="py-2.5 text-right font-bold">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-muted">該当データがありません。</td></tr>}
                {filtered.map((r) => {
                  const labels = labelsOf(tree, r.path);
                  return (
                    <tr key={r.id} className="hover:bg-surface">
                      <td className="py-3 text-muted">{r.date}</td>
                      <td className="py-3">
                        {labels.map((l, i) => (
                          <span key={i}>
                            {i > 0 && <span className="mx-1 text-slate-300">›</span>}
                            <span className={i === 0 ? "rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700" : `text-xs font-semibold ${i === labels.length - 1 ? "text-ink" : "text-muted"}`}>{l}</span>
                          </span>
                        ))}
                      </td>
                      <td className="py-3 font-semibold text-ink">{r.vendor || "—"}</td>
                      <td className="py-3 text-center"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${METHOD_TONE[r.method]}`}>{r.method}</span></td>
                      <td className="py-3 text-center">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${r.recurring ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500"}`}>
                          {r.recurring ? `定期・毎月${r.recurringDay ?? "?"}日` : "不定期"}
                        </span>
                      </td>
                      <td className="py-3 text-right font-black text-ink">{yen(r.amount)}</td>
                      <td className="py-3 text-xs text-muted">{r.note || "—"}</td>
                      <td className="py-3 text-right">
                        <button onClick={() => removeExpense(r.id)} className="rounded-lg border border-line px-2 py-1 text-xs text-muted hover:border-rose-400 hover:text-rose-500">削除</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : (
        <Panel title={`分類別ツリー（${month}）— クリックで展開`}
          action={
            <div className="flex gap-1.5">
              <button onClick={() => { const all = new Set<string>(); const walk = (ns: CatNode[], p: string[]) => ns.forEach((n) => { const np = [...p, n.key]; all.add(np.join("/")); walk(n.children ?? [], np); }); walk(tree, []); setExpanded(all); }}
                className="rounded-lg border border-line px-2.5 py-1 text-xs font-bold text-muted hover:border-brand-500 hover:text-brand-600">すべて展開</button>
              <button onClick={() => setExpanded(new Set())} className="rounded-lg border border-line px-2.5 py-1 text-xs font-bold text-muted hover:border-brand-500 hover:text-brand-600">すべて閉じる</button>
            </div>
          }>
          <div className="flex items-center gap-2 border-b border-line pb-2 pl-2 text-[11px] font-bold text-muted">
            <span className="flex-1">分類</span><span className="w-28 text-right">金額</span>
          </div>
          <TreeRows nodes={tree} path={[]} records={filtered} tree={tree} expanded={expanded} toggle={toggleExpand} />
          <div className="flex items-center gap-2 border-t-2 border-line pt-2.5 pl-2 text-sm font-black">
            <span className="flex-1 text-ink">合計</span>
            <span className="w-28 text-right text-ink">{yen(filtered.reduce((t, r) => t + r.amount, 0))}</span>
          </div>
        </Panel>
      )}

      {/* ===== モーダル：支出登録（定期/不定期） ===== */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setShowNew(false)} />
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="mb-1 text-base font-black text-ink">{draft.recurring ? "定期支出を登録" : "不定期支出を登録"}</h3>
            <p className="mb-4 text-[11px] text-muted">{draft.recurring ? "毎月発生する費用（給与・家賃・SaaS など）" : "単発で発生する費用（広告・出張・接待 など）"}</p>
            <div className="space-y-3">
              {/* 種別 dropdown */}
              <div>
                <label className="mb-1 block text-xs font-bold text-muted">種別</label>
                <select value={draft.recurring ? "rec" : "spot"} onChange={(e) => setDraft((d) => ({ ...d, recurring: e.target.value === "rec" }))}
                  className="w-full rounded-xl border border-line px-3 py-2 text-sm font-semibold text-ink outline-none focus:border-brand-500">
                  <option value="rec">定期（毎月・年度末まで自動）</option>
                  <option value="spot">不定期（単発）</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">支払日 *</label>
                  <input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">金額（円） *</label>
                  <input type="number" value={draft.amount} onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                    className="w-full rounded-xl border border-line px-3 py-2 text-right text-sm font-semibold outline-none focus:border-brand-500" />
                </div>
              </div>

              {/* 分類の連動セレクト（最大4階層） */}
              <div>
                <label className="mb-1 block text-xs font-bold text-muted">分類（{levels.map((_, i) => TIER_LABELS[i]).join(" › ")}）</label>
                <div className={`grid gap-2 ${levels.length >= 4 ? "grid-cols-4" : levels.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                  {levels.map((lv, i) => (
                    <select key={i} value={lv.value} onChange={(e) => pickLevel(i, e.target.value)}
                      className="rounded-xl border border-line px-2 py-2 text-xs font-semibold outline-none focus:border-brand-500">
                      {lv.options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">支払方法</label>
                  <select value={draft.method} onChange={(e) => setDraft((d) => ({ ...d, method: e.target.value as PayMethod }))}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500">
                    {PAY_METHODS.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
                {draft.recurring && (
                  <div>
                    <label className="mb-1 block text-xs font-bold text-muted">定期支払日（毎月）</label>
                    <select value={draft.recurringDay} onChange={(e) => setDraft((d) => ({ ...d, recurringDay: Number(e.target.value) }))}
                      className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500">
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((dd) => <option key={dd} value={dd}>{dd}日</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">支払先</label>
                  <input value={draft.vendor} onChange={(e) => setDraft((d) => ({ ...d, vendor: e.target.value }))}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">メモ</label>
                  <input value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowNew(false)} className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-muted hover:bg-surface">キャンセル</button>
              <button onClick={addExpense} className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white hover:bg-brand-700">登録する</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== モーダル：分類設定（4階層ツリー管理） ===== */}
      {showCats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setShowCats(false)} />
          <div className="relative flex max-h-[86vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h3 className="flex items-center gap-1.5 text-base font-black text-ink"><Icon name="gear" size={16} className="text-brand-600" />分類マスタ設定</h3>
                <p className="text-[11px] text-muted">大 › 中 › 小 › 細（第4階層は任意）— 追加・編集・削除が可能。変更は即時保存されます。</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={resetTreeOnly} className="rounded-xl border border-line px-3 py-1.5 text-xs font-bold text-muted hover:border-rose-400 hover:text-rose-500">初期値に戻す</button>
                <button onClick={() => setShowCats(false)} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface" aria-label="閉じる"><Icon name="close" size={16} /></button>
              </div>
            </div>
            <div className="overflow-auto p-5">
              <CatEditor nodes={tree} path={[]} tree={tree} onChange={setTree} />
            </div>
            <div className="flex justify-end border-t border-line px-5 py-3">
              <button onClick={() => setShowCats(false)} className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white hover:bg-brand-700">完了</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal: 予算 ===== */}
      {editBudget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setEditBudget(false)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="mb-1 text-base font-black text-ink">月次予算を設定</h3>
            <p className="mb-4 text-[11px] text-muted">大分類ごとの月次予算 — 超過すると赤字で警告します。</p>
            <div className="space-y-3">
              {tree.map((m) => (
                <div key={m.key} className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-ink">{m.label}</span>
                  <input type="number" value={store.budgets[m.key] ?? ""} onChange={(e) => setBudget(m.key, Number(e.target.value) || 0)}
                    placeholder="0" className="w-40 rounded-xl border border-line px-3 py-2 text-right text-sm font-semibold outline-none focus:border-brand-500" />
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-end">
              <button onClick={() => setEditBudget(false)} className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white hover:bg-brand-700">完了</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
