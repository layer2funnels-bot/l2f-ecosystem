import { useState, type FormEvent } from 'react';
import type { Comment } from '../../api/types.ts';
import { usePlanner } from '../../state/PlannerContext.tsx';
import { useDialogs } from '../Dialogs.tsx';
import { formatDateTime, relativeTime } from '../../lib/format.ts';
import { Avatar, Button, EmptyState, TextArea } from '../../ui/primitives.tsx';
import { LOCKED_REASON, useSave, type TabProps } from './shared.tsx';

function CommentItem({ c, mine, locked }: { c: Comment; mine: boolean; locked: boolean }) {
  const { client } = usePlanner();
  const dialogs = useDialogs();
  const { busy, save } = useSave();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(c.body);
  const [err, setErr] = useState<string | undefined>();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) { setErr('A comment cannot be empty.'); return; }
    setErr(undefined);
    if (await save(() => client.editComment(c.id, body.trim()), 'Comment saved.')) setEditing(false);
  };
  const remove = async () => {
    const ok = await dialogs.confirm({ title: 'Delete this comment?', body: <p>This removes your comment from the thread.</p>, confirmLabel: 'Delete comment', danger: true });
    if (ok) await save(() => client.deleteComment(c.id), 'Comment deleted.');
  };

  return (
    <li className="gd-comment">
      <Avatar name={c.author_name} />
      <div className="gd-grow">
        <p className="gd-feed__head">
          <strong>{c.author_name ?? 'Someone'}</strong>
          <time className="muted" dateTime={c.created_at} title={formatDateTime(c.created_at)}>{relativeTime(c.created_at)}</time>
          {c.edited_at && <span className="muted" title={formatDateTime(c.edited_at)}>(edited)</span>}
        </p>
        {editing ? (
          <form className="gd-form" onSubmit={submit} noValidate aria-label="Edit comment">
            <TextArea label="Comment" required value={body} error={err} onChange={(e) => setBody(e.target.value)} />
            <div className="form-actions"><Button onClick={() => { setEditing(false); setBody(c.body); }}>Cancel</Button><Button type="submit" variant="primary" busy={busy}>Save</Button></div>
          </form>
        ) : <p className="gd-pre">{c.body}</p>}
        {mine && !editing && !locked && (
          <p className="gd-action__btns"><Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button><Button size="sm" variant="ghost" busy={busy} onClick={remove}>Delete</Button></p>
        )}
      </div>
    </li>
  );
}

export function CommentsTab({ d, locked }: TabProps) {
  const { can, me, client } = usePlanner();
  const { busy, save } = useSave();
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | undefined>();
  const canAdd = can['comment.create'] && !locked;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) { setErr('Write a comment first.'); return; }
    setErr(undefined);
    if (await save(() => client.addComment(d.goal.id, body.trim()), 'Comment added.')) setBody('');
  };

  return (
    <div className="gd-stack">
      <h3 className="gd-h">Comments ({d.comments.length})</h3>
      {d.comments.length === 0
        ? <EmptyState title="No comments yet">Use comments to discuss this objective with your team.</EmptyState>
        : <ol className="gd-feed">{d.comments.map((c) => <CommentItem key={c.id} c={c} mine={c.author_id === me.id} locked={locked} />)}</ol>}
      {canAdd ? (
        <form className="gd-card gd-form" onSubmit={add} noValidate aria-label="Add a comment">
          <TextArea label="Add a comment" value={body} error={err} onChange={(e) => setBody(e.target.value)} />
          <div className="form-actions"><Button type="submit" variant="primary" busy={busy}>Post comment</Button></div>
        </form>
      ) : <p className="gd-note" role="note">{locked ? LOCKED_REASON : 'You can read comments but not add them.'}</p>}
    </div>
  );
}
