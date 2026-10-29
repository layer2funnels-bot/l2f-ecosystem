import { useId, useState, type FormEvent } from 'react';
import type { Action, Priority } from '../../api/types.ts';
import { usePlanner } from '../../state/PlannerContext.tsx';
import { useDialogs } from '../Dialogs.tsx';
import { PRIORITY_META, PRIORITY_ORDER } from '../../lib/status.ts';
import { formatDate } from '../../lib/format.ts';
import { Button, Chip, EmptyState, Segmented, TextArea, TextField } from '../../ui/primitives.tsx';
import { ACTION_STATUS, LOCKED_REASON, useSave, type TabProps } from './shared.tsx';

type View = 'list' | 'board';

function ActionItem({ a, editable, onEdit }: { a: Action; editable: boolean; onEdit: () => void }) {
  const { client, members, today } = usePlanner();
  const dialogs = useDialogs();
  const { busy, save } = useSave();
  const uid = useId();
  const overdue = a.status !== 'done' && !!a.due_date && a.due_date < today;
  const patch = (data: Record<string, unknown>) => save(() => client.saveAction(a.goal_id, a.id, data));
  const archive = async () => {
    const ok = await dialogs.confirm({ title: 'Archive this action?', body: <p>“{a.title}” will be hidden from the list.</p>, confirmLabel: 'Archive action', danger: true });
    if (ok) await save(() => client.saveAction(a.goal_id, a.id, { archived: true }), 'Action archived.');
  };

  return (
    <li className={`gd-action${overdue ? ' is-overdue' : ''}${a.status === 'done' ? ' is-done' : ''}`}>
      <div className="gd-action__main">
        <input type="checkbox" className="gd-action__check" id={`${uid}-c`} checked={a.status === 'done'} disabled={!editable || busy}
          aria-label={`Mark “${a.title}” as done`} onChange={(e) => patch({ status: e.target.checked ? 'done' : 'todo' })} />
        <div className="gd-grow">
          <label htmlFor={`${uid}-c`} className="gd-action__title">{a.title}</label>
          {a.notes && <p className="muted gd-small gd-pre">{a.notes}</p>}
          <p className="gd-small">
            {overdue && <Chip tone="bad">Overdue</Chip>}{' '}
            {a.due_date && <span className="muted">Due {formatDate(a.due_date, { year: true })}</span>}
          </p>
        </div>
        {editable && <div className="gd-action__btns"><Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Edit “${a.title}”`}>Edit</Button><Button size="sm" variant="ghost" busy={busy} onClick={archive} aria-label={`Archive “${a.title}”`}>Archive</Button></div>}
      </div>
      <div className="gd-action__ctl">
        <label className="gd-mini"><span>Status</span>
          <select className="input" value={a.status} disabled={!editable || busy} onChange={(e) => patch({ status: e.target.value })}>
            {ACTION_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select></label>
        <label className="gd-mini"><span>Assignee</span>
          <select className="input" value={a.assignee_id ?? ''} disabled={!editable || busy} onChange={(e) => patch({ assignee_id: e.target.value || null })}>
            <option value="">Unassigned</option>
            {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
          </select></label>
        <label className="gd-mini"><span>Due</span>
          <input className="input" type="date" value={a.due_date ?? ''} disabled={!editable || busy} onChange={(e) => patch({ due_date: e.target.value || null })} /></label>
        <label className="gd-mini"><span>Priority</span>
          <select className="input" value={a.priority} disabled={!editable || busy} onChange={(e) => patch({ priority: e.target.value as Priority })}>
            {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
          </select></label>
      </div>
    </li>
  );
}

function EditForm({ a, onDone }: { a: Action; onDone: () => void }) {
  const { client } = usePlanner();
  const { busy, save } = useSave();
  const [title, setTitle] = useState(a.title);
  const [notes, setNotes] = useState(a.notes ?? '');
  const [err, setErr] = useState<string | undefined>();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setErr('Give the action a title.'); return; }
    setErr(undefined);
    if (await save(() => client.saveAction(a.goal_id, a.id, { title: title.trim(), notes: notes.trim() }), 'Action saved.')) onDone();
  };
  return (
    <li className="gd-card">
      <form className="gd-form" onSubmit={submit} noValidate aria-label={`Edit action ${a.title}`}>
        <TextField label="Title" required value={title} error={err} onChange={(e) => setTitle(e.target.value)} />
        <TextArea label="Notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="form-actions"><Button onClick={onDone}>Cancel</Button><Button type="submit" variant="primary" busy={busy}>Save action</Button></div>
      </form>
    </li>
  );
}

export function ActionsTab({ d, locked }: TabProps) {
  const { can, client } = usePlanner();
  const { busy, save } = useSave();
  const [view, setView] = useState<View>('list');
  const [title, setTitle] = useState('');
  const [err, setErr] = useState<string | undefined>();
  const [editing, setEditing] = useState<string | null>(null);
  const editable = can['action.manage'] && !locked;
  const actions = d.actions.filter((a) => !a.archived_at);
  const done = actions.filter((a) => a.status === 'done').length;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setErr('Type what needs to be done.'); return; }
    setErr(undefined);
    if (await save(() => client.saveAction(d.goal.id, null, { title: title.trim() }), 'Action added.')) setTitle('');
  };

  const renderItem = (a: Action) => editing === a.id
    ? <EditForm key={a.id} a={a} onDone={() => setEditing(null)} />
    : <ActionItem key={a.id} a={a} editable={editable} onEdit={() => setEditing(a.id)} />;

  return (
    <div className="gd-stack">
      {d.goal.progress_mode === 'actions' && (
        <p className="gd-note" role="note">Progress for this goal is the share of actions that are done ({done} of {actions.length}).</p>
      )}
      {editable ? (
        <form className="gd-quickadd" onSubmit={add} noValidate aria-label="Add an action">
          <div className="gd-grow"><TextField label="New action" value={title} error={err} placeholder="What needs to be done?" onChange={(e) => setTitle(e.target.value)} /></div>
          <Button type="submit" variant="primary" busy={busy}>Add action</Button>
        </form>
      ) : <p className="gd-note" role="note">{locked ? LOCKED_REASON : 'You do not have permission to change actions.'}</p>}

      <div className="gd-row gd-row--between">
        <h3 className="gd-h">Actions ({actions.length})</h3>
        <Segmented<View> label="Layout" value={view} onChange={setView} options={[{ value: 'list', label: 'List' }, { value: 'board', label: 'Board' }]} />
      </div>

      {actions.length === 0 ? <EmptyState title="No actions yet">Actions are the concrete steps that move this objective forward.</EmptyState> : view === 'list' ? (
        <ul className="gd-actions">{actions.map(renderItem)}</ul>
      ) : (
        <div className="gd-board">
          {ACTION_STATUS.map((col) => {
            const items = actions.filter((a) => a.status === col.value);
            return (
              <section key={col.value} className="gd-col" aria-label={`${col.label}, ${items.length}`}>
                <h4 className="gd-h4">{col.label} <span className="muted">({items.length})</span></h4>
                {items.length ? <ul className="gd-actions">{items.map(renderItem)}</ul> : <p className="muted gd-small">Nothing here.</p>}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
