"use client";
// Report charts (Recharts). One axis per chart, thin marks, recessive grid, legend for 2+ series, tooltips on hover.
// Every chart sits next to a table with the same numbers (the accessible view).
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";

export type Fmt = (v: number) => string;
export interface Series {
  key: string;
  name: string;
  color: string;
  dashed?: boolean;
}

const axis = { stroke: "var(--line)", tick: { fill: "var(--muted)", fontSize: 11 }, tickLine: false } as const;
const cursor = { stroke: "var(--muted)", strokeDasharray: "3 3" };

function Tip({ active, payload, label, fmt, xLabel }: TooltipContentProps<number, string> & { fmt: Fmt; xLabel?: (l: unknown) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-card">
      <div className="mb-1 font-bold text-ink">{xLabel ? xLabel(label) : String(label)}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 text-ink">
          <span aria-hidden="true" className="inline-block h-[3px] w-3 rounded" style={{ background: p.color }} />
          <span className="text-muted">{p.name}</span>
          <b className="ml-auto pl-3">{fmt(Number(p.value))}</b>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: Series[] }) {
  if (items.length < 2) return null;
  return (
    <div className="mb-1 flex flex-wrap gap-3 text-xs text-muted" aria-hidden="true">
      {items.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <svg width="16" height="6">
            <line x1="0" y1="3" x2="16" y2="3" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? "4 3" : undefined} />
          </svg>
          {s.name}
        </span>
      ))}
    </div>
  );
}

/** Values over time (months). All series share one unit. */
export function TimeChart({ title, data, x = "month", series, fmt, height = 200, xLabel = (l) => `Month ${l}`, zero }: { title: string; data: object[]; x?: string; series: Series[]; fmt: Fmt; height?: number; xLabel?: (l: unknown) => string; zero?: boolean }) {
  return (
    <figure className="fm-chart" aria-label={`${title}. The table below has the same numbers.`}>
      <figcaption>{title}</figcaption>
      <Legend items={series} />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--line)" strokeOpacity={0.6} vertical={false} />
            <XAxis dataKey={x} {...axis} />
            <YAxis {...axis} width={58} tickFormatter={fmt} axisLine={false} />
            {zero && <ReferenceLine y={0} stroke="var(--muted)" />}
            <Tooltip content={(p) => <Tip {...(p as TooltipContentProps<number, string>)} fmt={fmt} xLabel={xLabel} />} cursor={cursor} />
            {series.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "5 4" : undefined} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--panel)" }} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** One measure per category, as horizontal bars (names stay readable). Negative values are allowed. */
export function BarsChart({ title, data, fmt, color = "var(--chart-1)", negColor = "var(--chart-2)", onPick }: { title: string; data: { name: string; value: number; id?: string }[]; fmt: Fmt; color?: string; negColor?: string; onPick?: (id: string) => void }) {
  const h = Math.max(80, data.length * 34 + 24);
  return (
    <figure className="fm-chart" aria-label={`${title}. The table has the same numbers.`}>
      <figcaption>{title}</figcaption>
      <div style={{ height: h }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }} barCategoryGap={8}>
            <CartesianGrid stroke="var(--line)" strokeOpacity={0.6} horizontal={false} />
            <XAxis type="number" {...axis} tickFormatter={fmt} />
            <YAxis type="category" dataKey="name" {...axis} width={140} axisLine={false} tickFormatter={(v: string) => (v.length > 20 ? v.slice(0, 19) + "…" : v)} />
            <ReferenceLine x={0} stroke="var(--muted)" />
            <Tooltip content={(p) => <Tip {...(p as TooltipContentProps<number, string>)} fmt={fmt} />} cursor={{ fill: "var(--line)", fillOpacity: 0.35 }} />
            <Bar dataKey="value" name={title} radius={[0, 4, 4, 0]} isAnimationActive={false} maxBarSize={22} cursor={onPick ? "pointer" : undefined} onClick={(d) => { const id = (d as unknown as { id?: string }).id; if (id && onPick) onPick(id); }}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.value < 0 ? negColor : color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** Two measures in the same unit per category (e.g. revenue and ad spend per source). */
export function PairBars({ title, data, series, fmt }: { title: string; data: object[]; series: [Series, Series]; fmt: Fmt }) {
  const h = Math.max(100, data.length * 44 + 30);
  return (
    <figure className="fm-chart" aria-label={`${title}. The table has the same numbers.`}>
      <figcaption>{title}</figcaption>
      <Legend items={series} />
      <div style={{ height: h }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }} barCategoryGap={10} barGap={2}>
            <CartesianGrid stroke="var(--line)" strokeOpacity={0.6} horizontal={false} />
            <XAxis type="number" {...axis} tickFormatter={fmt} />
            <YAxis type="category" dataKey="name" {...axis} width={140} axisLine={false} tickFormatter={(v: string) => (v.length > 20 ? v.slice(0, 19) + "…" : v)} />
            <Tooltip content={(p) => <Tip {...(p as TooltipContentProps<number, string>)} fmt={fmt} />} cursor={{ fill: "var(--line)", fillOpacity: 0.35 }} />
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[0, 4, 4, 0]} isAnimationActive={false} maxBarSize={14} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
