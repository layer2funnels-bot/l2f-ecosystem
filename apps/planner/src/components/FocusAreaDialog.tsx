// One dialog for creating and editing a focus area. The Planner page, the Board and plan Settings all open this same dialog.
import { useEffect, useState } from 'react';
import type { FocusArea, FocusColor, FocusTemplate } from '../api/types.ts';
import { usePlanner } from '../state/PlannerContext.tsx';
import { Button, Checkbox, SelectField, TextArea, TextField } from '../ui/primitives.tsx';
import { Dialog } from '../ui/overlay.tsx';

export const FOCUS_COLORS: { value: FocusColor; label: string }[] = [
  { value: 'blue', label: 'Blue' }, { value: 'coral', label: 'Coral' }, { value: 'teal', label: 'Teal' }, { value: 'amber', label: 'Amber' },
  { value: 'violet', label: 'Violet' }, { value: 'green', label: 'Green' }, { value: 'slate', label: 'Slate' },
];

export function ColorPicker({ value, onChange, disabled }: { value: FocusColor; onChange: (c: FocusColor) => void; disabled?: boolean }) {
  return (
    <fieldset className="ps-colors" disabled={disabled}>
      <legend className="field__label">Colour</legend>
      <div className="ps-colors__list">
        {FOCUS_COLORS.map((c) => (
          <label key={c.value} className={`ps-color${c.value === value ? ' is-on' : ''}`}>
            <input type="radio" name="focus-colour" className="sr-only" checked={c.value === value} onChange={() => onChange(c.value)} />
            <span className="ps-color__swatch" style={{ background: `var(--fa-${c.value})` }} aria-hidden="true" />
            <span>{c.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export type FocusFormMode = { kind: 'create' } | { kind: 'edit'; area: FocusArea };

export function FocusAreaDialog({ mode, onClose }: { mode: FocusFormMode | null; onClose: () => void }) {
  const { plan, planId, client, run, workspace, can } = usePlanner();
  const [library, setLibrary] = useState<FocusTemplate[]>([]); const [saveForReuse, setSaveForReuse] = useState(false); const [templateId, setTemplateId] = useState<string | null>(null);
  const [name, setName] = useState(''); const [desc, setDesc] = useState(''); const [color, setColor] = useState<FocusColor>('blue');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const editing = mode?.kind === 'edit' ? mode.area : null;

  useEffect(() => {
    if (!mode || !plan) return;
    setErrors({}); setSaveForReuse(false); setTemplateId(null);
    if (!editing && workspace) client.model(workspace.id).then((m) => setLibrary(m?.focus_templates ?? [])).catch(() => setLibrary([]));
    const used = plan.focus_areas.filter((a) => !a.archived_at).map((a) => a.color);
    setName(editing?.name ?? ''); setDesc(editing?.description ?? '');
    setColor(editing?.color ?? FOCUS_COLORS.find((c) => !used.includes(c.value))?.value ?? 'blue');
    setFrom(editing?.start_date ?? ''); setTo(editing?.end_date ?? '');
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!mode || !plan || !planId) return null;

  const submit = async () => {
    const e: Record<string, string> = {};
    const n = name.trim();
    if (!n) e.name = 'Give the focus area a name.';
    else if (plan.focus_areas.some((a) => a.id !== editing?.id && !a.archived_at && a.name.trim().toLowerCase() === n.toLowerCase())) e.name = 'This plan already has a focus area with that name.';
    if (from && to && to < from) e.to = 'The end date is before the start date.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const saved = await run(() => client.saveFocusArea(planId, editing?.id ?? null, { name: n, description: desc.trim() || null, color, start_date: from || null, end_date: to || null, ...(editing ? {} : { template_id: templateId }) }), { success: editing ? 'Focus area saved.' : `Focus area “${n}” added.` });
    if (saved && saveForReuse && !editing && workspace && !library.some((t) => t.name.trim().toLowerCase() === n.toLowerCase())) {
      await client.saveFocusTemplate(workspace.id, null, { name: n, description: desc.trim() || null, color }).catch(() => undefined);
    }
    setBusy(false);
    if (saved) onClose();
  };

  return (
    <Dialog open title={editing ? 'Edit focus area' : 'Add a focus area'} onClose={onClose}
      description={editing ? undefined : 'A focus area is a theme for this plan, such as Growth or Customers. Objectives are grouped under it.'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} onClick={submit}>{editing ? 'Save focus area' : 'Add focus area'}</Button></>}>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
        {!editing && library.length > 0 && <div className="span-2"><SelectField label="Start from a saved focus area" hint="Optional. Fills the form from your reusable list; you can still change anything." value="" onChange={(e) => { const t = library.find((x) => x.id === e.target.value); if (t) { setName(t.name); setDesc(t.description ?? ''); setColor(t.color); setTemplateId(t.id); } }}>
          <option value="">Choose one…</option>
          {library.filter((t) => !plan.focus_areas.some((a) => !a.archived_at && a.name.toLowerCase() === t.name.toLowerCase())).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </SelectField></div>}
        <div className="span-2"><TextField label="Name" required value={name} maxLength={80} error={errors.name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grow revenue" /></div>
        <div className="span-2"><TextArea label="Description" value={desc} rows={2} maxLength={300} onChange={(e) => setDesc(e.target.value)} /></div>
        <TextField label="Starts" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextField label="Ends" type="date" value={to} error={errors.to} onChange={(e) => setTo(e.target.value)} />
        <div className="span-2"><ColorPicker value={color} onChange={setColor} /></div>
        {!editing && can['plan.manage'] && <div className="span-2"><Checkbox label="Save for reuse in other plans and strategies" checked={saveForReuse} onChange={setSaveForReuse} /></div>}
      </form>
    </Dialog>
  );
}