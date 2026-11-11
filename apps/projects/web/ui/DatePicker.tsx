import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { addDays, cx, fmtDate, parseYmd, startOfWeek, toYmd, todayYmd } from '../lib/util.ts';
import { Icon } from './icons.tsx';
import { Popover } from './Overlay.tsx';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const monthLabel = (ymd: string) => new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(parseYmd(ymd));
function addMonths(ymd: string, n: number): string {
  const d = parseYmd(ymd);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toYmd(d);
}

export interface DatePickerProps {
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  clearable?: boolean;
  min?: string | null;
  max?: string | null;
  disabled?: boolean;
  invalid?: boolean;
  size?: 'sm' | 'md';
  ariaLabel?: string;
  className?: string;
  /** Visual treatment for the trigger: 'field' (default) or 'plain' (inline text button). */
  variant?: 'field' | 'plain';
  overdue?: boolean;
}

export function DatePicker({ value, onChange, placeholder = 'No date', clearable = true, min, max, disabled, invalid, size = 'md', ariaLabel, className, variant = 'field', overdue }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(value ?? todayYmd());
  const btn = useRef<HTMLButtonElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [focusDay, setFocusDay] = useState(false);

  useEffect(() => { if (open) { setCursor(value ?? todayYmd()); setFocusDay(true); } }, [open, value]);
  useEffect(() => {
    if (open && focusDay) { grid.current?.querySelector<HTMLButtonElement>(`[data-date="${cursor}"]`)?.focus({ preventScroll: true }); }
  }, [open, cursor, focusDay]);

  const close = (restore = true) => { setOpen(false); setFocusDay(false); if (restore) btn.current?.focus({ preventScroll: true }); };
  const blocked = (d: string) => (!!min && d < min) || (!!max && d > max);
  const pick = (d: string | null) => { onChange(d); close(); };

  const first = startOfWeek(`${cursor.slice(0, 8)}01`);
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  const cm = cursor.slice(0, 7);
  const today = todayYmd();

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, () => string> = {
      ArrowLeft: () => addDays(cursor, -1), ArrowRight: () => addDays(cursor, 1),
      ArrowUp: () => addDays(cursor, -7), ArrowDown: () => addDays(cursor, 7),
      PageUp: () => addMonths(cursor, -1), PageDown: () => addMonths(cursor, 1),
      Home: () => startOfWeek(cursor), End: () => addDays(startOfWeek(cursor), 6),
    };
    const fn = step[e.key];
    if (fn && (e.target as HTMLElement).hasAttribute('data-date')) { e.preventDefault(); setFocusDay(true); setCursor(fn()); }
  };

  return (
    <span className={cx('pm-datepicker', variant === 'plain' && 'pm-datepicker--plain', className)}>
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ? `${ariaLabel}: ${value ? fmtDate(value) : 'not set'}` : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cx('pm-select', size === 'sm' && 'pm-select--sm', open && 'is-open', invalid && 'is-invalid', overdue && 'is-overdue', variant === 'plain' && 'pm-select--plain')}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="calendar" size={14} className="pm-select__lead" />
        <span className={cx('pm-select__value pm-truncate', !value && 'is-placeholder')}>{value ? fmtDate(value) : placeholder}</span>
      </button>
      {clearable && value && !disabled && (
        <button type="button" className="pm-datepicker__clear" aria-label="Clear date" title="Clear date" onClick={() => onChange(null)}>
          <Icon name="x" size={12} />
        </button>
      )}
      <Popover anchor={btn.current} open={open} onClose={(r) => close(r !== 'outside')} className="pm-datepop" label="Choose a date">
        <div className="pm-cal" role="dialog" aria-label="Choose a date" onKeyDown={onKey}>
          <div className="pm-cal__head">
            <button type="button" className="pm-cal__nav" aria-label="Previous month" title="Previous month" onClick={() => { setFocusDay(false); setCursor(addMonths(cursor, -1)); }}><Icon name="chevronLeft" /></button>
            <div className="pm-cal__title" aria-live="polite">{monthLabel(cursor)}</div>
            <button type="button" className="pm-cal__nav" aria-label="Next month" title="Next month" onClick={() => { setFocusDay(false); setCursor(addMonths(cursor, 1)); }}><Icon name="chevronRight" /></button>
          </div>
          <div className="pm-cal__week" aria-hidden="true">{WEEKDAYS.map((w) => <span key={w}>{w}</span>)}</div>
          <div ref={grid} className="pm-cal__grid" role="grid">
            {days.map((d) => (
              <button
                key={d}
                type="button"
                role="gridcell"
                data-date={d}
                tabIndex={d === cursor ? 0 : -1}
                disabled={blocked(d)}
                aria-selected={d === value}
                aria-label={fmtDate(d)}
                className={cx('pm-cal__day', d.slice(0, 7) !== cm && 'is-out', d === today && 'is-today', d === value && 'is-selected')}
                onClick={() => pick(d)}
              >
                {Number(d.slice(8))}
              </button>
            ))}
          </div>
          <div className="pm-cal__foot">
            <button type="button" className="pm-cal__link" disabled={blocked(today)} onClick={() => pick(today)}>Today</button>
            {clearable && <button type="button" className="pm-cal__link" onClick={() => pick(null)}>Clear</button>}
          </div>
        </div>
      </Popover>
    </span>
  );
}
