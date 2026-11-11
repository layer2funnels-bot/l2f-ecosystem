import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { ActivityItem, Comment, StatusSpan } from '../../shared/api.ts';
import { call } from '../api/client.ts';
import { useQuery } from '../api/store.ts';
import { relTime, TASK_STATUS_META } from '../lib/util.ts';
import { Avatar, Button, ConfirmDialog, Tabs, Textarea, contextMenuProps } from '../ui/index.ts';
import type { CtxItem } from '../ui/index.ts';
import { absoluteLink, copyText } from '../lib/clipboard.ts';
import { links } from '../router.ts';
import { useTask } from './context.ts';
import { activityText, extractMentions, splitMentions } from './format.ts';
import { Section } from './Section.tsx';

export type ActivityTab = 'comments' | 'all' | 'status';

type Entry = { kind: 'comment'; at: string; id: string; comment: Comment } | { kind: 'history'; at: string; id: string; item: ActivityItem };

export function Activity({ tab, onTab }: { tab: ActivityTab; onTab: (t: ActivityTab) => void }) {
  const { task } = useTask();

  const feed = useMemo<Entry[]>(() => {
    if (tab === 'status') return [];
    const comments: Entry[] = task.comments.map((c) => ({ kind: 'comment', at: c.createdAt, id: `c-${c.id}`, comment: c }));
    if (tab === 'comments') return comments;
    // Comments are shown in full below; the "commented" history rows would just duplicate them.
    const history: Entry[] = task.activity.filter((a) => a.kind !== 'task.commented').map((a) => ({ kind: 'history', at: a.createdAt, id: `a-${a.id}`, item: a }));
    return [...history, ...comments].sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
  }, [task.comments, task.activity, tab]);

  return (
    <Section title="Activity">
      <Tabs
        ariaLabel="Activity view"
        value={tab}
        onChange={(t) => onTab(t as ActivityTab)}
        items={[{ id: 'comments', label: 'Comments', badge: task.comments.length }, { id: 'all', label: 'All activity' }, { id: 'status', label: 'Status history' }]}
      />
      <div className="pm-feed" role="tabpanel" aria-label={tab === 'comments' ? 'Comments' : tab === 'all' ? 'All activity' : 'Status history'}>
        {tab === 'status' && <StatusHistory />}
        {tab !== 'status' && feed.length === 0 && (
          <p className="pm-faint pm-feed__empty">{tab === 'comments' ? 'No comments yet. Start the conversation below.' : 'No activity yet.'}</p>
        )}
        {feed.map((e) => (e.kind === 'comment' ? <CommentItem key={e.id} c={e.comment} /> : <HistoryItem key={e.id} a={e.item} />))}
      </div>
    </Section>
  );
}

function HistoryItem({ a }: { a: ActivityItem }) {
  return (
    <div className="pm-hist">
      <Avatar person={a.actor} size={20} />
      <p className="pm-hist__text">
        <strong>{a.actor?.name ?? 'Someone'}</strong> {activityText(a)}
        <span className="pm-faint"> · <time dateTime={a.createdAt} title={new Date(a.createdAt).toLocaleString()}>{relTime(a.createdAt)}</time></span>
      </p>
    </div>
  );
}

function CommentItem({ c }: { c: Comment }) {
  const { task, people, isAdmin, act, trashed } = useTask();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.body);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const mentioned = useMemo(() => c.mentions.map((id) => people.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p), [c.mentions, people]);
  const parts = useMemo(() => splitMentions(c.body, mentioned), [c.body, mentioned]);

  const save = async () => {
    const body = text.trim();
    if (!body) return;
    if (body === c.body) { setEditing(false); return; }
    setBusy(true);
    const mentions = extractMentions(body, people);
    const r = await act(
      () => call('comments.edit', { id: c.id, body, mentions }),
      (d) => ({ ...d, comments: d.comments.map((x) => (x.id === c.id ? { ...x, body, mentions, editedAt: new Date().toISOString() } : x)) }),
    );
    setBusy(false);
    if (r.ok) setEditing(false);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); setEditing(false); setText(c.body); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void save(); }
  };
  const remove = async () => {
    await act(() => call('comments.remove', { id: c.id }), (d) => ({ ...d, comments: d.comments.filter((x) => x.id !== c.id) }));
    setConfirm(false);
  };

  const commentMenu = (): CtxItem[] | null => {
    if (editing) return null;
    const items: CtxItem[] = [
      { id: 'copy', icon: 'copy', label: 'Copy text', onSelect: () => void copyText(c.body, 'Comment copied') },
      { id: 'link', icon: 'link', label: 'Copy link to comment', onSelect: () => void copyText(absoluteLink(links.project(task.projectId, 'list', task.id)), 'Link copied') },
    ];
    if (!trashed && c.mine) items.push({ id: 'edit', icon: 'edit', label: 'Edit', separatorBefore: true, onSelect: () => { setText(c.body); setEditing(true); } });
    if (!trashed && (c.mine || isAdmin)) items.push({ id: 'delete', icon: 'trash', label: 'Delete', danger: true, separatorBefore: !c.mine, onSelect: () => setConfirm(true) });
    return items;
  };

  return (
    <article className="pm-comment" aria-label={`Comment by ${c.author.name}`} {...contextMenuProps(commentMenu, { label: `Actions for the comment by ${c.author.name}` })}>
      <Avatar person={c.author} size={28} />
      <div className="pm-comment__main">
        <header className="pm-comment__head">
          <strong>{c.author.name}</strong>
          <time className="pm-faint" dateTime={c.createdAt} title={new Date(c.createdAt).toLocaleString()}>{relTime(c.createdAt)}</time>
          {c.editedAt && <span className="pm-faint" title={`Edited ${new Date(c.editedAt).toLocaleString()}`}>(edited)</span>}
          {!editing && !trashed && (c.mine || isAdmin) && (
            <span className="pm-comment__tools">
              {c.mine && <button type="button" className="pm-linkbtn pm-comment__tool" onClick={() => { setText(c.body); setEditing(true); }} aria-label={`Edit comment by ${c.author.name}`}>Edit</button>}
              <button type="button" className="pm-linkbtn pm-comment__tool is-danger" onClick={() => setConfirm(true)} aria-label={`Delete comment by ${c.author.name}`}>Delete</button>
            </span>
          )}
        </header>
        {editing ? (
          <div className="pm-comment__edit">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} rows={2} maxRows={10} aria-label="Edit comment" maxLength={10000} autoFocus />
            <div className="pm-row pm-row--end">
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setText(c.body); }}>Cancel</Button>
              <Button size="sm" variant="primary" loading={busy} disabled={!text.trim()} onClick={() => void save()}>Save</Button>
            </div>
          </div>
        ) : (
          <p className="pm-comment__body">
            {parts.map((p, i) => (p.mention ? <span key={i} className="pm-mention">{p.text}</span> : <span key={i}>{p.text}</span>))}
          </p>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        title="Delete this comment?"
        message={c.mine ? 'This can’t be undone.' : `This removes ${c.author.name}’s comment for everyone. This can’t be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={remove}
        onClose={() => setConfirm(false)}
      />
    </article>
  );
}

/** "2d 4h", "3h 12m", "5m", "under a minute". */
export function fmtSpan(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / 60000);
  if (m < 1) return 'under a minute';
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d > 0) return h ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return mm ? `${h}h ${mm}m` : `${h}h`;
  return `${mm}m`;
}
const stamp = (iso: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

function StatusHistory() {
  const { task } = useTask();
  // Key starts with "task" so every task write (invalidateWork) refreshes it.
  const q = useQuery<StatusSpan[]>(`task-status:${task.id}`, () => call('tasks.statusHistory', { id: task.id }), []);
  if (!q.data) {
    return <p className="pm-faint pm-feed__empty">{q.error ? `Couldn't load the status history: ${q.error.message}` : 'Loading the status history…'}</p>;
  }
  const now = Date.now();
  return (
    <ol className="pm-sh" aria-label="Status history, oldest first">
      {q.data.map((s, i) => {
        const open = s.to === null;
        const meta = TASK_STATUS_META[s.status];
        const dur = fmtSpan((open ? now : new Date(s.to as string).getTime()) - new Date(s.from).getTime());
        return (
          <li key={`${s.status}-${s.from}-${i}`} className={open ? 'pm-sh__row is-current' : 'pm-sh__row'}>
            <span className="pm-sh__dot" style={{ background: meta.color }} aria-hidden="true" />
            <div className="pm-sh__main">
              <p className="pm-sh__head">
                <strong>{meta.label}</strong>
                <span className="pm-sh__dur pm-num" title="Time spent in this status">· {dur}</span>
                {open && <span className="pm-sh__now">current</span>}
              </p>
              <p className="pm-faint pm-sh__meta">
                {i === 0 ? 'Created' : 'Moved'} by {s.by?.name ?? 'someone'} · <time dateTime={s.from}>{stamp(s.from)}</time>
                {open ? ' → now' : <> → <time dateTime={s.to as string}>{stamp(s.to as string)}</time></>}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}