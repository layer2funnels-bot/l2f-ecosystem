import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { GoalDetail } from '../api/types.ts';
import { usePlanner } from '../state/PlannerContext.tsx';
import { Drawer, MenuButton } from '../ui/overlay.tsx';
import { MenuItem } from '../ui/overlay.tsx';
import { Avatar, Button, ErrorState, PriorityBadge, Skeleton, StatusBadge } from '../ui/primitives.tsx';
import { useDialogs } from './Dialogs.tsx';
import { LOCKED_REASON } from './drawer/shared.tsx';
import { OverviewTab } from './drawer/OverviewTab.tsx';
import { UpdatesTab } from './drawer/UpdatesTab.tsx';
import { MeasuresTab } from './drawer/MeasuresTab.tsx';
import { ActionsTab } from './drawer/ActionsTab.tsx';
import { RisksTab } from './drawer/RisksTab.tsx';
import { CommentsTab } from './drawer/CommentsTab.tsx';
import { HistoryTab } from './drawer/HistoryTab.tsx';

type TabId = 'overview' | 'updates' | 'measures' | 'actions' | 'risks' | 'comments' | 'history';
type Load = { id: string; state: 'loading' | 'error' | 'missing' | 'ready'; data?: GoalDetail };

export default function GoalDrawer() {
  const { client, openGoalId, openGoal, revision, can, toast, run, workspace, route, me } = usePlanner();
  const dialogs = useDialogs();
  const [load, setLoad] = useState<Load | null>(null);
  const [tab, setTab] = useState<TabId>('overview');
  const [retry, setRetry] = useState(0);
  const seq = useRef(0);

  useEffect(() => { const want = route.params.gtab; setTab((['updates', 'measures', 'actions', 'risks', 'comments', 'history'] as string[]).includes(want ?? '') ? want as TabId : 'overview'); }, [openGoalId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!openGoalId) { seq.current++; setLoad(null); return; }
    const id = openGoalId;
    const token = ++seq.current;
    // Keep what is on screen while refreshing the same goal; show the skeleton only for a different one.
    setLoad((prev) => (prev && prev.id === id && prev.state === 'ready' ? prev : { id, state: 'loading' }));
    client.goal(id).then((d) => {
      if (token !== seq.current) return;
      // A person who belongs to two organizations still works in one at a time: a goal from the other one is not shown here.
      const foreign = !!d && !!workspace && d.goal.workspace_id !== workspace.id;
      setLoad(d && !foreign ? { id, state: 'ready', data: d } : { id, state: 'missing' });
    }).catch(() => {
      if (token !== seq.current) return;
      setLoad((prev) => (prev && prev.id === id && prev.state === 'ready' ? prev : { id, state: 'error' }));
    });
  }, [openGoalId, revision, client, retry, workspace]);

  const close = useCallback(() => openGoal(null), [openGoal]);
  if (!openGoalId) return null;

  const current = load && load.id === openGoalId ? load : { id: openGoalId, state: 'loading' as const };
  const d = current.state === 'ready' ? current.data ?? null : null;

  if (!d) {
    const title = current.state === 'missing' ? 'Objective' : current.state === 'error' ? 'Objective' : 'Loading objective';
    return (
      <Drawer open title={title} onClose={close}>
        {current.state === 'loading' && <div role="status" aria-live="polite"><span className="sr-only">Loading objective</span><Skeleton lines={2} height={28} /><div className="gd-gap" /><Skeleton lines={6} height={18} /></div>}
        {current.state === 'missing' && (
          <div className="state" role="status">
            <h3 className="state__title">This objective isn't available</h3>
            <p className="state__text">It may have been removed, or you may not have access to it.</p>
            <div className="state__action"><Button variant="primary" onClick={close} data-autofocus>Close</Button></div>
          </div>
        )}
        {current.state === 'error' && <ErrorState title="The objective could not be loaded" onRetry={() => setRetry((n) => n + 1)}>Check your connection and try again.</ErrorState>}
      </Drawer>
    );
  }

  const g = d.goal;
  const locked = !!d.plan.archived_at;
  const archived = !!g.archived_at;
  const openRisks = d.risks.filter((r) => !r.archived_at && r.status !== 'closed').length;
  const openActions = d.actions.filter((a) => !a.archived_at && a.status !== 'done').length;

  const tabs: { id: TabId; label: string; count?: number; hint?: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'updates', label: 'Updates' },
    { id: 'measures', label: 'KPIs' },
    { id: 'actions', label: 'Tasks', count: openActions, hint: `${openActions} open` },
    { id: 'risks', label: 'Risks', count: openRisks, hint: `${openRisks} open` },
    { id: 'comments', label: 'Comments' },
    { id: 'history', label: 'History' },
  ];

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === tab);
    let n = i;
    if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = tabs.length - 1;
    else return;
    e.preventDefault();
    setTab(tabs[n]!.id);
    document.getElementById(`gd-tab-${tabs[n]!.id}`)?.focus();
  };

  const toggleArchive = async () => {
    const ok = await dialogs.confirm(archived
      ? { title: 'Restore this objective?', body: <p>“{g.title}” will appear in lists and reports again.</p>, confirmLabel: 'Restore objective' }
      : { title: 'Archive this objective?', body: <p>“{g.title}” will be hidden from lists and reports. Its history is kept and you can restore it later.</p>, confirmLabel: 'Archive objective', danger: true });
    if (!ok) return;
    await run(async () => { await client.setGoalArchived(g.id, !archived); return true; }, { success: archived ? 'Objective restored.' : 'Objective archived.' });
  };

  const deleteGoal = async () => {
    const ok = await dialogs.confirm({
      title: 'Delete this objective permanently?',
      body: <p>“{g.title}” will be removed for good. This only works for an archived goal with no work or history under it, and it cannot be undone.</p>,
      confirmLabel: 'Delete permanently', danger: true,
    });
    if (!ok) return;
    const done = await run(async () => { await client.deleteGoal(g.id); return true; }, { success: 'Objective deleted.', refresh: false });
    if (done) { close(); await run(async () => true); }
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href); toast('Link copied.', 'success'); }
    catch { toast('The link could not be copied. Copy it from the address bar instead.', 'error'); }
  };

  const reason = (allowed: boolean, why: string) => (locked ? LOCKED_REASON : allowed ? null : why);
  const editWhy = reason(can['goal.edit'] || g.owner_id === me.id, 'Needs permission to edit objectives.') ?? (archived ? 'Restore this goal to edit it.' : null);
  const addWhy = reason(can['goal.create'], 'Needs permission to create goals.') ?? (archived ? 'Restore this goal to add sub-goals.' : null);
  const archWhy = reason(can['goal.archive'], 'Needs permission to archive goals.');

  const actions = (
    <MenuButton label="Actions" size="sm">
      {() => (
        <>
          <MenuItem disabled={!!editWhy} onClick={() => dialogs.editGoal(g)}>Edit goal{editWhy && <small className="gd-why"> · {editWhy}</small>}</MenuItem>
          <MenuItem disabled={!!addWhy} onClick={() => dialogs.newGoal({ parentId: g.id })}>Add sub-goal{addWhy && <small className="gd-why"> · {addWhy}</small>}</MenuItem>
          <MenuItem disabled={!!archWhy} onClick={toggleArchive}>{archived ? 'Restore objective' : 'Archive objective'}{archWhy && <small className="gd-why"> · {archWhy}</small>}</MenuItem>
          {archived && can['goal.delete'] && <MenuItem danger disabled={locked} onClick={deleteGoal}>Delete permanently</MenuItem>}
          <MenuItem onClick={copyLink}>Copy link</MenuItem>
        </>
      )}
    </MenuButton>
  );

  const subtitle = (
    <div className="gd-head">
      <nav aria-label="Where this objective sits" className="gd-crumbs">
        <ol>
          <li>{d.plan.name}</li>
          <li>{d.focus_area.name}</li>
          {d.breadcrumb.map((b) => <li key={b.id}><button type="button" className="link-btn" onClick={() => openGoal(b.id)}>{b.title}</button></li>)}
        </ol>
      </nav>
      <div className="gd-meta">
        <StatusBadge status={g.status} />
        <span className="gd-owner"><Avatar name={g.owner_name} size={24} /> {g.owner_name ?? 'No owner'}</span>
        <PriorityBadge priority={g.priority} />
        {archived && <span className="chip chip--warn">Archived</span>}
      </div>
    </div>
  );

  const body = (() => {
    const p = { d, locked };
    switch (tab) {
      case 'updates': return <UpdatesTab {...p} />;
      case 'measures': return <MeasuresTab {...p} />;
      case 'actions': return <ActionsTab {...p} />;
      case 'risks': return <RisksTab {...p} />;
      case 'comments': return <CommentsTab {...p} />;
      case 'history': return <HistoryTab {...p} />;
      default: return <OverviewTab {...p} />;
    }
  })();

  return (
    <Drawer open title={g.title} subtitle={subtitle} onClose={close} actions={actions}>
      {locked && <p className="gd-banner" role="status">This plan is archived, so this objective is read-only. Restore the plan to make changes.</p>}
      {archived && !locked && <p className="gd-banner" role="status">This objective is archived. Restore it from the Actions menu to work on it again.</p>}
      <div className="gd-tabs" role="tablist" aria-label="Goal sections" onKeyDown={onTabKey}>
        {tabs.map((t) => (
          <button key={t.id} id={`gd-tab-${t.id}`} type="button" role="tab" aria-selected={tab === t.id} aria-controls="gd-panel" tabIndex={tab === t.id ? 0 : -1}
            className={`gd-tab${tab === t.id ? ' is-on' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}{t.count !== undefined && t.count > 0 && <span className="gd-count" aria-label={t.hint}>{t.count}</span>}
          </button>
        ))}
      </div>
      <div id="gd-panel" role="tabpanel" aria-labelledby={`gd-tab-${tab}`} tabIndex={0} className="gd-panel">{body}</div>
    </Drawer>
  );
}
