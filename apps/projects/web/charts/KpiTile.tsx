import { useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { cx } from '../lib/util.ts';
import { clamp, fmtNum } from './format.ts';
import { POINT_ATTR, useTip } from './tooltip.tsx';
import { useWidth } from './useSize.ts';

export interface SparkPoint { label: string; value: number }

/** Tiny trend line. Hover, tap or arrow through it to read a point; the whole thing has one summary label for screen readers. */
export function Sparkline({ points, name, format = fmtNum, color = 'var(--pm-accent)', height = 30 }: {
  points: SparkPoint[]; name: string; format?: (n: number) => string; color?: string; height?: number;
}) {
  const [box, W] = useWidth<HTMLDivElement>(120);
  const tip = useTip();
  const [idx, setIdx] = useState<number | null>(null);
  const n = points.length;
  if (n === 0) return <div className="pm-spark" ref={box} aria-hidden="true" style={{ height }} />;
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const padY = 4, padX = 3;
  const x = (i: number) => padX + (n === 1 ? (W - 2 * padX) / 2 : (i / (n - 1)) * (W - 2 * padX));
  const y = (v: number) => (hi === lo ? height / 2 : height - padY - ((v - lo) / (hi - lo)) * (height - 2 * padY));
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const area = `${d} L${x(n - 1).toFixed(1)} ${height} L${x(0).toFixed(1)} ${height} Z`;
  const active = tip.open ? idx : null;
  const content = (i: number) => ({ title: points[i].label, rows: [{ color, label: name, value: format(points[i].value), strong: true }] });
  const summary = `${name} trend over ${n} point${n === 1 ? '' : 's'}: from ${format(vals[0])} to ${format(vals[n - 1])}, low ${format(lo)}, high ${format(hi)}.`;

  const at = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = n === 1 ? 0 : clamp(Math.round(((e.clientX - r.left - padX) / Math.max(1, r.width - 2 * padX)) * (n - 1)), 0, n - 1);
    setIdx(i);
    tip.showAt(e.clientX, r.top + 4, content(i));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = idx ?? n - 1;
    const next = e.key === 'ArrowRight' ? cur + 1 : e.key === 'ArrowLeft' ? cur - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const i = clamp(next, 0, n - 1);
    setIdx(i);
    tip.showEl(e.currentTarget, content(i));
  };

  return (
    <div
      ref={box} className="pm-spark" style={{ height }} role="img" aria-label={summary} tabIndex={0} {...{ [POINT_ATTR]: '' }}
      onPointerEnter={at} onPointerMove={(e) => { if (e.pointerType !== 'touch') at(e); }}
      onPointerLeave={(e) => { if (e.pointerType !== 'touch') { setIdx(null); tip.hide(); } }}
      onFocus={(e) => { let kb = true; try { kb = e.currentTarget.matches(':focus-visible'); } catch { /* keyboard */ } if (kb) { setIdx(n - 1); tip.showEl(e.currentTarget, content(n - 1)); } }}
      onBlur={() => { setIdx(null); tip.hide(); }}
      onKeyDown={onKey}
    >
      <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} className="pm-chart__svg pm-spark__svg" focusable="false" aria-hidden="true">
        {n > 1 && <path d={area} fill={color} opacity="0.12" />}
        <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(active ?? n - 1)} cy={y(vals[active ?? n - 1])} r={active !== null ? 3.5 : 2.5} fill={color} />
      </svg>
      {tip.view}
    </div>
  );
}

/** A number with a label and an optional sparkline. `tone="danger"` paints the value red. */
export function KpiTile({ label, value, hint, tone, spark, icon }: {
  label: string; value: string; hint?: ReactNode; tone?: 'danger' | 'ok'; icon?: ReactNode;
  spark?: { points: SparkPoint[]; format?: (n: number) => string; color?: string };
}) {
  return (
    <div className={cx('pm-kpi', tone && `pm-kpi--${tone}`)} role="group" aria-label={`${label}: ${value}`}>
      <div className="pm-kpi__top">
        <span className="pm-kpi__label">{icon}{label}</span>
      </div>
      <div className="pm-kpi__value pm-num">{value}</div>
      {hint && <div className="pm-kpi__hint">{hint}</div>}
      {spark && <Sparkline points={spark.points} name={label} format={spark.format} color={tone === 'danger' ? 'var(--pm-danger)' : spark.color} />}
    </div>
  );
}
