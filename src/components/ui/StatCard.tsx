import Icon from "../Icon";
import type { StatCard as Stat, Tone } from "@/lib/mock";

// Bảng màu theo tone — dùng chuỗi class đầy đủ để Tailwind không purge nhầm.
const TONE: Record<Tone, { chip: string; bar: string }> = {
  brand:  { chip: "bg-brand-50 text-brand-600",   bar: "bg-brand-600" },
  green:  { chip: "bg-emerald-50 text-emerald-600", bar: "bg-emerald-500" },
  rose:   { chip: "bg-rose-50 text-rose-600",     bar: "bg-rose-500" },
  amber:  { chip: "bg-amber-50 text-amber-600",   bar: "bg-amber-500" },
  red:    { chip: "bg-red-50 text-red-600",       bar: "bg-red-500" },
  teal:   { chip: "bg-teal-50 text-teal-600",     bar: "bg-teal-500" },
  violet: { chip: "bg-violet-50 text-violet-600", bar: "bg-violet-500" },
};

export default function StatCard({ stat }: { stat: Stat }) {
  const tone = TONE[stat.tone];
  const up = (stat.delta ?? 0) >= 0;

  return (
    <div className="rounded-3xl border border-line/70 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-muted">{stat.label}</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-400">{stat.labelVi}</p>
        </div>
        <span className={`flex h-11 w-11 flex-none items-center justify-center rounded-2xl ${tone.chip}`}>
          <Icon name={stat.icon} size={21} />
        </span>
      </div>

      <p className="mt-4 text-[26px] font-black tracking-tight text-ink">{stat.value}</p>

      {/* Tiến độ (nếu có) */}
      {stat.progress != null && (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
            <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${stat.progress}%` }} />
          </div>
        </div>
      )}

      {/* Delta hoặc dòng phụ */}
      {stat.delta != null && (
        <p className="mt-2.5 flex items-center gap-1 text-xs font-semibold">
          <span className={up ? "text-emerald-600" : "text-rose-600"}>
            {up ? "▲" : "▼"} {Math.abs(stat.delta)}%
          </span>
          <span className="text-slate-400">{stat.deltaLabel}</span>
        </p>
      )}
      {stat.sub && stat.delta == null && <p className="mt-2.5 text-xs font-medium text-slate-400">{stat.sub}</p>}
    </div>
  );
}
