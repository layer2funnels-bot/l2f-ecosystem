import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Priority, ProjectLink } from '../../shared/api.ts';
import { PRIORITIES } from '../../shared/api.ts';
import { call } from '../api/client.ts';
import { invalidate, invalidateWork, useMutation } from '../api/store.ts';
import { useProject, useProjects } from '../lib/data.ts';
import { MAX_ASSIGNEES, useAssignable } from '../lib/people.ts';
import { kindCaption } from '../lib/projectKind.ts';
import { useSession } from '../lib/session.tsx';
import { lsGet, lsSet, PRIORITY_META } from '../lib/util.ts';
import { links, navigate, openTask, parseHash } from '../router.ts';
import { ProjectFormModal } from '../pages/projects/ProjectFormModal.tsx';
import { Button } from '../ui/Button.tsx';
import { Modal } from '../ui/Dialog.tsx';
import { DatePicker } from '../ui/DatePicker.tsx';
import { Field, Input } from '../ui/Form.tsx';
import { Icon } from '../ui/icons.tsx';
import { Menu } from '../ui/Menu.tsx';
import type { MenuItem, SelectOption } from '../ui/Menu.tsx';
import { Select } from '../ui/Menu.tsx';
import { PeoplePicker } from '../ui/PeoplePicker.tsx';
import { Tabs } from '../ui/Tabs.tsx';
import { toast } from '../ui/Toast.tsx';
import { isMac } from './shortcuts.ts';
import { realTarget } from '../lib/dom.ts';

const lastKey = (orgId: string) => `pm.quickadd.project.${orgId}`;
type Tab = 'task' | 'project' | 'link';
type Mode = 'create' | 'open' | 'another';
const LINK_KINDS: SelectOption<ProjectLink['kind']>[] = [
  { value: 'doc', label: 'Doc' }, { value: 'whiteboard', label: 'Whiteboard' }, { value: 'link', label: 'Link' },
];
const MOD_ENTER = isMac ? '⌘ Enter' : 'Ctrl+Enter';

/** "Quick create": Task, Project (hands over to the New project form) and Doc link. Usable from any page. */
export function QuickAddTask({ open, onClose, presetProjectId }: { open: boolean; onClose: () => void; presetProjectId?: string }) {
  const { user, org, canCreate } = useSession();
  const projects = useProjects('active', open);
  const [tab, setTab] = useState<Tab>('task');
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [assigneeTouched, setAssigneeTouched] = useState(false);
  const [dueOn, setDueOn] = useState<string | null>(null);
  const [priority, setPriority] = useState<Priority>('none');
  const [touched, setTouched] = useState(false);
  const [linkKind, setLinkKind] = useState<ProjectLink['kind']>('doc');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTouched, setLinkTouched] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const eligible = useMemo(() => (projects.data ?? []).filter((p) => p.myRole !== 'viewer'), [projects.data]);
  const detail = useProject(projectId || null);
  const project = detail.data && detail.data.id === projectId ? detail.data : null;

  // Pick the starting project once the list is here: preset, then the project on screen, then the last used.
  useEffect(() => {
    if (projectId || !projects.data) return;
    const current = parseHash(window.location.hash).projectId;
    const remembered = lsGet(lastKey(org.id));
    const pick = [presetProjectId, current, remembered].find((id) => id && eligible.some((p) => p.id === id)) ?? eligible[0]?.id ?? '';
    if (pick) setProjectId(pick);
  }, [projects.data, eligible, projectId, presetProjectId, org.id]);

  // Default the assignee to me whenever I am a member of the chosen project.
  useEffect(() => { setSectionId(''); }, [projectId]);
  useEffect(() => {
    if (!project || assigneeTouched) return;
    setAssigneeIds(project.members.some((m) => m.id === user.id) ? [user.id] : []);
  }, [project, assigneeTouched, user.id]);

  const projectOptions = useMemo<SelectOption<string>[]>(() => eligible.map((p) => ({
    value: p.id, label: p.name, hint: <span className="pm-faint">{kindCaption(p)}</span>,
    leading: <span className="pm-dot pm-dot--lg" style={{ background: p.color }} />,
  })), [eligible]);
  const sectionOptions = useMemo<SelectOption<string>[]>(() => [
    { value: '', label: 'No section' },
    ...[...(project?.sections ?? [])].sort((a, b) => a.position - b.position).map((s) => ({ value: s.id, label: s.name })),
  ], [project]);
  const priorityOptions = useMemo<SelectOption<Priority>[]>(() => PRIORITIES.map((p) => ({
    value: p, label: PRIORITY_META[p].label, leading: <Icon name="flag" size={13} style={{ color: PRIORITY_META[p].color }} />,
  })), []);
  const people = useAssignable(project ?? undefined);

  const create = useMutation(
    () => call('tasks.create', { projectId, title: title.trim(), sectionId: sectionId || null, assigneeIds, dueOn, priority }),
    { invalidate: [] },
  );
  const addLink = useMutation(
    (arg: { url: string }) => call('links.add', { projectId, kind: linkKind, title: linkTitle.trim(), url: arg.url }),
    { invalidate: [] },
  );

  const titleError = touched && !title.trim() ? 'Give the task a title.' : null;
  const submit = async (mode: Mode) => {
    setTouched(true);
    if (!title.trim() || !projectId) return;
    const row = await create.mutate(undefined);
    if (!row) return;
    invalidateWork();
    lsSet(lastKey(org.id), projectId);
    const name = project?.name ?? row.projectName;
    const openIt = () => { if (parseHash(window.location.hash).projectId === row.projectId) openTask(row.id); else navigate(links.project(row.projectId, null, row.id)); };
    if (mode === 'open') {
      toast.success(`Added “${row.title}” to ${name}`);
      onClose();
      openIt();
      return;
    }
    toast.success(`Added “${row.title}” to ${name}`, { action: { label: 'Open', onClick: openIt } });
    if (mode === 'another') {
      setTitle('');
      setTouched(false);
      titleRef.current?.focus();
    } else onClose();
  };

  const linkUrlNormalized = (() => {
    const raw = linkUrl.trim();
    return raw && !/^[a-z][a-z0-9+.-]*:/i.test(raw) ? `https://${raw}` : raw;
  })();
  const linkTitleError = linkTouched && !linkTitle.trim() ? 'Give the link a title.' : null;
  const linkUrlError = linkTouched && !linkUrl.trim() ? 'Paste the web address.' : linkUrl.trim() && !/^https?:\/\/[^\s]+$/i.test(linkUrlNormalized) ? 'Use a web address that starts with https://' : null;
  const submitLink = async () => {
    setLinkTouched(true);
    if (!projectId || !linkTitle.trim() || !linkUrl.trim() || !/^https?:\/\/[^\s]+$/i.test(linkUrlNormalized)) return;
    const row = await addLink.mutate({ url: linkUrlNormalized });
    if (!row) return;
    invalidate('project');
    lsSet(lastKey(org.id), projectId);
    const name = project?.name ?? 'the project';
    toast.success(`Added “${row.title}” to ${name}`, { action: { label: 'Open', onClick: () => navigate(links.project(projectId, 'docs')) } });
    onClose();
  };

  // Ctrl/Cmd+Enter = create & open (task) or add (link), from anywhere inside this window.
  const act = useRef({ tab, submit, submitLink });
  act.current = { tab, submit, submitLink };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.defaultPrevented) return;
      if (!(realTarget(e) as HTMLElement | null)?.closest?.('.pm-quickadd')) return;
      e.preventDefault();
      if (act.current.tab === 'task') void act.current.submit('open'); else if (act.current.tab === 'link') void act.current.submitLink();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const noProjects = !!projects.data && eligible.length === 0;
  const busy = create.loading || addLink.loading;
  const tabsEl = (
    <Tabs
      ariaLabel="What do you want to create?"
      value={tab}
      onChange={(t) => setTab(t as Tab)}
      className="pm-quickadd__tabs"
      items={[
        { id: 'task', label: 'Task', icon: 'taskAdd' },
        ...(canCreate ? [{ id: 'project', label: 'Project', icon: 'folderPlus' as const }] : []),
        { id: 'link', label: 'Doc link', icon: 'link' },
      ]}
    />
  );

  // The Project tab hands over to the regular New project form (same component, same logic), keeping the tab strip.
  if (tab === 'project' && canCreate) return <ProjectFormModal open onClose={onClose} tabs={tabsEl} />;

  const splitItems: MenuItem[] = [
    { id: 'open', icon: 'external', label: 'Create & open', hint: <span className="pm-faint">{MOD_ENTER}</span>, disabled: busy || noProjects, onSelect: () => void submit('open') },
    { id: 'another', icon: 'plus', label: 'Create & add another', disabled: busy || noProjects, onSelect: () => void submit('another') },
  ];

  const projectField = noProjects ? (
    <p className="pm-muted" role="status">{canCreate
      ? 'You don’t have a project you can add tasks to yet. Create a project first.'
      : `You have view-only access in ${org.name}, so you can’t add tasks. Ask an admin for editor access to a project.`}</p>
  ) : null;
  const projectPicker = (
    <Field label="Project">
      {projects.loading && !projects.data
        ? <span className="pm-skeleton" style={{ height: 32, borderRadius: 8, display: 'block' }} aria-hidden="true" />
        : <Select value={projectId || null} options={projectOptions} onChange={(v) => { setProjectId(v); setAssigneeTouched(false); }} ariaLabel="Project" searchable placeholder="Choose a project" />}
    </Field>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Quick create"
      description="Add a task or a project link without leaving this page."
      className="pm-quickadd"
      dismissible={!title.trim() && !linkTitle.trim() && !linkUrl.trim()}
      onSubmit={(e: FormEvent) => { e.preventDefault(); if (tab === 'task') void submit('create'); else void submitLink(); }}
      footer={tab === 'task' ? (
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <div className="pm-split" role="group" aria-label="Create task">
            <Button type="submit" variant="primary" loading={create.loading} disabled={noProjects || busy} className="pm-split__main" title="Create task (Enter)">Create task</Button>
            <Menu
              items={splitItems}
              align="end"
              label="More ways to create"
              trigger={(t) => (
                <Button {...t} variant="primary" icon="chevronDown" className="pm-split__caret" disabled={noProjects || busy} aria-label="More ways to create" title="More ways to create" />
              )}
            />
          </div>
        </>
      ) : (
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" loading={addLink.loading} disabled={noProjects} title={`Add link (Enter or ${MOD_ENTER})`}>Add link</Button>
        </>
      )}
    >
      <div className="pm-form">
        {tabsEl}
        {tab === 'task' ? (
          <>
            <Field label="Title" required error={titleError}>
              <Input ref={titleRef} data-autofocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" invalid={!!titleError} maxLength={300} autoComplete="off" />
            </Field>
            {projectField ?? (
              <>
                <div className="pm-form__row">
                  {projectPicker}
                  <Field label="Section">
                    <Select value={sectionId} options={sectionOptions} onChange={setSectionId} ariaLabel="Section" disabled={!project} />
                  </Field>
                </div>
                <div className="pm-form__row">
                  <Field label="Assignees">
                    <PeoplePicker people={people} value={assigneeIds} max={MAX_ASSIGNEES} placeholder="Unassigned" onChange={(ids) => { setAssigneeIds(ids); setAssigneeTouched(true); }} ariaLabel="Assignees" title="Assign people" />
                  </Field>
                  <Field label="Priority">
                    <Select value={priority} options={priorityOptions} onChange={setPriority} ariaLabel="Priority" />
                  </Field>
                </div>
                <Field label="Due date">
                  <DatePicker value={dueOn} onChange={setDueOn} ariaLabel="Due date" placeholder="No due date" />
                </Field>
              </>
            )}
          </>
        ) : (
          <>
            {projectField ?? (
              <>
                <div className="pm-form__row">
                  {projectPicker}
                  <Field label="Type">
                    <Select<ProjectLink['kind']> value={linkKind} options={LINK_KINDS} onChange={setLinkKind} ariaLabel="Link type" />
                  </Field>
                </div>
                <Field label="Title" required error={linkTitleError}>
                  <Input data-autofocus value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="e.g. Kickoff brief" invalid={!!linkTitleError} maxLength={200} autoComplete="off" />
                </Field>
                <Field label="Web address" required error={linkUrlError} hint="Shown on the project’s Docs & links page.">
                  <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://docs.example.com/brief" invalid={!!linkUrlError} maxLength={2000} inputMode="url" autoComplete="off" spellCheck={false} />
                </Field>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
