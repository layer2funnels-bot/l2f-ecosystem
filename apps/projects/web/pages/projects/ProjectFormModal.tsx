import { useMemo, useState } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
import type { ProjectDetail, ProjectKind, ProjectPatch } from '../../../shared/api.ts';
import { call } from '../../api/client.ts';
import { invalidate, useMutation } from '../../api/store.ts';
import { useClients, usePeople, useProjects } from '../../lib/data.ts';
import { KIND_META, KINDS } from '../../lib/projectKind.ts';
import { cx, PROJECT_COLORS } from '../../lib/util.ts';
import { links, navigate } from '../../router.ts';
import { Button } from '../../ui/Button.tsx';
import { ConfirmDialog, Modal } from '../../ui/Dialog.tsx';
import { DatePicker } from '../../ui/DatePicker.tsx';
import { Field, Input, Textarea } from '../../ui/Form.tsx';
import { Icon } from '../../ui/icons.tsx';
import { Select } from '../../ui/Menu.tsx';
import { PersonPicker } from '../../ui/PersonPicker.tsx';
import { toast } from '../../ui/Toast.tsx';

interface FormState {
  kind: ProjectKind;
  name: string;
  description: string;
  clientId: string;
  color: string;
  startOn: string | null;
  dueOn: string | null;
  visibility: 'members' | 'organization';
  templateId: string;
  ownerId: string | null;
}

const VIS = [
  { value: 'members' as const, label: 'Project members' },
  { value: 'organization' as const, label: 'Everyone in organization' },
];

export function ColorSwatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="pm-swatches" role="radiogroup" aria-label="Project color">
      {PROJECT_COLORS.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={c === value} aria-label={c} className={cx('pm-swatch', c === value && 'is-selected')} style={{ background: c }} onClick={() => onChange(c)}>
          {c === value && <Icon name="check" size={12} strokeWidth={2.4} />}
        </button>
      ))}
    </div>
  );
}

/** Segmented control: Client · Internal · Personal, with a one-line helper under it. */
export function KindPicker({ value, onChange }: { value: ProjectKind; onChange: (k: ProjectKind) => void }) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = KINDS.indexOf(value);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); onChange(KINDS[(i + 1) % KINDS.length]); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); onChange(KINDS[(i + KINDS.length - 1) % KINDS.length]); }
  };
  return (
    <div className="pm-field">
      <span className="pm-field__label" id="pm-kind-label">Project type</span>
      <div className="pm-seg" role="radiogroup" aria-labelledby="pm-kind-label" onKeyDown={onKey}>
        {KINDS.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={k === value} tabIndex={k === value ? 0 : -1} className={cx('pm-seg__btn', k === value && 'is-selected')} onClick={() => onChange(k)}>
            <Icon name={KIND_META[k].icon} size={14} />
            {KIND_META[k].label}
          </button>
        ))}
      </div>
      <span className="pm-field__hint" aria-live="polite">{KIND_META[value].helper}</span>
    </div>
  );
}

/** Create (project omitted) or edit (project given) a project. Confirms before discarding unsaved changes. */
export function ProjectFormModal({ open, onClose, project, templateId, kind, clientId: presetClientId, tabs }: { open: boolean; onClose: () => void; project?: ProjectDetail; templateId?: string; kind?: ProjectKind; clientId?: string; /** Optional strip rendered above the form (the Quick create tabs). */ tabs?: ReactNode }) {
  const editing = !!project;
  const clients = useClients(open);
  const people = usePeople(open && editing);
  const templates = useProjects('templates', open && !editing);

  const initial = useMemo<FormState>(() => ({
    kind: project?.kind ?? kind ?? 'client',
    name: project?.name ?? '',
    description: project?.description ?? '',
    clientId: project?.clientId ?? presetClientId ?? '',
    color: project?.color ?? PROJECT_COLORS[0],
    startOn: project?.startOn ?? null,
    dueOn: project?.dueOn ?? null,
    visibility: project?.visibility ?? 'members',
    templateId: templateId ?? '',
    ownerId: project?.owner?.id ?? null,
  }), [project, templateId, kind, presetClientId]);

  const [f, setF] = useState<FormState>(initial);
  const [touched, setTouched] = useState(false);
  const [serverErr, setServerErr] = useState<{ field?: string; message: string } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => { setF((s) => ({ ...s, [k]: v })); setServerErr(null); };

  const personal = f.kind === 'personal';
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const errors = {
    name: !f.name.trim() ? 'Give the project a name.' : f.name.trim().length > 120 ? 'Keep the name under 120 characters.' : null,
    dueOn: f.startOn && f.dueOn && f.dueOn < f.startOn ? 'Due date must be on or after the start date.' : null,
    clientId: !editing && f.kind === 'client' && !f.clientId ? 'Choose the client this project is for.' : null,
  };
  const fieldError = (k: 'name' | 'dueOn' | 'clientId') => (touched ? errors[k] : null) ?? (serverErr?.field === k ? serverErr.message : null);

  const create = useMutation(
    () => call('projects.create', {
      name: f.name.trim(), description: f.description.trim() || undefined, color: f.color,
      startOn: f.startOn, dueOn: f.dueOn, fromTemplateId: f.templateId || null,
      ...(personal ? { personal: true } : { clientId: f.kind === 'client' ? f.clientId || null : null, visibility: f.visibility }),
    }),
    { errorToast: false, onError: (e) => setServerErr({ field: e.field, message: e.message }), invalidate: ['projects', 'portfolio', 'workload'] },
  );
  const update = useMutation(
    (patch: ProjectPatch) => call('projects.update', { id: project?.id ?? '', patch }),
    { errorToast: false, onError: (e) => setServerErr({ field: e.field, message: e.message }), invalidate: ['project', 'projects', 'portfolio'] },
  );
  const busy = create.loading || update.loading;

  const requestClose = () => { if (busy) return; if (dirty) setConfirmDiscard(true); else onClose(); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (errors.name || errors.dueOn || errors.clientId) return;
    if (editing && project) {
      const patch: ProjectPatch = {};
      if (f.name.trim() !== project.name) patch.name = f.name.trim();
      if (f.description !== project.description) patch.description = f.description;
      if (f.color !== project.color) patch.color = f.color;
      if (f.startOn !== project.startOn) patch.startOn = f.startOn;
      if (f.dueOn !== project.dueOn) patch.dueOn = f.dueOn;
      // Personal projects have no client, visibility or owner to change (the server rejects them).
      if (project.kind !== 'personal') {
        if ((f.clientId || null) !== project.clientId) patch.clientId = f.clientId || null;
        if (f.visibility !== project.visibility) patch.visibility = f.visibility;
        if (f.ownerId !== (project.owner?.id ?? null)) patch.ownerId = f.ownerId;
      }
      const res = await update.mutate(patch);
      if (res) { toast.success('Project updated'); onClose(); }
    } else {
      const res = await create.mutate(undefined);
      if (res) {
        toast.success(personal ? `Created “${res.name}”. Only you can see it.` : `Created “${res.name}”`);
        invalidate('projects');
        onClose();
        navigate(links.project(res.id));
      }
    }
  };

  const noClients = !!clients.data && clients.data.length === 0;
  const clientChoices = (clients.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const clientOptions = [{ value: '', label: 'No client (internal)' }, ...clientChoices];
  const templateOptions = [{ value: '', label: 'Blank project' }, ...(templates.data ?? []).map((t) => ({ value: t.id, label: t.name }))];

  return (
    <>
      <Modal
        open={open}
        onClose={requestClose}
        title={editing ? 'Edit project details' : 'New project'}
        description={editing ? undefined : 'Projects hold tasks, docs and people around one outcome.'}
        onSubmit={(e) => void submit(e)}
        dismissible={!dirty}
        footer={
          <>
            <Button onClick={requestClose} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy}>{editing ? 'Save changes' : 'Create project'}</Button>
          </>
        }
      >
        <div className="pm-form">
          {!editing && tabs}
          {!editing && <KindPicker value={f.kind} onChange={(k) => set('kind', k)} />}
          <Field label="Name" required error={fieldError('name')}>
            <Input data-autofocus value={f.name} onChange={(e) => set('name', e.target.value)} placeholder={personal ? 'e.g. My Q4 goals' : 'e.g. Website relaunch'} invalid={!!fieldError('name')} maxLength={140} />
          </Field>
          <Field label="Description">
            <Textarea value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="What is this project about? (optional)" rows={2} />
          </Field>

          {personal ? (
            editing ? null : (
              <p className="pm-private-note" role="note"><Icon name="lock" size={14} /><span><strong>Private to you.</strong> No client, no members, no sharing.</span></p>
            )
          ) : editing ? (
            <div className="pm-form__row">
              <Field label="Client">
                <Select value={f.clientId} options={clientOptions} onChange={(v) => set('clientId', v)} ariaLabel="Client" searchable={clientOptions.length > 6} />
              </Field>
              <Field label="Owner">
                <PersonPicker people={people.data ?? []} value={f.ownerId} onChange={(id) => set('ownerId', id)} noneLabel="No owner" ariaLabel="Owner" />
              </Field>
            </div>
          ) : (
            <div className="pm-form__row">
              {f.kind === 'client' && (
                <Field label="Client" required error={fieldError('clientId')} hint={noClients ? 'No clients in this organization yet. Choose Internal instead.' : undefined}>
                  <Select value={f.clientId || null} options={clientChoices} onChange={(v) => set('clientId', v)} ariaLabel="Client" placeholder="Choose a client" invalid={!!fieldError('clientId')} searchable={clientChoices.length > 6} />
                </Field>
              )}
              <Field label="Visibility">
                <Select value={f.visibility} options={VIS} onChange={(v) => set('visibility', v)} ariaLabel="Visibility" />
              </Field>
            </div>
          )}

          <div className="pm-field">
            <span className="pm-field__label">Color</span>
            <ColorSwatches value={f.color} onChange={(c) => set('color', c)} />
          </div>
          <div className="pm-form__row">
            <Field label="Start date"><DatePicker value={f.startOn} onChange={(v) => set('startOn', v)} ariaLabel="Start date" placeholder="Not set" /></Field>
            <Field label="Due date" error={fieldError('dueOn')}>
              <DatePicker value={f.dueOn} onChange={(v) => set('dueOn', v)} ariaLabel="Due date" min={f.startOn} placeholder="Not set" invalid={!!fieldError('dueOn')} />
            </Field>
          </div>
          {editing && !personal && (
            <Field label="Visibility">
              <Select value={f.visibility} options={VIS} onChange={(v) => set('visibility', v)} ariaLabel="Visibility" />
            </Field>
          )}
          {!editing && (
            <Field label="Start from template" hint={templates.data && templates.data.length === 0 ? 'No templates yet. Use “Save as template” on any project.' : undefined}>
              <Select value={f.templateId} options={templateOptions} onChange={(v) => set('templateId', v)} ariaLabel="Template" searchable={templateOptions.length > 6} />
            </Field>
          )}
          {serverErr && !serverErr.field && <p className="pm-form__error" role="alert">{serverErr.message}</p>}
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmDiscard}
        title="Discard changes?"
        message="You have unsaved changes. If you close now, they will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        danger
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => { setConfirmDiscard(false); onClose(); }}
      />
    </>
  );
}
