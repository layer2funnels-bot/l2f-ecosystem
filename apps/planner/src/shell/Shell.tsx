// The Planner frame, modelled on the Design v4 shell: a left menu with a few plainly named sections, a top bar with search
// and one Create button, and (inside a section) a short row of tabs. Pages read the organization and plan from usePlanner().
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SearchHit } from '../api/types.ts';
import { usePlanner } from '../state/PlannerContext.tsx';
import { NAV, PAGES, PLAN_PAGES, buildHash, type NavTab, type Page } from '../state/route.ts';
import { useDialogs } from '../components/Dialogs.tsx';
import { Toasts, MenuButton, MenuItem } from '../ui/overlay.tsx';
import { Button, EmptyState, ErrorState, IconButton, PageLoading, StatusBadge, ProgressBar, Chip, Avatar, cx } from '../ui/primitives.tsx';
import { Icon } from '../ui/icons.tsx';
import { percent } from '../lib/format.ts';
import { PAGE_COMPONENTS } from '../pages/registry.ts';
import { Notifications } from '../components/Notifications.tsx';
import { HoverTip } from '../ui/HoverTip.tsx';
import GoalDrawer from '../components/GoalDrawer.tsx';
import type { Can } from '../api/types.ts';
import { eventInside, isTyping } from '../ui/dom.ts';

const NEEDS_MANAGE: Page[] = ['templates', 'settings', 'model'];
const allowed = (page: Page, can: Can) => !NEEDS_MANAGE.includes(page) || can['plan.manage'];

export function Shell({ banner, embedded = false }: { banner?: ReactNode; embedded?: boolean }) {
  const p = usePlanner();
  const dialogs = useDialogs();
  const [menuOpen, setMenuOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const route = p.route;
  const Page = PAGE_COMPONENTS[route.page];
  const group = NAV.find((g) => g.pages.includes(route.page)) ?? NAV[0]!;
  const needsPlan = PLAN_PAGES.includes(route.page);
  const archived = !!p.plan?.plan.archived_at;
  const planSummary = p.plans.find((x) => x.id === p.planId) ?? null;
  const visibleNav = NAV.filter((g) => !g.admin || p.can['plan.manage']);
  const tabs = group.tabs && route.page !== 'plans' ? group.tabs.filter((t) => allowed(t.page, p.can)) : [];
  const pageLabel = PAGES.find((x) => x.page === route.page)?.label ?? '';

  useEffect(() => { mainRef.current?.focus({ preventScroll: true }); setMenuOpen(false); }, [route.page]);
  const isActiveTab = (t: NavTab) => t.page === route.page && (t.params ? Object.entries(t.params).every(([k, v]) => route.params[k] === v) : !route.params.view && !route.params.tab);
  const href = (page: Page, params: Record<string, string> = {}) => buildHash(page, { ...params, plan: PLAN_PAGES.includes(page) || page === 'plans' ? p.planId : null });

  return (
    <div className={cx('app', embedded && 'app--embedded')}>
      {!embedded && <a className="skip" href="#planner-main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}>Skip to content</a>}   {/* in the shell, its own skip link leads to Planner */}
      {!embedded && (
        <>
          {menuOpen && <div className="rail-scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
          <aside className={cx('rail', menuOpen && 'rail--open')} aria-label="Planner">
            <div className="rail__top">
              <span className="brand"><span className="brand__mark" aria-hidden="true">P</span>Planner</span>
            </div>
            {p.workspaces.length > 0 && (
              <label className="rail__org">
                <span className="rail__orglabel">Organization</span>
                <select className="input" aria-label="Organization" value={p.workspace?.id ?? ''} onChange={(e) => void p.switchWorkspace(e.target.value)}>
                  {p.workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </label>)}
            <nav className="rail__nav" aria-label="Menu">
              {visibleNav.filter((g) => !g.admin).map((g) => (
                <a key={g.key} className="rail__link" href={href(g.home)} aria-current={g.key === group.key ? 'page' : undefined}><Icon name={g.icon} />{g.label}</a>))}
              {visibleNav.some((g) => g.admin) && <p className="rail__section">Admin</p>}
              {visibleNav.filter((g) => g.admin).map((g) => (
                <a key={g.key} className="rail__link" href={href(g.home)} aria-current={g.key === group.key ? 'page' : undefined}><Icon name={g.icon} />{g.label}</a>))}
            </nav>
            <div className="rail__foot">
              <Avatar name={p.me.name} size={36} />
              <div className="rail__who"><strong>{p.me.name}</strong><span className="muted">{p.workspace?.name}</span></div>
            </div>
          </aside>
        </>
      )}

      <div className="stage">
        {banner}
        <header className="topbar">
          {!embedded && <IconButton className="menubtn" label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><Icon name="menu" /></IconButton>}
          <div className="topbar__title"><span className="topbar__group">{group.label}</span>{route.page !== group.home && group.key !== 'home' && <span className="topbar__crumb"> / {pageLabel}</span>}</div>
          <div className="topbar__spacer" />
          {p.status === 'ready' && <GlobalSearch />}
          {p.status === 'ready' && (p.can['goal.create'] || p.can['plan.manage']) && (
            <MenuButton variant="primary" label="Create">
              {() => <>
                <MenuItem disabled={!p.can['goal.create'] || !p.plan || archived} hint={!p.can['goal.create'] ? 'You need permission to add objectives.' : archived ? 'This plan is archived: restore it first.' : 'Open a plan first.'} onClick={() => dialogs.newGoal()}>New objective</MenuItem>
                <MenuItem disabled={!p.can['plan.manage'] || !p.plan || archived} hint={!p.can['plan.manage'] ? 'You need permission to manage plans.' : archived ? 'This plan is archived: restore it first.' : 'Open a plan first.'} onClick={() => dialogs.newFocus()}>New focus area</MenuItem>
                <MenuItem disabled={!p.can['plan.manage']} hint="You need permission to manage plans." onClick={() => dialogs.newPlan()}>New plan</MenuItem>
                <MenuItem disabled={!p.can['action.manage'] || !p.plan || archived} hint={!p.can['action.manage'] ? 'You need permission to manage tasks.' : archived ? 'This plan is archived: restore it first.' : 'Open a plan first.'} onClick={() => dialogs.turnIntoWork()}>Turn strategy into work</MenuItem>
                <MenuItem disabled={!p.can['review.manage'] || !p.plan || archived} hint={!p.can['review.manage'] ? 'You need permission to manage reviews.' : 'Open a plan first.'} onClick={() => p.navigate('reviews', { plan: p.planId, new: '1' })}>Schedule a review</MenuItem>
              </>}
            </MenuButton>)}
          {p.status === 'ready' && <Notifications embedded={embedded} />}
          {!embedded && <IconButton className="themebtn" label={`Colour scheme: ${p.themePref}. Click to change.`} onClick={() => p.setThemePref(p.themePref === 'auto' ? 'light' : p.themePref === 'light' ? 'dark' : 'auto')}>
            <Icon name={p.themePref === 'dark' ? 'moon' : p.themePref === 'light' ? 'sun' : 'auto'} />
          </IconButton>}
        </header>

        {p.status === 'ready' && (needsPlan || route.page === 'alignment') && p.plans.length > 0 && (
          <div className="planbar">
            <label className="row" style={{ gap: 'var(--space-2)' }}>
              <span className="sr-only">Plan</span>
              <select className="input planbar__select" aria-label="Plan" value={p.planId ?? ''} onChange={(e) => p.selectPlan(e.target.value)}>
                {!p.planId && <option value="" disabled>Choose a plan</option>}
                {p.plans.map((pl) => <option key={pl.id} value={pl.id}>{pl.favorite ? '★ ' : ''}{pl.name}{pl.archived_at ? ' (archived)' : ''}</option>)}
              </select>
            </label>
            {p.plan && <IconButton label={p.plan.plan.favorite ? 'Remove from favourites' : 'Add to favourites'} aria-pressed={p.plan.plan.favorite} onClick={() => p.run(() => p.client.toggleFavorite(p.plan!.plan.id, !p.plan!.plan.favorite))}><Icon name="star" /></IconButton>}
            {archived && <Chip tone="warn">Archived · read-only</Chip>}
            {planSummary && <span className="planbar__meta"><span className="planbar__bar"><ProgressBar value={planSummary.progress} thin label="Plan progress" /></span><strong>{percent(planSummary.progress)}</strong>
              {planSummary.overdue_reviews > 0 && <a href={buildHash('reviews', { plan: p.planId })}><StatusBadge status="off_track" compact />Review overdue</a>}</span>}
          </div>)}

        {p.status === 'ready' && tabs.length > 0 && (
          <nav className="subnav" aria-label={`${group.label} sections`}>
            {tabs.map((t) => <a key={t.label} className="subnav__link" href={href(t.page, t.params)} aria-current={isActiveTab(t) ? 'page' : undefined}>{t.label}</a>)}
          </nav>)}

        <main id="planner-main" className="main" ref={mainRef} tabIndex={-1}>
          <h1 className="sr-only">Planner · {pageLabel}{p.workspace ? ` · ${p.workspace.name}` : ''}</h1>
          {p.status === 'loading' && <PageLoading label="Loading Planner" />}
          {p.status === 'error' && <ErrorState onRetry={() => window.location.reload()}>{p.errorText}</ErrorState>}
          {p.status === 'no-access' && (
            <EmptyState title="No access to Planner here">
              {p.workspace ? `You don’t have access to Planner in ${p.workspace.name}.` : 'You don’t belong to an organization yet.'} Ask an organization admin to give you access
              {p.workspaces.length > 1 ? ', or switch to another organization in the menu.' : '.'}
            </EmptyState>)}
          {p.status === 'ready' && !allowed(route.page, p.can) && <EmptyState title="Not available">You don’t have access to this section.</EmptyState>}
          {p.status === 'ready' && allowed(route.page, p.can) && !needsPlan && <Page />}
          {p.status === 'ready' && allowed(route.page, p.can) && needsPlan && (
            p.plans.length === 0 ? (
              <EmptyState title="Start your first plan" action={p.can['plan.manage'] ? <><Button variant="primary" onClick={() => dialogs.newPlan()}>Create a plan</Button> <Button onClick={() => p.navigate('templates')}>Start from a template</Button></> : undefined}>
                A plan turns your vision into focus areas, objectives, measures and regular reviews.{!p.can['plan.manage'] && ' A plan manager needs to create the first plan.'}
              </EmptyState>
            ) : p.planStatus === 'loading' ? <PageLoading label="Loading plan" />
              : p.planStatus === 'missing' ? <EmptyState title="That plan isn’t available">It may not exist or you may not have access. Choose another plan above, or open <a href={buildHash('plans')}>Plans</a>.</EmptyState>
              : p.plan && p.planStatus === 'ready' ? <Page /> : null)}
        </main>
      </div>
      {p.status === 'ready' && p.plan && <GoalDrawer />}
      <Toasts items={p.toasts} onDismiss={p.dismissToast} />
      <HoverTip />
    </div>
  );
}

function GlobalSearch() {
  const p = usePlanner();
  const [q, setQ] = useState(''); const [hits, setHits] = useState<SearchHit[] | null>(null); const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null); const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!p.workspace || q.trim().length < 2) { setHits(null); return; }
    const ws = p.workspace.id; let live = true;
    const t = window.setTimeout(() => { p.client.search(ws, q).then((r) => { if (live) setHits(r); }).catch(() => { if (live) setHits([]); }); }, 250);
    return () => { live = false; window.clearTimeout(t); };
  }, [q, p.workspace, p.client]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!eventInside(box.current, e)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      const typing = isTyping(e);
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); input.current?.focus(); setOpen(true); }
    };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, []);
  const go = (h: SearchHit) => { setOpen(false); setQ(''); if (h.plan_id !== p.planId) p.selectPlan(h.plan_id); p.openGoal(h.id); };
  return (
    <div className="search" ref={box} role="search">
      <label className="sr-only" htmlFor="planner-search">Search objectives</label>
      <input id="planner-search" ref={input} className="input search__input" type="search" placeholder="Search objectives  ( / )" value={q} autoComplete="off"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); (e.target as HTMLElement).blur(); } }} />
      {open && q.trim().length >= 2 && hits && (
        <div className="search__results" role="listbox" aria-label="Search results">
          {hits.length === 0 && <p className="muted" style={{ padding: 'var(--space-3)' }}>No objectives match “{q.trim()}”.</p>}
          {hits.map((h) => (
            <button key={h.id} type="button" role="option" aria-selected={false} className="search__hit" onClick={() => go(h)}>
              <strong>{h.title}</strong>
              <span className="muted" style={{ fontSize: '0.85em' }}>{h.plan_name}{h.archived ? ' · archived' : ''}</span>
              <span><StatusBadge status={h.status} /></span>
            </button>))}
        </div>)}
    </div>
  );
}
