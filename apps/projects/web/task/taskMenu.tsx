// The right-click menu of a task. One builder serves every surface (List row, Board card, Calendar chip, Timeline bar,
// My Work, drawer subtasks, search results), so they can never disagree. It loads the project (members, sections) and tags on demand.
import type { BulkTaskPatch, OrgMember, Person, Priority, ProjectDetail, Tag, TaskRow, TaskStatus } from '../../shared/api.ts';
import { PRIORITIES, TASK_STATUSES } from '../../shared/api.ts';
import { call } from '../api/client.ts';
import { invalidateWork, onInvalidate, setQueryData } from '../api/store.ts';
import { absoluteLink, copyText, openInNewTab } from '../lib/clipboard.ts';
import { getMe } from '../lib/me.ts';
import { addDays, fmtDate, PRIORITY_META, startOfWeek, TASK_STATUS_META, todayYmd } from '../lib/util.ts';
import { assignablePeople } from '../lib/people.ts';
import { applyPatch, sendTaskPatch } from '../pages/project/views/taskViewShared.tsx';
import { links, openTask, parseHash } from '../router.ts';
import { Avatar } from '../ui/Badges.tsx';
import { contextMenuProps } from '../ui/ContextMenu.tsx';
import type { CtxItem } from '../ui/ContextMenu.tsx';
import { Icon } from '../ui/icons.tsx';
import { askForm } from '../ui/Prompt.tsx';
import { toast } from '../ui/Toast.tsx';
import { hostOf, normalizeUrl } from './links.ts';
import { requestTitleEdit } from './panelNav.ts';

// ---------- small on-demand caches ----------
const TTL = 15_000;
const projects = new Map<string, { at: number; data: ProjectDetail }>();
let tagCache: { at: number; data: Tag[] } | null = null;
let peopleCache: { at: number; data: OrgMember[] } | null = null;
const fresh = (at: number) => Date.now() - at < TTL;
export function rememberProject(p: ProjectDetail): void { projects.set(p.id, { at: Date.now(), data: p }); }
async function loadProject(id: string): Promise<ProjectDetail> {
  const hit = projects.get(id);
  if (hit && fresh(hit.at)) return hit.data;
  const data = await call('projects.get', { id });
  projects.set(id, { at: Date.now(), data });
  return data;
}
async function loadTags(): Promise<Tag[]> {
  if (tagCache && fresh(tagCache.at)) return tagCache.data;
  const data = await call('tags.list', {});
  tagCache = { at: Date.now(), data };
  return data;
}
async function loadPeople(): Promise<OrgMember[]> {
  if (peopleCache && fresh(peopleCache.at)) return peopleCache.data;
  const data = await call('people.list', {});
  peopleCache = { at: Date.now(), data };
  return data;
}
export function clearMenuCache(): void { projects.clear(); tagCache = null; peopleCache = null; }
onInvalidate((prefixes) => {
  if (prefixes.some((p) => 'project'.startsWith(p) || p.startsWith('project'))) projects.clear();
  if (prefixes.some((p) => p.startsWith('tag'))) tagCache = null;
  if (prefixes.some((p) => p.startsWith('people'))) peopleCache = null;
});

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');
const short = (s: string) => (s.length > 40 ? `${s.slice(0, 39)}…` : s);

// ---------- writes ----------
export async function patchTasks(targets: TaskRow[], patch: BulkTaskPatch, members: Person[], okMessage?: string): Promise<boolean> {
  const ids = targets.map((t) => t.id);
  const byProject = new Map<string, string[]>();
  for (const t of targets) byProject.set(t.projectId, [...(byProject.get(t.projectId) ?? []), t.id]);
  const undos = [...byProject].map(([pid, list]) => {
    const set = new Set(list);
    return setQueryData<TaskRow[]>(`tasks:${pid}`, (old) => old.map((t) => (set.has(t.id) ? applyPatch(t, patch, members) : t)));
  });
  try {
    await sendTaskPatch(ids, patch);
    invalidateWork();
    if (okMessage) toast.success(okMessage);
    return true;
  } catch (e) {
    for (const u of undos) u();
    invalidateWork();
    toast.error(errText(e));
    return false;
  }
}

export async function trashTasks(targets: TaskRow[]): Promise<boolean> {
  const ids = targets.map((t) => t.id);
  const gone = new Set(ids);
  const undos = [...new Set(targets.map((t) => t.projectId))].map((pid) =>
    setQueryData<TaskRow[]>(`tasks:${pid}`, (old) => old.filter((t) => !gone.has(t.id) && !(t.parentId && gone.has(t.parentId)))));
  try {
    await call('tasks.trash', { ids });
    invalidateWork();
    toast.success(ids.length === 1 ? `Moved “${short(targets[0].title)}” to trash` : `Moved ${ids.length} tasks to trash`, {
      action: { label: 'Undo', onClick: () => void call('tasks.restore', { ids }).then(() => invalidateWork()).catch((e) => toast.error(errText(e))) },
    });
    return true;
  } catch (e) {
    for (const u of undos) u();
    invalidateWork();
    toast.error(errText(e));
    return false;
  }
}

/** "Follow up: <title>" in the same project and section, same assignees, due in 7 days, waiting on the original. Opens it for naming. */
export async function createFollowUp(t: Pick<TaskRow, 'id' | 'projectId' | 'title' | 'sectionId' | 'assignees' | 'dueOn'>): Promise<void> {
  try {
    const row = await call('tasks.create', {
      projectId: t.projectId,
      title: `Follow up: ${t.title}`.slice(0, 300),
      sectionId: t.sectionId ?? null,
      assigneeIds: t.assignees.map((a) => a.id),
      dueOn: t.dueOn ? addDays(todayYmd(), 7) : null,
    });
    await call('deps.add', { taskId: row.id, dependsOnId: t.id });
    invalidateWork();
    requestTitleEdit(row.id);
    openTask(row.id);
    toast.success('Follow-up task created');
  } catch (e) {
    invalidateWork();
    toast.error(errText(e));
  }
}

export async function addTaskLink(taskId: string, existing?: { id: string; title: string; url: string }): Promise<boolean> {
  const r = await askForm({
    title: existing ? 'Edit link' : 'Add link',
    fields: [
      { name: 'url', label: 'URL', initial: existing?.url ?? '', placeholder: 'example.com/page', required: true, maxLength: 2000 },
      { name: 'title', label: 'Title (optional)', initial: existing?.title ?? '', placeholder: 'Defaults to the site name', maxLength: 200 },
    ],
    confirmLabel: existing ? 'Save' : 'Add link',
    validate: (v) => { const n = normalizeUrl(v.url); return n.ok ? null : n.error; },
  });
  if (!r) return false;
  const n = normalizeUrl(r.url);
  if (!n.ok) return false;
  const title = r.title || hostOf(n.url);
  try {
    if (existing) await call('links.task.update', { id: existing.id, title, url: n.url });
    else await call('links.task.add', { taskId, title, url: n.url });
    invalidateWork();
    toast.success(existing ? 'Link updated' : 'Link added');
    return true;
  } catch (e) {
    toast.error(errText(e));
    return false;
  }
}

// ---------- the menu ----------
export interface TaskMenuOpts {
  /** The rows selected in the List. The menu acts on all of them when the clicked task is one of them. */
  selection?: TaskRow[];
  /** Pass the project when the surface already has it (skips a fetch). */
  project?: ProjectDetail;
  /** Adds a "Rename" item (inline rename on that surface). */
  onRename?: () => void;
}

function buildItems(task: TaskRow, sel: TaskRow[] | null, project: ProjectDetail, tags: Tag[], org: OrgMember[], opts: TaskMenuOpts): CtxItem[] {
  const targets = sel ?? [task];
  const n = targets.length;
  const multi = n > 1;
  const canEdit = project.myRole !== 'viewer' && !project.deletedAt && !targets.some((t) => t.deletedAt);
  const me = getMe();
  // Who can be assigned here (same rule as the server), plus anyone already assigned to the selected tasks.
  const members = assignablePeople(project, org, targets.flatMap((t) => t.assignees));
  const patch = (p: BulkTaskPatch, msg?: string) => void patchTasks(targets, p, members, msg);
  const sameAll = <T,>(get: (t: TaskRow) => T) => targets.every((t) => get(t) === get(targets[0]));
  const view = (() => { const r = parseHash(window.location.hash); return r.projectId === task.projectId && r.view ? r.view : 'list'; })();
  const today = todayYmd();
  const dateItem = (id: string, label: string, ymd: string): CtxItem => ({ id, label, shortcut: fmtDate(ymd), checked: sameAll((t) => t.dueOn) && targets[0].dueOn === ymd, onSelect: () => patch({ dueOn: ymd }) });

  const items: CtxItem[] = [];
  if (multi) items.push({ id: 'count', heading: true, label: `${n} tasks selected` });
  if (!multi) {
    items.push({ id: 'open', icon: 'external', label: 'Open', shortcut: 'Enter', onSelect: () => openTask(task.id) });
    items.push({ id: 'newtab', icon: 'arrowRight', label: 'Open in new tab', onSelect: () => openInNewTab(links.project(task.projectId, view, task.id)) });
  }

  if (canEdit) {
    const tagSets = new Map<string, Set<string>>(targets.map((t) => [t.id, new Set(t.tags.map((g) => g.id))]));
    // Assignee toggles keep the menu open, so the current state is tracked here (the check marks flip on their own).
    const whoSets = new Map<string, Set<string>>(targets.map((t) => [t.id, new Set(t.assignees.map((a) => a.id))]));
    const everyoneHas = (id: string) => targets.every((t) => whoSets.get(t.id)?.has(id));
    const toggleWho = (id: string) => {
      const add = !everyoneHas(id);
      for (const t of targets) { const s = whoSets.get(t.id)!; if (add) s.add(id); else s.delete(id); }
      void patchTasks(targets, add ? { addAssigneeIds: [id] } : { removeAssigneeIds: [id] }, members).then((ok) => {
        if (!ok) for (const t of targets) { const s = whoSets.get(t.id)!; if (add) s.delete(id); else s.add(id); }
      });
    };
    const ordered = [...members].sort((a, b) => (a.id === me?.id ? -1 : b.id === me?.id ? 1 : a.name.localeCompare(b.name)));
    items.push(
      {
        id: 'status', icon: 'checkCircle', label: 'Status', separatorBefore: true,
        children: TASK_STATUSES.map((s: TaskStatus) => ({
          id: s, label: TASK_STATUS_META[s].label, leading: <span className="pm-dot" style={{ background: TASK_STATUS_META[s].color }} />,
          checked: sameAll((t) => t.status) && targets[0].status === s, onSelect: () => patch({ status: s }),
        })),
      },
      {
        id: 'priority', icon: 'flag', label: 'Priority',
        children: [...PRIORITIES].reverse().map((p: Priority) => ({
          id: p, label: PRIORITY_META[p].label, leading: <Icon name="flag" size={14} style={{ color: PRIORITY_META[p].color }} />,
          checked: sameAll((t) => t.priority) && targets[0].priority === p, onSelect: () => patch({ priority: p }),
        })),
      },
      {
        id: 'assignee', icon: 'user', label: 'Assignees', searchable: true, searchPlaceholder: 'Search people…',
        children: [
          { id: '__none', label: 'Unassign everyone', icon: 'x', disabled: targets.every((t) => t.assignees.length === 0), disabledReason: 'Nobody is assigned', onSelect: () => patch({ assigneeIds: [] }, 'Unassigned') },
          ...ordered.map((m): CtxItem => ({
            id: m.id, label: m.id === me?.id ? `${m.name} (you)` : m.name, text: `${m.name} ${m.email}`, leading: <Avatar person={m} size={18} />,
            keepOpen: true, checked: everyoneHas(m.id), onSelect: () => toggleWho(m.id),
          })),
        ],
      },
      {
        id: 'due', icon: 'calendar', label: 'Due date',
        children: [
          dateItem('today', 'Today', today),
          dateItem('tomorrow', 'Tomorrow', addDays(today, 1)),
          dateItem('nextweek', 'Next week', addDays(startOfWeek(today), 7)),
          {
            id: 'pick', label: 'Pick date…', icon: 'calendar',
            onSelect: () => void askForm({ title: 'Due date', fields: [{ name: 'd', label: 'Due date', type: 'date', initial: targets[0].dueOn ?? '', required: true }], confirmLabel: 'Set due date' })
              .then((r) => { if (r?.d) patch({ dueOn: r.d }); }),
          },
          { id: 'clear', label: 'Clear due date', icon: 'x', separatorBefore: true, disabled: targets.every((t) => !t.dueOn), disabledReason: 'No due date', onSelect: () => patch({ dueOn: null }, 'Due date cleared') },
        ],
      },
      {
        id: 'section', icon: 'folder', label: 'Section',
        children: [
          { id: '__none', label: 'No section', checked: sameAll((t) => t.sectionId ?? null) && !targets[0].sectionId, onSelect: () => patch({ sectionId: null }) },
          ...[...project.sections].sort((a, b) => a.position - b.position).map((s): CtxItem => ({ id: s.id, label: s.name, checked: sameAll((t) => t.sectionId) && targets[0].sectionId === s.id, onSelect: () => patch({ sectionId: s.id }) })),
        ],
      },
      {
        id: 'tags', icon: 'filter', label: 'Tags',
        children: tags.length === 0 ? [{ id: '__empty', label: 'No tags in this organization yet', disabled: true }] : tags.map((g): CtxItem => {
          const allHave = () => targets.every((t) => tagSets.get(t.id)?.has(g.id));
          return {
            id: g.id, label: g.name, leading: <span className="pm-dot" style={{ background: g.color }} />, keepOpen: true, checked: allHave(),
            onSelect: () => {
              const add = !allHave();
              void (async () => {
                try {
                  for (const t of targets) {
                    const set = tagSets.get(t.id) ?? new Set<string>();
                    if (add) set.add(g.id); else set.delete(g.id);
                    tagSets.set(t.id, set);
                    await call('tasks.setTags', { id: t.id, tagIds: [...set] });
                  }
                  invalidateWork();
                } catch (e) { toast.error(errText(e)); invalidateWork(); }
              })();
            },
          };
        }),
      },
    );

    const quick = project.fields.filter((f) => f.type === 'select' || f.type === 'checkbox');
    if (quick.length) {
      items.push({
        id: 'fields', icon: 'filter', label: 'Fields',
        children: quick.map((f): CtxItem => (f.type === 'checkbox'
          ? { id: f.id, label: f.name, checked: targets.every((t) => t.fields[f.id] === true), onSelect: () => patch({ fields: { [f.id]: targets.every((t) => t.fields[f.id] === true) ? null : true } }) }
          : { id: f.id, label: f.name, children: [
            ...f.options.map((o): CtxItem => ({ id: o.id, label: o.label, leading: <span className="pm-dot" style={{ background: o.color }} />, checked: targets.every((t) => t.fields[f.id] === o.id), onSelect: () => patch({ fields: { [f.id]: o.id } }) })),
            { id: '__clear', label: 'Clear', icon: 'x', separatorBefore: f.options.length > 0, disabled: targets.every((t) => t.fields[f.id] === undefined), disabledReason: 'Not set', onSelect: () => patch({ fields: { [f.id]: null } }) },
          ] })),
      });
    }

    const allDone = targets.every((t) => t.status === 'done');
    items.push({
      id: 'complete', icon: 'checkCircle', label: allDone ? 'Reopen' : 'Mark complete', shortcut: 'Ctrl+Enter', separatorBefore: true,
      onSelect: () => {
        const prev = targets.map((t) => ({ t, s: t.status }));
        void patchTasks(targets, { status: allDone ? 'todo' : 'done' }, members).then((ok) => {
          if (ok && !allDone) toast.success(multi ? `Completed ${n} tasks` : `Completed “${short(task.title)}”`, {
            action: { label: 'Undo', onClick: () => { for (const p of prev) void patchTasks([p.t], { status: p.s }, members); } },
          });
        });
      },
    });
    if (!multi) {
      if (opts.onRename) items.push({ id: 'rename', icon: 'edit', label: 'Rename', onSelect: opts.onRename });
      if (!task.parentId) {
        items.push({
          id: 'subtask', icon: 'plus', label: 'Add subtask…',
          onSelect: () => void askForm({ title: 'Add subtask', description: `Under “${short(task.title)}”`, fields: [{ name: 'title', label: 'Title', required: true, maxLength: 300 }], confirmLabel: 'Add subtask' }).then(async (r) => {
            if (!r) return;
            try { await call('tasks.create', { projectId: task.projectId, parentId: task.id, title: r.title }); invalidateWork(); toast.success('Subtask added'); } catch (e) { toast.error(errText(e)); }
          }),
        });
      }
      items.push(
        { id: 'link', icon: 'link', label: 'Add link…', onSelect: () => void addTaskLink(task.id) },
        { id: 'followup', icon: 'taskAdd', label: 'Create follow-up task', onSelect: () => void createFollowUp(task) },
        { id: 'dup', icon: 'copy', label: 'Duplicate', onSelect: () => void call('tasks.duplicate', { id: task.id }).then(() => { invalidateWork(); toast.success('Task duplicated'); }).catch((e) => toast.error(errText(e))) },
      );
    }
  }

  if (!multi) {
    items.push(
      { id: 'copylink', icon: 'link', label: 'Copy link', shortcut: 'Shift+L', separatorBefore: true, onSelect: () => void copyText(absoluteLink(links.project(task.projectId, view, task.id)), 'Link copied') },
      { id: 'copyid', icon: 'copy', label: `Copy task ID (#${task.number})`, onSelect: () => void copyText(`#${task.number}`, `Copied #${task.number}`) },
    );
  }
  if (canEdit) {
    items.push({ id: 'trash', icon: 'trash', label: 'Move to trash', danger: true, separatorBefore: true, onSelect: () => void trashTasks(targets) });
  }
  return items;
}

/** Items for one task, synchronously when the project is already known, otherwise after loading it. */
export function taskMenuItems(task: TaskRow, opts: TaskMenuOpts = {}): CtxItem[] | Promise<CtxItem[]> {
  const sel = opts.selection && opts.selection.length > 1 && opts.selection.some((s) => s.id === task.id) ? opts.selection : null;
  if (opts.project) rememberProject(opts.project);
  const hit = opts.project ?? (projects.get(task.projectId) && fresh(projects.get(task.projectId)!.at) ? projects.get(task.projectId)!.data : null);
  if (hit && tagCache && fresh(tagCache.at) && peopleCache && fresh(peopleCache.at)) return buildItems(task, sel, hit, tagCache.data, peopleCache.data, opts);
  return Promise.all([hit ?? loadProject(task.projectId), loadTags(), loadPeople()]).then(([p, g, o]) => buildItems(task, sel, p, g, o, opts));
}

/** Spread on any element that stands for a task. */
export function taskMenuProps(task: TaskRow, opts: TaskMenuOpts = {}) {
  return contextMenuProps(() => taskMenuItems(task, opts), { label: `Actions for ${task.title}` });
}
