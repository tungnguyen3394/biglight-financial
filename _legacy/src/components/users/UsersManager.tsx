"use client";

// ユーザー管理 — Googleログインで自動登録された実ユーザーをDBで管理。
//   ・オンライン状態（60秒ハートビート、2分以内=オンライン）
//   ・承認フロー（@biglight.jp 以外は PENDING → 管理者が承認）
//   ・権限（閲覧・編集・削除）とロール、ログイン履歴
import { useCallback, useEffect, useState } from "react";
import Panel from "@/components/ui/Panel";
import Icon from "@/components/Icon";

type ApiUser = {
  id: string; email: string; name: string; image: string | null;
  role: string; status: string;
  canView: boolean; canEdit: boolean; canDelete: boolean;
  department: string | null;
  online: boolean; lastSeenAt: string | null; lastLoginAt: string | null;
  loginCount: number; createdAt: string;
};
type LoginRow = { id: string; at: string; ip: string | null; userAgent: string | null };

const ROLES = ["ADMIN", "MANAGER", "STAFF", "VIEWER"];
const ROLE_TONE: Record<string, string> = {
  ADMIN: "bg-violet-50 text-violet-700", MANAGER: "bg-sky-50 text-sky-700",
  STAFF: "bg-emerald-50 text-emerald-600", VIEWER: "bg-slate-100 text-slate-500",
};
const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  PENDING:  { label: "承認待ち", tone: "bg-amber-50 text-amber-600" },
  ACTIVE:   { label: "有効",     tone: "bg-emerald-50 text-emerald-600" },
  DISABLED: { label: "停止",     tone: "bg-rose-50 text-rose-500" },
};

function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function agoLabel(s: string | null): string {
  if (!s) return "未ログイン";
  const min = Math.floor((Date.now() - new Date(s).getTime()) / 60000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}
// User-Agent → 簡易表示（Chrome / Safari / Edge…）
function browserOf(ua: string | null): string {
  if (!ua) return "—";
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("Chrome/")) return "Chrome";
  if (ua.includes("Safari/")) return "Safari";
  if (ua.includes("Firefox/")) return "Firefox";
  return "その他";
}

export default function UsersManager() {
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [me, setMe] = useState("");
  const [loading, setLoading] = useState(true);
  const [histFor, setHistFor] = useState<ApiUser | null>(null);
  const [hist, setHist] = useState<LoginRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setUsers(data.users); setIsAdmin(data.isAdmin); setMe(data.me);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000); // オンライン状態を30秒ごとに更新
    return () => clearInterval(t);
  }, [load]);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.error ?? "更新に失敗しました"); }
      await load();
    } finally { setBusy(null); }
  }
  async function removeUser(u: ApiUser) {
    if (!confirm(`「${u.name}」を削除しますか？（ログイン履歴も削除されます）`)) return;
    setBusy(u.id);
    try {
      const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.error ?? "削除に失敗しました"); }
      await load();
    } finally { setBusy(null); }
  }
  async function openHistory(u: ApiUser) {
    setHistFor(u); setHist(null);
    const res = await fetch(`/api/users/${u.id}/logins`, { cache: "no-store" });
    if (res.ok) { const data = await res.json(); setHist(data.logins); } else { setHist([]); }
  }

  const pending = users.filter((u) => u.status === "PENDING");
  const others = users.filter((u) => u.status !== "PENDING");
  const onlineCount = users.filter((u) => u.online).length;

  if (loading) return <div className="rounded-3xl border border-line bg-white p-12 text-center text-sm text-muted">読み込み中…</div>;

  return (
    <div className="space-y-6">
      {/* 説明 */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-3xl border border-line/70 bg-white px-5 py-3.5 text-xs text-muted shadow-card">
        <span className="font-black text-ink">仕組み：</span>
        <span><b className="text-brand-600">@biglight.jp</b> のGoogleアカウント = 自動で利用開始</span>
        <span>その他のメール = <b className="text-amber-600">承認待ち</b> → 管理者が承認</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />オンライン：{onlineCount}人</span>
      </div>

      {/* ===== 承認待ち ===== */}
      {pending.length > 0 && (
        <Panel icon="warning" title={`承認待ち（${pending.length}件）`}>
          <div className="space-y-2.5">
            {pending.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/50 px-4 py-3">
                <Avatar u={u} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{u.name}</p>
                  <p className="truncate text-xs text-muted">{u.email} ・ 登録 {fmtDate(u.createdAt)}</p>
                </div>
                {isAdmin ? (
                  <div className="flex gap-1.5">
                    <button disabled={busy === u.id} onClick={() => patch(u.id, { status: "ACTIVE" })}
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">承認する</button>
                    <button disabled={busy === u.id} onClick={() => removeUser(u)}
                      className="rounded-xl border border-line px-3 py-2 text-xs font-bold text-muted hover:border-rose-400 hover:text-rose-500 disabled:opacity-50">拒否</button>
                  </div>
                ) : <span className="text-[11px] text-amber-600">管理者の承認待ち</span>}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* ===== ユーザー一覧 ===== */}
      <Panel icon="users" title={`ユーザー一覧（${others.length}人）`}
        action={<span className="text-[11px] text-slate-400">ユーザーはGoogleログインで自動登録されます</span>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2.5 font-bold">ユーザー</th>
                <th className="py-2.5 text-center font-bold">状態</th>
                <th className="py-2.5 text-center font-bold">ロール</th>
                <th className="py-2.5 text-center font-bold">閲覧</th>
                <th className="py-2.5 text-center font-bold">編集</th>
                <th className="py-2.5 text-center font-bold">削除</th>
                <th className="py-2.5 font-bold">最終ログイン</th>
                <th className="py-2.5 text-right font-bold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {others.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-muted">まだユーザーがいません。Googleでログインすると自動登録されます。</td></tr>}
              {others.map((u) => {
                const st = STATUS_LABEL[u.status] ?? STATUS_LABEL.ACTIVE;
                return (
                  <tr key={u.id} className="hover:bg-surface">
                    <td className="py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="relative">
                          <Avatar u={u} />
                          <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${u.online ? "bg-emerald-500" : "bg-slate-300"}`} title={u.online ? "オンライン" : `最終: ${agoLabel(u.lastSeenAt)}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 truncate font-bold text-ink">
                            {u.name}
                            {u.email === me && <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[9px] font-bold text-brand-600">自分</span>}
                          </p>
                          <p className="truncate text-[11px] text-muted">{u.email}</p>
                          <p className="text-[10px] text-slate-400">{u.online ? <span className="font-bold text-emerald-600">オンライン</span> : agoLabel(u.lastSeenAt)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-center">
                      {isAdmin && u.email !== me ? (
                        <button disabled={busy === u.id}
                          onClick={() => patch(u.id, { status: u.status === "ACTIVE" ? "DISABLED" : "ACTIVE" })}
                          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${st.tone} hover:ring-1 hover:ring-line disabled:opacity-50`}
                          title="クリックで有効/停止を切り替え">{st.label}</button>
                      ) : <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${st.tone}`}>{st.label}</span>}
                    </td>
                    <td className="py-3 text-center">
                      {isAdmin ? (
                        <select value={u.role} disabled={busy === u.id}
                          onChange={(e) => patch(u.id, { role: e.target.value, applyPreset: true })}
                          className={`rounded-full border-0 px-2 py-0.5 text-xs font-bold outline-none ${ROLE_TONE[u.role] ?? ""}`}>
                          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      ) : <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${ROLE_TONE[u.role] ?? ""}`}>{u.role}</span>}
                    </td>
                    {(["canView", "canEdit", "canDelete"] as const).map((k) => (
                      <td key={k} className="py-3 text-center">
                        <input type="checkbox" checked={u[k]} disabled={!isAdmin || busy === u.id}
                          onChange={(e) => patch(u.id, { [k]: e.target.checked })}
                          className="h-4 w-4 accent-brand-600 disabled:opacity-40" />
                      </td>
                    ))}
                    <td className="py-3">
                      <p className="text-xs text-ink">{fmtDate(u.lastLoginAt)}</p>
                      <p className="text-[10px] text-slate-400">計 {u.loginCount} 回</p>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => openHistory(u)}
                          className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-bold text-muted hover:border-brand-500 hover:text-brand-600">
                          <Icon name="history" size={12} />履歴
                        </button>
                        {isAdmin && u.email !== me && (
                          <button disabled={busy === u.id} onClick={() => removeUser(u)}
                            className="rounded-lg border border-line px-2 py-1 text-xs text-muted hover:border-rose-400 hover:text-rose-500 disabled:opacity-50">削除</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!isAdmin && <p className="mt-3 text-[11px] text-slate-400">※ 権限の変更・承認・削除は ADMIN のみ操作できます。</p>}
      </Panel>

      {/* ===== モーダル：ログイン履歴 ===== */}
      {histFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setHistFor(null)} />
          <div className="relative flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div className="flex items-center gap-2.5">
                <Avatar u={histFor} />
                <div>
                  <h3 className="text-base font-black text-ink">ログイン履歴 — {histFor.name}</h3>
                  <p className="text-[11px] text-muted">{histFor.email} ・ 直近50件</p>
                </div>
              </div>
              <button onClick={() => setHistFor(null)} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface" aria-label="閉じる"><Icon name="close" size={16} /></button>
            </div>
            <div className="overflow-auto p-5">
              {hist === null ? (
                <p className="py-6 text-center text-sm text-muted">読み込み中…</p>
              ) : hist.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">ログイン履歴はありません。</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-line text-left text-muted">
                      <th className="py-2 font-bold">日時</th>
                      <th className="py-2 font-bold">IP</th>
                      <th className="py-2 font-bold">ブラウザ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {hist.map((l) => (
                      <tr key={l.id}>
                        <td className="py-2 tabular-nums text-ink">{fmtDate(l.at)}</td>
                        <td className="py-2 text-muted">{l.ip ?? "—"}</td>
                        <td className="py-2 text-muted">{browserOf(l.userAgent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Avatar({ u }: { u: { name: string; image: string | null } }) {
  if (u.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={u.image} alt="" referrerPolicy="no-referrer" className="h-9 w-9 rounded-full object-cover" />;
  }
  return <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-black text-brand-700">{u.name.charAt(0)}</span>;
}
