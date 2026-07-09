"use client";

import { useEffect, useRef, useState } from "react";
import Panel from "@/components/ui/Panel";
import { NAV } from "@/lib/nav";
import {
  STORAGE_KEY, ROLE_TONE, presetPerms, sampleUsers,
  type AppUser, type Role,
} from "@/lib/users";

const ROLES: Role[] = ["ADMIN", "MANAGER", "STAFF", "VIEWER"];
const DEPTS = ["経営", "営業部", "管理部"];
const emptyDraft = { name: "", email: "", dept: DEPTS[1], role: "STAFF" as Role };

export default function UsersManager() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [permFor, setPermFor] = useState<string | null>(null); // user id đang chỉnh quyền
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const ready = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      setUsers(raw ? (JSON.parse(raw) as AppUser[]) : sampleUsers());
    } catch { setUsers(sampleUsers()); }
    ready.current = true;
  }, []);
  useEffect(() => {
    if (!ready.current) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(users)); } catch { /* ignore */ }
  }, [users]);

  const target = users.find((u) => u.id === permFor) ?? null;

  function addUser() {
    if (!draft.name.trim() || !draft.email.trim()) { alert("氏名・メールは必須です。"); return; }
    setUsers((prev) => [...prev, {
      id: "u" + Date.now(), name: draft.name.trim(), email: draft.email.trim(),
      dept: draft.dept, role: draft.role, active: true, perms: presetPerms(draft.role),
    }]);
    setDraft(emptyDraft); setShowNew(false);
  }
  function togglePerm(userId: string, key: string) {
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, perms: { ...u.perms, [key]: !u.perms[key] } } : u));
  }
  function applyPreset(userId: string, role: Role) {
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role, perms: presetPerms(role) } : u));
  }
  function toggleActive(userId: string) {
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, active: !u.active } : u));
  }
  function removeUser(userId: string) {
    if (!confirm("このユーザーを削除しますか？")) return;
    setUsers((prev) => prev.filter((u) => u.id !== userId));
  }
  function resetSample() {
    if (!confirm("サンプルデータに戻します。よろしいですか？")) return;
    setUsers(sampleUsers());
  }

  const permCount = (u: AppUser) => NAV.filter((n) => u.perms[n.key]).length;

  return (
    <div className="space-y-6">
      <Panel title="ユーザー一覧"
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => setShowNew(true)} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-brand-700">＋ ユーザー追加</button>
            <button onClick={resetSample} className="rounded-xl border border-line px-3 py-2 text-xs font-bold text-muted hover:border-rose-400 hover:text-rose-500">サンプルに戻す</button>
          </div>
        }>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2.5 font-bold">氏名</th>
                <th className="py-2.5 font-bold">メール</th>
                <th className="py-2.5 font-bold">部署</th>
                <th className="py-2.5 text-center font-bold">権限ロール</th>
                <th className="py-2.5 text-center font-bold">閲覧可能</th>
                <th className="py-2.5 text-center font-bold">状態</th>
                <th className="py-2.5 text-right font-bold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-surface">
                  <td className="py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-black text-brand-700">{u.name.charAt(0)}</span>
                      <span className="font-bold text-ink">{u.name}</span>
                    </div>
                  </td>
                  <td className="py-3 text-muted">{u.email}</td>
                  <td className="py-3 text-muted">{u.dept}</td>
                  <td className="py-3 text-center"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${ROLE_TONE[u.role]}`}>{u.role}</span></td>
                  <td className="py-3 text-center">
                    <button onClick={() => setPermFor(u.id)} className="rounded-lg border border-line px-2.5 py-1 text-xs font-bold text-brand-600 hover:border-brand-500">
                      {permCount(u)} / {NAV.length} モジュール
                    </button>
                  </td>
                  <td className="py-3 text-center">
                    <button onClick={() => toggleActive(u.id)}
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${u.active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
                      {u.active ? "有効" : "停止"}
                    </button>
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => setPermFor(u.id)} className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-brand-700">権限設定</button>
                      <button onClick={() => removeUser(u.id)} className="rounded-lg border border-line px-2 py-1 text-xs text-muted hover:border-rose-400 hover:text-rose-500">削除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ===== Modal: ma trận quyền ===== */}
      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setPermFor(null)} />
          <div className="relative flex max-h-[86vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h3 className="text-base font-black text-ink">権限設定 — {target.name}</h3>
                <p className="text-[11px] text-muted">Bật/tắt module mà người này ĐƯỢC XEM. Menu của họ chỉ hiện module được bật.</p>
              </div>
              <button onClick={() => setPermFor(null)} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface" aria-label="閉じる">✕</button>
            </div>

            <div className="overflow-auto p-5">
              {/* preset theo role */}
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-muted">ロール一括適用：</span>
                {ROLES.map((r) => (
                  <button key={r} onClick={() => applyPreset(target.id, r)}
                    className={`rounded-full px-3 py-1 text-xs font-bold transition ${target.role === r ? "bg-brand-600 text-white" : "border border-line text-muted hover:border-brand-500 hover:text-brand-600"}`}>
                    {r}
                  </button>
                ))}
              </div>

              {/* ma trận module */}
              <div className="divide-y divide-line rounded-xl border border-line">
                {NAV.map((n) => {
                  const on = !!target.perms[n.key];
                  return (
                    <label key={n.key} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-surface">
                      <input type="checkbox" checked={on} onChange={() => togglePerm(target.id, n.key)} className="h-4 w-4 accent-brand-600" />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-bold ${on ? "text-ink" : "text-slate-400"}`}>{n.label}</p>
                        <p className="text-[10px] text-slate-400">{n.labelVi}</p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${on ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                        {on ? "閲覧可" : "非表示"}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end border-t border-line px-5 py-3">
              <button onClick={() => setPermFor(null)} className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white hover:bg-brand-700">完了</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal: thêm user ===== */}
      {showNew && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setShowNew(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="mb-4 text-base font-black text-ink">ユーザーを追加</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-muted">氏名 *</label>
                <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-muted">メール *</label>
                <input type="email" value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                  className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">部署</label>
                  <select value={draft.dept} onChange={(e) => setDraft((d) => ({ ...d, dept: e.target.value }))}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500">
                    {DEPTS.map((dp) => <option key={dp}>{dp}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-muted">権限ロール</label>
                  <select value={draft.role} onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value as Role }))}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-500">
                    {ROLES.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-slate-400">※ Quyền xem module sẽ áp bộ mặc định theo ロール — thêm xong có thể chỉnh từng ô ở「権限設定」.</p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowNew(false)} className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-muted hover:bg-surface">キャンセル</button>
              <button onClick={addUser} className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white hover:bg-brand-700">追加する</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
