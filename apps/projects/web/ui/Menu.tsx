import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, KeyboardEvent, ReactNode, RefObject } from 'react';
import { cx } from '../lib/util.ts';
import { Icon } from './icons.tsx';
import type { IconName } from './icons.tsx';
import { Popover } from './Overlay.tsx';
import type { Anchor, CloseReason } from './Overlay.tsx';
import { byId } from '../lib/dom.ts';

export interface MenuItem {
  id: string;
  label: ReactNode;
  /** Plain text used for searching (defaults to label when it is a string). */
  text?: string;
  icon?: IconName;
  leading?: ReactNode;
  hint?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  selected?: boolean;
  heading?: boolean;
  separatorBefore?: boolean;
  onSelect?: () => void;
}

function itemText(i: MenuItem): string { return (i.text ?? (typeof i.label === 'string' ? i.label : '')).toLowerCase(); }
function filterItems(items: MenuItem[], q: string): MenuItem[] {
  const n = q.trim().toLowerCase();
  return n ? items.filter((i) => !i.heading && itemText(i).includes(n)) : items;
}
const selectable = (i: MenuItem) => !i.disabled && !i.heading;

export interface MenuPanelProps {
  anchor: Anchor;
  open: boolean;
  onClose: (reason: CloseReason) => void;
  items: MenuItem[];
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  align?: 'start' | 'end';
  matchWidth?: boolean;
  role?: 'menu' | 'listbox';
  label?: string;
  className?: string;
}

/** Keyboard-navigable menu / listbox in a portal. Arrow keys, Home/End, Enter, Escape, optional search. */
export function MenuPanel({ anchor, open, onClose, items, searchable, searchPlaceholder = 'Search…', emptyText = 'No matches', align, matchWidth, role = 'menu', label, className }: MenuPanelProps) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(-1);
  const uid = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const visible = useMemo(() => filterItems(items, q), [items, q]);

  useEffect(() => {
    if (!open) return;
    setQ('');
    const sel = items.findIndex((i) => i.selected && selectable(i));
    setActive(sel >= 0 ? sel : items.findIndex(selectable));
    (searchable ? inputRef.current : panelRef.current)?.focus({ preventScroll: true });
    // eslint-disable-next-line
  }, [open]);

  const onQuery = (v: string) => { setQ(v); setActive(filterItems(items, v).findIndex(selectable)); };

  useEffect(() => {
    if (open && active >= 0) byId(`${uid}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, uid]);

  const move = (dir: 1 | -1) => {
    const idx = visible.map((v, i) => (selectable(v) ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return;
    const cur = idx.indexOf(active);
    setActive(idx[(cur + dir + idx.length) % idx.length] ?? idx[0]);
  };
  const choose = (i: number) => {
    const it = visible[i];
    if (!it || !selectable(it)) return;
    it.onSelect?.();
    onClose('select');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(1); break;
      case 'ArrowUp': e.preventDefault(); move(-1); break;
      case 'Home': if (!searchable) { e.preventDefault(); setActive(visible.findIndex(selectable)); } break;
      case 'End': if (!searchable) { e.preventDefault(); for (let i = visible.length - 1; i >= 0; i--) if (selectable(visible[i])) { setActive(i); break; } } break;
      case 'Enter': e.preventDefault(); choose(active); break;
      case ' ': if (!searchable) { e.preventDefault(); choose(active); } break;
      case 'Tab': onClose('tab'); break;
    }
  };

  const optRole = role === 'listbox' ? 'option' : 'menuitem';
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} align={align} matchWidth={matchWidth} className={cx('pm-menu-pop', className)}>
      <div ref={panelRef} className="pm-menu" role={role} aria-label={label} tabIndex={-1} onKeyDown={onKeyDown} aria-activedescendant={active >= 0 ? `${uid}-${active}` : undefined}>
        {searchable && (
          <div className="pm-menu__search">
            <Icon name="search" size={14} />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => onQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              aria-activedescendant={active >= 0 ? `${uid}-${active}` : undefined}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}
        <div className="pm-menu__list">
          {visible.length === 0 && <div className="pm-menu__empty">{emptyText}</div>}
          {visible.map((it, i) => it.heading ? (
            <div key={it.id} className="pm-menu__heading" role="presentation">{it.label}</div>
          ) : (
            <div key={it.id} role="presentation">
              {it.separatorBefore && <div className="pm-menu__sep" role="separator" />}
              <div
                id={`${uid}-${i}`}
                role={optRole}
                aria-selected={role === 'listbox' ? !!it.selected : undefined}
                aria-checked={role === 'menu' && it.selected !== undefined ? it.selected : undefined}
                aria-disabled={it.disabled || undefined}
                className={cx('pm-menu__item', i === active && 'is-active', it.danger && 'is-danger', it.disabled && 'is-disabled', it.selected && 'is-selected')}
                onMouseEnter={() => { if (selectable(it)) setActive(i); }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
              >
                {it.leading ?? (it.icon ? <Icon name={it.icon} /> : null)}
                <span className="pm-menu__label pm-truncate">{it.label}</span>
                {it.hint && <span className="pm-menu__hint">{it.hint}</span>}
                {it.selected && <Icon name="check" size={14} className="pm-menu__check" />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Popover>
  );
}

export type TriggerProps = Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'onKeyDown' | 'aria-haspopup' | 'aria-expanded'> & { ref: RefObject<HTMLButtonElement> };

export interface MenuProps extends Omit<MenuPanelProps, 'anchor' | 'open' | 'onClose'> {
  trigger: (props: TriggerProps, open: boolean) => ReactNode;
  onOpenChange?: (open: boolean) => void;
}

export function Menu({ trigger, onOpenChange, ...panel }: MenuProps) {
  const [open, setOpenState] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const setOpen = (v: boolean) => { setOpenState(v); onOpenChange?.(v); };
  const props: TriggerProps = {
    ref,
    onClick: () => setOpen(!open),
    onKeyDown: (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); } },
    'aria-haspopup': panel.role === 'listbox' ? 'listbox' : 'menu',
    'aria-expanded': open,
  };
  return (
    <>
      {trigger(props, open)}
      <MenuPanel
        {...panel}
        anchor={ref.current}
        open={open}
        onClose={(reason) => { setOpen(false); if (reason !== 'outside') ref.current?.focus({ preventScroll: true }); }}
      />
    </>
  );
}

// ---------- Select ----------
export interface SelectOption<T extends string> { value: T; label: string; leading?: ReactNode; hint?: ReactNode }

export function Select<T extends string>({ value, options, onChange, placeholder = 'Select…', searchable, disabled, invalid, size = 'md', ariaLabel, className, matchWidth = true }: {
  value: T | null;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  size?: 'sm' | 'md';
  ariaLabel?: string;
  className?: string;
  matchWidth?: boolean;
}) {
  const items = useMemo<MenuItem[]>(() => options.map((o) => ({ id: o.value || '__empty', label: o.label, text: o.label, leading: o.leading, hint: o.hint, selected: o.value === value, onSelect: () => onChange(o.value) })), [options, value, onChange]);
  const current = options.find((o) => o.value === value);
  return (
    <Menu
      role="listbox"
      items={items}
      searchable={searchable ?? options.length > 8}
      matchWidth={matchWidth}
      label={ariaLabel}
      trigger={(t, open) => (
        <button type="button" {...t} disabled={disabled} aria-label={ariaLabel} className={cx('pm-select', size === 'sm' && 'pm-select--sm', open && 'is-open', invalid && 'is-invalid', className)}>
          {current?.leading}
          <span className={cx('pm-select__value pm-truncate', !current && 'is-placeholder')}>{current ? current.label : placeholder}</span>
          <Icon name="chevronsUpDown" size={14} className="pm-select__caret" />
        </button>
      )}
    />
  );
}
