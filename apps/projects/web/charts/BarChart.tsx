import { useId, useMemo, useState } from 'react';
import { clip, fmtNum, niceAxis } from './format.ts';
import { Legend } from './Legend.tsx';
import { bindPoint, useRoving, useTip } from './tooltip.tsx';
import type { TipRow } from './tooltip.tsx';
import { useWidth } from './useSize.ts';
import { cx } from '../lib/util.ts';

export interface BarSeries { key: string; label: string; color: string }
export interface BarDatum {
  key: string; label: string;
  /** Value per series key. */
  values: Record<string, number>;
  /** Extra tooltip rows (estimates, overdue ...). */
  rows?: TipRow[];
  /** Overrides the series color for single-series charts (status / priority colors). */
  color?: string;
}

/**
 * Horizontal or vertical bars; several series are stacked or grouped. Hover or focus a category for every series' value
 * (plus `rows`), arrow keys move between categories, the legend hides a series.
 */
export function BarChart({ data, series, orientation = 'horizontal', stacked = false, valueLabels = true, format = fmtNum, ariaLabel, rowHeight = 32, height = 220, noun, className }: {
  data: BarDatum[]; series: BarSeries[]; orientation?: 'horizontal' | 'vertical'; stacked?: boolean; valueLabels?: boolean;
  format?: (n: number) => string; ariaLabel: string; rowHeight?: number; height?: number; noun?: string; className?: string;
}) {
  const [box, W] = useWidth<HTMLDivElement>(420);
  const tip = useTip();
  const roving = useRoving(data.length);
  const clipId = useId();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const live = useMemo(() => series.filter((s) => !hidden.has(s.key)), [series, hidden]);
  const horizontal = orientation === 'horizontal';
  const sum = (d: BarDatum) => live.reduce((n, s) => n + (d.values[s.key] ?? 0), 0);
  const peak = data.reduce((m, d) => Math.max(m, stacked ? sum(d) : Math.max(0, ...live.map((s) => d.values[s.key] ?? 0))), 0);
  const axis = niceAxis(peak, horizontal ? Math.max(2, Math.min(5, Math.floor(W / 90))) : 4);
  const active = tip.open ? hover : null;

  // geometry
  const labelW = horizontal ? Math.min(Math.max(...data.map((d) => d.label.length), 4) * 6.4 + 12, Math.max(80, W * 0.34)) : 0;
  const padL = horizontal ? labelW : 34, padR = horizontal ? (valueLabels ? 40 : 10) : 8, padT = horizontal ? 4 : valueLabels ? 20 : 8, padB = horizontal ? 22 : 30;
  const H = horizontal ? padT + padB + data.length * rowHeight : height;
  const pw = Math.max(40, W - padL - padR), ph = H - padT - padB;
  const band = horizontal ? rowHeight : pw / Math.max(1, data.length);
  const scale = (v: number) => (v / axis.max) * (horizontal ? pw : ph);

  const toggle = (key: string) => { tip.hide(); setHover(null); setHidden((h) => { const n = new Set(h); if (n.has(key)) n.delete(key); else n.add(key); return n; }); };
  const total = data.reduce((n, d) => n + sum(d), 0);
  const summary = `${ariaLabel}. ${data.map((d) => `${d.label} ${live.map((s) => `${s.label} ${format(d.values[s.key] ?? 0)}`).join(', ')}`).join('; ')}.`;

  return (
    <div ref={box} className={cx('pm-bar', className)}>
      <div {...roving.rootProps} role="group" aria-label={ariaLabel} aria-description={summary}>
        <svg className="pm-chart__svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} focusable="false" role="presentation">
          {/* grid + axis */}
          {axis.ticks.map((t) => horizontal ? (
            <g key={t}>
              <line x1={padL + scale(t)} x2={padL + scale(t)} y1={padT} y2={padT + ph} className={t === 0 ? 'pm-chart__axis' : 'pm-chart__grid'} />
              <text x={padL + scale(t)} y={H - 6} textAnchor="middle" className="pm-chart__tick">{format(t)}</text>
            </g>
          ) : (
            <g key={t}>
              <line x1={padL} x2={padL + pw} y1={padT + ph - scale(t)} y2={padT + ph - scale(t)} className={t === 0 ? 'pm-chart__axis' : 'pm-chart__grid'} />
              <text x={padL - 6} y={padT + ph - scale(t) + 4} textAnchor="end" className="pm-chart__tick">{format(t)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const content = {
              title: d.label,
              rows: [
                ...live.map((s) => ({ color: d.color && series.length === 1 ? d.color : s.color, label: s.label, value: format(d.values[s.key] ?? 0), strong: true })),
                ...(stacked && live.length > 1 ? [{ label: 'Total', value: format(sum(d)) }] : []),
                ...(d.rows ?? []),
              ],
            };
            const pos = i * band;
            const thick = Math.min(horizontal ? rowHeight * 0.58 : band * 0.62, 34) / (stacked ? 1 : Math.max(1, live.length));
            const slotSize = thick * (stacked ? 1 : live.length);
            const start = pos + (band - slotSize) / 2;
            const stackTotal = sum(d);
            const isActive = active === i;
            return (
              <g key={d.key} className={cx('pm-bar__cat', isActive && 'is-active')}>
                {/* hit area / hover band */}
                <rect
                  className="pm-chart__pt pm-chart__hit"
                  role="img"
                  x={horizontal ? 0 : padL + pos} y={horizontal ? padT + pos : padT} width={horizontal ? W : band} height={horizontal ? band : ph + padB - 2}
                  rx={6}
                  {...roving.pointProps(i)}
                  {...bindPoint(tip, content, (on) => setHover(on ? i : null))}
                />
                {horizontal
                  ? <text x={padL - 8} y={padT + pos + band / 2 + 4} textAnchor="end" className="pm-chart__cat" pointerEvents="none">{clip(d.label, labelW - 10)}</text>
                  : <text x={padL + pos + band / 2} y={H - 10} textAnchor="middle" className="pm-chart__cat" pointerEvents="none">{clip(d.label, band - 4)}</text>}
                {stacked ? (() => {
                  // one rounded stack: plain segments clipped to the rounded outline
                  const len = scale(stackTotal);
                  let off = 0;
                  const cid = `${clipId}-${i}`;
                  return (
                    <g pointerEvents="none">
                      <clipPath id={cid}>
                        {horizontal
                          ? <rect x={padL} y={padT + start} width={Math.max(len, 0)} height={thick} rx={4} />
                          : <rect x={padL + start} y={padT + ph - len} width={thick} height={Math.max(len, 0)} rx={4} />}
                      </clipPath>
                      <g clipPath={`url(#${cid})`}>
                        {live.map((s) => {
                          const v = d.values[s.key] ?? 0;
                          const l = scale(v);
                          const r = horizontal
                            ? <rect key={s.key} x={padL + off} y={padT + start} width={l} height={thick} fill={s.color} />
                            : <rect key={s.key} x={padL + start} y={padT + ph - off - l} width={thick} height={l} fill={s.color} />;
                          off += l;
                          return r;
                        })}
                      </g>
                      {valueLabels && stackTotal > 0 && (horizontal
                        ? <text x={padL + len + 6} y={padT + start + thick / 2 + 4} className="pm-chart__val">{format(stackTotal)}</text>
                        : <text x={padL + start + thick / 2} y={padT + ph - len - 5} textAnchor="middle" className="pm-chart__val">{format(stackTotal)}</text>)}
                    </g>
                  );
                })() : (
                  <g pointerEvents="none">
                    {live.map((s, k) => {
                      const v = d.values[s.key] ?? 0;
                      const l = scale(v);
                      const color = d.color && series.length === 1 ? d.color : s.color;
                      const o = start + k * thick;
                      return horizontal ? (
                        <g key={s.key}>
                          {v > 0 ? <rect x={padL} y={padT + o} width={Math.max(l, 2)} height={thick} rx={4} fill={color} /> : <rect x={padL} y={padT + o + thick / 2 - 1} width={2} height={2} rx={1} className="pm-chart__zero" />}
                          {valueLabels && <text x={padL + Math.max(l, 2) + 6} y={padT + o + thick / 2 + 4} className="pm-chart__val">{format(v)}</text>}
                        </g>
                      ) : (
                        <g key={s.key}>
                          {v > 0 ? <rect x={padL + o} y={padT + ph - l} width={thick} height={Math.max(l, 2)} rx={4} fill={color} /> : <rect x={padL + o} y={padT + ph - 2} width={thick} height={2} rx={1} className="pm-chart__zero" />}
                          {valueLabels && <text x={padL + o + thick / 2} y={padT + ph - Math.max(l, 2) - 5} textAnchor="middle" className="pm-chart__val">{format(v)}</text>}
                        </g>
                      );
                    })}
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {series.length > 1 && <Legend items={series.map((s) => ({ key: s.key, label: s.label, color: s.color }))} hidden={hidden} onToggle={toggle} />}
      {noun && total === 0 && <p className="pm-faint pm-chart__note">No {noun} to show.</p>}
      {tip.view}
    </div>
  );
}
