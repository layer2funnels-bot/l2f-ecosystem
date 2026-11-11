import { forwardRef, useCallback, useLayoutEffect, useRef } from 'react';
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { cx } from '../lib/util.ts';
import { Icon } from './icons.tsx';

/** Wraps a control with a label, hint and error. The label is the real <label>, so clicking it focuses the control. */
export function Field({ label, error, hint, required, children, className }: {
  label?: ReactNode; error?: string | null; hint?: ReactNode; required?: boolean; children: ReactNode; className?: string;
}) {
  return (
    <label className={cx('pm-field', className)}>
      {label && <span className="pm-field__label">{label}{required && <span className="pm-field__req" aria-hidden="true"> *</span>}</span>}
      {children}
      {error ? <span className="pm-field__error" role="alert">{error}</span> : hint ? <span className="pm-field__hint">{hint}</span> : null}
    </label>
  );
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  invalid?: boolean;
  size?: 'sm' | 'md';
  leading?: ReactNode;
  trailing?: ReactNode;
  wrapClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, size = 'md', leading, trailing, className, wrapClassName, ...rest }, ref,
) {
  return (
    <span className={cx('pm-input', size === 'sm' && 'pm-input--sm', invalid && 'is-invalid', rest.disabled && 'is-disabled', wrapClassName)}>
      {leading && <span className="pm-input__adorn">{leading}</span>}
      <input ref={ref} className={cx('pm-input__el', className)} aria-invalid={invalid || undefined} {...rest} />
      {trailing && <span className="pm-input__adorn pm-input__adorn--end">{trailing}</span>}
    </span>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { invalid?: boolean; autosize?: boolean; maxRows?: number }

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, autosize = true, maxRows = 12, className, onChange, value, rows = 3, ...rest }, ref,
) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const fit = useCallback(() => {
    const el = inner.current;
    if (!el || !autosize) return;
    el.style.height = 'auto';
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
    el.style.height = `${Math.min(el.scrollHeight, lh * maxRows + 16)}px`;
  }, [autosize, maxRows]);
  useLayoutEffect(fit, [fit, value]);
  return (
    <textarea
      ref={(el) => { inner.current = el; if (typeof ref === 'function') ref(el); else if (ref) ref.current = el; }}
      className={cx('pm-textarea', invalid && 'is-invalid', className)}
      aria-invalid={invalid || undefined}
      rows={rows}
      value={value}
      onChange={(e) => { onChange?.(e); fit(); }}
      {...rest}
    />
  );
});

export function Checkbox({ checked, onChange, label, disabled, indeterminate, className }: {
  checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean; indeterminate?: boolean; className?: string;
}) {
  return (
    <label className={cx('pm-check', disabled && 'is-disabled', className)}>
      <input
        type="checkbox"
        className="pm-check__input"
        checked={checked}
        disabled={disabled}
        ref={(el) => { if (el) el.indeterminate = !!indeterminate && !checked; }}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="pm-check__box" aria-hidden="true">
        {checked ? <Icon name="check" size={12} strokeWidth={2.2} /> : indeterminate ? <span className="pm-check__dash" /> : null}
      </span>
      {label && <span className="pm-check__label">{label}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cx('pm-toggle', checked && 'is-on')}
      onClick={() => onChange(!checked)}
    >
      <span className="pm-toggle__knob" />
    </button>
  );
}
