"use client";

import { useEffect, useRef, useState } from "react";
import Panel from "@/components/ui/Panel";
import Icon from "@/components/Icon";
import {
  STORAGE_KEY, TIER_LABELS, defaultAccounts, addChildAt, renameAt, deleteAt, type CatNode,
} from "@/lib/accounts";

const MAX_DEPTH = 4;

function Node({ node, path, tree, onChange }: { node: CatNode; path: string[]; tree: CatNode[]; onChange: (t: CatNode[]) => void }) {
  const [open, setOpen] = useState(path.length === 1);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(node.label);
  const [adding, setAdding] = useState("");
  const depth = path.length;
  const kids = node.children ?? [];
  const canChild = depth < MAX_DEPTH;

  return (
    <div className="py-0.5" style={{ paddingLeft: depth > 1 ? 16 : 0 }}>
      <div className="flex items-center gap-1.5">
        {canChild ? <button onClick={() => setOpen(!open)} className="flex h-5 w-5 flex-none items-center justify-center text-slate-400"><Icon name="chevronRight" size={11} className={`transition-transform ${open ? "rotate-90" : ""}`} /></button> : <span className="h-5 w-5 flex-none" />}
        <span className={`rounded px-1.5 py-0.5 text-[9px] font-black ${depth === 1 ? "bg-brand-50 text-brand-700" : depth === 2 ? "bg-emerald-50 text-emerald-600" : depth === 3 ? "bg-amber-50 text-amber-600" : "bg-violet-50 text-violet-600"}`}>{TIER_LABELS[depth - 1]}</span>
        {editing ? (
          <>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="w-40 rounded-lg border border-brand-500 px-2 py-1 text-xs outline-none" />
            <button onClick={() => { if (name.trim()) onChange(renameAt(tree, path, name.trim())); setEditing(false); }} className="rounded bg-brand-600 px-2 py-1 text-[10px] font-bold text-white">保存</button>
          </>
        ) : (
          <>
            <span className="text-sm font-semibold text-ink">{node.label}</span>
            <button onClick={() => { setName(node.label); setEditing(true); }} className="text-slate-400 hover:text-brand-600" aria-label="名称変更"><Icon name="pencil" size={11} /></button>
            <button onClick={() => { if (confirm(`「${node.label}」を削除しますか？（配下も削除）`)) onChange(deleteAt(tree, path)); }} className="text-slate-400 hover:text-rose-500" aria-label="削除"><Icon name="close" size={11} /></button>
          </>
        )}
      </div>
      {open && canChild && (
        <div className="ml-5 border-l border-line pl-2">
          {kids.map((c) => <Node key={c.key} node={c} path={[...path, c.key]} tree={tree} onChange={onChange} />)}
          <div className="mt-1 flex items-center gap-1.5">
            <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder={`＋ ${TIER_LABELS[depth]}`} className="w-36 rounded-lg border border-dashed border-line px-2 py-1 text-xs outline-none focus:border-brand-500" />
            <button onClick={() => { if (adding.trim()) { onChange(addChildAt(tree, path, adding.trim())); setAdding(""); } }} className="rounded-lg bg-brand-600 px-2 py-1 text-[10px] font-bold text-white">追加</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AccountsMaster() {
  const [tree, setTree] = useState<CatNode[]>([]);
  const [adding, setAdding] = useState("");
  const ready = useRef(false);

  useEffect(() => {
    try { const raw = window.localStorage.getItem(STORAGE_KEY); setTree(raw ? JSON.parse(raw) : defaultAccounts()); } catch { setTree(defaultAccounts()); }
    ready.current = true;
  }, []);
  useEffect(() => { if (!ready.current) return; try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tree)); } catch { /* ignore */ } }, [tree]);

  return (
    <Panel icon="folder" title="勘定科目マスタ（大 › 中 › 小 › 細）"
      action={<button onClick={() => { if (confirm("初期値に戻しますか？")) setTree(defaultAccounts()); }} className="rounded-lg border border-line px-2.5 py-1 text-xs font-bold text-muted hover:border-rose-400 hover:text-rose-500">初期値</button>}>
      <p className="mb-3 text-[11px] text-muted">ここで定義した科目を、支出・回収などの各画面はドロップダウンで選択します。</p>
      <div className="space-y-1">
        {tree.map((n) => <Node key={n.key} node={n} path={[n.key]} tree={tree} onChange={setTree} />)}
        <div className="mt-2 flex items-center gap-1.5">
          <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="＋ 大分類を追加" className="w-44 rounded-lg border border-dashed border-line px-2.5 py-1.5 text-xs outline-none focus:border-brand-500" />
          <button onClick={() => { if (adding.trim()) { setTree(addChildAt(tree, [], adding.trim())); setAdding(""); } }} className="rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-bold text-white">追加</button>
        </div>
      </div>
    </Panel>
  );
}
