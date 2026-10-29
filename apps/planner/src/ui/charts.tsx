// Tiny SVG/CSS charts. No chart library: values are drawn directly and always have a text equivalent.
import type { Status } from '../api/types.ts';
import { STATUS_META, STATUS_ORDER } from '../lib/status.ts';
import { cx } from './primitives.tsx';

export function Sparkline({ values, width = 96, height = 28, label, target, direction = 'increase' }: { values: number[]; width?: number; height?: number; label: string; target?: number; direction?: 'increase' | 'decrease' }) {
  if (values.length < 2) return <span className="muted" aria-label={label}>No history</span>;
  const lo = Math.min(...values, target ?? Infinity), hi = Math.max(...values, target ?? -Infinity);
  const span = hi - lo || 1;
  const pad = 3;
  const pts = values.map((v, i) => [pad + (i / (values.length - 1)) * (width - pad * 2), height - pad - ((v - lo) / span) * (height - pad * 2)] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1]!;
  const improving = direction === 'increase' ? values[values.length - 1]! >= values[0]! : values[values.length - 1]! <= values[0]!;
  const ty = target != null ? height - pad - ((target - lo) / span) * (height - pad * 2) : null;
  return (
    <svg className={cx('spark', improving ? 'spark--up' : 'spark--down')} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      {ty != null && <line x1={pad} x2={width - pad} y1={ty} y2={ty} className="spark__target" />}
      <path d={d} className="spark__line" fill="none" />
      <circle cx={last[0]} cy={last[1]} r="2.6" className="spark__dot" />
    </svg>
  );
}

/** A single horizontal bar split by status, with a legend that carries the numbers as text. */
export function StatusBar({ counts, total }: { counts: Partial<Record<Status, number>>; total?: number }) {
  const sum = total ?? STATUS_ORDER.reduce((n, s) => n + (counts[s] ?? 0), 0);
  if (!sum) return <div className="statusbar statusbar--empty" role="img" aria-label="No goals yet" />;
  const text = STATUS_ORDER.filter((s) => counts[s]).map((s) => `${counts[s]} ${STATUS_META[s].label.toLowerCase()}`).join(', ');
  return (
    <div className="statusbar" role="img" aria-label={text}>
      {STATUS_ORDER.filter((s) => counts[s]).map((s) => <span key={s} className={cx('statusbar__seg', `statusbar__seg--${s}`)} style={{ flexGrow: counts[s] }} data-tip={`${STATUS_META[s].label}: ${counts[s]}`} />)}
    </div>
  );
}
export function StatusLegend({ counts }: { counts: Partial<Record<Status, number>> }) {
  return (
    <ul className="legend">
      {STATUS_ORDER.map((s) => <li key={s} className="legend__item"><span className={cx('legend__dot', `statusbar__seg--${s}`)} aria-hidden="true" /> {STATUS_META[s].label} <strong>{counts[s] ?? 0}</strong></li>)}
    </ul>
  );
}

export function Ring({ value, size = 84, label }: { value: number; size?: number; label: string }) {
  const r = (size - 10) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, value));
  return (
    <div className="ring" style={{ inlineSize: size, blockSize: size }} role="img" aria-label={`${label}: ${Math.round(v)}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring__track" fill="none" strokeWidth="8" />
        <circle cx={size / 2} cy={size / 2} r={r} className="ring__value" fill="none" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="ring__text">{Math.round(v)}%</span>
    </div>
  );
}

/** Pie (donut-free) of counts with labels "25% (1)", like Cascade's health pies. */
export function Pie({ slices, size = 180, label }: { slices: { key: string; label: string; value: number; color: string }[]; size?: number; label: string }) {
  const total = slices.reduce((n, s) => n + s.value, 0);
  const r = size / 2;
  let a = -Math.PI / 2;
  const parts = total ? slices.filter((s) => s.value > 0).map((s) => {
    const sweep = (s.value / total) * Math.PI * 2, a0 = a, a1 = a + sweep; a = a1;
    const p = (t: number) => `${r + r * Math.cos(t)} ${r + r * Math.sin(t)}`;
    const d = sweep >= Math.PI * 2 - 1e-6 ? `M ${r} 0 A ${r} ${r} 0 1 1 ${r - 0.01} 0 Z` : `M ${r} ${r} L ${p(a0)} A ${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${p(a1)} Z`;
    const mid = (a0 + a1) / 2;
    return { ...s, d, tx: r + r * 0.62 * Math.cos(mid), ty: r + r * 0.62 * Math.sin(mid), pct: Math.round((s.value / total) * 100) };
  }) : [];
  return (
    <figure className="pie">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${label}: ${slices.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
        {total === 0 ? <circle cx={r} cy={r} r={r - 1} fill="var(--sunk)" /> : parts.map((s) => <path key={s.key} d={s.d} fill={s.color} stroke="var(--surface)" strokeWidth="2" className="pie__slice"><title>{`${s.label}: ${s.value} of ${total} (${s.pct}%)`}</title></path>)}
        {parts.map((s) => <text key={`t${s.key}`} x={s.tx} y={s.ty} textAnchor="middle" dominantBaseline="middle" className="pie__lbl">{s.pct}% ({s.value})</text>)}
      </svg>
      <figcaption className="chart-legend">{slices.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}</figcaption>
    </figure>
  );
}

/** Stacked bars: one bar per group (e.g. plan), stacked by status, like Cascade's "objectives by plan". */
export function StackedBars({ groups, keys, label }: { groups: { name: string; counts: Record<string, number> }[]; keys: { key: string; label: string; color: string }[]; label: string }) {
  const max = Math.max(1, ...groups.map((g) => keys.reduce((n, k) => n + (g.counts[k.key] ?? 0), 0)));
  const H = 180;
  return (
    <figure className="sbars" aria-label={label}>
      <div className="sbars__plot">
        {groups.map((g) => {
          const tot = keys.reduce((n, k) => n + (g.counts[k.key] ?? 0), 0);
          return (
            <div key={g.name} className="sbars__col">
              <div className="sbars__stack" style={{ height: H }} data-tip={`${g.name}: ${tot}`}>
                {keys.filter((k) => (g.counts[k.key] ?? 0) > 0).map((k) => <div key={k.key} style={{ height: `${((g.counts[k.key] ?? 0) / max) * 100}%`, background: k.color }} data-tip={`${k.label}: ${g.counts[k.key]}`} />)}
              </div>
              <span className="sbars__name">{g.name}</span><span className="muted sbars__tot">{tot}</span>
            </div>);
        })}
      </div>
      <figcaption className="chart-legend">{keys.map((k) => <span key={k.key}><i style={{ background: k.color }} />{k.label}</span>)}</figcaption>
    </figure>
  );
}
