import { useId, useMemo, useState } from 'react';
import { fmtNum, niceAxis } from './format.ts';
import { Legend } from './Legend.tsx';
import { bindPoint, useRoving, useTip } from './tooltip.tsx';
import { useWidth } from './useSize.ts';
import { cx } from '../lib/util.ts';

export interface LineSeries {
  key: string; label: string; color: string; values: number[];
  /** Fill under the line. */
  area?: boolean; dashed?: boolean;
}

/**
 * Line / area chart over a shared x axis. Moving over the plot (or arrowing through it) draws a vertical guide and a dot
 * on every visible series, and the tooltip lists each series' value at that x. The legend hides a series.
 */
export function LineChart({ xs, xLabel, xTitle, series, height = 240, format = fmtNum, ariaLabel, integer = true, className }: {
  xs: string[]; xLabel: (i: number) => string; xTitle: (i: number) => string; series: LineSeries[];
  height?: number; format?: (n: number) => string; ariaLabel: string; integer?: boolean; className?: string;
}) {
  const [box, W] = useWidth<HTMLDivElement>(560);
  const tip = useTip();
  const roving = useRoving(xs.length);
  const gid = useId();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const live = useMemo(() => series.filter((s) => !hidden.has(s.key)), [series, hidden]);
  const n = xs.length;

  const peak = Math.max(0, ...live.flatMap((s) => s.values));
  const axis = niceAxis(peak, 4, integer);
  const padL = 12 + Math.max(...axis.ticks.map((t) => format(t).length)) * 6.4, padR = 14, padT = 10, padB = 26;
  const H = height, pw = Math.max(40, W - padL - padR), ph = H - padT - padB;
  const x = (i: number) => padL + (n <= 1 ? pw / 2 : (i / (n - 1)) * pw);
  const y = (v: number) => padT + ph - (v / axis.max) * ph;
  const step = n <= 1 ? pw : pw / (n - 1);
  const every = Math.max(1, Math.ceil(64 / Math.max(step, 1)));
  const active = tip.open ? hover : null;
  // x labels: every `every`-th point, and always the last one (replacing a regular label that would sit too close to it)
  const tickIdx: number[] = [];
  for (let i = 0; i < n; i += every) tickIdx.push(i);
  if (n > 1 && tickIdx[tickIdx.length - 1] !== n - 1) {
    if (n - 1 - tickIdx[tickIdx.length - 1] < every * 0.7 && tickIdx.length > 1) tickIdx.pop();
    tickIdx.push(n - 1);
  }

  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const areaPath = (vals: number[]) => `${path(vals)} L${x(n - 1).toFixed(1)} ${y(0).toFixed(1)} L${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;
  const toggle = (key: string) => { tip.hide(); setHover(null); setHidden((h) => { const s = new Set(h); if (s.has(key)) s.delete(key); else s.add(key); return s; }); };
  const showDots = n <= 45;

  return (
    <div ref={box} className={cx('pm-line', className)}>
      <div {...roving.rootProps} role="group" aria-label={ariaLabel}>
        <svg className="pm-chart__svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} focusable="false" role="presentation">
          <defs>
            {live.map((s) => (
              <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={s.color} stopOpacity="0.28" />
                <stop offset="1" stopColor={s.color} stopOpacity="0.02" />
              </linearGradient>
            ))}
          </defs>
          {axis.ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={padL + pw} y1={y(t)} y2={y(t)} className={t === 0 ? 'pm-chart__axis' : 'pm-chart__grid'} />
              <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="pm-chart__tick">{format(t)}</text>
            </g>
          ))}
          {tickIdx.map((i) => (
            <text key={i} x={x(i)} y={H - 8} textAnchor={n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle'} className="pm-chart__tick">{xLabel(i)}</text>
          ))}
          {live.filter((s) => s.area).map((s) => n > 1 && <path key={`a-${s.key}`} d={areaPath(s.values)} fill={`url(#${gid}-${s.key})`} pointerEvents="none" />)}
          {live.map((s) => (
            <path key={s.key} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? '5 4' : undefined} pointerEvents="none" className="pm-line__path" />
          ))}
          {showDots && live.map((s) => s.values.map((v, i) => (
            <circle key={`${s.key}-${i}`} cx={x(i)} cy={y(v)} r={n === 1 ? 4 : 2.2} fill={s.color} pointerEvents="none" opacity={s.dashed ? 0 : 0.9} />
          )))}
          {active !== null && (
            <g pointerEvents="none" className="pm-line__guide">
              <line x1={x(active)} x2={x(active)} y1={padT} y2={padT + ph} className="pm-chart__guide" />
              {live.map((s) => <circle key={s.key} cx={x(active)} cy={y(s.values[active] ?? 0)} r={5} fill={s.color} className="pm-chart__dot" />)}
            </g>
          )}
          {xs.map((_, i) => {
            const content = {
              title: xTitle(i),
              rows: live.map((s) => ({ color: s.color, label: s.label, value: format(s.values[i] ?? 0), strong: true })),
            };
            const left = x(i) - step / 2;
            return (
              <rect
                key={i} role="img" className="pm-chart__pt pm-chart__hit pm-line__hit"
                x={left} y={padT} width={Math.max(6, step)} height={ph + 4}
                {...roving.pointProps(i)}
                {...bindPoint(tip, content, (on) => setHover(on ? i : null))}
              />
            );
          })}
        </svg>
      </div>
      {series.length > 1 && <Legend items={series.map((s) => ({ key: s.key, label: s.label, color: s.color, dashed: s.dashed }))} hidden={hidden} onToggle={toggle} />}
      {tip.view}
    </div>
  );
}
