export default function Panel({
  title, action, children, className = "",
}: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl border border-line/70 bg-white shadow-card ${className}`}>
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-6 py-4">
          <h3 className="text-[15px] font-black tracking-tight text-ink">{title}</h3>
          {action}
        </div>
      )}
      <div className="p-6">{children}</div>
    </section>
  );
}
