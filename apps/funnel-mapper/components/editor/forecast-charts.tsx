"use client";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { money, moneyShort } from "@/lib/format";
import type { ProjectionRow } from "@/lib/funnel-math";

const axis = { stroke: "var(--line)", tick: { fill: "var(--muted)", fontSize: 11 }, tickLine: false } as const;

function Tip({ active, payload, label, currency }: TooltipContentProps<number, string> & { currency: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-card">
      <div className="mb-1 font-bold text-ink">Month {label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 text-ink">
          <span aria-hidden="true" className="inline-block h-[3px] w-3 rounded" style={{ background: p.color }} />
          <span className="text-muted">{p.name}</span>
          <b className="ml-auto pl-3">{money(Number(p.value), currency)}</b>
        </div>
      ))}
    </div>
  );
}

function Legend({ items }: { items: [string, string, boolean?][] }) {
  return (
    <div className="mb-1 flex flex-wrap gap-3 text-xs text-muted" aria-hidden="true">
      {items.map(([l, c, dashed]) => (
        <span key={l} className="inline-flex items-center gap-1.5">
          <svg width="16" height="6">
            <line x1="0" y1="3" x2="16" y2="3" stroke={c} strokeWidth="2" strokeDasharray={dashed ? "4 3" : undefined} />
          </svg>
          {l}
        </span>
      ))}
    </div>
  );
}

/** Revenue vs costs per month, then cumulative profit. Same unit, one axis each; the table view lives in the Forecast tab. */
export function ForecastCharts({ rows, currency }: { rows: ProjectionRow[]; currency: string }) {
  const fmt = (v: number) => moneyShort(v, currency);
  return (
    <figure className="m-0 mb-3" aria-label="Forecast charts. Use “Show table” for the numbers.">
      <figcaption className="mb-1 text-[13px] font-bold">Revenue and costs per month</figcaption>
      <Legend
        items={[
          ["Revenue", "var(--chart-1)"],
          ["Costs", "var(--muted)", true],
        ]}
      />
      <div className="h-[170px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--line)" strokeOpacity={0.6} vertical={false} />
            <XAxis dataKey="month" {...axis} />
            <YAxis {...axis} width={52} tickFormatter={fmt} axisLine={false} />
            <Tooltip content={(p) => <Tip {...(p as TooltipContentProps<number, string>)} currency={currency} />} cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }} />
            <Line type="monotone" dataKey="revenue" name="Revenue" stroke="var(--chart-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--panel)" }} isAnimationActive={false} />
            <Line type="monotone" dataKey="costs" name="Costs" stroke="var(--muted)" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--panel)" }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-3 mb-1 text-[13px] font-bold">Cumulative profit</figcaption>
      <div className="h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--line)" strokeOpacity={0.6} vertical={false} />
            <XAxis dataKey="month" {...axis} />
            <YAxis {...axis} width={52} tickFormatter={fmt} axisLine={false} />
            <ReferenceLine y={0} stroke="var(--muted)" />
            <Tooltip content={(p) => <Tip {...(p as TooltipContentProps<number, string>)} currency={currency} />} cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }} />
            <Area type="monotone" dataKey="cumulative" name="Cumulative profit" stroke="var(--chart-1)" strokeWidth={2} fill="var(--chart-1)" fillOpacity={0.12} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
