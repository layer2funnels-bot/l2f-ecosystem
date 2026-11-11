import { projectMenuProps } from '../lib/projectMenu.tsx';
import { useMemo } from 'react';
import { useMyWork, usePortfolio, useProjects } from '../lib/data.ts';
import { isPersonal, kindCaption } from '../lib/projectKind.ts';
import { LockMark } from '../ui/LockMark.tsx';
import { useSession } from '../lib/session.tsx';
import { addDays, cx, fmtDate, isOverdue, startOfWeek, todayYmd } from '../lib/util.ts';
import type { ProjectSummary } from '../../shared/api.ts';
import { links, navigate } from '../router.ts';
import { ProgressBar, StatusPill } from '../ui/Badges.tsx';
import { Button } from '../ui/Button.tsx';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../ui/Feedback.tsx';
import { Icon } from '../ui/icons.tsx';
import { useShell } from '../shell/ShellContext.tsx';
import { TASK_STATUS_META } from '../lib/util.ts';

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function HomePage() {
  const { user, org, canCreate } = useSession();
  const { openNewProject } = useShell();
  const mywork = useMyWork();
  const portfolio = usePortfolio();
  const projects = useProjects('active');

  const summary = useMemo(() => {
    const today = todayYmd();
    const weekEnd = addDays(startOfWeek(today), 6);
    const all = mywork.data ?? [];
    const tasks = all.filter((t) => t.status !== 'done');
    const upNext = [...tasks].sort((a, b) => (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999')).slice(0, 5);
    return {
      open: tasks.length,
      overdue: tasks.filter((t) => t.dueOn && t.dueOn < today).length,
      week: tasks.filter((t) => t.dueOn && t.dueOn >= today && t.dueOn <= weekEnd).length,
      doneToday: all.length - tasks.length,
      upNext,
    };
  }, [mywork.data]);

  const projectTiles = useMemo(() => {
    const list: ProjectSummary[] = (portfolio.data ?? []).filter((p) => !p.isTemplate);
    return {
      active: list.filter((p) => p.status === 'on_track' || p.status === 'at_risk' || p.status === 'off_track').length,
      risk: list.filter((p) => p.status === 'at_risk' || p.status === 'off_track').length,
    };
  }, [portfolio.data]);
  const recent = useMemo(() => [...(projects.data ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6), [projects.data]);

  return (
    <div className="pm-page">
      <PageHeader
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        subtitle={`${org.name} · ${new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}`}
        actions={canCreate ? <Button variant="primary" icon="plus" onClick={() => openNewProject()}>New project</Button> : undefined}
      />

      <div className="pm-kpis" role="list" aria-label="Your numbers">
        <Kpi label="My open tasks" value={mywork.data ? summary.open : null} href={links.myWork} hint="Open My Work" />
        <Kpi label="Overdue" value={mywork.data ? summary.overdue : null} href={`${links.myWork}?due=overdue`} tone={summary.overdue > 0 ? 'danger' : undefined} hint="Show my overdue tasks" />
        <Kpi label="Due this week" value={mywork.data ? summary.week : null} href={`${links.myWork}?due=week`} hint="Show tasks due today and later this week" />
        <Kpi label="Completed today" value={mywork.data ? summary.doneToday : null} href={`${links.myWork}?due=done`} tone={summary.doneToday > 0 ? 'ok' : undefined} hint="Show what I completed today" />
        <Kpi label="Active projects" value={portfolio.data ? projectTiles.active : null} href={`${links.portfolio}?status=on_track,at_risk,off_track`} hint="Open the Portfolio with active projects" />
        <Kpi label="At risk / off track" value={portfolio.data ? projectTiles.risk : null} href={`${links.portfolio}?status=at_risk,off_track`} tone={projectTiles.risk > 0 ? 'warn' : undefined} hint="Open the Portfolio filtered to at risk and off track" />
      </div>

      <div className="pm-home">
        <Card title="My open tasks" actions={<a className="pm-card__link" href={links.myWork}>View all <Icon name="arrowRight" size={12} /></a>} className="pm-home__work">
          {mywork.loading && <div className="pm-stack"><Skeleton height={56} /><Skeleton height={32} /><Skeleton height={32} /></div>}
          {mywork.error && !mywork.data && <ErrorState compact title="Couldn't load your tasks" message={mywork.error.message} onRetry={() => void mywork.refetch()} />}
          {mywork.data && (
            <>
              {summary.upNext.length === 0 ? (
                <EmptyState compact icon="checkCircle" title="Nothing assigned to you" text="When tasks are assigned to you, the soonest ones appear here." />
              ) : (
                <ul className="pm-tasklist" aria-label="Up next">
                  {summary.upNext.map((t) => (
                    <li key={t.id}>
                      <button type="button" className="pm-taskrow" onClick={() => navigate(links.project(t.projectId, null, t.id))}>
                        <span className="pm-dot pm-dot--lg" style={{ background: t.projectColor }} aria-hidden="true" />
                        <span className="pm-taskrow__title pm-truncate">{t.title}</span>
                        <span className="pm-taskrow__proj pm-faint pm-truncate">{t.projectName}</span>
                        <span className="pm-taskrow__status" style={{ color: TASK_STATUS_META[t.status].color }}>{TASK_STATUS_META[t.status].label}</span>
                        <span className={cx('pm-taskrow__due pm-num', isOverdue(t.dueOn) && 'is-overdue')}>{t.dueOn ? fmtDate(t.dueOn) : '—'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>

        <Card title="Recent projects" actions={<a className="pm-card__link" href={links.projects}>All projects <Icon name="arrowRight" size={12} /></a>} className="pm-home__recent">
          {projects.loading && <div className="pm-stack"><Skeleton height={64} /><Skeleton height={64} /><Skeleton height={64} /></div>}
          {projects.error && !projects.data && <ErrorState compact title="Couldn't load projects" message={projects.error.message} onRetry={() => void projects.refetch()} />}
          {projects.data && recent.length === 0 && (
            <EmptyState compact icon="folder" title="No projects yet" text="Create a project to get started." action={canCreate ? <Button variant="primary" icon="plus" onClick={() => openNewProject()}>New project</Button> : undefined} />
          )}
          <div className="pm-cards">
            {recent.map((p) => (
              <a key={p.id} className="pm-pcard" href={links.project(p.id)} {...projectMenuProps(p)}>
                <span className="pm-pcard__bar" style={{ background: p.color }} aria-hidden="true" />
                <span className="pm-pcard__top">
                  <span className="pm-lockwrap"><span className="pm-pcard__name pm-truncate">{p.name}</span>{isPersonal(p) && <LockMark />}</span>
                  <StatusPill status={p.status} kind="project" compact />
                </span>
                <span className="pm-faint pm-truncate">{kindCaption(p)}{p.dueOn ? ` · due ${fmtDate(p.dueOn)}` : ''}</span>
                <span className="pm-pcard__progress"><ProgressBar value={p.stats.progress} color={p.color} label={`${p.name} progress`} /><span className="pm-num pm-muted">{p.stats.progress}%</span></span>
              </a>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, href, tone, hint }: { label: string; value: number | null; href: string; tone?: 'danger' | 'warn' | 'ok'; hint: string }) {
  return (
    <a role="listitem" href={href} className={cx('pm-kpi', tone && `pm-kpi--${tone}`)} title={hint} aria-label={`${label}: ${value ?? 'loading'}. ${hint}`}>
      <span className="pm-kpi__value pm-num">{value ?? '–'}</span>
      <span className="pm-kpi__label">{label}</span>
    </a>
  );
}