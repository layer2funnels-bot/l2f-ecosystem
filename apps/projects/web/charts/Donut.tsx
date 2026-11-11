import { useId, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { cx } from '../lib/util.ts';
import { fmtNum, fmtShare } from './format.ts';
import { Legend } from './Legend.tsx';
import { bindPoint, useRoving, useTip } from './tooltip.tsx';
import type { TipRow } from './tooltip.tsx';
import { useWidth } from './useSize.ts';

export interface DonutSlice {
  key: string; label: string; value: number; color: string;
  /** Extra tooltip rows, e.g. the estimate of the tasks in this slice. */
  rows?: TipRow[];
}

const TAU = Math.PI * 2;
function arc(cx0: number, cy0: number, ro: number, ri: number, a0: number, a1: number): string {
  const end = Math.min(a1, a0 + TAU - 0.0005); // a full circle cannot be one arc
  const big = end - a0 > Math.PI ? 1 : 0;
  const p = (r: number, a: number) => `${(cx0 + r * Math.cos(a)).toFixed(2)} ${(cy0 + r * Math.sin(a)).toFixed(2)}`;
  return `M ${p(ro, a0)} A ${ro} ${ro} 0 ${big} 1 ${p(ro, end)} L ${p(ri, end)} A ${ri} ${ri} 0 ${big} 0 ${p(ri, a0)} Z`;
}

/**
 * Donut with a center total. Hover or focus a segment for its count and share; the legend switches segments on and off
 * (shares are then of what is shown). `noun` is the thing being counted, e.g. ['task', 'tasks'].
 */
export function Donut({ data, ariaLabel, noun = ['task', 'tasks'], centerLabel, size = 184, className }: {
  data: DonutSlice[]; ariaLabel: string; noun?: [string, string]; centerLabel?: string; size?: number; className?: string;
}) {
  const [box, width] = useWidth<HTMLDivElement>(360);
  const tip = useTip();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [hover, setHover] = useState<string | null>(null);
  const shown = useMemo(() => data.filter((d) => !hidden.has(d.key) && d.value > 0), [data, hidden]);
  const total = shown.reduce((n, d) => n + d.value, 0);
  const roving = useRoving(shown.length);
  const uid = useId();

  const stacked = width < 340;
  const D = Math.min(size, Math.max(140, stacked ? width - 8 : size));
  const c = D / 2, ro = D / 2 - 6, ri = ro * 0.64;
  let angle = -Math.PI / 2;
  const segs = shown.map((d) => { const a0 = angle; angle += (d.value / total) * TAU; return { d, a0, a1: angle }; });
  const active = tip.open ? hover : null;
  const activeSeg = segs.find((s) => s.d.key === active);

  const toggle = (key: string) => {
    setHover(null); tip.hide();
    setHidden((h) => { const n = new Set(h); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  };

  return (
    <div ref={box} className={cx('pm-donut', stacked && 'is-stacked', className)}>
      <div className="pm-donut__plot" {...roving.rootProps} role="group" aria-label={ariaLabel}>
        <svg className="pm-chart__svg" width={D} height={D} viewBox={`0 0 ${D} ${D}`} focusable="false" role="presentation">
          {total === 0 && <circle cx={c} cy={c} r={(ro + ri) / 2} fill="none" className="pm-donut__empty" strokeWidth={ro - ri} />}
          {segs.map((s, i) => {
            const content = {
              title: s.d.label,
              rows: [
                { color: s.d.color, label: noun[1][0].toUpperCase() + noun[1].slice(1), value: fmtNum(s.d.value), strong: true },
                { label: 'Share of total', value: fmtShare(s.d.value / total) },
                ...(s.d.rows ?? []),
              ],
            };
            const dim = active !== null && active !== s.d.key;
            return (
              <path
                key={s.d.key}
                d={arc(c, c, ro, ri, s.a0, s.a1)}
                role="img"
                className={cx('pm-donut__seg', active === s.d.key && 'is-active', dim && 'is-dim')}
                style={{ fill: s.d.color, transformOrigin: `${c}px ${c}px` } as CSSProperties}
                {...roving.pointProps(i)}
                {...bindPoint(tip, content, (on) => setHover(on ? s.d.key : null))}
              />
            );
          })}
          <g className="pm-donut__center" pointerEvents="none" aria-hidden="true" id={`${uid}-c`}>
            <text x={c} y={c - 2} textAnchor="middle" className="pm-donut__total">{fmtNum(activeSeg ? activeSeg.d.value : total)}</text>
            <text x={c} y={c + 16} textAnchor="middle" className="pm-donut__caption">{activeSeg ? activeSeg.d.label : centerLabel ?? (total === 1 ? noun[0] : noun[1])}</text>
          </g>
        </svg>
      </div>
      <Legend
        className="pm-donut__legend"
        items={data.map((d) => ({ key: d.key, label: d.label, color: d.color, value: hidden.has(d.key) ? '–' : fmtNum(d.value) }))}
        hidden={hidden}
        onToggle={toggle}
      />
      {tip.view}
    </div>
  );
}
