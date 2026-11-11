import { taskMenuProps } from './taskMenu.tsx';
import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { TaskDetail, TaskPatch, TaskRow } from '../../shared/api.ts';
import { call } from '../api/client.ts';
import { invalidate, invalidateWork, setQueryData } from '../api/store.ts';
import { useProject } from '../lib/data.ts';
import { MAX_ASSIGNEES, patchAssignees, useAssignable } from '../lib/people.ts';
import { cx, isOverdue } from '../lib/util.ts';
import { openTask } from '../router.ts';
import { AssigneeStack, DatePicker, Icon, PeoplePicker, ProgressBar, toast } from '../ui/index.ts';
import { toApiError, useTask } from './context.ts';
import { Section } from './Section.tsx';

export function Subtasks() {
  const { task, taskKey, readOnly } = useTask();
  const project = useProject(task.projectId);
  const assignable = useAssignable(project.data, task.subtasks.flatMap((s) => s.assignees));
  const subs = task.subtasks;
  const done = subs.filter((s) => s.status === 'done').length;
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const patchSub = async (sub: TaskRow, patch: TaskPatch, local: Partial<TaskRow>) => {
    const undo = setQueryData<TaskDetail>(taskKey, (d) => ({ ...d, subtasks: d.subtasks.map((s) => (s.id === sub.id ? { ...s, ...local } : s)) }));
    try {
      await call('tasks.update', { id: sub.id, patch, version: sub.version });
      invalidateWork();
    } catch (e) {
      undo();
      toast.error(toApiError(e).message);
      invalidate(taskKey);
    }
  };

  const add = async () => {
    const t = title.trim();
    if (!t) return;
    if (t.length > 300) { setError('Subtask titles can be at most 300 characters.'); return; }
    setError(null);
    setTitle('');
    try {
      await call('tasks.create', { projectId: task.projectId, parentId: task.id, title: t });
      invalidateWork();
    } catch (e) {
      setTitle(t);
      setError(toApiError(e).message);
    }
    input.current?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); void add(); }
    else if (e.key === 'Escape' && title) { e.preventDefault(); setTitle(''); setError(null); }
  };

  return (
    <Section title="Subtasks" meta={subs.length ? `${done}/${subs.length}` : undefined}>
      {subs.length > 0 && <ProgressBar value={(done / subs.length) * 100} label={`Subtasks: ${done} of ${subs.length} complete`} height={4} color="var(--pm-st-done)" />}
      <ul className="pm-subs" aria-label="Subtasks">
        {subs.map((s) => {
          const isDone = s.status === 'done';
          return (
            <li key={s.id} className="pm-sub" {...taskMenuProps(s)}>
              <button
                type="button"
                role="checkbox"
                aria-checked={isDone}
                aria-label={`${isDone ? 'Reopen' : 'Complete'} subtask: ${s.title}`}
                className={cx('pm-circle', isDone && 'is-done')}
                disabled={readOnly}
                onClick={() => void patchSub(s, { status: isDone ? 'todo' : 'done' }, { status: isDone ? 'todo' : 'done' })}
              >
                {isDone && <Icon name="check" size={12} strokeWidth={2.2} />}
              </button>
              <button type="button" className={cx('pm-sub__title pm-truncate', isDone && 'is-done')} onClick={() => openTask(s.id)} title={s.title}>
                {s.title}
              </button>
              <div className="pm-sub__meta">
                <PeoplePicker
                  people={assignable}
                  value={s.assignees.map((a) => a.id)}
                  disabled={readOnly}
                  max={MAX_ASSIGNEES}
                  ariaLabel={`Assignees of ${s.title}`}
                  title="Assign people"
                  onChange={(ids) => void patchSub(s, { assigneeIds: ids }, { assignees: patchAssignees(s.assignees, { assigneeIds: ids }, assignable) })}
                  trigger={(t) => (
                    <button type="button" {...t} disabled={readOnly} className="pm-sub__assignee" aria-label={`Assignees: ${s.assignees.map((a) => a.name).join(', ') || 'Unassigned'}`} title={s.assignees.map((a) => a.name).join(', ') || 'Unassigned'}>
                      <AssigneeStack people={s.assignees} max={2} size={22} />
                    </button>
                  )}
                />
                <DatePicker
                  variant="plain"
                  size="sm"
                  value={s.dueOn}
                  placeholder="Due"
                  ariaLabel={`Due date for ${s.title}`}
                  disabled={readOnly}
                  overdue={isOverdue(s.dueOn, isDone)}
                  onChange={(v) => void patchSub(s, { dueOn: v }, { dueOn: v })}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {!readOnly && (
        <div className="pm-addrow">
          <Icon name="plus" size={14} />
          <input
            ref={input}
            className="pm-addrow__input"
            value={title}
            placeholder="Add a subtask — press Enter"
            aria-label="Add a subtask"
            aria-invalid={!!error || undefined}
            onChange={(e) => { setTitle(e.target.value); setError(null); }}
            onKeyDown={onKey}
            autoComplete="off"
          />
        </div>
      )}
      {error && <p className="pm-tf__error" role="alert">{error}</p>}
      {subs.length === 0 && readOnly && <p className="pm-faint">No subtasks.</p>}
    </Section>
  );
}
