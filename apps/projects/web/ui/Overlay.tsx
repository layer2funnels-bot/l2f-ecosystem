import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/util.ts';
import { activeEl, portalTarget } from '../lib/dom.ts';

export function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, portalTarget());
}

// ---------- Popover: portal, flips near viewport edges, closes on outside click / Escape ----------
export type Anchor = HTMLElement | { x: number; y: number } | null;
export type CloseReason = 'outside' | 'escape' | 'select' | 'tab';

function anchorRect(a: Anchor) {
  if (!a) return null;
  if (a instanceof HTMLElement) return a.getBoundingClientRect();
  return { left: a.x, right: a.x, top: a.y, bottom: a.y, width: 0, height: 0 };
}

export interface PopoverProps {
  anchor: Anchor;
  open: boolean;
  onClose: (reason: CloseReason) => void;
  children: ReactNode;
  align?: 'start' | 'end';
  matchWidth?: boolean;
  className?: string;
  gap?: number;
  label?: string;
}

export function Popover({ anchor, open, onClose, children, align = 'start', matchWidth, className, gap = 6, label }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden', top: 0, left: 0 });
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const place = useCallback(() => {
    const el = ref.current;
    const r = anchorRect(anchor);
    if (!el || !r) return;
    const m = 8;
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = el.offsetWidth;
    const natural = el.scrollHeight;
    const below = vh - r.bottom - gap - m;
    const above = r.top - gap - m;
    const placeBelow = natural <= below || below >= above;
    const room = Math.max(120, placeBelow ? below : above);
    const h = Math.min(natural, room);
    const top = placeBelow ? r.bottom + gap : r.top - gap - h;
    let left = align === 'end' ? r.right - w : r.left;
    left = Math.max(m, Math.min(left, vw - w - m));
    setStyle({ top, left, maxHeight: room, minWidth: matchWidth ? r.width : undefined, visibility: 'visible', transformOrigin: placeBelow ? 'top' : 'bottom' });
  }, [anchor, align, matchWidth, gap]);

  useLayoutEffect(() => { if (open) place(); }, [open, place, children]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => place();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (anchor instanceof HTMLElement && anchor.contains(t)) return;
      closeRef.current('outside');
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeRef.current('escape'); }
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, anchor, place]);

  if (!open) return null;
  return (
    <Portal>
      <div ref={ref} className={cx('pm-pop', className)} style={style} aria-label={label}>
        {children}
      </div>
    </Portal>
  );
}

// ---------- Tooltip ----------
export function Tooltip({ label, children, side = 'top' }: { label: ReactNode; children: ReactNode; side?: 'top' | 'bottom' }) {
  const wrap = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const r = wrap.current?.getBoundingClientRect();
      if (!r) return;
      setPos({ x: r.left + r.width / 2, y: side === 'top' ? r.top - 6 : r.bottom + 6 });
    }, 350);
  };
  const hide = () => { window.clearTimeout(timer.current); setPos(null); };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  if (!label) return <>{children}</>;
  return (
    <span ref={wrap} className="pm-tipwrap" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onPointerDown={hide}>
      {children}
      {pos && (
        <Portal>
          <div className={cx('pm-tooltip', side === 'bottom' && 'pm-tooltip--bottom')} role="tooltip" style={{ left: pos.x, top: pos.y }}>
            {label}
          </div>
        </Portal>
      )}
    </span>
  );
}

// ---------- Focus trap + restore ----------
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const previous = activeEl() as HTMLElement | null;
    const first = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el;
    first.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const nodes = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === activeEl());
      if (!nodes.length) { e.preventDefault(); el.focus(); return; }
      const a = nodes[0], b = nodes[nodes.length - 1];
      const cur = activeEl();
      if (e.shiftKey && (cur === a || cur === el)) { e.preventDefault(); b.focus(); }
      else if (!e.shiftKey && cur === b) { e.preventDefault(); a.focus(); }
    };
    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('keydown', onKey);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [ref, active]);
}

let scrollLocks = 0;
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    scrollLocks++;
    document.body.style.overflow = 'hidden';
    return () => { scrollLocks--; if (scrollLocks === 0) document.body.style.overflow = ''; };
  }, [active]);
}

export type KeyEvent = ReactKeyboardEvent<HTMLElement>;
