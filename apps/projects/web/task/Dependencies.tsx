import { useMemo, useState } from 'react';
import type { TaskDetail, TaskRef } from '../../shared/api.ts';
import { call } from '../api/client.ts';
import { useTasks } from '../lib/data.ts';
import { openTask } from '../router.ts';
import { Button, Icon, Menu, StatusPill } from '../ui/index.ts';
import type { MenuItem } from '../ui/index.ts';
import { useTask } from './context.ts';
import { Section } from './Section.tsx';

type Kind = 'waitingOn' | 'blocking';

export function Dependencies() {
  return (
    <div className="pm-deps">
      <DepList kind="waitingOn" title="Waiting on" empty="Not waiting on any task." addLabel="Add dependency" />
      <DepList kind="blocking" title="Blocking" empty="Not blocking any task." addLabel="Add blocked task" />
    </div>
  );
}

function DepList({ kind, title, empty, addLabel }: { kind: Kind; title: string; empty: string; addLabel: string }) {
  const { task, readOnly, act } = useTask();
  const tasks = useTasks(task.projectId);
  const list = task[kind];
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo<MenuItem[]>(() => {
    const already = new Set(task[kind].map((r) => r.id));
    return (tasks.data ?? [])
      .filter((t) => t.id !== task.id && t.parentId !== task.id && !already.has(t.id))
      .sort((a, b) => a.number - b.number)
      .map((t): MenuItem => ({
        id: t.id,
        label: <span className="pm-dep__opt"><span className="pm-faint pm-num">#{t.number}</span> <span className="pm-truncate">{t.title}</span></span>,
        text: `#${t.number} ${t.title}`,
        hint: t.status === 'done' ? 'Done' : undefined,
        onSelect: () => void addDep(t.id, { id: t.id, number: t.number, title: t.title, status: t.status }),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks.data, task.id, task.waitingOn, task.blocking, kind]);
  // addDep is a hoisted function declaration that only closes over stable props/refs.

  const edge = (otherId: string) => (kind === 'waitingOn' ? { taskId: task.id, dependsOnId: otherId } : { taskId: otherId, dependsOnId: task.id });

  async function addDep(otherId: string, ref: TaskRef) {
    setError(null);
    const r = await act(() => call('deps.add', edge(otherId)), (d: TaskDetail) => ({ ...d, [kind]: [...d[kind], ref] }), { silent: true });
    if (!r.ok) setError(r.error.message);
  }
  const removeDep = async (ref: TaskRef) => {
    setError(null);
    const r = await act(() => call('deps.remove', edge(ref.id)), (d: TaskDetail) => ({ ...d, [kind]: d[kind].filter((x) => x.id !== ref.id) }), { silent: true });
    if (!r.ok) setError(r.error.message);
  };

  return (
    <Section
      title={title}
      meta={list.length || undefined}
      actions={!readOnly && (
        <Menu
          role="listbox"
          items={candidates}
          searchable
          searchPlaceholder="Search tasks in this project…"
          emptyText={tasks.loading ? 'Loading tasks…' : 'No tasks to add'}
          label={addLabel}
          className="pm-dep__menu"
          trigger={(t) => <Button size="sm" icon="plus" {...t}>Add</Button>}
        />
      )}
    >
      {list.length === 0 ? <p className="pm-faint">{empty}</p> : (
        <ul className="pm-deplist" aria-label={title}>
          {list.map((r) => (
            <li key={r.id} className="pm-dep">
              <StatusPill status={r.status} compact />
              <button type="button" className="pm-dep__title pm-truncate" onClick={() => openTask(r.id)} title={r.title}>
                <span className="pm-faint pm-num">#{r.number}</span> {r.title}
              </button>
              {!readOnly && (
                <button type="button" className="pm-mini pm-mini--danger" aria-label={`Remove ${r.title} from ${title.toLowerCase()}`} title={`Remove ${r.title} from ${title.toLowerCase()}`} onClick={() => void removeDep(r)}>
                  <Icon name="x" size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="pm-tf__error" role="alert">{error}</p>}
    </Section>
  );
}
