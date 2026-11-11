import { projectMenuProps } from '../lib/projectMenu.tsx';
import { useMemo, useState } from 'react';
import type { ProjectKind, ProjectStatus, ProjectSummary } from '../../shared/api.ts';
import { PROJECT_STATUSES } from '../../shared/api.ts';
import { call } from '../api/client.ts';
import { useQuery } from '../api/store.ts';
import { daysLate } from '../lib/oversight.tsx';
import { isPersonal, KIND_META } from '../lib/projectKind.ts';
import { LockMark } from '../ui/LockMark.tsx';
import { useSession } from '../lib/session.tsx';
import { cx, fmtDate, PROJECT_STATUS_META, todayYmd } from '../lib/util.ts';
import { links, setHashParam, useRoute } from '../router.ts';
import { Avatar, Chip, ProgressBar, StatusPill } from '../ui/Badges.tsx';
import { Button } from '../ui/Button.tsx';
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from '../ui/Feedback.tsx';
import { Input } from '../ui/Form.tsx';
import { Icon } from '../ui/icons.tsx';

type SortKey = 'name' | 'client' | 'status' | 'owner' | 'progress' | 'open' | 'overdue' | 'next' | 'due';
type Kind = 'all' | ProjectKind;
const KIND_CHIPS: Kind[] = ['all', 'client', 'internal', 'personal'];
const STATUS_ORDER: Record<ProjectStatus, number> = { off_track: 0, at_risk: 1, on_track: 2, on_hold: 3, complete: 4 };

const COLS: { key: SortKey; label: string; num?: boolean }[] = [
  { key: 'name', label: 'Project' },
  { key: 'client', label: 'Client' },
  { key: 'status', label: 'Status' },
  { key: 'owner', label: 'Owner' },
  { key: 'progress', label: 'Progress' },
  { key: 'open', label: 'Open', num: true },
  { key: 'overdue', label: 'Overdue', num: true },
  { key: 'next', label: 'Next due' },
  { key: 'due', label: 'Due date' },
];

function sortValue(p: ProjectSummary, k: SortKey): string | number {
  switch (k) {
    case 'name': return p.name.toLowerCase();
    case 'client': return (p.kind === 'personal' ? '~~personal' : p.clientName ?? '~internal').toLowerCase();
    case 'status': return STATUS_ORDER[p.status];
    case 'owner': return (p.owner?.name ?? '~').toLowerCase();
    case 'progress': return p.stats.progress;
    case 'open': return p.stats.open;
    case 'overdue': return p.stats.overdue;
    case 'next': return p.stats.nextDueOn ?? '9999-12-31';
    case 'due': return p.dueOn ?? '9999-12-31';
  }
}

export function PortfolioPage() {
  const { org } = useSession();
  const q = useQuery('portfolio', () => call('portfolio.get', {}), []);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'due', dir: 'asc' });
  // The status filter lives in the URL (#/portfolio?status=at_risk,off_track), so Home tiles and links can open a filtered view.
  const route = useRoute();
  const statusParam = route.params.get('status') ?? '';
  const statuses = useMemo(() => statusParam.split(',').filter((s): s is ProjectStatus => (PROJECT_STATUSES as string[]).includes(s)), [statusParam]);
  const setStatuses = (next: ProjectStatus[]) => setHashParam('status', next.length ? next.join(',') : null, { replace: true });
  const [kind, setKind] = useState<Kind>('all');
  const [search, setSearch] = useState('');

  const all = q.data ?? [];
  const tiles = useMemo(() => ({
    projects: all.length,
    onTrack: all.filter((p) => p.status === 'on_track').length,
    risk: all.filter((p) => p.status === 'at_risk' || p.status === 'off_track').length,
    overdue: all.reduce((a, p) => a + p.stats.overdue, 0),
  }), [all]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = all.filter((p) =>
      (statuses.length === 0 || statuses.includes(p.status)) &&
      (kind === 'all' || p.kind === kind) &&
      (!needle || p.name.toLowerCase().includes(needle) || (p.clientName ?? '').toLowerCase().includes(needle) || (p.owner?.name ?? '').toLowerCase().includes(needle)));
    const m = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const x = sortValue(a, sort.key), y = sortValue(b, sort.key);
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return c * m || a.name.localeCompare(b.name);
    });
  }, [all, statuses, kind, search, sort]);

  const filtering = statuses.length > 0 || kind !== 'all' || search.trim() !== '';
  const clickSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'progress' || key === 'open' || key === 'overdue' ? 'desc' : 'asc' }));

  return (
    <div className="pm-page pm-page--wide">
      <PageHeader title="Portfolio" subtitle={`Every project you can open in ${org.name}, side by side.`} />

      {q.data && (
        <div className="pm-pf-tiles" role="list" aria-label="Portfolio summary">
          <Tile label="Projects" value={tiles.projects} />
          <Tile label="On track" value={tiles.onTrack} tone="ok" />
          <Tile label="At risk / off track" value={tiles.risk} tone={tiles.risk > 0 ? 'warn' : undefined} />
          <Tile label="Overdue tasks" value={tiles.overdue} tone={tiles.overdue > 0 ? 'danger' : undefined} />
        </div>
      )}

      <div className="pm-toolbar" role="search">
        <Input wrapClassName="pm-toolbar__search" size="sm" leading={<Icon name="search" size={14} />} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, client or owner" aria-label="Search projects" />
        <div className="pm-toolbar__chips" role="group" aria-label="Filter by type">
          {KIND_CHIPS.map((k) => (
            <Chip key={k} selected={kind === k} onClick={() => setKind(k)}>{k === 'all' ? 'All' : KIND_META[k].label}</Chip>
          ))}
        </div>
        <span className="pm-toolbar__divider" aria-hidden="true" />
        <div className="pm-toolbar__chips" role="group" aria-label="Filter by status">
          {PROJECT_STATUSES.map((s) => (
            <Chip key={s} selected={statuses.includes(s)} color={PROJECT_STATUS_META[s].color} onClick={() => setStatuses(statuses.includes(s) ? statuses.filter((x) => x !== s) : [...statuses, s])}>{PROJECT_STATUS_META[s].label}</Chip>
          ))}
        </div>
      </div>

      {q.loading && !q.data && <SkeletonRows rows={6} height={52} />}
      {q.error && !q.data && <ErrorState title="Couldn't load the portfolio" message={q.error.message} onRetry={() => void q.refetch()} />}

      {q.data && rows.length === 0 && (
        filtering
          ? <EmptyState icon="search" title="No projects match" text="Try a different search or clear the filters." action={<Button onClick={() => { setSearch(''); setKind('all'); setStatuses([]); }}>Clear filters</Button>} />
          : <EmptyState icon="folder" title="No projects yet" text="Projects you can open will be compared here." />
      )}

      {rows.length > 0 && (
        <>
          <p className="pm-sr-only" aria-live="polite">{rows.length} {rows.length === 1 ? 'project' : 'projects'} shown, sorted by {COLS.find((c) => c.key === sort.key)?.label} {sort.dir === 'asc' ? 'ascending' : 'descending'}</p>
          <div className="pm-pf-scroll">
            <table className="pm-pf">
              <thead>
                <tr>
                  {COLS.map((c) => (
                    <th key={c.key} scope="col" aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={cx(c.num && 'is-num')}>
                      <button type="button" onClick={() => clickSort(c.key)}>
                        {c.label}
                        <Icon name={sort.key === c.key ? (sort.dir === 'asc' ? 'chevronUp' : 'chevronDown') : 'chevronsUpDown'} size={12} className={cx('pm-pf__sort', sort.key !== c.key && 'is-idle')} />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const dueLate = daysLate(p.dueOn, p.status === 'complete');
                  const nextLate = !!p.stats.nextDueOn && p.stats.nextDueOn < todayYmd();
                  return (
                    <tr key={p.id} {...projectMenuProps(p)}>
                      <th scope="row" className="pm-pf__name">
                        <a href={links.project(p.id)}>
                          <span className="pm-prow__swatch pm-pf__swatch" style={{ background: p.color }} aria-hidden="true" />
                          <span className="pm-truncate">{p.name}</span>
                          {isPersonal(p) && <LockMark />}
                        </a>
                      </th>
                      <td>{p.clientName ?? <span className="pm-faint">{isPersonal(p) ? 'Personal' : 'Internal'}</span>}</td>
                      <td><StatusPill status={p.status} kind="project" compact /></td>
                      <td>{p.owner ? <span className="pm-pf__owner"><Avatar person={p.owner} size={22} /><span className="pm-truncate">{p.owner.name}</span></span> : <span className="pm-faint">No owner</span>}</td>
                      <td><span className="pm-pf__progress"><ProgressBar value={p.stats.progress} color={p.color} label={`${p.name} progress`} /><span className="pm-num">{p.stats.progress}%</span></span></td>
                      <td className="is-num pm-num">{p.stats.open}</td>
                      <td className={cx('is-num pm-num', p.stats.overdue > 0 && 'pm-danger-text')}>{p.stats.overdue > 0 ? <strong>{p.stats.overdue}</strong> : 0}</td>
                      <td className={cx('pm-num', nextLate && 'pm-danger-text')}>{p.stats.nextDueOn ? fmtDate(p.stats.nextDueOn) : <span className="pm-faint">—</span>}</td>
                      <td className={cx('pm-num', dueLate && 'pm-danger-text')}>
                        {p.dueOn ? <>{fmtDate(p.dueOn)}{dueLate && <span className="pm-pf__late">{dueLate}</span>}</> : <span className="pm-faint">No date</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="pm-pf-cards" aria-label="Projects">
            {rows.map((p) => {
              const dueLate = daysLate(p.dueOn, p.status === 'complete');
              return (
                <li key={p.id} className="pm-pf-card" {...projectMenuProps(p)}>
                  <span className="pm-pf-card__bar" style={{ background: p.color }} aria-hidden="true" />
                  <div className="pm-pf-card__top">
                    <a className="pm-pf-card__name pm-truncate" href={links.project(p.id)}>{p.name}</a>{isPersonal(p) && <LockMark />}
                    <StatusPill status={p.status} kind="project" compact />
                  </div>
                  <div className="pm-faint">{p.clientName ?? (isPersonal(p) ? 'Personal \u00b7 private' : 'Internal')}{p.owner ? ` · ${p.owner.name}` : ''}</div>
                  <div className="pm-pf__progress"><ProgressBar value={p.stats.progress} color={p.color} label={`${p.name} progress`} /><span className="pm-num">{p.stats.progress}%</span></div>
                  <dl className="pm-pf-card__facts">
                    <div><dt>Open</dt><dd className="pm-num">{p.stats.open}</dd></div>
                    <div><dt>Overdue</dt><dd className={cx('pm-num', p.stats.overdue > 0 && 'pm-danger-text')}>{p.stats.overdue}</dd></div>
                    <div><dt>Next due</dt><dd className={cx('pm-num', !!p.stats.nextDueOn && p.stats.nextDueOn < todayYmd() && 'pm-danger-text')}>{p.stats.nextDueOn ? fmtDate(p.stats.nextDueOn) : '—'}</dd></div>
                    <div><dt>Due</dt><dd className={cx('pm-num', dueLate && 'pm-danger-text')}>{p.dueOn ? fmtDate(p.dueOn) : '—'}{dueLate ? ` · ${dueLate}` : ''}</dd></div>
                  </dl>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' | 'danger' }) {
  return (
    <div role="listitem" className={cx('pm-tile', tone && `pm-tile--${tone}`)}>
      <div className="pm-tile__value pm-num">{value}</div>
      <div className="pm-tile__label">{label}</div>
    </div>
  );
}
