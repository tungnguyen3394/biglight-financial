import Icon from "../Icon";
import type { IconName } from "@/lib/nav";

// 「開発中モジュール」表示 — フェーズ1の枠組みページ用。
export default function EmptyState({
  icon, title, description,
}: { icon: IconName; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-white px-6 py-16 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <Icon name={icon} size={26} />
      </span>
      <h3 className="text-base font-black text-ink">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-muted">{description}</p>
      <span className="mt-5 rounded-full bg-surface px-3 py-1 text-[11px] font-bold text-muted">
        フェーズ1 · 枠組み準備済み — 詳細機能は今後追加予定
      </span>
    </div>
  );
}
