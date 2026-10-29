// Small, accessible building blocks shared by every Planner screen. Styling lives in styles/base.css.
import { useId, useState, type ButtonHTMLAttributes, type ReactNode, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes } from 'react';
import type { Priority, Status } from '../api/types.ts';
import { PRIORITY_META, STATUS_META } from '../lib/status.ts';
import { initials } from '../lib/format.ts';

const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');
export { cx };

// ------------------------------------------------------------------ buttons
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'md' | 'sm'; busy?: boolean }
export function Button({ variant = 'secondary', size = 'md', busy, className, children, disabled, type = 'button', ...rest }: BtnProps) {
  return <button type={type} className={cx('btn', `btn--${variant}`, size === 'sm' && 'btn--sm', className)} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
    {busy && <span className="spinner" aria-hidden="true" />}{children}</button>;
}
export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" className={cx('icon-btn', className)} aria-label={label} title={label} {...rest}>{children}</button>;
}

// ------------------------------------------------------------------ badges and chips
export function StatusBadge({ status, compact }: { status: Status; compact?: boolean }) {
  const m = STATUS_META[status];
  return <span className={cx('badge', `badge--${m.tone}`)}><span aria-hidden="true" className="badge__glyph">{m.glyph}</span>{compact ? <span className="sr-only">{m.label}</span> : m.label}</span>;
}
export function PriorityBadge({ priority }: { priority: Priority }) {
  const m = PRIORITY_META[priority];
  return <span className={cx('chip', `chip--prio-${priority}`)}><span aria-hidden="true">{m.glyph}</span> {m.label}</span>;
}
export function Chip({ children, tone, title }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'warn' | 'bad'; title?: string }) {
  return <span className={cx('chip', tone && `chip--${tone}`)} title={title}>{children}</span>;
}
export function Avatar({ name, size = 28 }: { name: string | null | undefined; size?: number }) {
  return <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }} title={name ?? 'No owner'} aria-label={name ?? 'No owner'} role="img">{name ? initials(name) : '–'}</span>;
}

// ------------------------------------------------------------------ progress
export function ProgressBar({ value, status, label, thin, expected }: { value: number | string; status?: Status; label?: string; thin?: boolean; expected?: number | null }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className={cx('progress', thin && 'progress--thin', status && `progress--${STATUS_META[status].tone}`)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} aria-label={label ?? 'Progress'}
      data-tip={`${label ?? 'Progress'}: ${Math.round(v)}%${status ? ` · ${STATUS_META[status].label}` : ''}${expected != null ? ` · expected by today: ${expected}%` : ''}`}>
      <div className="progress__fill" style={{ inlineSize: `${v}%` }} />
      {expected != null && <div className="progress__expected" style={{ insetInlineStart: `${expected}%` }} title={`Expected today: ${expected}%`} />}
    </div>
  );
}

// ------------------------------------------------------------------ form fields (always labelled)
interface FieldShell { label: string; hint?: string; error?: string | null; required?: boolean }
function Shell({ id, label, hint, error, required, children }: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div className={cx('field', error && 'field--error')}>
      <label htmlFor={id} className="field__label">{label}{required && <span aria-hidden="true" className="field__req"> *</span>}</label>
      {children}
      {hint && !error && <p className="field__hint" id={`${id}-hint`}>{hint}</p>}
      {error && <p className="field__error" id={`${id}-err`} role="alert">{error}</p>}
    </div>
  );
}
const describedBy = (id: string, hint?: string, error?: string | null) => error ? `${id}-err` : hint ? `${id}-hint` : undefined;

export function TextField({ label, hint, error, required, ...rest }: FieldShell & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return <Shell id={id} label={label} hint={hint} error={error} required={required}><input id={id} className="input" required={required} aria-invalid={!!error || undefined} aria-describedby={describedBy(id, hint, error)} {...rest} /></Shell>;
}
export function TextArea({ label, hint, error, required, rows = 3, ...rest }: FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return <Shell id={id} label={label} hint={hint} error={error} required={required}><textarea id={id} className="input input--area" rows={rows} required={required} aria-invalid={!!error || undefined} aria-describedby={describedBy(id, hint, error)} {...rest} /></Shell>;
}
export function SelectField({ label, hint, error, required, children, ...rest }: FieldShell & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return <Shell id={id} label={label} hint={hint} error={error} required={required}><select id={id} className="input" required={required} aria-invalid={!!error || undefined} aria-describedby={describedBy(id, hint, error)} {...rest}>{children}</select></Shell>;
}
export function Checkbox({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return <label htmlFor={id} className="check"><input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>;
}

/** Toggle buttons for a small set of options; one pressed at a time. */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; title?: string }[]; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button key={o.value} type="button" className={cx('seg__btn', o.value === value && 'is-on')} aria-pressed={o.value === value} title={o.title} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

/** Multi-select list inside a disclosure, used by filters. */
export function MultiPick<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="multi">
      <button type="button" className={cx('btn btn--secondary btn--sm', value.length > 0 && 'is-active')} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        {label}{value.length > 0 && <span className="multi__count">{value.length}</span>}<span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="multi__panel" id={id} role="group" aria-label={label}>
          {options.map((o) => <Checkbox key={o.value} label={o.label} checked={value.includes(o.value)} onChange={(on) => onChange(on ? [...value, o.value] : value.filter((v) => v !== o.value))} />)}
          {value.length > 0 && <button type="button" className="link-btn" onClick={() => onChange([])}>Clear</button>}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ states
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="state state--empty"><h3 className="state__title">{title}</h3>{children && <p className="state__text">{children}</p>}{action && <div className="state__action">{action}</div>}</div>;
}
export function ErrorState({ title = 'Something went wrong', children, onRetry }: { title?: string; children?: ReactNode; onRetry?: () => void }) {
  return <div className="state state--error" role="alert"><h3 className="state__title">{title}</h3>{children && <p className="state__text">{children}</p>}{onRetry && <div className="state__action"><Button onClick={onRetry}>Try again</Button></div>}</div>;
}
export function Skeleton({ lines = 3, height = 16 }: { lines?: number; height?: number }) {
  return <div className="skeleton" aria-hidden="true">{Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton__line" style={{ blockSize: height, inlineSize: `${92 - ((i * 17) % 40)}%` }} />)}</div>;
}
export function PageLoading({ label = 'Loading' }: { label?: string }) {
  return <div className="page-loading" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" /> {label}…<Skeleton lines={5} height={44} /></div>;
}
export function Section({ title, actions, children, id }: { title: ReactNode; actions?: ReactNode; children: ReactNode; id?: string }) {
  return <section className="section" aria-labelledby={id}><header className="section__head"><h2 className="section__title" id={id}>{title}</h2>{actions && <div className="section__actions">{actions}</div>}</header>{children}</section>;
}
export function Card({ children, className }: { children: ReactNode; className?: string }) { return <div className={cx('card', className)}>{children}</div>; }
