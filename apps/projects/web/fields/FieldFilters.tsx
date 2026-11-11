// Toolbar pieces for custom fields: the field filter, the List "Columns" menu, the Board "Show fields on cards" menu and the Fields button.
// Filters run in the browser on the data tasks.list already returned (TaskRow.fields has every value of the project).
import { useRef, useState } from 'react';
import type { CustomField, FieldFilter, FieldFilterOp } from '../../shared/api.ts';
import { cx } from '../lib/util.ts';
import { DatePicker } from '../ui/DatePicker.tsx';
import { Checkbox, Input } from '../ui/Form.tsx';
import { Icon } from '../ui/icons.tsx';
import { Select } from '../ui/Menu.tsx';
import type { SelectOption } from '../ui/Menu.tsx';
import { Popover } from '../ui/Overlay.tsx';
import { defaultFilter, FieldTypeIcon, filterIsActive, OPS_BY_TYPE, opLabel, opNeedsValue } from './fieldKit.tsx';
import { FieldsManagerModal } from './FieldsManager.tsx';

// ───────────── filter ─────────────
export function FieldFilterButton({ fields, value, onChange }: { fields: CustomField[]; value: FieldFilter[]; onChange: (v: FieldFilter[]) => void }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const active = value.filter(filterIsActive).length;
  const byId = new Map(fields.map((f) => [f.id, f]));
  const set = (i: number, patch: Partial<FieldFilter>) => onChange(value.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const fieldOptions: SelectOption<string>[] = fields.map((f) => ({ value: f.id, label: f.name, leading: <FieldTypeIcon type={f.type} size={13} /> }));

  return (
    <>
      <button ref={btn} type="button" className={cx('lb-fbtn', active > 0 && 'is-active', open && 'is-open')} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>Fields</span>{active > 0 && <span className="lb-fbtn__n">{active}</span>}<Icon name="chevronDown" size={12} />
      </button>
      <Popover anchor={btn.current} open={open} onClose={() => setOpen(false)} className="ff-pop" label="Filter by custom fields">
        <div className="ff">
          <div className="ff__title">Filter by custom fields</div>
          {value.length === 0 && <p className="ff__empty">Show only tasks whose custom fields match. All filters must match.</p>}
          {value.map((flt, i) => {
            const f = byId.get(flt.fieldId);
            if (!f) return null;
            const ops = OPS_BY_TYPE[f.type];
            return (
              <div key={i} className="ff__row">
                <Select<string> size="sm" value={f.id} options={fieldOptions} ariaLabel="Field" className="ff__field"
                  onChange={(id) => { const nf = byId.get(id); if (nf) onChange(value.map((x, j) => (j === i ? defaultFilter(nf) : x))); }} />
                <Select<FieldFilterOp> size="sm" value={flt.op} options={ops.map((o) => ({ value: o, label: opLabel(f.type, o) }))} ariaLabel="Condition" className="ff__op"
                  onChange={(op) => set(i, { op, ...(opNeedsValue(op) ? {} : { value: undefined }) })} />
                {opNeedsValue(flt.op) && <ValueInput field={f} filter={flt} onChange={(v) => set(i, { value: v })} />}
                <button type="button" className="lb-iconbtn" aria-label={`Remove the ${f.name} filter`} title="Remove" onClick={() => onChange(value.filter((_, j) => j !== i))}><Icon name="x" size={13} /></button>
              </div>
            );
          })}
          <div className="ff__foot">
            <button type="button" className="lb-linkbtn" onClick={() => onChange([...value, defaultFilter(fields[0])])}>+ Add filter</button>
            {value.length > 0 && <button type="button" className="lb-linkbtn" onClick={() => onChange([])}>Clear all</button>}
          </div>
        </div>
      </Popover>
    </>
  );
}

function ValueInput({ field, filter, onChange }: { field: CustomField; filter: FieldFilter; onChange: (v: FieldFilter['value']) => void }) {
  const v = filter.value;
  switch (field.type) {
    case 'select': case 'multiselect':
      return (
        <Select<string> size="sm" value={typeof v === 'string' ? v : null} placeholder="Choose…" ariaLabel="Option" className="ff__val"
          options={field.options.map((o) => ({ value: o.id, label: o.label, leading: <span className="pm-dot" style={{ background: o.color }} /> }))} onChange={onChange} />
      );
    case 'checkbox':
      return <Select<string> size="sm" value={v === false ? 'no' : 'yes'} ariaLabel="Checked" className="ff__val" options={[{ value: 'yes', label: 'Checked' }, { value: 'no', label: 'Not checked' }]} onChange={(x) => onChange(x === 'yes')} />;
    case 'date':
      return <div className="ff__val"><DatePicker size="sm" value={typeof v === 'string' ? v : null} placeholder="Pick a date" ariaLabel="Date" clearable={false} onChange={(d) => onChange(d ?? undefined)} /></div>;
    case 'number': case 'currency':
      return (
        <Input size="sm" wrapClassName="ff__val" type="number" step="any" inputMode="decimal" placeholder="Value" aria-label="Value"
          value={typeof v === 'number' ? String(v) : ''} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />
      );
    default:
      return <Input size="sm" wrapClassName="ff__val" placeholder="Value" aria-label="Value" maxLength={200} value={typeof v === 'string' ? v : ''} onChange={(e) => onChange(e.target.value)} />;
  }
}

// ───────────── List columns ─────────────
export const OPTIONAL_COLUMNS = [{ id: 'tags', label: 'Tags' }, { id: 'who', label: 'Assignees' }, { id: 'due', label: 'Due date' }] as const;
export const DEFAULT_COLUMNS: string[] = ['tags', 'who', 'due'];

export function ColumnsMenu({ columns, fields, onChange }: { columns: string[] | null; fields: CustomField[]; onChange: (next: string[] | null) => void }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const cur = columns ?? DEFAULT_COLUMNS;
  const toggle = (id: string, on: boolean) => onChange(on ? [...cur, id] : cur.filter((x) => x !== id));
  const custom = columns !== null && columns.some((c) => !DEFAULT_COLUMNS.includes(c));
  const changed = columns !== null && (custom || DEFAULT_COLUMNS.some((c) => !cur.includes(c)));
  return (
    <>
      <button ref={btn} type="button" className={cx('lb-fbtn lb-fbtn--view', changed && 'is-active', open && 'is-open')} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="list" size={13} /><span>Columns</span><Icon name="chevronDown" size={12} />
      </button>
      <Popover anchor={btn.current} open={open} onClose={() => setOpen(false)} align="end" className="lb-fpop" label="Show or hide columns">
        <div className="lb-fpop__list" role="group" aria-label="Columns">
          <div className="ff__title">Columns</div>
          <p className="fc__fixed">Name, Priority and Status are always shown.</p>
          {OPTIONAL_COLUMNS.map((c) => (
            <div key={c.id} className="lb-fopt"><Checkbox checked={cur.includes(c.id)} onChange={(on) => toggle(c.id, on)} label={<span className="lb-fopt__label"><span className="pm-truncate">{c.label}</span></span>} /></div>
          ))}
          <div className="ff__title ff__title--sub">Custom fields</div>
          {fields.length === 0 && <div className="lb-fpop__empty">No custom fields yet. Use the Fields button to add one.</div>}
          {fields.map((f) => (
            <div key={f.id} className="lb-fopt">
              <Checkbox checked={cur.includes(`f:${f.id}`)} onChange={(on) => toggle(`f:${f.id}`, on)} label={<span className="lb-fopt__label"><FieldTypeIcon type={f.type} size={13} /><span className="pm-truncate">{f.name}</span></span>} />
            </div>
          ))}
        </div>
        <div className="lb-fpop__foot ff__foot">
          <button type="button" className="lb-linkbtn" onClick={() => onChange(fields.length ? [...DEFAULT_COLUMNS, ...fields.map((f) => `f:${f.id}`)] : DEFAULT_COLUMNS)}>Show all</button>
          <button type="button" className="lb-linkbtn" onClick={() => onChange(null)}>Reset</button>
        </div>
      </Popover>
    </>
  );
}

// ───────────── Board cards ─────────────
export const MAX_CARD_FIELDS = 2;
export function CardFieldsMenu({ value, fields, onChange }: { value: string[]; fields: CustomField[]; onChange: (next: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const choices = fields.filter((f) => f.type === 'select' || f.type === 'multiselect');
  return (
    <>
      <button ref={btn} type="button" className={cx('lb-fbtn lb-fbtn--view', value.length > 0 && 'is-active', open && 'is-open')} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="filter" size={13} /><span>Show fields on cards</span>{value.length > 0 && <span className="lb-fbtn__n">{value.length}</span>}<Icon name="chevronDown" size={12} />
      </button>
      <Popover anchor={btn.current} open={open} onClose={() => setOpen(false)} align="end" className="lb-fpop" label="Fields shown on cards">
        <div className="lb-fpop__list" role="group" aria-label="Fields shown on cards">
          <p className="fc__fixed">Cards can show up to {MAX_CARD_FIELDS} select or multi-select fields when they are set.</p>
          {choices.length === 0 && <div className="lb-fpop__empty">Add a select or multi-select field first (Fields button in the List view or the task panel).</div>}
          {choices.map((f) => {
            const on = value.includes(f.id);
            return (
              <div key={f.id} className="lb-fopt">
                <Checkbox
                  checked={on} disabled={!on && value.length >= MAX_CARD_FIELDS}
                  onChange={(c) => onChange(c ? [...value, f.id] : value.filter((x) => x !== f.id))}
                  label={<span className="lb-fopt__label"><FieldTypeIcon type={f.type} size={13} /><span className="pm-truncate">{f.name}</span></span>}
                />
              </div>
            );
          })}
        </div>
        {value.length > 0 && <div className="lb-fpop__foot"><button type="button" className="lb-linkbtn" onClick={() => onChange([])}>Hide all</button></div>}
      </Popover>
    </>
  );
}

// ───────────── Fields button ─────────────
export function FieldsButton({ projectId, count }: { projectId: string; count: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="lb-fbtn lb-fbtn--view" aria-haspopup="dialog" onClick={() => setOpen(true)} title="Add, edit or reorder the custom fields of this project">
        <FieldTypeIcon type="text" size={13} /><span>Fields</span>{count > 0 && <span className="lb-fbtn__n">{count}</span>}
      </button>
      {open && <FieldsManagerModal projectId={projectId} open onClose={() => setOpen(false)} />}
    </>
  );
}
