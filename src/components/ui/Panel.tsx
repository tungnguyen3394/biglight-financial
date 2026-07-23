"use client";

import { useState } from "react";
import Icon, { type UiIconName } from "@/components/Icon";

// icon: タイトル左のラインアイコン（絵文字は使わない）
// collapsible: ヘッダークリック／ボタンで本文を開閉できる（defaultOpen で初期状態を指定）
export default function Panel({
  title, icon, action, children, className = "", collapsible = false, defaultOpen = true,
}: {
  title?: React.ReactNode; icon?: UiIconName; action?: React.ReactNode;
  children: React.ReactNode; className?: string; collapsible?: boolean; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const body = !collapsible || open;
  return (
    <section className={`rounded-3xl border border-line/70 bg-white shadow-card ${className}`}>
      {title && (
        <div
          className={`flex flex-wrap items-center justify-between gap-3 px-6 py-4 ${body ? "border-b border-line/70" : ""} ${collapsible ? "cursor-pointer select-none" : ""}`}
          onClick={collapsible ? () => setOpen((o) => !o) : undefined}
        >
          <h3 className="flex items-center gap-2 text-[15px] font-black tracking-tight text-ink">
            {icon && <Icon name={icon} size={17} className="text-brand-600" />}
            {title}
          </h3>
          <div className="flex items-center gap-2" onClick={(e) => collapsible && e.stopPropagation()}>
            {action}
            {collapsible && (
              <button
                onClick={() => setOpen((o) => !o)}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-muted hover:border-brand-500 hover:text-brand-600"
                aria-label={open ? "折りたたむ" : "展開する"}
              >
                <Icon name="chevronDown" size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>
        </div>
      )}
      {body && <div className="p-6">{children}</div>}
    </section>
  );
}
