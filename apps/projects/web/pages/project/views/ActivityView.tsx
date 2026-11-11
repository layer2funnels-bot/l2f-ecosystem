// Optional "Activity" view: the project's history, newest first, grouped by day, with filters and cursor pagination.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { FeedItem, FeedType, ProjectDetail } from '../../../../shared/api.ts';
import { call } from '../../../api/client.ts';
import type { ApiError } from '../../../api/client.ts';
import { activityText } from '../../../task/format.ts';
import { relTime, toYmd } from '../../../lib/util.ts';
import { links } from '../../../router.ts';
import { Avatar } from '../../../ui/Badges.tsx';
import { Button } from '../../../ui/Button.tsx';
import { EmptyState, ErrorState, SkeletonRows } from '../../../ui/Feedback.tsx';
import { Select } from '../../../ui/Menu.tsx';
import { OPTIONAL_VIEWS } from '../resourceKit.tsx';

const TYPE_OPTIONS: { value: FeedType | ''; label: string }[] = [
  { value: '', label: 'All activity' }, { value: 'tasks', label: 'Tasks' }, { value: 'comments', label: 'Comments' }, { value: 'status', label: 'Status changes' },
  { value: 'assignments', label: 'Assignments' }, { value: 'files', label: 'Files and links' }, { value: 'project', label: 'Project' },
];
const viewLabel = (k: unknown) => OPTIONAL_VIEWS.find((v) => v.kind === k)?.label ?? String(k);
const q = (v: unknown) => `“${String(v ?? '')}”`;

/** Project-level sentences; null for task activity. */
function projectSentence(a: FeedItem): string | null {
  const d = a.data;
  switch (a.kind) {
    case 'project.created': return d.copiedFrom ? 'created this project from a copy' : 'created this project';
    case 'project.updated': return Array.isArray(d.fields) && d.fields.length ? `updated the project (${(d.fields as string[]).join(', ')})` : 'updated the project';
    case 'project.archived': return 'archived this project';
    case 'project.unarchived': return 'unarchived this project';
    case 'project.trashed': return 'moved this project to the trash';
    case 'project.restored': return 'restored this project from the trash';
    case 'project.member': return d.role ? `set a member’s role to ${String(d.role)}` : 'removed a member';
    case 'view.added': return `added the ${viewLabel(d.view)} view`;
    case 'view.removed': return `removed the ${viewLabel(d.view)} view`;
    case 'collection.created': return `created the collection ${q(d.name)}`;
    case 'collection.deleted': return `deleted the collection ${q(d.name)} (its items moved to Unsorted)`;
    case 'resource.file_added': return `uploaded ${q(d.title)} to Collection`;
    case 'resource.added': return `added the ${d.kind === 'embed' ? 'embed' : 'link'} ${q(d.title)} to Collection`;
    case 'resource.removed': return `removed ${q(d.title)} from Collection`;
    case 'resource.restored': return `restored ${q(d.title)} in Collection`;
    default: return a.kind.startsWith('task.') ? null : a.kind.replace(/[._]/g, ' ');
  }
}

function Sentence({ a, projectId }: { a: FeedItem; projectId: string }): ReactNode {
  const who = <strong>{a.actor?.name ?? 'Someone'}</strong>;
  const ps = projectSentence(a);
  if (ps) return <>{who} {ps}</>;
  const text = activityText({ id: a.id, actor: a.actor, kind: a.kind, data: a.data, createdAt: a.createdAt });
  const title = a.taskTitle ?? 'a task';
  const link = a.taskId ? <a className="pm-act__task" href={links.project(projectId, 'list', a.taskId)}>{q(title)}</a> : <span>{q(title)}</span>;
  if (text.includes('this task')) { const [x, y] = text.split('this task'); return <>{who} {x}task {link}{y}</>; }
  if (text.startsWith('made this a')) return <>{who} made {link} a{text.slice('made this a'.length)}</>;
  if (text.startsWith('assigned ')) return <>{who} {text} to {link}</>;
  if (text.startsWith('unassigned ')) return <>{who} {text} from {link}</>;
  return <>{who} {text} on {link}</>;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const day = (x: Date) => toYmd(x);
  const now = new Date();
  if (day(d) === day(now)) return 'Today';
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (day(d) === day(y)) return 'Yesterday';
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' }).format(d);
}

export function ActivityView({ project: p }: { project: ProjectDetail }) {
  const [type, setType] = useState<FeedType | ''>('');
  const [personId, setPersonId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [items, setItems] = useState<FeedItem[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'more' | 'error'>('loading');
  const [error, setError] = useState<ApiError | null>(null);
  const gen = useRef(0);

  const args = useCallback((before?: number) => ({
    projectId: p.id, limit: 30, ...(type ? { type } : {}), ...(personId ? { personId } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), ...(before ? { before } : {}),
  }), [p.id, type, personId, from, to]);

  const load = useCallback(async (reset: boolean, cursor?: number) => {
    const g = ++gen.current;
    setState(reset ? 'loading' : 'more');
    try {
      const r = await call('activity.feed', args(cursor));
      if (g !== gen.current) return;
      setItems((old) => (reset ? r.items : [...old, ...r.items]));
      setNext(r.next);
      setState('ready');
    } catch (e) { if (g === gen.current) { setError(e as ApiError); setState('error'); } }
  }, [args]);

  useEffect(() => { void load(true); }, [load]);

  // Load more when the end of the list scrolls into view.
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = end.current;
    if (!el || next === null || state !== 'ready') return;
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) void load(false, next); }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [next, state, load]);

  const groups: { label: string; rows: FeedItem[] }[] = [];
  for (const it of items) {
    const label = dayLabel(it.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(it); else groups.push({ label, rows: [it] });
  }
  const filtered = !!(type || personId || from || to);

  return (
    <div className="pm-act">
      <div className="pm-act__filters" role="group" aria-label="Filter activity">
        <Select<FeedType | ''> value={type} options={TYPE_OPTIONS} onChange={setType} ariaLabel="Type of activity" size="sm" matchWidth={false} />
        <Select<string> value={personId} options={[{ value: '', label: 'Anyone' }, ...p.members.map((m) => ({ value: m.id, label: m.name }))]} onChange={setPersonId} ariaLabel="Person" size="sm" matchWidth={false} />
        <label className="pm-act__date"><span className="pm-faint">From</span><input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From date" /></label>
        <label className="pm-act__date"><span className="pm-faint">To</span><input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To date" /></label>
        {filtered && <Button size="sm" variant="ghost" onClick={() => { setType(''); setPersonId(''); setFrom(''); setTo(''); }}>Clear filters</Button>}
        <Button size="sm" variant="ghost" icon="restore" onClick={() => void load(true)} aria-label="Refresh">Refresh</Button>
      </div>
      {state === 'loading' ? <SkeletonRows rows={6} height={40} />
        : state === 'error' && items.length === 0 ? <ErrorState title="Couldn't load the activity" message={error?.message} onRetry={() => void load(true)} />
        : items.length === 0 ? <EmptyState icon="activity" title={filtered ? 'Nothing matches these filters' : 'No activity yet'} text={filtered ? 'Try a different type, person or date range.' : 'Changes to tasks, files and the project will appear here.'} />
        : (
          <div className="pm-act__feed">
            {groups.map((g) => (
              <section key={g.label} aria-label={g.label}>
                <h2 className="pm-act__day">{g.label}</h2>
                <ul className="pm-act__list">
                  {g.rows.map((a) => (
                    <li key={a.id} className="pm-act__row">
                      <Avatar person={a.actor} size={24} />
                      <p className="pm-act__text"><Sentence a={a} projectId={p.id} /></p>
                      <time className="pm-faint pm-act__time" dateTime={a.createdAt} title={new Date(a.createdAt).toLocaleString()}>{new Date(a.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · {relTime(a.createdAt)}</time>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <div ref={end} className="pm-act__end">
              {next !== null && <Button size="sm" loading={state === 'more'} onClick={() => void load(false, next)}>Load more</Button>}
              {next === null && <span className="pm-faint">That’s everything.</span>}
              {state === 'error' && <span className="pm-danger-text" role="alert">Couldn’t load more: {error?.message}</span>}
            </div>
          </div>
        )}
    </div>
  );
}
