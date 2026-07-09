import PageHeader from "@/components/ui/PageHeader";
import Panel from "@/components/ui/Panel";
import DemoData from "@/components/settings/DemoData";

// Danh mục cấu hình động (không hard-code) — quản lý tại đây.
const CATEGORY_GROUPS = [
  { type: "REVENUE", label: "売上区分", items: ["人材紹介", "派遣", "コンサル"] },
  { type: "EXPENSE", label: "支出区分", items: ["人件費", "オフィス", "広告宣伝", "その他"] },
  { type: "CUSTOMER_GROUP", label: "顧客分類", items: ["製造", "食品", "建設", "サービス"] },
  { type: "CONTRACT_TYPE", label: "契約区分", items: ["月額", "スポット", "成果報酬"] },
];

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="設定" subtitle="Cấu hình hệ thống — danh mục động + dữ liệu demo" />
      <div className="mb-6"><DemoData /></div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {CATEGORY_GROUPS.map((g) => (
          <Panel key={g.type} title={g.label}
            action={<button className="text-xs font-bold text-brand-600 hover:text-brand-700">＋ 追加</button>}>
            <div className="flex flex-wrap gap-2">
              {g.items.map((it) => (
                <span key={it} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink">
                  {it}
                  <button className="text-slate-400 hover:text-rose-500" aria-label="削除">×</button>
                </span>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-slate-400">type: <span className="font-mono">{g.type}</span> — lưu ở bảng Category</p>
          </Panel>
        ))}
      </div>
    </>
  );
}
