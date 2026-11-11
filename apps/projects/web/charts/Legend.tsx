import type { CSSProperties } from 'react';
import { cx } from '../lib/util.ts';

export interface LegendItem { key: string; label: string; color: string; value?: string; dashed?: boolean }

/** Legend that doubles as the series switch: pressing an entry hides / shows that series (aria-pressed). */
export function Legend({ items, hidden, onToggle, className }: { items: LegendItem[]; hidden?: ReadonlySet<string>; onToggle?: (key: string) => void; className?: string }) {
  return (
    <ul className={cx('pm-legend', className)} aria-label="Legend">
      {items.map((it) => {
        const off = hidden?.has(it.key) ?? false;
        const body = (
          <>
            <i className={cx('pm-legend__sw', it.dashed && 'is-dashed')} style={{ '--sw': it.color } as CSSProperties} aria-hidden="true" />
            <span className="pm-legend__label">{it.label}</span>
            {it.value !== undefined && <span className="pm-legend__val pm-num">{it.value}</span>}
          </>
        );
        return (
          <li key={it.key}>
            {onToggle ? (
              <button type="button" className={cx('pm-legend__item', off && 'is-off')} aria-pressed={!off} title={off ? `Show ${it.label}` : `Hide ${it.label}`} onClick={() => onToggle(it.key)}>{body}</button>
            ) : (
              <span className="pm-legend__item">{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
