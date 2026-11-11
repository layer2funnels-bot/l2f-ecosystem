// The "Fields" manager: list, reorder, rename, edit options / currency / decimals, archive and restore, create.
// Managers change things; everyone else sees the same list read-only. Every change is saved at once and the project refetches.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import type { CustomField, FieldOptionInput, FieldType } from '../../shared/api.ts';
import { FIELD_TYPES } from '../../shared/api.ts';
import { call } from '../api/client.ts';
import { invalidateWork, useQuery } from '../api/store.ts';
import { useProject } from '../lib/data.ts';
import { cx } from '../lib/util.ts';
import { Button, IconButton } from '../ui/Button.tsx';
import { ConfirmDialog, Modal } from '../ui/Dialog.tsx';
import { Field, Input } from '../ui/Form.tsx';
import { Icon } from '../ui/icons.tsx';
import { Select } from '../ui/Menu.tsx';
import type { SelectOption } from '../ui/Menu.tsx';
import { Popover } from '../ui/Overlay.tsx';
import { toast } from '../ui/Toast.tsx';
import { CURRENCY_CODES, currencyName, currencySymbol, FieldTypeIcon, OPTION_COLORS, POPULAR_CURRENCIES, TYPE_META } from './fieldKit.tsx';

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');
const isSelectType = (t: FieldType) => t === 'select' || t === 'multiselect';
const CURRENCY_OPTIONS: SelectOption<string>[] = [...new Set([...POPULAR_CURRENCIES, ...CURRENCY_CODES])]
  .map((c) => ({ value: c, label: `${c} · ${currencyName(c)}`, hint: currencySymbol(c) }));
const DECIMAL_OPTIONS: SelectOption<string>[] = ['0', '1', '2', '3', '4'].map((d) => ({ value: d, label: d === '0' ? '0 (whole numbers)' : `${d} decimal${d === '1' ? '' : 's'}` }));

export function summary(f: CustomField): string {
  if (f.type === 'currency') return `${f.currency}`;
  if (f.type === 'number') return `${f.decimals} decimal${f.decimals === 1 ? '' : 's'}`;
  if (isSelectType(f.type)) return `${f.options.length} option${f.options.length === 1 ? '' : 's'}`;
  return '';
}

export function FieldsManagerModal({ projectId, open, onClose }: { projectId: string; open: boolean; onClose: () => void }) {
  const project = useProject(open ? projectId : null);
  const canManage = project.data?.myRole === 'manager' && !project.data.deletedAt;
  const listQ = useQuery(`project:${projectId}:fields`, () => call('fields.list', { projectId, includeArchived: true }), [], { enabled: open && canManage });
  const tasksQ = useQuery(`tasks:${projectId}`, () => call('tasks.list', { projectId, includeDone: true }), [true], { enabled: open });
  const all = useMemo<CustomField[]>(() => (canManage ? listQ.data : project.data?.fields) ?? [], [canManage, listQ.data, project.data?.fields]);
  const serverActive = useMemo(() => all.filter((f) => !f.archivedAt).sort((a, b) => a.position - b.position), [all]);
  const archived = useMemo(() => all.filter((f) => f.archivedAt), [all]);

  // Local order while a reorder is being saved.
  const [order, setOrder] = useState<string[] | null>(null);
  useEffect(() => { setOrder(null); }, [serverActive]);
  const active = useMemo(() => {
    if (!order) return serverActive;
    const by = new Map(serverActive.map((f) => [f.id, f]));
    return order.map((id) => by.get(id)).filter((f): f is CustomField => !!f);
  }, [serverActive, order]);

  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [purge, setPurge] = useState<CustomField | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  useEffect(() => { if (!open) { setOpenId(null); setCreating(false); setShowArchived(false); } }, [open]);

  const run = async (fn: () => Promise<unknown>, ok?: string): Promise<boolean> => {
    try { await fn(); invalidateWork(); if (ok) toast.success(ok); return true; }
    catch (e) { invalidateWork(); toast.error(errText(e)); return false; }
  };

  const reorder = async (ids: string[]) => {
    setOrder(ids);
    const done = await run(() => call('fields.reorder', { projectId, ids }));
    if (!done) setOrder(null);
  };
  const move = (id: string, dir: -1 | 1) => {
    const ids = active.map((f) => f.id);
    const i = ids.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void reorder(ids);
  };
  const drop = (target: string) => {
    if (!dragId || dragId === target) return;
    const ids = active.map((f) => f.id).filter((x) => x !== dragId);
    ids.splice(ids.indexOf(target), 0, dragId);
    void reorder(ids);
  };

  const archive = (f: CustomField) => {
    if (openId === f.id) setOpenId(null);
    void run(() => call('fields.archive', { id: f.id }), `Archived “${f.name}”. Its values are kept.`);
  };
  const restore = (f: CustomField) => run(() => call('fields.restore', { id: f.id }), `Restored “${f.name}”`);

  const loading = open && (project.loading || (canManage && listQ.loading)) && all.length === 0;
  const body = (
    <div className="fm">
      {!canManage && project.data && (
        <p className="fm__note"><Icon name="lock" size={13} /> Only project managers can change custom fields. You can see them here and fill them in on tasks.</p>
      )}
      {loading && <p className="pm-faint">Loading fields…</p>}
      {!loading && active.length === 0 && !creating && (
        <div className="fm__empty">
          <p><strong>No custom fields yet.</strong></p>
          <p className="pm-faint">Add your own columns to every task in this project, such as a budget, a channel or an approval.</p>
        </div>
      )}
      <ul className="fm__list" aria-label="Custom fields">
        {active.map((f, i) => (
          <li
            key={f.id}
            className={cx('fm__item', openId === f.id && 'is-open', dragId === f.id && 'is-dragging', overId === f.id && dragId && dragId !== f.id && 'is-over')}
            onDragOver={(e: DragEvent) => { if (dragId) { e.preventDefault(); setOverId(f.id); } }}
            onDrop={(e) => { e.preventDefault(); drop(f.id); setDragId(null); setOverId(null); }}
          >
            <div className="fm__row">
              {canManage && (
                <span
                  className="fm__grip" draggable title="Drag to reorder" aria-hidden="true"
                  onDragStart={(e) => { setDragId(f.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', f.name); }}
                  onDragEnd={() => { setDragId(null); setOverId(null); }}
                ><Icon name="menu" size={14} /></span>
              )}
              <span className="fm__type" title={TYPE_META[f.type].label}><FieldTypeIcon type={f.type} size={15} /></span>
              <span className="fm__name pm-truncate" title={f.name}>{f.name}</span>
              <span className="fm__meta">{TYPE_META[f.type].label}{summary(f) ? ` · ${summary(f)}` : ''}</span>
              {canManage && (
                <span className="fm__actions">
                  <IconButton icon="chevronUp" label={`Move ${f.name} up`} size="sm" disabled={i === 0} onClick={() => move(f.id, -1)} />
                  <IconButton icon="chevronDown" label={`Move ${f.name} down`} size="sm" disabled={i === active.length - 1} onClick={() => move(f.id, 1)} />
                  <Button size="sm" icon="edit" aria-expanded={openId === f.id} onClick={() => setOpenId(openId === f.id ? null : f.id)}>{openId === f.id ? 'Done' : 'Edit'}</Button>
                  <IconButton icon="archive" label={`Archive ${f.name}`} tooltip="Archive (values are kept)" size="sm" onClick={() => archive(f)} />
                </span>
              )}
            </div>
            {canManage && openId === f.id && <EditPanel field={f} usage={tasksQ.data ?? []} run={run} />}
            {!canManage && isSelectType(f.type) && f.options.length > 0 && (
              <div className="fm__optsline">{f.options.map((o) => <span key={o.id} className="fv-pill" style={{ ['--opt' as string]: o.color }}><span className="fv-pill__dot" />{o.label}</span>)}</div>
            )}
          </li>
        ))}
      </ul>

      {canManage && (creating
        ? <NewField projectId={projectId} existing={all.map((f) => f.name)} run={run} onDone={(id) => { setCreating(false); if (id) setOpenId(null); }} />
        : <Button icon="plus" onClick={() => setCreating(true)} className="fm__add">New field</Button>)}

      {canManage && archived.length > 0 && (
        <section className="fm__archived">
          <button type="button" className="fm__archtoggle" aria-expanded={showArchived} onClick={() => setShowArchived((s) => !s)}>
            <Icon name={showArchived ? 'chevronDown' : 'chevronRight'} size={13} /> Archived fields ({archived.length})
          </button>
          {showArchived && (
            <ul className="fm__list">
              {archived.map((f) => (
                <li key={f.id} className="fm__item is-archived">
                  <div className="fm__row">
                    <span className="fm__type"><FieldTypeIcon type={f.type} size={15} /></span>
                    <span className="fm__name pm-truncate" title={f.name}>{f.name}</span>
                    <span className="fm__meta">{TYPE_META[f.type].label} · hidden, values kept</span>
                    <span className="fm__actions">
                      <Button size="sm" icon="restore" onClick={() => void restore(f)}>Restore</Button>
                      <Button size="sm" variant="ghost" icon="trash" className="fm__danger" onClick={() => setPurge(f)}>Delete permanently</Button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <ConfirmDialog
        open={!!purge}
        danger
        title={`Delete “${purge?.name ?? ''}” permanently?`}
        message={<>This removes the field and every value it holds on every task of this project. It cannot be undone. To only hide it, keep it archived.</>}
        confirmLabel="Delete permanently"
        onClose={() => setPurge(null)}
        onConfirm={async () => { if (purge) { await run(() => call('fields.purge', { id: purge.id }), 'Field deleted'); setPurge(null); } }}
      />
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title="Custom fields" size="lg" className="fm-dialog" description={project.data ? `Extra columns for the tasks in ${project.data.name}.` : undefined} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      {body}
    </Modal>
  );
}

// ───────────── edit one field ─────────────
function EditPanel({ field, usage, run }: { field: CustomField; usage: { fields: Record<string, unknown> }[]; run: (fn: () => Promise<unknown>, ok?: string) => Promise<boolean> }) {
  const [name, setName] = useState(field.name);
  const [nameErr, setNameErr] = useState<string | null>(null);
  useEffect(() => { setName(field.name); }, [field.name]);
  const saveName = async () => {
    const n = name.trim();
    if (!n) { setNameErr('A field needs a name.'); return; }
    if (n === field.name) { setNameErr(null); setName(field.name); return; }
    try { await call('fields.update', { id: field.id, name: n }); invalidateWork(); setNameErr(null); }
    catch (e) { setNameErr(errText(e)); }
  };
  return (
    <div className="fm__edit">
      <Field label="Name" error={nameErr}>
        <Input value={name} maxLength={60} invalid={!!nameErr} onChange={(e) => { setName(e.target.value); setNameErr(null); }}
          onBlur={() => void saveName()} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
      </Field>
      <p className="fm__typeline"><FieldTypeIcon type={field.type} /> {TYPE_META[field.type].label}: {TYPE_META[field.type].desc} The type cannot be changed.</p>
      {field.type === 'currency' && (
        <Field label="Currency">
          <Select<string> value={field.currency} options={CURRENCY_OPTIONS} searchable ariaLabel="Currency" onChange={(c) => void run(() => call('fields.update', { id: field.id, currency: c }))} />
        </Field>
      )}
      {field.type === 'number' && (
        <Field label="Decimals" hint="Values keep at most this many decimals.">
          <Select<string> value={String(field.decimals ?? 0)} options={DECIMAL_OPTIONS} ariaLabel="Decimals" onChange={(d) => void run(() => call('fields.update', { id: field.id, decimals: Number(d) }))} />
        </Field>
      )}
      {isSelectType(field.type) && <PersistedOptions field={field} usage={usage} run={run} />}
    </div>
  );
}

function PersistedOptions({ field, usage, run }: { field: CustomField; usage: { fields: Record<string, unknown> }[]; run: (fn: () => Promise<unknown>, ok?: string) => Promise<boolean> }) {
  const [options, setOptions] = useState<FieldOptionInput[]>(field.options);
  const [del, setDel] = useState<FieldOptionInput | null>(null);
  useEffect(() => { setOptions(field.options); }, [field.options]);
  const commit = async (next: FieldOptionInput[]) => {
    setOptions(next);
    const ok = await run(() => call('fields.update', { id: field.id, options: next }));
    if (!ok) setOptions(field.options);
  };
  const used = (id?: string) => (id ? usage.filter((t) => { const v = t.fields[field.id]; return Array.isArray(v) ? v.includes(id) : v === id; }).length : 0);
  return (
    <>
      <OptionsEditor options={options} onChange={(next, persist) => { if (persist) void commit(next); else setOptions(next); }} onDelete={(o) => setDel(o)} max={50} />
      <ConfirmDialog
        open={!!del}
        danger
        title={`Delete the option “${del?.label ?? ''}”?`}
        message={<>{used(del?.id) > 0 ? <>It is set on <strong>{used(del?.id)}</strong> task{used(del?.id) === 1 ? '' : 's'}; it will be removed from {used(del?.id) === 1 ? 'it' : 'them'}.</> : 'No task uses it yet.'} This cannot be undone.</>}
        confirmLabel="Delete option"
        onClose={() => setDel(null)}
        onConfirm={async () => { if (del) { await commit(options.filter((o) => o.id !== del.id)); setDel(null); } }}
      />
    </>
  );
}

// ───────────── options list editor (shared by create and edit) ─────────────
function OptionsEditor({ options, onChange, onDelete, max }: {
  options: FieldOptionInput[];
  /** persist = true when the change should be saved now (blur, recolor, add, remove); false while typing. */
  onChange: (next: FieldOptionInput[], persist: boolean) => void;
  /** Persisted options ask for confirmation first (the parent shows the dialog); omitted = delete right away. */
  onDelete?: (o: FieldOptionInput) => void;
  max: number;
}) {
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const add = () => {
    const label = draft.trim();
    if (!label) return;
    if (label.length > 40) { setErr('Option names can be at most 40 characters.'); return; }
    if (options.some((o) => o.label.toLowerCase() === label.toLowerCase())) { setErr(`“${label}” is already an option.`); return; }
    setErr(null); setDraft('');
    onChange([...options, { label, color: OPTION_COLORS[options.length % OPTION_COLORS.length] }], true);
  };
  const rename = (i: number, label: string) => {
    const l = label.trim();
    if (!l) { setErr('An option needs a name.'); onChange([...options], false); return; }
    if (options.some((o, j) => j !== i && o.label.toLowerCase() === l.toLowerCase())) { setErr(`“${l}” is already an option.`); return; }
    setErr(null);
    if (l !== options[i].label) onChange(options.map((o, j) => (j === i ? { ...o, label: l } : o)), true);
  };
  return (
    <div className="fm__opts">
      <div className="fm__optshead">Options <span className="pm-faint">({options.length} of {max})</span></div>
      <ul className="fm__optlist">
        {options.map((o, i) => (
          <li key={o.id ?? `new-${i}`} className="fm__opt">
            <ColorButton color={o.color ?? OPTION_COLORS[i % OPTION_COLORS.length]} label={o.label} onPick={(c) => onChange(options.map((x, j) => (j === i ? { ...x, color: c } : x)), true)} />
            <input
              className="fm__optinput" defaultValue={o.label} key={`${o.id}-${o.label}`} maxLength={40} aria-label={`Option ${i + 1} name`}
              onBlur={(e) => { rename(i, e.currentTarget.value); }}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } else if (e.key === 'Escape') { e.currentTarget.value = o.label; e.currentTarget.blur(); } e.stopPropagation(); }}
            />
            <IconButton icon="trash" label={`Delete option ${o.label}`} size="sm" onClick={() => (o.id && onDelete ? onDelete(o) : onChange(options.filter((_, j) => j !== i), true))} />
          </li>
        ))}
      </ul>
      {options.length < max && (
        <div className="fm__optadd">
          <input
            className="fm__optinput" value={draft} maxLength={40} placeholder="Add an option and press Enter" aria-label="New option name"
            onChange={(e) => { setDraft(e.target.value); setErr(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } e.stopPropagation(); }}
          />
          <Button size="sm" icon="plus" onClick={add} disabled={!draft.trim()}>Add</Button>
        </div>
      )}
      {err && <p className="pm-tf__error" role="alert">{err}</p>}
    </div>
  );
}

function ColorButton({ color, label, onPick }: { color: string; label: string; onPick: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={btn} type="button" className="fm__swatch" style={{ background: color }} aria-label={`Color of ${label}`} title="Change color" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)} />
      <Popover anchor={btn.current} open={open} onClose={() => setOpen(false)} className="fm__palette" label="Pick a color">
        <div className="fm__colors">
          {OPTION_COLORS.map((c) => (
            <button key={c} type="button" className={cx('fm__color', c.toLowerCase() === color.toLowerCase() && 'is-on')} style={{ background: c }} aria-label={c} onClick={() => { onPick(c); setOpen(false); }} />
          ))}
        </div>
        <label className="fm__custom">Custom <input type="color" value={color} onChange={(e) => onPick(e.target.value)} aria-label="Custom color" /></label>
      </Popover>
    </>
  );
}

// ───────────── create ─────────────
function NewField({ projectId, existing, onDone }: {
  projectId: string; existing: string[]; run: (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>; onDone: (created?: string) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<FieldType>('text');
  const [currency, setCurrency] = useState('USD');
  const [decimals, setDecimals] = useState('0');
  const [options, setOptions] = useState<FieldOptionInput[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);

  const create = async () => {
    const n = name.trim();
    if (!n) { setErr('Give the field a name.'); nameRef.current?.focus(); return; }
    if (existing.some((x) => x.toLowerCase() === n.toLowerCase())) { setErr(`A field named “${n}” already exists.`); return; }
    setBusy(true);
    try {
      const f = await call('fields.create', {
        projectId, name: n, type,
        ...(isSelectType(type) ? { options } : {}), ...(type === 'currency' ? { currency } : {}), ...(type === 'number' ? { decimals: Number(decimals) } : {}),
      });
      invalidateWork();
      toast.success(`Added the field “${f.name}”`);
      onDone(f.id);
    } catch (e) { setErr(errText(e)); setBusy(false); }
  };
  return (
    <form className="fm__new" onSubmit={(e) => { e.preventDefault(); void create(); }} noValidate>
      <h3 className="fm__newtitle">New field</h3>
      <Field label="Name" error={err}>
        <Input ref={nameRef} value={name} maxLength={60} invalid={!!err} placeholder="e.g. Budget, Channel, Approved" onChange={(e) => { setName(e.target.value); setErr(null); }} />
      </Field>
      <div className="fm__typegrid" role="radiogroup" aria-label="Field type">
        {FIELD_TYPES.map((t) => (
          <button key={t} type="button" role="radio" aria-checked={type === t} className={cx('fm__typecard', type === t && 'is-on')} onClick={() => setType(t)}>
            <span className="fm__typecard__icon"><FieldTypeIcon type={t} size={16} /></span>
            <span className="fm__typecard__label">{TYPE_META[t].label}</span>
            <span className="fm__typecard__desc">{TYPE_META[t].desc}</span>
          </button>
        ))}
      </div>
      {type === 'currency' && <Field label="Currency"><Select<string> value={currency} options={CURRENCY_OPTIONS} searchable ariaLabel="Currency" onChange={setCurrency} /></Field>}
      {type === 'number' && <Field label="Decimals"><Select<string> value={decimals} options={DECIMAL_OPTIONS} ariaLabel="Decimals" onChange={setDecimals} /></Field>}
      {isSelectType(type) && <OptionsEditor options={options} max={50} onChange={(next) => setOptions(next)} />}
      <div className="fm__newfoot">
        <Button onClick={() => onDone()} disabled={busy}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>Create field</Button>
      </div>
    </form>
  );
}
