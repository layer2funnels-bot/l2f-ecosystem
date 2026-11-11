import { taskMenuProps } from '../task/taskMenu.tsx';
import { useEffect, useRef, useState } from 'react';
import { call } from '../api/client.ts';
import { useQuery } from '../api/store.ts';
import { useDebounced } from '../lib/hooks.ts';
import { Highlight } from '../lib/oversight.tsx';
import { useSession } from '../lib/session.tsx';
import { cx, fmtDate, isOverdue } from '../lib/util.ts';
import { links, openTask, setHashParam, useRoute } from '../router.ts';
import { AssigneeStack, ProgressBar, StatusPill } from '../ui/Badges.tsx';
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from '../ui/Feedback.tsx';
import { Input } from '../ui/Form.tsx';
import { Icon } from '../ui/icons.tsx';

export function SearchPage() {
  const route = useRoute();
  const { org } = useSession();
  const urlQ = route.q;
  const [value, setValue] = useState(urlQ);
  const pushed = useRef(urlQ);
  const debounced = useDebounced(value, 250);
  const inputRef = useRef<HTMLInputElement>(null);

  // input -> URL
  useEffect(() => {
    const next = debounced.trim();
    if (next === pushed.current.trim()) return;
    pushed.current = debounced;
    setHashParam('q', next || null, { replace: true });
  }, [debounced]);
  // URL -> input (e.g. search submitted from the top bar)
  useEffect(() => {
    if (urlQ !== pushed.current) { pushed.current = urlQ; setValue(urlQ); }
  }, [urlQ]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const term = urlQ.trim();
  const q = useQuery('search', () => call('search.query', { q: term }), [term], { enabled: term.length > 0 });
  const data = term ? q.data : undefined;
  const nothing = !!data && data.projects.length === 0 && data.tasks.length === 0;

  return (
    <div className="pm-page">
      <PageHeader title="Search" subtitle={`Projects and tasks in ${org.name}. Other organizations are never included.`} />
      <div role="search" className="pm-sp-box">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          leading={<Icon name="search" size={16} />}
          placeholder="Search projects and tasks"
          aria-label="Search projects and tasks"
          data-search
          maxLength={100}
          type="search"
          autoComplete="off"
          trailing={value ? <button type="button" className="pm-sp-clear" aria-label="Clear search" title="Clear search" onClick={() => { setValue(''); inputRef.current?.focus(); }}><Icon name="x" size={14} /></button> : undefined}
        />
      </div>

      <div aria-live="polite">
        {!term && <EmptyState icon="search" title="Search everything you can open" text="Type a project name or part of a task title." />}
        {term && q.loading && !data && <SkeletonRows rows={5} height={44} />}
        {term && q.error && !data && <ErrorState title="Search failed" message={q.error.message} onRetry={() => void q.refetch()} />}
        {term && nothing && <EmptyState icon="search" title={`No results for “${term}”`} text="Check the spelling or try a shorter word." />}
      </div>

      {data && !nothing && (
        <div className="pm-sp-results">
          <section aria-labelledby="sp-projects">
            <h2 id="sp-projects" className="pm-group__title">Projects <span className="pm-faint">· {data.projects.length}</span></h2>
            {data.projects.length === 0 ? <p className="pm-faint pm-sp-none">No projects match.</p> : (
              <ul className="pm-plist">
                {data.projects.map((p) => (
                  <li key={p.id} className="pm-sp-row">
                    <a className="pm-sp-row__main" href={links.project(p.id)}>
                      <span className="pm-prow__swatch" style={{ background: p.color, height: 28 }} aria-hidden="true" />
                      <span className="pm-sp-row__text">
                        <span className="pm-prow__name pm-truncate"><Highlight text={p.name} query={term} /></span>
                        <span className="pm-faint pm-truncate">{p.clientName ?? 'Internal'}{p.owner ? ` · ${p.owner.name}` : ''}</span>
                      </span>
                      <StatusPill status={p.status} kind="project" compact />
                      <span className="pm-sp-row__progress"><ProgressBar value={p.stats.progress} color={p.color} label={`${p.name} progress`} /><span className="pm-num pm-muted">{p.stats.progress}%</span></span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="sp-tasks">
            <h2 id="sp-tasks" className="pm-group__title">Tasks <span className="pm-faint">· {data.tasks.length}{data.tasks.length >= 20 ? '+' : ''}</span></h2>
            {data.tasks.length === 0 ? <p className="pm-faint pm-sp-none">No tasks match.</p> : (
              <ul className="pm-plist">
                {data.tasks.map((t) => (
                  <li key={t.id} className="pm-sp-row" {...taskMenuProps(t)}>
                    <div className="pm-sp-row__main pm-sp-row__main--task">
                      <button type="button" className={cx('pm-sp-row__title', t.status === 'done' && 'is-done')} onClick={() => openTask(t.id)}>
                        <span className="pm-truncate"><Highlight text={t.title} query={term} /></span>
                      </button>
                      <a className="pm-mw-row__proj pm-truncate" href={links.project(t.projectId)}>
                        <span className="pm-dot" style={{ background: t.projectColor }} aria-hidden="true" />
                        <span className="pm-truncate">{t.projectName}</span>
                      </a>
                      <StatusPill status={t.status} compact />
                      <AssigneeStack people={t.assignees} max={3} size={20} empty={false} />
                      <span className={cx('pm-num pm-sp-row__due', isOverdue(t.dueOn, t.status === 'done') && 'pm-danger-text')}>{t.dueOn ? fmtDate(t.dueOn) : <span className="pm-faint">No date</span>}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {data.tasks.length >= 20 && <p className="pm-faint pm-sp-none">Showing the first 20 matches. Refine your search to narrow it down.</p>}
          </section>
        </div>
      )}
    </div>
  );
}
