export default function PageHeader({
  title, subtitle, action,
}: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-2xl font-black tracking-tight text-ink sm:text-[28px]">{title}</h2>
        {subtitle && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
