// Dialogs, drawers, menus and toasts with focus handling (Esc closes, focus returns, Tab stays inside).
import { useEffect, useId, useRef, useState, type ReactNode, type KeyboardEvent as ReactKeyEvent } from 'react';
import { Button, cx } from './primitives.tsx';
import type { ToastItem } from '../state/PlannerContext.tsx';
import { activeIn, eventInside } from './dom.ts';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useOverlay(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const restore = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    restore.current = activeIn(ref.current) as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus], input:not([type=hidden]), textarea, select') ?? el?.querySelector<HTMLElement>(FOCUSABLE) ?? el;
    first?.focus();
    return () => { restore.current?.focus?.(); };
  }, [open]);
  const onKeyDown = (e: ReactKeyEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab') return;
    const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((n) => n.offsetParent !== null);
    if (!nodes.length) return;
    const first = nodes[0]!, last = nodes[nodes.length - 1]!;
    if (e.shiftKey && activeIn(first) === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && activeIn(last) === last) { e.preventDefault(); first.focus(); }
  };
  return { ref, onKeyDown };
}

export function Dialog({ open, title, onClose, children, footer, wide, description }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; description?: string }) {
  const titleId = useId();
  const { ref, onKeyDown } = useOverlay(open, onClose);
  if (!open) return null;
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={cx('dialog', wide && 'dialog--wide')} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}>
        <header className="dialog__head">
          <div><h2 id={titleId} className="dialog__title">{title}</h2>{description && <p className="dialog__desc">{description}</p>}</div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </header>
        <div className="dialog__body">{children}</div>
        {footer && <footer className="dialog__foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Drawer({ open, title, onClose, children, actions, subtitle }: { open: boolean; title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  const titleId = useId();
  const { ref, onKeyDown } = useOverlay(open, onClose);
  if (!open) return null;
  return (
    <div className="drawer-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside ref={ref} className="drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}>
        <header className="drawer__head">
          <div className="drawer__headtext"><h2 id={titleId} className="drawer__title">{title}</h2>{subtitle && <div className="drawer__sub">{subtitle}</div>}</div>
          <div className="drawer__actions">{actions}<button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>✕</button></div>
        </header>
        <div className="drawer__body">{children}</div>
      </aside>
    </div>
  );
}

export function ConfirmDialog({ open, title, children, confirmLabel = 'Confirm', danger, busy, onConfirm, onClose }: { open: boolean; title: string; children: ReactNode; confirmLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog open={open} title={title} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} busy={busy} onClick={onConfirm} data-autofocus>{confirmLabel}</Button></>}>
      <div className="dialog__text">{children}</div>
    </Dialog>
  );
}

export function Toasts({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {items.map((t) => (
        <div key={t.id} className={cx('toast', `toast--${t.kind}`)} role={t.kind === 'error' ? 'alert' : 'status'}>
          <span className="toast__text">{t.text}</span>
          <button type="button" className="icon-btn" aria-label="Dismiss message" onClick={() => onDismiss(t.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}

/** A small popover menu opened by a button. */
export function MenuButton({ label, children, align = 'end', variant = 'secondary', size = 'md' }: { label: ReactNode; children: (close: () => void) => ReactNode; align?: 'start' | 'end'; variant?: 'primary' | 'secondary' | 'ghost'; size?: 'md' | 'sm' }) {
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!eventInside(wrap.current, e)) setOpen(false); };
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="menu" ref={wrap}>
      <Button variant={variant} size={size} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{label}{typeof label === 'string' && <span aria-hidden="true"> ▾</span>}</Button>   {/* icon menus (⋯) need no arrow */}
      {open && <div className={cx('menu__panel', align === 'start' && 'menu__panel--start')} id={id} role="menu" onClick={() => setOpen(false)}>{children(() => setOpen(false))}</div>}
    </div>
  );
}/** A panel that stays open while you use what is inside (unlike a menu): closes on outside click or Escape. */
export function Popover({ label, count, children, align = 'start' }: { label: ReactNode; count?: number; children: ReactNode; align?: 'start' | 'end' }) {
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!eventInside(wrap.current, e)) setOpen(false); };
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="popover" ref={wrap}>
      <Button className={cx(count ? 'is-active' : undefined)} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{label}{!!count && <span className="multi__count">{count}</span>}<span aria-hidden="true"> ▾</span></Button>
      {open && <div className={cx('popover__panel', align === 'end' && 'popover__panel--end')} id={id} role="group" aria-label={typeof label === 'string' ? label : undefined}>{children}</div>}
    </div>
  );
}
export function MenuItem({ children, onClick, danger, disabled, hint }: { children: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean; hint?: string }) {
  return <button type="button" role="menuitem" className={cx('menu__item', danger && 'menu__item--danger')} disabled={disabled} title={disabled ? hint : undefined} onClick={onClick}>{children}{disabled && hint && <span className="sr-only"> ({hint})</span>}</button>;
}
