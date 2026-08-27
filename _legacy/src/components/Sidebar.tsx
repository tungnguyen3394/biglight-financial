"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, APP_NAME } from "@/lib/nav";
import Icon from "./Icon";

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-64 flex-col border-r border-line bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 border-b border-line px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white font-black">B</div>
        <div className="leading-tight">
          <div className="text-sm font-black text-ink">BIGLIGHT</div>
          <div className="text-[11px] font-semibold text-muted">Management</div>
        </div>
      </div>

      {/* Menu */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.key}
              href={item.href}
              onClick={onNavigate}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-muted hover:bg-surface hover:text-ink"
              }`}
              title={item.labelVi}
            >
              <Icon name={item.icon} size={19} className={active ? "text-brand-600" : "text-slate-400 group-hover:text-ink"} />
              <span className="flex-1 truncate">{item.label}</span>
              {active && <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-line p-3">
        <div className="rounded-xl bg-surface px-3 py-2.5 text-[11px] leading-relaxed text-muted">
          <span className="font-bold text-ink">{APP_NAME}</span><br />
          社内管理システム
        </div>
      </div>
    </div>
  );
}
