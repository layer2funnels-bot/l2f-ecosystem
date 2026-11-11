import { useState } from 'react';
import { clamp } from './format.ts';
import { bindPoint, POINT_ATTR, useTip } from './tooltip.tsx';
import type { TipContent } from './tooltip.tsx';

/** Ring showing 0..100. Hover / focus shows `tip`; the label in the middle defaults to the rounded percentage. */
export function ProgressRing({ value, size = 76, stroke = 9, color = 'var(--pm-st-done)', label, caption, tip: content, ariaLabel }: {
  value: number; size?: number; stroke?: number; color?: string; label?: string; caption?: string; tip?: TipContent; ariaLabel: string;
}) {
  const tip = useTip();
  const [, setOn] = useState(false);
  const v = clamp(Number.isFinite(value) ? value : 0, 0, 100);
  const r = (size - stroke) / 2, c = size / 2, len = 2 * Math.PI * r;
  const bind = content ? bindPoint(tip, content, setOn) : null;
  return (
    <span className="pm-ring" style={{ width: size, height: size }}>
      <svg className="pm-chart__svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" focusable="false"
        {...(bind ? { ...bind, tabIndex: 0, [POINT_ATTR]: '' } : { 'aria-label': ariaLabel })}>
        <circle cx={c} cy={c} r={r} fill="none" className="pm-ring__track" strokeWidth={stroke} />
        {v > 0 && <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(len * v) / 100} ${len}`} transform={`rotate(-90 ${c} ${c})`} className="pm-ring__arc" />}
        <text x={c} y={caption ? c + 1 : c + 5} textAnchor="middle" className="pm-ring__label">{label ?? `${Math.round(v)}%`}</text>
        {caption && <text x={c} y={c + 14} textAnchor="middle" className="pm-ring__caption">{caption}</text>}
      </svg>
      {tip.view}
    </span>
  );
}
