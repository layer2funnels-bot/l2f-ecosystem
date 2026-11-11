// One reusable context menu for the whole app.
//   - spread `contextMenuProps(() => items)` on any element: right-click, Shift+F10 / Menu key and touch long-press (500 ms) open it
//   - a single <ContextMenuHost /> (mounted once in App) renders it, so only one menu can ever be open
//   - items may have `children` (submenus, open on hover or →), icons, shortcut hints, danger style, disabled + reason tooltip
//   - closes on outside click, scroll, resize, Escape, Tab and window blur. Text fields keep the native browser menu.
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode, TouchEvent as ReactTouchEvent } from 'react';
import { cx } from '../lib/util.ts';
import { Icon } from './icons.tsx';
import type { IconName } from './icons.tsx';
import { Portal } from './Overlay.tsx';
import { byId, activeEl } from '../lib/dom.ts';

export interface CtxItem {
  id: string;
  label: ReactNode;
  /** Plain text for type-ahead and search (defaults to label when it is a string). */
  text?: string;
  icon?: IconName;
  leading?: ReactNode;
  /** Right-aligned shortcut hint, e.g. "Ctrl+Enter". */
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  /** Shown as a tooltip when the item is disabled. */
  disabledReason?: string;
  /** Shows a check mark. */
  checked?: boolean;
  /** Stay open after choosing (used for toggles such as tags); the check mark flips locally. */
  keepOpen?: boolean;
  separatorBefore?: boolean;
  heading?: boolean;
  /** Submenu. */
  children?: CtxItem[];
  /** Adds a search box to the submenu. */
  searchable?: boolean;
  searchPlaceholder?: string;
  onSelect?: () => void;
}
export type CtxItems = CtxItem[];
export type CtxSource = () => CtxItem[] | Promise<CtxItem[]> | null | undefined;

interface OpenState { id: number; x: number; y: number; items: CtxItem[] | null; label: string; returnFocus: HTMLElement | null; keyboard: boolean }

// ---------- single global store: one menu at a time ----------
let state: OpenState | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => { for (const l of [...listeners]) l(); };
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

export function closeContextMenu(restoreFocus = false): void {
  if (!state) return;
  const back = restoreFocus ? state.returnFocus : null;
  state = null;
  emit();
  if (back && document.contains(back)) back.focus({ preventScroll: true });
}
export function isContextMenuOpen(): boolean { return state !== null; }

export function openContextMenu(o: { x: number; y: number; items: CtxItem[] | Promise<CtxItem[]>; label?: string; keyboard?: boolean }): void {
  const id = ++seq;
  const active = activeEl();
  state = {
    id, x: o.x, y: o.y, items: Array.isArray(o.items) ? o.items : null, label: o.label ?? 'Actions',
    returnFocus: active instanceof HTMLElement && active !== document.body ? active : null, keyboard: !!o.keyboard,
  };
  emit();
  if (!Array.isArray(o.items)) {
    o.items.then((items) => { if (state?.id === id) { state = { ...state, items }; emit(); } }, () => { if (state?.id === id) closeContextMenu(); });
  }
}

/** For "⋯" buttons: opens the context menu of the nearest ancestor that has contextMenuProps, anchored under the button. */
export function openMenuFrom(el: HTMLElement): void {
  const r = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: Math.max(1, Math.round(r.left)), clientY: Math.round(r.bottom + 2) }));
}

// ---------- trigger props ----------
const NATIVE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
const isNative = (t: EventTarget | null) => t instanceof Element && !!t.closest(NATIVE);

let touch: { timer: number; x: number; y: number; fired: boolean } | null = null;
let lastOpenAt = 0;

/** Spread on any element. `source` is called when the menu is requested; return null to show nothing (the browser menu / a parent's menu then applies). */
export function contextMenuProps(source: CtxSource, o: { label?: string } = {}) {
  const open = (x: number, y: number, keyboard: boolean) => {
    const items = source();
    if (!items) return false;
    lastOpenAt = Date.now();
    openContextMenu({ x, y, items, label: o.label, keyboard });
    return true;
  };
  return {
    onContextMenu: (e: ReactMouseEvent<HTMLElement>) => {
      if (isNative(e.target)) return;
      const fromKeyboard = e.clientX === 0 && e.clientY === 0 && e.button === 0;
      let x = e.clientX, y = e.clientY;
      if (fromKeyboard) { const r = (e.target as HTMLElement).getBoundingClientRect(); x = r.left + Math.min(24, r.width / 2); y = r.bottom - Math.min(8, r.height / 2); }
      if (open(x, y, fromKeyboard)) { e.preventDefault(); e.stopPropagation(); }
    },
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => {
      if (!(e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey))) return;
      if (isNative(e.target)) return;
      const r = (e.target as HTMLElement).getBoundingClientRect();
      if (open(r.left + Math.min(24, r.width / 2), r.bottom - Math.min(8, r.height / 2), true)) { e.preventDefault(); e.stopPropagation(); }
    },
    onTouchStart: (e: ReactTouchEvent<HTMLElement>) => {
      if (e.touches.length !== 1 || isNative(e.target)) return;
      const t = e.touches[0];
      if (touch) window.clearTimeout(touch.timer);
      const mine = { x: t.clientX, y: t.clientY, fired: false, timer: 0 };
      mine.timer = window.setTimeout(() => {
        if (touch !== mine || Date.now() - lastOpenAt < 700) return;
        if (open(mine.x, mine.y, false)) mine.fired = true;
      }, 500);
      touch = mine;
    },
    onTouchMove: (e: ReactTouchEvent<HTMLElement>) => {
      if (!touch) return;
      const t = e.touches[0];
      if (Math.abs(t.clientX - touch.x) > 10 || Math.abs(t.clientY - touch.y) > 10) { window.clearTimeout(touch.timer); touch = null; }
    },
    onTouchEnd: (e: ReactTouchEvent<HTMLElement>) => {
      if (!touch) return;
      window.clearTimeout(touch.timer);
      if (touch.fired && e.cancelable) e.preventDefault(); // no click after a long-press
      touch = null;
    },
    onTouchCancel: () => { if (touch) window.clearTimeout(touch.timer); touch = null; },
  };
}

// ---------- rendering ----------
const textOf = (i: CtxItem) => (i.text ?? (typeof i.label === 'string' ? i.label : '')).toLowerCase();
const selectable = (i: CtxItem) => !i.disabled && !i.heading;

interface PanelProps {
  items: CtxItem[];
  label: string;
  x: number; y: number;
  /** Submenus anchor to the parent item's rectangle. */
  anchor?: DOMRect;
  level: number;
  focusOnMount: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  onCloseSelf: () => void;
}

function Panel({ items, label, x, y, anchor, level, focusOnMount, searchable, searchPlaceholder, onCloseSelf }: PanelProps) {
  const uid = useId();
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(-1);
  const [sub, setSub] = useState<{ index: number; keyboard: boolean } | null>(null);
  const [flips, setFlips] = useState<Set<string>>(new Set());
  const hoverTimer = useRef<number | undefined>(undefined);
  const typed = useRef({ buf: '', at: 0 });

  const visible = searchable && q.trim() ? items.filter((i) => !i.heading && textOf(i).includes(q.trim().toLowerCase())) : items;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const m = 8, vw = window.innerWidth, vh = window.innerHeight;
    const maxHeight = vh - m * 2;
    const w = el.offsetWidth, h = Math.min(el.scrollHeight, maxHeight);
    let left: number, top: number;
    if (anchor) {
      left = anchor.right - 4;
      if (left + w > vw - m) left = anchor.left - w + 4;
      top = anchor.top - 5;
    } else {
      left = x + w > vw - m ? x - w : x;
      top = y + h > vh - m ? y - h : y;
    }
    left = Math.max(m, Math.min(left, vw - w - m));
    top = Math.max(m, Math.min(top, vh - h - m));
    setPos({ left, top, maxHeight });
  }, [anchor, x, y, visible.length]);

  useEffect(() => {
    if (focusOnMount) (searchable ? input.current : ref.current)?.focus({ preventScroll: true });
    setActive(focusOnMount ? items.findIndex(selectable) : -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);
  useEffect(() => { if (active >= 0) byId(`${uid}-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active, uid]);

  const move = (dir: 1 | -1, from = active) => {
    const idx = visible.map((v, i) => (selectable(v) ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return;
    const cur = idx.indexOf(from);
    setActive(idx[cur < 0 ? (dir === 1 ? 0 : idx.length - 1) : (cur + dir + idx.length) % idx.length]);
  };
  const openSub = (i: number, keyboard: boolean) => {
    const it = visible[i];
    if (it?.children?.length && selectable(it)) setSub({ index: i, keyboard });
  };
  const choose = (i: number, keyboard: boolean) => {
    const it = visible[i];
    if (!it || !selectable(it)) return;
    if (it.children?.length) { openSub(i, keyboard); return; }
    if (it.keepOpen) {
      setFlips((f) => { const n = new Set(f); if (n.has(it.id)) n.delete(it.id); else n.add(it.id); return n; });
      it.onSelect?.();
      return;
    }
    closeContextMenu(true);
    it.onSelect?.();
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const inField = e.target instanceof HTMLInputElement;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    switch (e.key) {
      case 'ArrowDown': stop(); move(1); return;
      case 'ArrowUp': stop(); move(-1); return;
      case 'Home': if (!inField) { stop(); setActive(visible.findIndex(selectable)); } return;
      case 'End': if (!inField) { stop(); for (let i = visible.length - 1; i >= 0; i--) if (selectable(visible[i])) { setActive(i); break; } } return;
      case 'ArrowRight': if (!inField || (e.target as HTMLInputElement).selectionStart === (e.target as HTMLInputElement).value.length) { if (visible[active]?.children?.length) { stop(); openSub(active, true); } } return;
      case 'ArrowLeft': if (level > 0 && !inField) { stop(); onCloseSelf(); } return;
      case 'Enter': stop(); choose(active, true); return;
      case ' ': if (!inField) { stop(); choose(active, true); } return;
      case 'Escape': stop(); if (level > 0) onCloseSelf(); else closeContextMenu(true); return;
      case 'Tab': e.stopPropagation(); closeContextMenu(true); return;
      default: break;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.stopPropagation(); // never let a typed letter reach the global shortcuts
      if (inField) return;
      // type-ahead
      const now = Date.now();
      const t = typed.current;
      t.buf = now - t.at > 700 ? e.key.toLowerCase() : t.buf + e.key.toLowerCase();
      t.at = now;
      const n = visible.length;
      const start = t.buf.length > 1 ? Math.max(active, 0) : active + 1;
      for (let k = 0; k < n; k++) {
        const i = (start + k) % n;
        if (selectable(visible[i]) && textOf(visible[i]).startsWith(t.buf)) { e.preventDefault(); setActive(i); break; }
      }
    }
  };

  const subItem = sub ? visible[sub.index] : undefined;
  const subEl = sub ? byId(`${uid}-${sub.index}`) : null;
  return (
    <div
      ref={ref}
      className={cx('pm-pop pm-ctx', level > 0 && 'pm-ctx--sub')}
      style={pos ? { left: pos.left, top: pos.top, maxHeight: pos.maxHeight, visibility: 'visible' } : { left: x, top: y, visibility: 'hidden' }}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      data-ctx-level={level}
      aria-activedescendant={active >= 0 ? `${uid}-${active}` : undefined}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {searchable && (
        <div className="pm-menu__search">
          <Icon name="search" size={14} />
          <input
            ref={input}
            value={q}
            onChange={(e) => { setQ(e.target.value); setSub(null); setActive(items.filter((i) => !i.heading && textOf(i).includes(e.target.value.trim().toLowerCase())).findIndex(selectable)); }}
            placeholder={searchPlaceholder ?? 'Search…'}
            aria-label={searchPlaceholder ?? 'Search'}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      )}
      <div className="pm-ctx__list">
        {visible.length === 0 && <div className="pm-menu__empty">No matches</div>}
        {visible.map((it, i) => {
          if (it.heading) return <div key={it.id} className="pm-menu__heading" role="presentation">{it.label}</div>;
          const checked = it.keepOpen ? !!it.checked !== flips.has(it.id) : it.checked;
          const has = !!it.children?.length;
          return (
            <div key={it.id} role="presentation">
              {it.separatorBefore && i > 0 && <div className="pm-menu__sep" role="separator" />}
              <div
                id={`${uid}-${i}`}
                role={checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
                aria-checked={checked}
                aria-disabled={it.disabled || undefined}
                aria-haspopup={has ? 'menu' : undefined}
                aria-expanded={has ? sub?.index === i : undefined}
                title={it.disabled ? it.disabledReason : undefined}
                className={cx('pm-menu__item pm-ctx__item', i === active && 'is-active', it.danger && 'is-danger', it.disabled && 'is-disabled', sub?.index === i && 'is-open')}
                onMouseEnter={() => {
                  window.clearTimeout(hoverTimer.current);
                  if (selectable(it)) setActive(i); else setActive(-1);
                  if (has && selectable(it)) hoverTimer.current = window.setTimeout(() => openSub(i, false), 90);
                  else if (sub) hoverTimer.current = window.setTimeout(() => setSub(null), 140);
                }}
                onMouseDown={(e) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); }}
                onClick={() => choose(i, false)}
              >
                {it.leading ?? (it.icon ? <Icon name={it.icon} /> : <span className="pm-ctx__noicon" aria-hidden="true" />)}
                <span className="pm-menu__label pm-truncate">{it.label}</span>
                {it.shortcut && <kbd className="pm-ctx__kbd">{it.shortcut}</kbd>}
                {checked && <Icon name="check" size={14} className="pm-menu__check" />}
                {has && <Icon name="chevronRight" size={14} className="pm-ctx__caret" />}
              </div>
            </div>
          );
        })}
      </div>
      {sub && subItem?.children && subEl && (
        <Portal>
          <Panel
            key={`${sub.index}-${subItem.id}`}
            items={subItem.children}
            label={typeof subItem.label === 'string' ? subItem.label : 'Submenu'}
            x={0} y={0}
            anchor={subEl.getBoundingClientRect()}
            level={level + 1}
            focusOnMount={sub.keyboard}
            searchable={subItem.searchable}
            searchPlaceholder={subItem.searchPlaceholder}
            onCloseSelf={() => { setSub(null); ref.current?.focus({ preventScroll: true }); }}
          />
        </Portal>
      )}
    </div>
  );
}

export function ContextMenuHost() {
  const s = useSyncExternalStore(subscribe, () => state);
  const id = s?.id;

  useEffect(() => {
    if (id === undefined) return;
    const inMenu = (t: EventTarget | null) => t instanceof Element && !!t.closest('.pm-ctx');
    const onDown = (e: PointerEvent) => { if (!inMenu(e.target)) closeContextMenu(); };
    const onScroll = (e: Event) => { if (!inMenu(e.target)) closeContextMenu(); };
    const onKey = (e: KeyboardEvent) => {
      if (inMenu(e.target)) return;
      if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); } closeContextMenu(e.key === 'Escape'); }
    };
    const close = () => closeContextMenu();
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('wheel', onScroll, { capture: true, passive: true });
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    window.addEventListener('hashchange', close);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('wheel', onScroll, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('hashchange', close);
    };
  }, [id]);

  if (!s) return null;
  return (
    <Portal>
      <Panel
        key={`${s.id}-${s.items ? 'ready' : 'loading'}`}
        items={s.items ?? [{ id: '__loading', label: 'Loading…', disabled: true }]}
        label={s.label}
        x={s.x} y={s.y}
        level={0}
        focusOnMount
        onCloseSelf={() => closeContextMenu(true)}
      />
    </Portal>
  );
}
