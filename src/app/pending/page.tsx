"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function PendingInner() {
  const params = useSearchParams();
  const disabled = params.get("reason") === "disabled";

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-3xl border border-line/70 bg-white p-8 text-center shadow-card">
        <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${disabled ? "bg-rose-50 text-rose-500" : "bg-amber-50 text-amber-500"}`}>
          {disabled ? (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M5.5 5.5l13 13" /></svg>
          ) : (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          )}
        </div>
        <h1 className="mb-2 text-base font-black text-ink">
          {disabled ? "アカウントが停止されています" : "承認をお待ちください"}
        </h1>
        <p className="mb-6 text-xs leading-relaxed text-muted">
          {disabled
            ? "このアカウントは管理者によって停止されました。利用を再開するには管理者にお問い合わせください。"
            : "アカウントは登録済みです。BIGLIGHT管理者の承認後にログインできるようになります。承認されたら再度ログインしてください。"}
        </p>
        <Link href="/login" className="inline-block rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
          ログイン画面へ戻る
        </Link>
      </div>
    </div>
  );
}

export default function PendingPage() {
  return <Suspense><PendingInner /></Suspense>;
}
