import { projectMenuProps } from '../../lib/projectMenu.tsx';
import type { ReactNode } from 'react';
import type { ProjectSummary } from '../../../shared/api.ts';
import { isPersonal, kindCaption } from '../../lib/projectKind.ts';
import { cx, fmtDate, isOverdue } from '../../lib/util.ts';
import { links } from '../../router.ts';
import { Avatar, ProgressBar, StatusPill } from '../../ui/Badges.tsx';
import { Icon } from '../../ui/icons.tsx';

/** One project in a list. The name is a stretched link; `actions` sit above it. */
export function ProjectRow({ p, actions }: { p: ProjectSummary; actions?: ReactNode }) {
  const finished = p.status === 'complete';
  const late = isOverdue(p.dueOn, finished);
  const personal = isPersonal(p);
  return (
    <li className="pm-prow" {...projectMenuProps(p)}>
      <div className="pm-prow__main">
        <span className="pm-prow__swatch" style={{ background: p.color }} aria-hidden="true" />
        <div className="pm-prow__titles">
          <a className="pm-prow__name pm-truncate" href={links.project(p.id)}>{p.name}</a>
          <span className="pm-prow__client pm-faint pm-truncate">
            {personal ? (
              <span className="pm-lockmark" role="img" aria-label="Personal project, private to you" title="Personal project, private to you"><Icon name="lock" size={11} /></span>
            ) : null}
            {kindCaption(p)}
            {!personal && p.visibility === 'members' && <span className="pm-lockmark" role="img" aria-label="Visible to project members only" title="Visible to project members only"><Icon name="users" size={11} className="pm-prow__lock" /></span>}
          </span>
        </div>
      </div>
      <div className="pm-prow__status"><StatusPill status={p.status} kind="project" compact /></div>
      <div className="pm-prow__owner">
        <Avatar person={p.owner} size={22} />
        <span className="pm-truncate pm-muted">{p.owner?.name ?? 'No owner'}</span>
      </div>
      <div className={cx('pm-prow__due pm-num', late && 'is-overdue')}>
        {p.dueOn ? (<><Icon name="calendar" size={13} /><span>{fmtDate(p.dueOn)}</span></>) : <span className="pm-faint">No due date</span>}
      </div>
      <div className="pm-prow__progress">
        <ProgressBar value={p.stats.progress} color={p.color} label={`${p.name} progress`} />
        <span className="pm-num pm-muted">{p.stats.progress}%</span>
      </div>
      <div className="pm-prow__counts pm-num">
        <span className="pm-muted">{p.stats.open} open</span>
        {p.stats.overdue > 0 && <span className="pm-danger-text">{p.stats.overdue} overdue</span>}
      </div>
      {actions && <div className="pm-prow__actions">{actions}</div>}
    </li>
  );
}
