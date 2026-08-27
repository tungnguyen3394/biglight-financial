import StatCard from "@/components/ui/StatCard";
import Panel from "@/components/ui/Panel";
import { DASHBOARD_STATS, YOJITSU_SAMPLE, COLLECTIONS_SAMPLE } from "@/lib/mock";
import { yen } from "@/lib/format";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* 概要カード8枚 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {DASHBOARD_STATS.map((s) => <StatCard key={s.key} stat={s} />)}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 予実対比 */}
        <Panel title="予実対比（今月）" className="lg:col-span-2"
          action={<span className="text-[11px] font-semibold text-muted">計画 vs 実績</span>}>
          <div className="space-y-4">
            {YOJITSU_SAMPLE.map((row) => {
              const rate = Math.round((row.actual / row.planned) * 100);
              return (
                <div key={row.label}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-bold text-ink">{row.label}</span>
                    <span className="text-muted">
                      実績 <span className="font-bold text-ink">{yen(row.actual)}</span>
                      <span className="mx-1 text-slate-300">/</span>
                      計画 {yen(row.planned)}
                      <span className={`ml-2 font-bold ${rate >= 100 ? "text-emerald-600" : rate >= 80 ? "text-amber-600" : "text-rose-600"}`}>{rate}%</span>
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface">
                    <div className={`h-full rounded-full ${rate >= 100 ? "bg-emerald-500" : rate >= 80 ? "bg-brand-600" : "bg-amber-500"}`}
                      style={{ width: `${Math.min(rate, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* 回収予定 */}
        <Panel title="回収予定・延滞" action={<span className="text-[11px] font-semibold text-muted">直近</span>}>
          <ul className="space-y-3">
            {COLLECTIONS_SAMPLE.map((c, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{c.customer}</p>
                  <p className="text-[11px] text-muted">期日 {c.due}</p>
                </div>
                <div className="flex-none text-right">
                  <p className="text-sm font-black text-ink">{yen(c.amount)}</p>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    c.status === "延滞" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>{c.status}</span>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <p className="text-center text-[11px] text-slate-400">
        ※ フェーズ1はサンプルデータを表示。フェーズ2で実データベース（Prisma / PostgreSQL）に接続予定。
      </p>
    </div>
  );
}
