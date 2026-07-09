"use client";

import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";

export default function Header({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const current = NAV.find((n) => pathname === n.href || pathname.startsWith(n.href + "/"));

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6">
      {/* Hamburger (mobile) */}
      <button
        onClick={onMenu}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface lg:hidden"
        aria-label="メニュー"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>

      {/* Title */}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-black text-ink sm:text-lg">{current?.label ?? "ダッシュボード"}</h1>
        {current?.labelVi && <p className="truncate text-[11px] text-muted">{current.labelVi}</p>}
      </div>

      {/* Search (desktop) */}
      <div className="relative hidden md:block">
        <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></svg>
        <input
          placeholder="検索…"
          className="w-56 rounded-xl border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink outline-none focus:border-brand-500 focus:bg-white"
        />
      </div>

      {/* User */}
      <div className="flex items-center gap-2">
        <button className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface" aria-label="通知">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.5 21a1.5 1.5 0 0 0 3 0" /></svg>
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />
        </button>
        <div className="flex items-center gap-2 rounded-xl px-1.5 py-1 hover:bg-surface">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-black text-brand-700">T</div>
          <div className="hidden leading-tight sm:block">
            <div className="text-xs font-bold text-ink">Tung Nguyen</div>
            <div className="text-[10px] text-muted">Admin</div>
          </div>
        </div>
      </div>
    </header>
  );
}
