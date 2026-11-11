import { useMemo, useState } from 'react';
import type { ProjectKind, ProjectScope, ProjectStatus, ProjectSummary } from '../../../shared/api.ts';
import { PROJECT_STATUSES } from '../../../shared/api.ts';
import { useProjects } from '../../lib/data.ts';
import { KIND_META } from '../../lib/projectKind.ts';
import { useSession } from '../../lib/session.tsx';
import { PROJECT_STATUS_META } from '../../lib/util.ts';
import { useRoute } from '../../router.ts';
import { Chip } from '../../ui/Badges.tsx';
import { Button } from '../../ui/Button.tsx';
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from '../../ui/Feedback.tsx';
import { Input } from '../../ui/Form.tsx';
import { Icon } from '../../ui/icons.tsx';
import { Tabs } from '../../ui/Tabs.tsx';
import { useShell } from '../../shell/ShellContext.tsx';
import { ProjectRow } from './ProjectRow.tsx';

type Kind = 'all' | ProjectKind;
const KIND_CHIPS: Kind[] = ['all', 'client', 'internal', 'personal'];
const TABS: { id: ProjectScope; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'templates', label: 'Templates' },
  { id: 'archived', label: 'Archived' },
];

export function ProjectsPage() {
  const route = useRoute();
  const { org, canCreate } = useSession();
  const { openNewProject } = useShell();
  const initial = route.params.get('tab');
  const [scope, setScope] = useState<ProjectScope>(initial === 'templates' || initial === 'archived' ? initial : 'active');
  const [kind, setKind] = useState<Kind>('all');
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [q, setQ] = useState('');
  const projects = useProjects(scope);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (projects.data ?? []).filter((p) =>
      (kind === 'all' || p.kind === kind) &&
      (!status || p.status === status) &&
      (!needle || p.name.toLowerCase().includes(needle) || (p.clientName ?? '').toLowerCase().includes(needle)));
  }, [projects.data, kind, status, q]);

  const groups = useMemo(() => {
    const byClient = new Map<string, ProjectSummary[]>();
    const internal: ProjectSummary[] = [];
    const personal: ProjectSummary[] = [];
    for (const p of filtered) {
      if (p.kind === 'personal') personal.push(p);
      else if (p.kind === 'internal') internal.push(p);
      else { const name = p.clientName ?? 'No client'; byClient.set(name, [...(byClient.get(name) ?? []), p]); }
    }
    const clients = [...byClient.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return { clients, clientCount: clients.reduce((n, [, l]) => n + l.length, 0), internal, personal };
  }, [filtered]);
  const kindCounts = useMemo(() => {
    const list = projects.data ?? [];
    return { all: list.length, client: list.filter((p) => p.kind === 'client').length, internal: list.filter((p) => p.kind === 'internal').length, personal: list.filter((p) => p.kind === 'personal').length } as Record<Kind, number>;
  }, [projects.data]);
  const total = projects.data?.length ?? 0;
  const filtering = q.trim() !== '' || kind !== 'all' || status !== null;

  const header = (
    <ProjectRowHeader />
  );
  const rowActions = (p: ProjectSummary) => (scope === 'templates' && canCreate ? <UseTemplate id={p.id} /> : undefined);

  return (
    <div className="pm-page">
      <PageHeader
        title="Projects"
        subtitle={`${org.name} · ${total} ${scope === 'templates' ? (total === 1 ? 'template' : 'templates') : `${scope === 'archived' ? 'archived' : 'active'} ${total === 1 ? 'project' : 'projects'}`}`}
        actions={canCreate ? <Button variant="primary" icon="plus" onClick={() => openNewProject({ kind: kind === 'all' ? undefined : kind })}>New project</Button> : undefined}
      />

      <Tabs ariaLabel="Project lists" items={TABS} value={scope} onChange={(v) => setScope(v as ProjectScope)} />

      <div className="pm-toolbar" role="search">
        <Input wrapClassName="pm-toolbar__search" size="sm" leading={<Icon name="search" size={14} />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name or client" aria-label="Filter projects" />
        <div className="pm-toolbar__chips" role="group" aria-label="Filter by type">
          {KIND_CHIPS.map((k) => (
            <Chip key={k} selected={kind === k} onClick={() => setKind(k)}>{k === 'all' ? 'All' : KIND_META[k].label}<span className="pm-chip__count pm-num">{kindCounts[k]}</span></Chip>
          ))}
        </div>
        <span className="pm-toolbar__divider" aria-hidden="true" />
        <div className="pm-toolbar__chips" role="group" aria-label="Filter by status">
          {PROJECT_STATUSES.map((s) => (
            <Chip key={s} selected={status === s} color={PROJECT_STATUS_META[s].color} onClick={() => setStatus(status === s ? null : s)}>{PROJECT_STATUS_META[s].label}</Chip>
          ))}
        </div>
      </div>

      {projects.loading && <SkeletonRows rows={6} height={56} />}
      {projects.error && !projects.data && <ErrorState title="Couldn't load projects" message={projects.error.message} onRetry={() => void projects.refetch()} />}

      {projects.data && filtered.length === 0 && (
        filtering ? (
          <EmptyState icon="search" title="No projects match" text="Try a different search or clear the filters." action={<Button onClick={() => { setQ(''); setKind('all'); setStatus(null); }}>Clear filters</Button>} />
        ) : scope === 'active' ? (
          <EmptyState icon="folder" title="No projects yet" text="Create your first project to start planning work." action={canCreate ? <Button variant="primary" icon="plus" onClick={() => openNewProject()}>New project</Button> : undefined} />
        ) : scope === 'templates' ? (
          <EmptyState icon="copy" title="No templates yet" text="Open any project and choose “Save as template” from its menu to reuse its structure." />
        ) : (
          <EmptyState icon="archive" title="Nothing archived" text="Archived projects stay readable but leave your active lists. They appear here." />
        )
      )}

      {groups.clients.length > 0 && (
        <section className="pm-group" aria-label="Client projects">
          <h2 className="pm-group__title">Client projects<span className="pm-faint"> · {groups.clientCount}</span></h2>
          {header}
          {groups.clients.map(([client, list]) => (
            <div key={client} className="pm-group__sub">
              <h3 className="pm-group__client">{client}<span className="pm-faint"> · {list.length}</span></h3>
              <ul className="pm-plist">{list.map((p) => <ProjectRow key={p.id} p={p} actions={rowActions(p)} />)}</ul>
            </div>
          ))}
        </section>
      )}
      {groups.internal.length > 0 && (
        <section className="pm-group" aria-label={`${org.name} projects`}>
          <h2 className="pm-group__title">{org.name} projects<span className="pm-faint"> · {groups.internal.length}</span></h2>
          {groups.clients.length === 0 && header}
          <ul className="pm-plist">{groups.internal.map((p) => <ProjectRow key={p.id} p={p} actions={rowActions(p)} />)}</ul>
        </section>
      )}
      {groups.personal.length > 0 && (
        <section className="pm-group" aria-label="Personal projects">
          <h2 className="pm-group__title"><Icon name="lock" size={13} /> Personal<span className="pm-faint"> · {groups.personal.length} · only you can see these</span></h2>
          {groups.clients.length === 0 && groups.internal.length === 0 && header}
          <ul className="pm-plist">{groups.personal.map((p) => <ProjectRow key={p.id} p={p} actions={rowActions(p)} />)}</ul>
        </section>
      )}    </div>
  );
}

function UseTemplate({ id }: { id: string }) {
  const { openNewProject } = useShell();
  return <Button size="sm" onClick={() => openNewProject({ templateId: id })}>Use template</Button>;
}

export function ProjectRowHeader() {
  return (
    <div className="pm-prow pm-prow--head" aria-hidden="true">
      <div>Project</div><div>Status</div><div>Owner</div><div>Due</div><div>Progress</div><div>Tasks</div>
    </div>
  );
}
