import { useMemo, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import type { ChecklistItem, TaskDetail } from '../../shared/api.ts';
import { call } from '../api/client.ts';
import { cx } from '../lib/util.ts';
import { Checkbox, Icon, ProgressBar } from '../ui/index.ts';
import { useTask } from './context.ts';
import { Section } from './Section.tsx';

const sorted = (items: ChecklistItem[]) => [...items].sort((a, b) => a.position - b.position);

export function Checklist() {
  const { task, readOnly, act } = useTask();
  const items = useMemo(() => sorted(task.checklist), [task.checklist]);
  const done = items.filter((i) => i.done).length;
  const [label, setLabel] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const editCancelled = useRef(false);
  const [announce, setAnnounce] = useState('');

  const patchLocal = (id: string, p: Partial<ChecklistItem>) => (d: TaskDetail): TaskDetail => ({ ...d, checklist: d.checklist.map((i) => (i.id === id ? { ...i, ...p } : i)) });

  const toggle = (i: ChecklistItem, v: boolean) => void act(() => call('checklist.update', { id: i.id, done: v }), patchLocal(i.id, { done: v }));
  const remove = (i: ChecklistItem) => void act(() => call('checklist.remove', { id: i.id }), (d) => ({ ...d, checklist: d.checklist.filter((x) => x.id !== i.id) }));

  const add = async () => {
    const t = label.trim();
    if (!t) return;
    if (t.length > 500) { setError('Checklist items can be at most 500 characters.'); return; }
    setError(null);
    setLabel('');
    const r = await act(() => call('checklist.add', { taskId: task.id, label: t }), undefined, { silent: true });
    if (!r.ok) { setLabel(t); setError(r.error.message); }
    addInput.current?.focus();
  };

  const startEdit = (i: ChecklistItem) => { if (readOnly) return; editCancelled.current = false; setEditing(i.id); setEditText(i.label); };
  const commitEdit = (i: ChecklistItem) => {
    if (editCancelled.current) { editCancelled.current = false; setEditing(null); return; }
    const t = editText.trim();
    setEditing(null);
    if (!t || t === i.label) return;
    void act(() => call('checklist.update', { id: i.id, label: t }), patchLocal(i.id, { label: t }));
  };
  const onEditKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); editCancelled.current = true; (e.target as HTMLInputElement).blur(); }
  };

  /** Move `id` so that it ends up at index `to` of the list. */
  const move = (id: string, to: number) => {
    const from = items.findIndex((i) => i.id === id);
    if (from < 0 || to < 0 || to >= items.length || from === to) return;
    const rest = items.filter((i) => i.id !== id);
    const prev = rest[to - 1];
    const next = rest[to];
    const position = prev && next ? (prev.position + next.position) / 2 : prev ? prev.position + 1000 : next ? (next.position > 1 ? next.position / 2 : next.position - 1000) : 1000;
    setAnnounce(`Moved to position ${to + 1} of ${items.length}`);
    void act(() => call('checklist.update', { id, position }), patchLocal(id, { position }));
  };

  const onDrop = (e: DragEvent, targetId: string) => {
    e.preventDefault();
    if (dragId && dragId !== targetId) move(dragId, items.findIndex((i) => i.id === targetId));
    setDragId(null);
    setOverId(null);
  };

  return (
    <Section title="Checklist" meta={items.length ? `${done}/${items.length}` : undefined}>
      {items.length > 0 && <ProgressBar value={(done / items.length) * 100} label={`Checklist: ${done} of ${items.length} done`} height={4} color="var(--pm-st-done)" />}
      <ul className="pm-cl" aria-label="Checklist">
        {items.map((i, idx) => (
          <li
            key={i.id}
            className={cx('pm-cl__item', dragId === i.id && 'is-dragging', overId === i.id && dragId !== i.id && 'is-over')}
            draggable={!readOnly && editing !== i.id}
            onDragStart={(e) => { setDragId(i.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', i.id); }}
            onDragOver={(e) => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (overId !== i.id) setOverId(i.id); } }}
            onDrop={(e) => onDrop(e, i.id)}
            onDragEnd={() => { setDragId(null); setOverId(null); }}
          >
            <Checkbox checked={i.done} disabled={readOnly} onChange={(v) => toggle(i, v)} label={<span className="pm-sr-only">{i.label}</span>} />
            {editing === i.id ? (
              <input
                className="pm-cl__edit"
                autoFocus
                value={editText}
                aria-label="Edit checklist item"
                maxLength={500}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={onEditKey}
                onBlur={() => commitEdit(i)}
              />
            ) : (
              <button type="button" className={cx('pm-cl__label', i.done && 'is-done')} onClick={() => startEdit(i)} disabled={readOnly} title={readOnly ? undefined : 'Click to edit'}>
                {i.label}
              </button>
            )}
            {!readOnly && editing !== i.id && (
              <span className="pm-cl__tools">
                <button type="button" className="pm-mini" aria-label={`Move “${i.label}” up`} title={`Move “${i.label}” up`} disabled={idx === 0} onClick={() => move(i.id, idx - 1)}><Icon name="chevronUp" size={14} /></button>
                <button type="button" className="pm-mini" aria-label={`Move “${i.label}” down`} title={`Move “${i.label}” down`} disabled={idx === items.length - 1} onClick={() => move(i.id, idx + 1)}><Icon name="chevronDown" size={14} /></button>
                <button type="button" className="pm-mini pm-mini--danger" aria-label={`Delete “${i.label}”`} title={`Delete “${i.label}”`} onClick={() => remove(i)}><Icon name="x" size={14} /></button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <span className="pm-sr-only" role="status" aria-live="polite">{announce}</span>
      {!readOnly && (
        <div className="pm-addrow">
          <Icon name="plus" size={14} />
          <input
            ref={addInput}
            className="pm-addrow__input"
            value={label}
            placeholder="Add a checklist item — press Enter"
            aria-label="Add a checklist item"
            onChange={(e) => { setLabel(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }}
            autoComplete="off"
          />
        </div>
      )}
      {error && <p className="pm-tf__error" role="alert">{error}</p>}
      {items.length === 0 && readOnly && <p className="pm-faint">No checklist items.</p>}
    </Section>
  );
}
