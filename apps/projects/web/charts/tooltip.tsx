// One tooltip for every chart: a fixed, non-interactive bubble in a portal. It sits near the pointer (or the focused element),
// flips to the other side near viewport edges, fades in over 120 ms and never takes pointer events.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { clamp } from './format.ts';
import { portalTarget } from '../lib/dom.ts';

export interface TipRow { color?: string; label: string; value: string; strong?: boolean }
export interface TipContent { title?: string; subtitle?: string; rows?: TipRow[]; note?: string }
interface TipState { x: number; y: number; gap: number; center: boolean; content: TipContent }

export interface TipApi {
  /** Near a point in viewport coordinates (the pointer). */
  showAt: (x: number, y: number, content: TipContent) => void;
  /** Above (or below) an element, centered on it: used for keyboard focus and taps. */
  showEl: (el: Element, content: TipContent) => void;
  hide: () => void;
  /** True while a tooltip is showing (charts use it to drop their hover highlight when a tap elsewhere dismissed it). */
  open: boolean;
  view: ReactNode;
}

/** Marks everything that can show a tooltip: tapping anywhere else (or scrolling, or Escape) dismisses it. */
export const POINT_ATTR = 'data-chart-point';

export function useTip(): TipApi {
  const [tip, setTip] = useState<TipState | null>(null);
  const showAt = useCallback((x: number, y: number, content: TipContent) => setTip({ x, y, gap: 14, center: false, content }), []);
  const showEl = useCallback((el: Element, content: TipContent) => {
    const r = el.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, y: r.top, gap: 8, center: true, content });
  }, []);
  const hide = useCallback(() => setTip(null), []);

  const open = tip !== null;
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!(e.target instanceof Element) || !e.target.closest(`[${POINT_ATTR}]`)) setTip(null); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setTip(null); };
    const scroll = () => setTip(null);
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', scroll, true);
    return () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', key); window.removeEventListener('scroll', scroll, true); };
  }, [open]);

  return { showAt, showEl, hide, open, view: tip ? <TipView tip={tip} /> : null };
}

/** Pointer + keyboard wiring for one data point. `onActive` tells the chart which point is highlighted. */
export function bindPoint(tip: TipApi, content: TipContent, onActive: (on: boolean) => void) {
  return {
    onPointerEnter: (e: ReactPointerEvent<Element>) => { onActive(true); tip.showAt(e.clientX, e.clientY, content); },
    onPointerMove: (e: ReactPointerEvent<Element>) => { if (e.pointerType !== 'touch') tip.showAt(e.clientX, e.clientY, content); },
    onPointerLeave: (e: ReactPointerEvent<Element>) => { if (e.pointerType === 'touch') return; onActive(false); tip.hide(); },
    onFocus: (e: ReactFocusEvent<Element>) => {
      // A mouse click also focuses the point; only keyboard focus re-anchors the bubble on the element.
      let kb = true;
      try { kb = e.currentTarget.matches(':focus-visible'); } catch { /* old engine: treat as keyboard */ }
      onActive(true);
      if (kb) tip.showEl(e.currentTarget, content);
    },
    onBlur: () => { onActive(false); tip.hide(); },
    'aria-label': tipText(content),
  };
}

function TipView({ tip }: { tip: TipState }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight, m = 8;
    let left = tip.center ? tip.x - w / 2 : tip.x + tip.gap;
    if (!tip.center && left + w > vw - m) left = tip.x - tip.gap - w;   // flip to the left of the pointer
    left = clamp(left, m, Math.max(m, vw - w - m));
    let top = tip.y - h - tip.gap;                                       // prefer above
    if (top < m) top = tip.y + tip.gap + (tip.center ? 0 : 8);            // flip below
    top = clamp(top, m, Math.max(m, vh - h - m));
    setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }));
  }, [tip]);
  const c = tip.content;
  return createPortal(
    <div ref={ref} className="pm-tip" style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }} aria-hidden="true">
      {c.title && <div className="pm-tip__title">{c.title}</div>}
      {c.subtitle && <div className="pm-tip__sub">{c.subtitle}</div>}
      {c.rows?.map((r, i) => (
        <div key={i} className={r.strong ? 'pm-tip__row is-strong' : 'pm-tip__row'}>
          {r.color ? <i className="pm-tip__sw" style={{ background: r.color }} /> : <i className="pm-tip__sw is-none" />}
          <span className="pm-tip__label">{r.label}</span>
          <span className="pm-tip__val">{r.value}</span>
        </div>
      ))}
      {c.note && <div className="pm-tip__note">{c.note}</div>}
    </div>,
    portalTarget(),
  );
}

/** Text a screen reader hears for a data point: the same words as the tooltip. */
export function tipText(c: TipContent): string {
  return [c.title, c.subtitle, ...(c.rows ?? []).map((r) => `${r.label} ${r.value}`), c.note].filter(Boolean).join(', ');
}

/**
 * Roving tabindex across a chart's data points: one point is a tab stop, arrow keys / Home / End move between them.
 * Spread `rootProps` on the container and `pointProps(i)` on each point.
 */
export function useRoving(count: number) {
  const [active, setActive] = useState(0);
  const cur = Math.min(active, Math.max(0, count - 1));
  const onKeyDown = (e: ReactKeyboardEvent<Element>) => {
    const t = (e.target as Element).closest('[data-pi]');
    if (!t) return;
    const i = Number(t.getAttribute('data-pi'));
    let n = i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = i + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = i - 1;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = count - 1;
    else return;
    e.preventDefault();
    n = clamp(n, 0, count - 1);
    (e.currentTarget.querySelector(`[data-pi="${n}"]`) as SVGElement | HTMLElement | null)?.focus();
  };
  const pointProps = (i: number) => ({
    'data-pi': i,
    [POINT_ATTR]: '',
    tabIndex: i === cur ? 0 : -1,
    onFocus: () => setActive(i),
  });
  return { rootProps: { onKeyDown }, pointProps, active: cur };
}
