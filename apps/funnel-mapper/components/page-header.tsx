export function PageHeader({ title, sub, eyebrow, children }: { title: React.ReactNode; sub?: React.ReactNode; eyebrow?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1">
        {eyebrow && <div className="mb-2 text-[11px] font-semibold tracking-[0.09em] text-muted uppercase">{eyebrow}</div>}
        <h1 className="font-display text-[30px] leading-tight font-semibold tracking-[-0.02em] text-ink">{title}</h1>
        {sub && <p className="mt-1.5 text-sm text-muted">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

/** One figure of a divided row (V2 KPI row): label, big number, hint. Put them in `.fm-kgrid`. */
export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="fm-kc">
      <span className="text-xs text-muted">{label}</span>
      <b className="mt-1 block font-display text-[30px] leading-tight font-semibold tracking-[-0.02em] text-ink">{value}</b>
      {hint && <em className="mt-0.5 block text-xs text-muted not-italic">{hint}</em>}
    </div>
  );
}
