import { useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { cx } from '../lib/util.ts';
import { Icon } from './icons.tsx';
import type { IconName } from './icons.tsx';

export interface TabItem { id: string; label: string; icon?: IconName; badge?: ReactNode; /** Small mark after the label, e.g. "Default" or a pin. */ mark?: ReactNode; /** Shows an inline editor in place of the tab (Enter saves, Escape cancels). */ edit?: { initial: string; onCommit: (value: string) => void; onCancel: () => void } }

export function Tabs({ items, value, onChange, ariaLabel, itemProps, className, trailing }: {
  /** Rendered after the last tab inside the tab bar (e.g. a "+" button). */
  trailing?: ReactNode;
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  /** Props spread on each tab button, e.g. contextMenuProps(...) for a right-click menu. */
  itemProps?: (id: string) => Record<string, unknown>;
  className?: string;
}) {
  const list = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = items.findIndex((t) => t.id === value);
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % items.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = items.length - 1;
    if (n < 0) return;
    e.preventDefault();
    onChange(items[n].id);
    requestAnimationFrame(() => list.current?.querySelector<HTMLButtonElement>(`[data-tab="${items[n].id}"]`)?.focus());
  };
  return (
    <div ref={list} className={cx('pm-tabs', className)} role="tablist" aria-label={ariaLabel} onKeyDown={onKey}>
      {items.map((t) => t.edit ? <TabEditor key={t.id} id={t.id} edit={t.edit} /> : (
        <button
          key={t.id}
          type="button"
          role="tab"
          data-tab={t.id}
          aria-selected={t.id === value}
          tabIndex={t.id === value ? 0 : -1}
          className={cx('pm-tab', t.id === value && 'is-active')}
          onClick={() => onChange(t.id)}
          {...(itemProps ? itemProps(t.id) : {})}
        >
          {t.icon && <Icon name={t.icon} size={14} />}
          <span>{t.label}</span>
          {t.mark}
          {t.badge !== undefined && <span className="pm-tab__badge">{t.badge}</span>}
        </button>
      ))}
      {trailing}
    </div>
  );
}

function TabEditor({ id, edit }: { id: string; edit: NonNullable<TabItem['edit']> }) {
  const done = useRef(false);
  const finish = (save: boolean, v: string) => { if (done.current) return; done.current = true; if (save) edit.onCommit(v); else edit.onCancel(); };
  return (
    <div className="pm-tab is-active is-editing" role="tab" aria-selected data-tab={id}>
      <input
        className="pm-tab__input" defaultValue={edit.initial} maxLength={40} aria-label="View name (empty resets to the default)" autoFocus onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); finish(true, e.currentTarget.value); } else if (e.key === 'Escape') { e.preventDefault(); finish(false, ''); } }}
        onBlur={(e) => finish(true, e.currentTarget.value)}
      />
    </div>
  );
}
