import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { TaskDetail, TaskPatch, TaskStatus } from '../../shared/api.ts';
import { call } from '../api/client.ts';
import { invalidate, invalidateWork, setQueryData, useQuery } from '../api/store.ts';
import { usePeople, useTasks } from '../lib/data.ts';
import { useStoredBool } from '../lib/hooks.ts';
import { useSession } from '../lib/session.tsx';
import { cx } from '../lib/util.ts';
import { links, openTask, setHashParam } from '../router.ts';
import { Button, ConfirmDialog, EmptyState, ErrorState, Icon, IconButton, Portal, Skeleton, toast, useFocusTrap, openContextMenu } from '../ui/index.ts';
import type { CtxItem } from '../ui/index.ts';
import { useScrollLock } from '../ui/Overlay.tsx';
import { Activity } from './Activity.tsx';
import type { ActivityTab } from './Activity.tsx';
import { Attachments } from './Attachments.tsx';
import { Links } from './Links.tsx';
import { addTaskLink, createFollowUp } from './taskMenu.tsx';
import { Checklist } from './Checklist.tsx';
import { Composer } from './Composer.tsx';
import { TaskContext, toApiError } from './context.ts';
import type { TaskCtxValue, UpdateResult } from './context.ts';
import { Dependencies } from './Dependencies.tsx';
import { Description } from './Description.tsx';
import { Fields } from './Fields.tsx';
import { Subtasks } from './Subtasks.tsx';
import { TimeTracking } from './TimeTracking.tsx';
import { TitleField } from './TitleField.tsx';
import { publishedTaskOrder, registerTaskPanel } from './panelNav.ts';

/** Opened by the shell whenever the URL has ?task=<id>. Closing must call onClose (removes the param). */
export function TaskDrawer({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const shell = useRef<HTMLDivElement>(null);
  const down = useRef(false);
  const [wide, setWide] = useStoredBool('pm.task.wide', false);
  useFocusTrap(shell, true);
  useScrollLock(true);

  const taskKey = `task:${taskId}`;
  const q = useQuery(taskKey, () => call('tasks.get', { id: taskId }));

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); onClose(); }
  };

  let content;
  if (q.data) {
    content = <TaskBody task={q.data} taskKey={taskKey} reload={() => void q.refetch()} refetching={q.fetching} refetchFailed={!!q.error} onClose={onClose} wide={wide} setWide={setWide} />;
  } else if (q.error) {
    const gone = ['not_found', 'forbidden', 'invalid'].includes(q.error.code);
    content = (
      <>
        <PlainHead onClose={onClose} />
        <div className="pm-task__scroll">
          {gone ? (
            <EmptyState
              icon="lock"
              title="This task isn’t available"
              text="It may have been deleted, or it belongs to a project or organization you don’t have access to."
              action={<Button variant="primary" onClick={onClose}>Close</Button>}
            />
          ) : (
            <ErrorState title="Couldn’t load this task" message={q.error.message} onRetry={() => void q.refetch()} />
          )}
        </div>
      </>
    );
  } else {
    content = (
      <>
        <PlainHead onClose={onClose} />
        <div className="pm-task__scroll" role="status" aria-label="Loading task">
          <Skeleton height={28} width="70%" radius={8} />
          <div className="pm-task__skel">
            {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} height={30} radius={8} />)}
          </div>
          <Skeleton height={90} radius={8} />
        </div>
      </>
    );
  }

  return (
    <Portal>
      <div
        className="pm-overlay pm-overlay--drawer pm-taskov"
        onMouseDown={(e) => { down.current = e.target === e.currentTarget; }}
        onClick={(e) => { if (down.current && e.target === e.currentTarget) onClose(); }}
      >
        <div
          ref={shell}
          role="dialog"
          aria-modal="true"
          aria-label={q.data ? `Task: ${q.data.title}` : 'Task'}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className={cx('pm-dialog pm-dialog--drawer pm-task', wide && 'is-wide')}
          data-task-id={taskId}
        >
          {content}
        </div>
      </div>
    </Portal>
  );
}

function PlainHead({ onClose }: { onClose: () => void }) {
  return (
    <header className="pm-th">
      <div className="pm-th__row">
        <span className="pm-spacer" />
        <IconButton icon="x" label="Close task" onClick={onClose} data-autofocus />
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------------------------
function TaskBody({ task, taskKey, reload, refetching, refetchFailed, onClose, wide, setWide }: {
  task: TaskDetail; taskKey: string; reload: () => void; refetching: boolean; refetchFailed: boolean; onClose: () => void; wide: boolean; setWide: (v: boolean) => void;
}) {
  const { user, isAdmin } = useSession();
  const people = usePeople().data ?? [];
  const parentList = useTasks(task.projectId);
  const parent = task.parentId ? parentList.data?.find((t) => t.id === task.parentId) : undefined;
  const project = useQuery(`project:${task.projectId}`, () => call('projects.get', { id: task.projectId }));

  const trashed = !!task.deletedAt;
  const readOnly = task.myRole === 'viewer' || trashed;
  const canEdit = !readOnly;
  const [conflict, setConflict] = useState(false);
  const [tab, setTab] = useState<ActivityTab>('comments');
  const [confirmTrash, setConfirmTrash] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stickToEnd = useRef(false);

  // ---- writes ----
  const versionRef = useRef(task.version);
  versionRef.current = Math.max(versionRef.current, task.version);
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  const update = useCallback((patch: TaskPatch, local?: Partial<TaskDetail>): Promise<UpdateResult> => {
    const undo = local ? setQueryData<TaskDetail>(taskKey, (d) => ({ ...d, ...local })) : undefined;
    const run = async (): Promise<UpdateResult> => {
      try {
        const row = await call('tasks.update', { id: task.id, patch, version: versionRef.current });
        versionRef.current = Math.max(versionRef.current, row.version);
        setQueryData<TaskDetail>(taskKey, (d) => ({ ...d, version: Math.max(d.version, row.version), completedAt: row.completedAt, updatedAt: row.updatedAt }));
        invalidateWork();
        return { ok: true };
      } catch (e) {
        undo?.();
        const error = toApiError(e);
        if (error.code === 'conflict') setConflict(true);
        else if (error.field !== 'dueOn' && error.field !== 'startOn') toast.error(error.message);
        if (error.code !== 'conflict') invalidate(taskKey);
        return { ok: false, error };
      }
    };
    const p = chain.current.then(run);
    chain.current = p;
    return p;
  }, [task.id, taskKey]);

  const act = useCallback(async <T,>(fn: () => Promise<T>, local?: (d: TaskDetail) => TaskDetail, opts?: { silent?: boolean }) => {
    const undo = local ? setQueryData<TaskDetail>(taskKey, local) : undefined;
    try {
      const value = await fn();
      invalidateWork();
      return { ok: true as const, value };
    } catch (e) {
      undo?.();
      const error = toApiError(e);
      if (!opts?.silent && error.code !== 'unauthenticated') toast.error(error.message);
      invalidate(taskKey);
      return { ok: false as const, error };
    }
  }, [taskKey]);

  const setStatus = useCallback((status: TaskStatus) => {
    const completing = status === 'done' && task.status !== 'done';
    void update({ status }, { status, completedAt: status === 'done' ? new Date().toISOString() : null }).then((r) => {
      if (r.ok && completing && task.repeatRule) toast.success('Completed. The next repeat was created.');
    });
  }, [update, task.status, task.repeatRule]);

  const ctx = useMemo<TaskCtxValue>(() => ({
    task, taskKey, readOnly, trashed, people, me: user, isAdmin, update, setStatus, act, reload: () => { setConflict(false); reload(); },
  }), [task, taskKey, readOnly, trashed, people, user, isAdmin, update, setStatus, act, reload]);

  // Keep the newest comment in view after sending.
  useLayoutEffect(() => {
    if (stickToEnd.current && scroller.current) { scroller.current.scrollTop = scroller.current.scrollHeight; stickToEnd.current = false; }
  }, [task.comments.length]);
  useEffect(() => { if (conflict) scroller.current?.scrollTo({ top: 0 }); }, [conflict]);

  // The body always opens at the top (also when the task changes), and late-loading sections must not shift it
  // until the person scrolls on their own.
  const userScrolled = useRef(false);
  useLayoutEffect(() => {
    userScrolled.current = false;
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = 0;
    const again = () => { if (!userScrolled.current && scroller.current) scroller.current.scrollTop = 0; };
    const raf = requestAnimationFrame(again);
    const t1 = window.setTimeout(again, 120);
    const t2 = window.setTimeout(again, 450);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [task.id]);

  // ---- header actions ----
  const done = task.status === 'done';
  const copyLink = async () => {
    const url = window.location.href;
    try { await navigator.clipboard.writeText(url); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      ta.remove();
    }
    toast.success('Link copied');
  };
  // ---- previous / next task: the order List or Board published, else the project's tasks.list order ----
  const siblingIds = (): string[] => {
    const shown = publishedTaskOrder(task.projectId);
    if (shown?.includes(task.id)) return shown;
    return (parentList.data ?? []).filter((t) => !t.parentId || t.id === task.id).map((t) => t.id);
  };
  const ids = siblingIds();
  const at = ids.indexOf(task.id);
  const prevId = at > 0 ? ids[at - 1] : null;
  const nextId = at >= 0 && at < ids.length - 1 ? ids[at + 1] : null;
  const step = (dir: -1 | 1) => {
    const now = siblingIds();
    const i = now.indexOf(task.id);
    const target = i < 0 ? undefined : now[i + dir];
    if (!target) { toast.info(dir > 0 ? 'This is the last task in the list.' : 'This is the first task in the list.'); return; }
    setHashParam('task', target, { replace: true });
  };
  const toggleComplete = () => {
    if (readOnly) { toast.info(trashed ? 'Restore this task to change it.' : 'You have view-only access to this task.'); return; }
    setStatus(task.status === 'done' ? 'todo' : 'done');
  };
  const panelApi = useRef({ step, toggleComplete, copyLink });
  panelApi.current = { step, toggleComplete, copyLink };
  useEffect(() => {
    registerTaskPanel({ step: (d) => panelApi.current.step(d), toggleComplete: () => panelApi.current.toggleComplete(), copyLink: () => void panelApi.current.copyLink() });
    return () => registerTaskPanel(null);
  }, []);

  const toggleFollow = () => {
    const on = !task.following;
    void act(() => call('follow.set', { taskId: task.id, on }), (d) => ({
      ...d, following: on,
      followers: on ? [...d.followers.filter((f) => f.id !== user.id), user] : d.followers.filter((f) => f.id !== user.id),
    }));
  };
  const duplicate = async () => {
    const r = await act(() => call('tasks.duplicate', { id: task.id }));
    if (r.ok) toast.success('Task duplicated', { action: { label: 'Open copy', onClick: () => openTask(r.value.id) } });
  };
  const trash = async () => {
    try {
      await call('tasks.trash', { ids: [task.id] });
      invalidateWork();
      const id = task.id;
      toast.success('Task moved to trash', {
        action: {
          label: 'Undo',
          onClick: () => {
            call('tasks.restore', { ids: [id] })
              .then(() => { invalidateWork(); toast.success('Task restored'); })
              .catch((e) => toast.error(toApiError(e).message));
          },
        },
      });
      onClose();
    } catch (e) {
      toast.error(toApiError(e).message);
    }
    setConfirmTrash(false);
  };
  const restore = () => void act(() => call('tasks.restore', { ids: [task.id] }), (d) => ({ ...d, deletedAt: null })).then((r) => { if (r.ok) toast.success('Task restored'); });

  // Top-level tasks of this project this task could become a subtask of (a task that has subtasks cannot become one).
  const parentChoices = (parentList.data ?? []).filter((t) => !t.parentId && t.id !== task.id && !t.deletedAt);
  const menuItems = (): CtxItem[] => {
    const items: CtxItem[] = [];
    if (canEdit) {
      items.push(
        { id: 'followup', label: 'Create follow-up task', icon: 'taskAdd', onSelect: () => void createFollowUp(task) },
        { id: 'link', label: 'Add link…', icon: 'link', onSelect: () => void addTaskLink(task.id) },
        { id: 'dup', label: 'Duplicate', icon: 'copy', onSelect: () => void duplicate() },
      );
      if (task.parentId) {
        items.push({ id: 'top', label: 'Make top-level', icon: 'chevronLeft', separatorBefore: true, onSelect: () => void update({ parentId: null }, { parentId: null }).then((r) => { if (r.ok) toast.success('Now a top-level task'); }) });
      } else {
        items.push({
          id: 'sub', label: 'Convert to subtask of…', icon: 'arrowRight', separatorBefore: true, searchable: true, searchPlaceholder: 'Search tasks…',
          disabled: task.subtasks.length > 0 || parentChoices.length === 0,
          disabledReason: task.subtasks.length > 0 ? 'A task that has subtasks cannot become a subtask' : 'There is no other task to nest it under',
          children: parentChoices.slice(0, 300).map((t): CtxItem => ({
            id: t.id, label: `#${t.number} ${t.title}`, text: `${t.number} ${t.title}`,
            onSelect: () => void update({ parentId: t.id }, { parentId: t.id }).then((r) => { if (r.ok) toast.success(`Now a subtask of “${t.title.length > 40 ? `${t.title.slice(0, 39)}…` : t.title}”`); }),
          })),
        });
      }
    }
    items.push(
      { id: 'copy', label: 'Copy link', icon: 'link', shortcut: 'Shift+L', separatorBefore: items.length > 0, onSelect: () => void copyLink() },
      { id: 'wide', label: wide ? 'Use standard width' : 'Open in full width', icon: 'panelLeft', onSelect: () => setWide(!wide) },
    );
    if (canEdit) items.push({ id: 'trash', label: 'Move to trash', icon: 'trash', danger: true, separatorBefore: true, onSelect: () => setConfirmTrash(true) });
    return items;
  };
  const sectionName = task.sectionId ? project.data?.sections.find((s) => s.id === task.sectionId)?.name : null;

  return (
    <TaskContext.Provider value={ctx}>
      <header className="pm-th">
        <div className="pm-th__row">
          <Button
            className={cx('pm-complete', done && 'is-done')}
            icon="checkCircle"
            aria-pressed={done}
            disabled={readOnly}
            onClick={() => setStatus(done ? 'todo' : 'done')}
            title={`${done ? 'Reopen' : 'Mark complete'} (Ctrl+Enter)`}
            data-autofocus
          >
            {done ? 'Completed' : 'Mark complete'}
          </Button>
          <span className="pm-spacer" />
          <Button
            size="sm"
            variant="ghost"
            icon="bell"
            aria-pressed={task.following}
            className={cx('pm-follow', task.following && 'is-on')}
            onClick={toggleFollow}
            title={task.followers.length ? `Followers: ${task.followers.map((f) => f.name).join(', ')}` : 'No followers yet'}
          >
            <span className="pm-th__label">{task.following ? 'Unfollow' : 'Follow'}</span>
          </Button>
          <IconButton icon="chevronUp" label="Previous task" tooltip="Previous task (K)" size="sm" disabled={!prevId} onClick={() => step(-1)} />
          <IconButton icon="chevronDown" label="Next task" tooltip="Next task (J)" size="sm" disabled={!nextId} onClick={() => step(1)} />
          <IconButton icon="link" label="Copy link" tooltip="Copy link (Shift+L)" size="sm" onClick={() => void copyLink()} />
          <IconButton icon="more" label="More actions" size="sm" aria-haspopup="menu" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openContextMenu({ x: r.right - 4, y: r.bottom + 4, items: menuItems(), label: 'Task actions' }); }} />
          <IconButton icon="x" label="Close task" size="sm" onClick={onClose} />
        </div>
        <nav className="pm-crumbs" aria-label="Breadcrumb">
          <a href={links.project(task.projectId)} className="pm-crumbs__project" title={`Go to ${task.projectName}`}>
            <span className="pm-dot pm-dot--lg" style={{ background: task.projectColor }} aria-hidden="true" />
            <span className="pm-truncate">{task.projectName}</span>
          </a>
          {sectionName && <><Icon name="chevronRight" size={12} className="pm-faint" /><span className="pm-truncate">{sectionName}</span></>}
          <Icon name="chevronRight" size={12} className="pm-faint" />
          <span className="pm-num" aria-current="page">#{task.number}</span>
        </nav>
      </header>

      {conflict && (
        <div className="pm-banner pm-task__banner" role="alert">
          <Icon name="alert" />
          <span>This task changed elsewhere — Reload</span>
          <Button size="sm" variant="primary" icon="restore" onClick={ctx.reload}>Reload</Button>
        </div>
      )}
      {trashed && (
        <div className="pm-banner pm-banner--danger pm-task__banner" role="status">
          <Icon name="trash" />
          <span>This task is in the trash. It is read-only until restored.</span>
          {task.myRole !== 'viewer' && <Button size="sm" icon="restore" onClick={restore}>Restore</Button>}
        </div>
      )}
      {!conflict && refetchFailed && !refetching && (
        <div className="pm-banner pm-task__banner" role="status">
          <Icon name="alert" />
          <span>Couldn’t refresh this task. What you see may be out of date.</span>
          <Button size="sm" icon="restore" onClick={reload}>Retry</Button>
        </div>
      )}

      <div className="pm-task__scroll" ref={scroller} onWheel={() => { userScrolled.current = true; }} onTouchMove={() => { userScrolled.current = true; }} onPointerDown={() => { userScrolled.current = true; }}>
        {parent && (
          <button type="button" className="pm-linkbtn pm-task__parent" onClick={() => openTask(parent.id)}>
            <Icon name="chevronLeft" size={12} /> Subtask of #{parent.number} {parent.title}
          </button>
        )}
        <TitleField />
        <Fields />
        <Description />
        {!task.parentId && <Subtasks />}
        <Checklist />
        <Dependencies />
        <Links />
        <Attachments />
        <TimeTracking />
        <Activity tab={tab} onTab={setTab} />
      </div>

      <footer className="pm-task__foot">
        <Composer onSent={() => { setTab('comments'); stickToEnd.current = true; }} />
      </footer>

      <ConfirmDialog
        open={confirmTrash}
        title="Move this task to the trash?"
        message={<>“{task.title}”{task.subtasks.length ? ` and its ${task.subtasks.length} subtask${task.subtasks.length === 1 ? '' : 's'}` : ''} will move to the trash. You can restore it from the Trash page or with Undo.</>}
        confirmLabel="Move to trash"
        danger
        onConfirm={trash}
        onClose={() => setConfirmTrash(false)}
      />
    </TaskContext.Provider>
  );
}
