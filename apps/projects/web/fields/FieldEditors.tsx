// One editor per field type, used in the task drawer (variant "row") and in List cells (variant "cell").
// Editors never talk to the server: they call onChange(value | null) and the caller saves optimistically.
import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { CustomField, FieldOption, FieldValue } from '../../shared/api.ts';
import { cx, fmtDate } from '../lib/util.ts';
import { Chip } from '../ui/Badges.tsx';
import { DatePicker } from '../ui/DatePicker.tsx';
import { Checkbox, Input } from '../ui/Form.tsx';
import { Icon } from '../ui/icons.tsx';
import { Menu } from '../ui/Menu.tsx';
import type { MenuItem } from '../ui/Menu.tsx';
import { Popover } from '../ui/Overlay.tsx';
import { toast } from '../ui/Toast.tsx';
import { currencySymbol, decimalsOf, formatNumber, hostLabel, optionOf, parseNumberText, parseUrlText, valueText } from './fieldKit.tsx';

export interface FieldEditorProps {
  field: CustomField;
  value: FieldValue | undefined;
  onChange: (v: FieldValue | null) => void;
  readOnly?: boolean;
  variant: 'row' | 'cell';
}

export function FieldEditor(p: FieldEditorProps) {
  switch (p.field.type) {
    case 'select': return <SelectEditor {...p} />;
    case 'multiselect': return <MultiEditor {...p} />;
    case 'date': return <DateEditor {...p} />;
    case 'checkbox': return <CheckEditor {...p} />;
    default: return <TextualEditor {...p} />;
  }
}

export function OptionPill({ option }: { option: FieldOption }) {
  return (
    <span className="fv-pill" style={{ ['--opt' as string]: option.color }} title={option.label}>
      <span className="fv-pill__dot" aria-hidden="true" /><span className="pm-truncate">{option.label}</span>
    </span>
  );
}

/** Read-only rendering of a value (cards, tooltips, viewers). */
export function ValueView({ field, value, variant }: { field: CustomField; value: FieldValue | undefined; variant: 'row' | 'cell' }) {
  const empty = <span className="fv-empty">{variant === 'row' ? 'Not set' : ''}</span>;
  if (value === undefined || value === null) return empty;
  switch (field.type) {
    case 'select': { const o = typeof value === 'string' ? optionOf(field, value) : undefined; return o ? <OptionPill option={o} /> : empty; }
    case 'multiselect': {
      const os = Array.isArray(value) ? value.map((id) => optionOf(field, id)).filter((o): o is FieldOption => !!o) : [];
      return os.length ? <PillRow options={os} max={variant === 'cell' ? 2 : 99} /> : empty;
    }
    case 'date': return typeof value === 'string' ? <span>{fmtDate(value)}</span> : empty;
    case 'checkbox': return value === true ? <span className="fv-check-on"><Icon name="check" size={13} /> Yes</span> : empty;
    case 'url': return typeof value === 'string' ? <a className="fv-link pm-truncate" href={value} target="_blank" rel="noopener noreferrer" title={value}>{hostLabel(value)}</a> : empty;
    default: return <span className={cx('pm-truncate', (field.type === 'number' || field.type === 'currency') && 'fv-num')} title={valueText(field, value)}>{valueText(field, value)}</span>;
  }
}

function PillRow({ options, max }: { options: FieldOption[]; max: number }) {
  const shown = options.slice(0, max);
  const more = options.length - shown.length;
  return (
    <span className="fv-pills">
      {shown.map((o) => <OptionPill key={o.id} option={o} />)}
      {more > 0 && <span className="fv-more" title={options.slice(max).map((o) => o.label).join(', ')}>+{more}</span>}
    </span>
  );
}

// ───────────── text, link, number, currency ─────────────
function amountText(f: CustomField, v: number): string {
  if (f.type !== 'currency') return formatNumber(f, v);
  const d = decimalsOf(f);
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
}

function TextualEditor({ field, value, onChange, readOnly, variant }: FieldEditorProps) {
  const isNum = field.type === 'number' || field.type === 'currency';
  const current = value === undefined || value === null ? null : (value as string | number);
  const rawText = current === null ? '' : String(current);
  const idle = current === null ? '' : isNum ? amountText(field, current as number) : String(current);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(rawText);
  const [err, setErr] = useState<string | null>(null);
  const cancel = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const errId = useId();

  useEffect(() => { if (!editing && !err) setText(rawText); }, [rawText, editing, err]);
  useEffect(() => { if (editing) { input.current?.focus(); input.current?.select(); } }, [editing]);

  const parse = (): { ok: true; value: FieldValue | null } | { ok: false; error: string } => {
    if (field.type === 'text') {
      const s = text.trim();
      return s.length > 2000 ? { ok: false, error: 'Text can be at most 2,000 characters.' } : { ok: true, value: s || null };
    }
    return field.type === 'url' ? parseUrlText(text) : parseNumberText(text, field);
  };
  /** Saves what was typed. Returns the problem when it cannot be saved. */
  const commit = (): string | null => {
    const r = parse();
    if (!r.ok) return r.error;
    setErr(null);
    if (JSON.stringify(r.value) !== JSON.stringify(current)) onChange(r.value);
    return null;
  };
  const onBlur = () => {
    if (cancel.current) { cancel.current = false; setEditing(false); setErr(null); setText(rawText); return; }
    const problem = commit();
    if (problem) {
      if (variant === 'cell') { toast.error(`${field.name}: ${problem}`); setText(rawText); } else setErr(problem);
    }
    setEditing(false);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); input.current?.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel.current = true; input.current?.blur(); }
    e.stopPropagation();
  };

  if (readOnly) return <ValueView field={field} value={value} variant={variant} />;

  if (variant === 'cell') {
    if (!editing) {
      return (
        <span className="fv-celltext">
          {field.type === 'url' && current ? (
            <>
              <a className="fv-link pm-truncate" href={String(current)} target="_blank" rel="noopener noreferrer" title={String(current)}>{hostLabel(String(current))}</a>
              <button type="button" className="lb-iconbtn fv-edit" aria-label={`Edit ${field.name}`} title="Edit link" onClick={() => setEditing(true)}><Icon name="edit" size={12} /></button>
            </>
          ) : (
            <button type="button" className={cx('fv-textbtn pm-truncate', isNum && 'fv-num', !idle && 'is-empty')} title={idle ? `${field.name}: ${valueText(field, value)}` : `Set ${field.name}`} aria-label={`${field.name}: ${idle || 'empty'}. Edit`} onClick={() => setEditing(true)}>
              {idle || <span className="fv-textbtn__ph">{isNum ? '0' : 'Add'}</span>}
            </button>
          )}
        </span>
      );
    }
    return (
      <input
        ref={input} className={cx('fv-cellinput', isNum && 'fv-num')} value={text} aria-label={field.name} inputMode={isNum ? 'decimal' : undefined}
        maxLength={field.type === 'text' || field.type === 'url' ? 2000 : 40} spellCheck={false}
        onChange={(e) => setText(e.target.value)} onBlur={onBlur} onKeyDown={onKey}
      />
    );
  }

  // row variant
  const shown = editing || err ? text : idle;
  return (
    <div className="fv-row">
      <Input
        ref={input}
        value={shown}
        placeholder={field.type === 'url' ? 'https://…' : field.type === 'text' ? 'Add text' : isNum ? '0' : ''}
        aria-label={field.name}
        aria-describedby={err ? errId : undefined}
        inputMode={isNum ? 'decimal' : undefined}
        invalid={!!err}
        maxLength={field.type === 'text' || field.type === 'url' ? 2000 : 40}
        leading={field.type === 'currency' ? <span className="fv-sym" title={field.currency ?? ''}>{currencySymbol(field.currency ?? 'USD')}</span> : undefined}
        trailing={field.type === 'url' && current && !editing ? (
          <a className="lb-iconbtn fv-open" href={String(current)} target="_blank" rel="noopener noreferrer" aria-label={`Open ${field.name} in a new tab`} title="Open link"><Icon name="external" size={13} /></a>
        ) : undefined}
        onChange={(e) => { setText(e.target.value); if (err) setErr(null); }}
        onFocus={() => { setEditing(true); if (!err) setText(rawText); }}
        onBlur={onBlur}
        onKeyDown={onKey}
        autoComplete="off"
        spellCheck={field.type === 'text'}
      />
      {err && <p id={errId} className="pm-tf__error" role="alert">{err}</p>}
    </div>
  );
}

// ───────────── select ─────────────
function SelectEditor({ field, value, onChange, readOnly, variant }: FieldEditorProps) {
  const opt = typeof value === 'string' ? optionOf(field, value) : undefined;
  if (readOnly) return <ValueView field={field} value={value} variant={variant} />;
  const items: MenuItem[] = [
    ...field.options.map((o): MenuItem => ({ id: o.id, label: o.label, text: o.label, leading: <span className="pm-dot" style={{ background: o.color }} />, selected: o.id === value, onSelect: () => { if (o.id !== value) onChange(o.id); } })),
    ...(opt ? [{ id: '__clear', label: 'Clear', icon: 'x' as const, separatorBefore: field.options.length > 0, onSelect: () => onChange(null) }] : []),
  ];
  return (
    <Menu
      role="listbox" items={items} label={field.name} searchable={field.options.length > 8} emptyText="No options yet. A project manager can add some under Fields."
      trigger={(t, open) => (
        <button type="button" {...t} className={cx('fv-trigger', variant === 'cell' && 'is-cell', open && 'is-open')} aria-label={`${field.name}: ${opt ? opt.label : 'not set'}. Change`}>
          {opt ? <OptionPill option={opt} /> : <span className="fv-placeholder">{variant === 'row' ? 'Select…' : 'Set'}</span>}
          <Icon name="chevronsUpDown" size={12} className="fv-trigger__caret" />
        </button>
      )}
    />
  );
}

// ───────────── multi-select ─────────────
function MultiEditor({ field, value, onChange, readOnly, variant }: FieldEditorProps) {
  const ids = Array.isArray(value) ? value : [];
  const chosen = ids.map((id) => optionOf(field, id)).filter((o): o is FieldOption => !!o);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  if (readOnly) return <ValueView field={field} value={value} variant={variant} />;

  const set = (next: string[]) => onChange(next.length ? field.options.filter((o) => next.includes(o.id)).map((o) => o.id) : null);
  const panel = (
    <Popover anchor={btn.current} open={open} onClose={() => setOpen(false)} className="lb-fpop" label={`${field.name} options`}>
      <div className="lb-fpop__list" role="group" aria-label={field.name}>
        {field.options.length === 0 && <div className="lb-fpop__empty">No options yet. A project manager can add some under Fields.</div>}
        {field.options.map((o) => (
          <div key={o.id} className="lb-fopt">
            <Checkbox checked={ids.includes(o.id)} onChange={(on) => set(on ? [...ids, o.id] : ids.filter((x) => x !== o.id))} label={<span className="lb-fopt__label"><span className="pm-dot" style={{ background: o.color }} /><span className="pm-truncate">{o.label}</span></span>} />
          </div>
        ))}
      </div>
      {ids.length > 0 && <div className="lb-fpop__foot"><button type="button" className="lb-linkbtn" onClick={() => set([])}>Clear all</button></div>}
    </Popover>
  );

  if (variant === 'cell') {
    return (
      <>
        <button ref={btn} type="button" className={cx('fv-trigger is-cell', open && 'is-open')} aria-haspopup="listbox" aria-expanded={open} aria-label={`${field.name}: ${chosen.length ? chosen.map((o) => o.label).join(', ') : 'not set'}. Change`} onClick={() => setOpen((o) => !o)}>
          {chosen.length ? <PillRow options={chosen} max={2} /> : <span className="fv-placeholder">Set</span>}
        </button>
        {panel}
      </>
    );
  }
  return (
    <div className="fv-chips">
      {chosen.map((o) => (
        <Chip key={o.id} color={o.color} selected onRemove={() => set(ids.filter((x) => x !== o.id))}>{o.label}</Chip>
      ))}
      <button ref={btn} type="button" className="pp-addbtn" aria-haspopup="listbox" aria-expanded={open} aria-label={`Add ${field.name}`} onClick={() => setOpen((o) => !o)}>
        <Icon name="plus" size={13} />{chosen.length ? 'Add' : 'Choose'}
      </button>
      {panel}
    </div>
  );
}

// ───────────── date ─────────────
function DateEditor({ field, value, onChange, readOnly, variant }: FieldEditorProps) {
  const v = typeof value === 'string' ? value : null;
  if (readOnly) return <ValueView field={field} value={value} variant={variant} />;
  if (variant === 'cell') {
    return (
      <span className={cx('lb-due', !v && 'is-empty')}>
        <DatePicker variant="plain" size="sm" value={v} placeholder="Add date" ariaLabel={field.name} onChange={(d) => onChange(d)} />
      </span>
    );
  }
  return <DatePicker value={v} onChange={(d) => onChange(d)} ariaLabel={field.name} placeholder="No date" />;
}

// ───────────── checkbox ─────────────
function CheckEditor({ field, value, onChange, readOnly, variant }: FieldEditorProps) {
  const on = value === true;
  return (
    <Checkbox
      checked={on} disabled={readOnly} className={variant === 'cell' ? 'fv-checkcell' : undefined}
      onChange={(c) => onChange(c ? true : null)}
      label={variant === 'row' ? (on ? 'Yes' : 'No') : <span className="pm-sr-only">{field.name}</span>}
    />
  );
}
