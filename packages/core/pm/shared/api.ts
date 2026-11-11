// The single API contract between the web app and the server (and, later, the ecosystem's /api/ layer).
// Transport: POST /api/<op> with JSON body = args; headers `authorization: Bearer <token>` and `x-org-id: <uuid>`.
// Success: 200 { data }. Failure: 4xx/5xx { error: { code, message, field? } }.
// All dates are 'YYYY-MM-DD' strings; all timestamps ISO strings. Ids are UUIDs. Field names are camelCase.

export type OrgRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type ProjectRole = 'manager' | 'editor' | 'viewer';
export type ProjectStatus = 'on_track' | 'at_risk' | 'off_track' | 'on_hold' | 'complete';
export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done';
export type Priority = 'none' | 'low' | 'medium' | 'high' | 'urgent';
export type RepeatRule = 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
export type ViewKind = 'overview' | 'list' | 'board' | 'calendar' | 'timeline';
export type ProjectScope = 'active' | 'archived' | 'trash' | 'templates';
export type ErrorCode = 'unauthenticated' | 'forbidden' | 'not_found' | 'invalid' | 'conflict' | 'internal';

export const TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'blocked', 'done'];
export const PRIORITIES: Priority[] = ['none', 'low', 'medium', 'high', 'urgent'];
export const PROJECT_STATUSES: ProjectStatus[] = ['on_track', 'at_risk', 'off_track', 'on_hold', 'complete'];

export interface Person { id: string; name: string; email: string; color: string }
export interface OrgMember extends Person { role: OrgRole }
export interface Org { id: string; name: string; slug: string; role: OrgRole }
export interface Client { id: string; name: string }
export interface Tag { id: string; name: string; color: string }

export interface ProjectStats {
  total: number; done: number; open: number; overdue: number; blocked: number;
  progress: number;            // 0..100, done / total top-level tasks (0 when total = 0)
  nextDueOn: string | null;    // earliest due date among open tasks
}
// client: has a client · internal: organization work, no client · personal: private to its owner (nobody else, not even admins)
export type ProjectKind = 'client' | 'internal' | 'personal';
export interface ProjectSummary {
  id: string; name: string; color: string; status: ProjectStatus; description: string; kind: ProjectKind;
  clientId: string | null; clientName: string | null;
  owner: Person | null; startOn: string | null; dueOn: string | null;
  visibility: 'members' | 'organization'; isTemplate: boolean; defaultView: ViewKind;
  archivedAt: string | null; deletedAt: string | null; updatedAt: string;
  myRole: ProjectRole; stats: ProjectStats;
}
export interface ProjectMember extends Person { role: ProjectRole }
export interface Section { id: string; name: string; position: number }
export type ProjectLinkKind = 'doc' | 'whiteboard' | 'sheet' | 'link';
export interface ProjectLink { id: string; kind: ProjectLinkKind; title: string; url: string; createdAt: string; /** Name of the person who added it (project details only). */ addedBy?: string | null }

// ---- custom fields for tasks (project-scoped; server/ops/fields.ts) ----
export type FieldType = 'text' | 'number' | 'currency' | 'select' | 'multiselect' | 'date' | 'checkbox' | 'url';
export const FIELD_TYPES: FieldType[] = ['text', 'number', 'currency', 'select', 'multiselect', 'date', 'checkbox', 'url'];
export interface FieldOption { id: string; label: string; color: string }
/** text, url: string · number, currency: number · select: option id · multiselect: option ids · date: 'YYYY-MM-DD' · checkbox: boolean. */
export type FieldValue = string | number | boolean | string[];
export interface CustomField {
  id: string; projectId: string; name: string; type: FieldType;
  /** select / multiselect only (max 50), in display order; [] for other types. */
  options: FieldOption[];
  /** currency only: ISO 4217 code such as 'USD'. */
  currency: string | null;
  /** number only: 0..4 decimals. */
  decimals: number | null;
  position: number; archivedAt: string | null;
}
/** Options sent to fields.create / fields.update: an option with an existing id keeps it (rename / recolor), one without an id is new. */
export interface FieldOptionInput { id?: string; label: string; color?: string }
export const FIELD_OP_LABEL = { is: 'is', is_not: 'is not', contains: 'contains', gt: 'greater than', lt: 'less than', is_set: 'is set', is_empty: 'is empty' } as const;
export type FieldFilterOp = keyof typeof FIELD_OP_LABEL;
/**
 * Filters on custom fields. Applied in the List and Board from the data tasks.list already returned (TaskRow.fields holds every
 * value of the project, so nothing is missing and no extra request is needed). All filters must match.
 */
export interface FieldFilter { fieldId: string; op: FieldFilterOp; value?: FieldValue }

export interface ProjectDetail extends ProjectSummary { members: ProjectMember[]; sections: Section[]; links: ProjectLink[]; /** Active custom fields in display order. */ fields: CustomField[] }

export interface TaskRow {
  id: string; projectId: string; projectName: string; projectColor: string;
  number: number; sectionId: string | null; parentId: string | null;
  title: string; status: TaskStatus; priority: Priority;
  /** Everyone responsible for the task (0..20), sorted by name. */
  assignees: Person[]; startOn: string | null; dueOn: string | null;
  estimateMinutes: number | null; repeatRule: RepeatRule | null; position: number;
  completedAt: string | null; deletedAt: string | null; version: number; updatedAt: string; createdAt: string;
  tags: Tag[];
  /** Values of the project's active custom fields, by field id (only fields that have a value). */
  fields: Record<string, FieldValue>;
  counts: { subtasks: number; subtasksDone: number; checklist: number; checklistDone: number; files: number; links: number; comments: number; waitingOn: number };
}
export interface ChecklistItem { id: string; label: string; done: boolean; position: number }
export interface TaskRef { id: string; number: number; title: string; status: TaskStatus }
export interface Comment { id: string; author: Person; body: string; mentions: string[]; createdAt: string; editedAt: string | null; mine: boolean }
/** A Drive file linked to a task. kind 'document' opens in Docs/Sheets/Whiteboard. */
export interface Attachment { id: string; fileId: string; kind: string; name: string; mime: string; sizeBytes: number; uploadedBy: Person; createdAt: string }
export interface TaskLink { id: string; title: string; url: string; createdBy: Person | null; createdAt: string }
export interface TimeEntry { id: string; user: Person; startedAt: string; endedAt: string | null; minutes: number; note: string; billable: boolean; mine: boolean }
export interface ActivityItem { id: number; actor: Person | null; kind: string; data: Record<string, unknown>; createdAt: string }
export interface TaskDetail extends TaskRow {
  description: string; createdBy: Person | null;
  subtasks: TaskRow[]; checklist: ChecklistItem[];
  waitingOn: TaskRef[]; blocking: TaskRef[];
  comments: Comment[]; attachments: Attachment[]; links: TaskLink[]; time: TimeEntry[]; totalMinutes: number;
  activity: ActivityItem[]; followers: Person[]; following: boolean;
  myRole: ProjectRole;
}
/** One stretch of time a task spent in a status. `to` is null for the current (open-ended) stretch; `by` is who moved it into the status. */
export interface StatusSpan { status: TaskStatus; from: string; to: string | null; by: Person | null }
export interface RunningTimer { entryId: string; taskId: string; taskTitle: string; projectId: string; startedAt: string }
export interface Notification { id: string; kind: 'assigned' | 'mentioned' | 'commented' | 'completed' | 'due_changed'; summary: string; projectId: string; taskId: string | null; actor: Person | null; readAt: string | null; createdAt: string }

export interface TaskPatch {
  title?: string; description?: string; status?: TaskStatus; priority?: Priority;
  /** Replaces the whole set of assignees (max 20; each must be an organization member who can view the project). */
  assigneeIds?: string[]; startOn?: string | null; dueOn?: string | null;
  estimateMinutes?: number | null; repeatRule?: RepeatRule | null; sectionId?: string | null;
  /** Make this task a subtask of a top-level task of the same project (null = make it top-level). */
  parentId?: string | null;
  /** Custom field values by field id; null clears a value. Validated per field type; fields must belong to the task's project. */
  fields?: Record<string, FieldValue | null>;
}
/** Bulk patches can also add or remove assignees without replacing the others (replace runs first, then add, then remove). */
export interface BulkTaskPatch extends TaskPatch { addAssigneeIds?: string[]; removeAssigneeIds?: string[] }
export interface ProjectPatch {
  name?: string; description?: string; color?: string; status?: ProjectStatus; clientId?: string | null;
  ownerId?: string | null; startOn?: string | null; dueOn?: string | null;
  visibility?: 'members' | 'organization'; defaultView?: ViewKind;
}
export type PinnableView = ViewKind | 'report' | 'docs';
/** list.columns = visible optional columns in order ('tags', 'who', 'due', 'f:<fieldId>'); groupBy 'field:<fieldId>' groups by a select field; sort 'field:<fieldId>' or 'field:<fieldId>:desc'. board.cardFields = field ids shown on cards. */
export interface ViewPrefs { pinned?: PinnableView[]; list?: { groupBy?: 'section' | 'status' | 'assignee' | 'priority' | 'none' | `field:${string}`; sort?: string; hideDone?: boolean; filters?: TaskFilters; columns?: string[] }; board?: Record<string, unknown>; overview?: OverviewPrefs }
/** Analytics filter bar of the Overview page. preset 'custom' uses from / to. assigneeIds may contain 'unassigned'. */
export interface OverviewPrefs { preset?: '7d' | '30d' | '90d' | 'project' | 'custom'; from?: string; to?: string; assigneeIds?: string[]; includeSubtasks?: boolean }
/** assigneeIds: a task matches when it has ANY of these people; the id 'unassigned' matches tasks without assignees. */
export interface TaskFilters { q?: string; assigneeIds?: string[]; tagIds?: string[]; statuses?: TaskStatus[]; priorities?: Priority[]; due?: 'overdue' | 'today' | 'week' | 'none'; fields?: FieldFilter[] }

export interface WorkloadCell { minutes: number; tasks: number }
export interface Workload {
  weeks: string[];                           // Monday dates, first = current week
  people: { person: Person; overdue: WorkloadCell; noDate: WorkloadCell; byWeek: WorkloadCell[]; unestimated: number }[];
  capacityMinutesPerWeek: number;            // 2400
}
export interface ProjectReport {
  stats: ProjectStats & { doneLast7: number; doneLast30: number; estimateLeftMinutes: number; loggedMinutes: number };
  byStatus: { status: TaskStatus; count: number }[];
  byPriority: { priority: Priority; count: number }[];
  people: { person: Person | null; open: number; overdue: number; done: number; estimateLeftMinutes: number; billableMinutes: number; otherMinutes: number }[];
  completedPerWeek: { weekStart: string; count: number }[];   // last 8 weeks
}
/**
 * Project analytics (Overview + Report). Scope: tasks created on or before `range.to` that were not finished before `range.from`
 * (optionally only those with one of `assigneeIds`, or 'unassigned'), top-level only unless includeSubtasks. Status is the current status.
 * A task with several assignees counts once in totals / distinctTasks and once for EACH assignee in byAssignee.
 */
export interface ProjectAnalytics {
  range: { from: string; to: string; bucket: 'day' | 'week' };
  distinctTasks: number;
  totals: { total: number; open: number; done: number; overdue: number; blocked: number; unassigned: number; estimateMinutes: number; estimateDoneMinutes: number; loggedMinutes: number };
  byStatus: { status: TaskStatus; count: number; estimateMinutes: number }[];
  byPriority: { priority: Priority; count: number; estimateMinutes: number }[];
  byAssignee: { person: Person | null; open: number; done: number; overdue: number; estimateOpenMinutes: number; loggedMinutes: number }[];
  bySection: { sectionId: string | null; name: string; count: number; open: number; done: number }[];
  /** One point per day (per week, starting at range.from, when the range is longer than 92 days). openAtEnd is measured at the end of the bucket. */
  completionSeries: {
    date: string; created: number; completed: number; openAtEnd: number;
    /** Measured at the end of the bucket, for the KPI sparklines: tasks in scope that existed, how many of the open ones were past due (by their current due dates), their estimate, and minutes logged inside the bucket. */
    totalAtEnd: number; overdueAtEnd: number; estimateLeftAtEnd: number; loggedMinutes: number;
  }[];
  remainingSeries: { date: string; value: number }[];
  /** Straight line from the open count at range.from down to 0 at the project due date; empty when the project has no due date. */
  idealSeries: { date: string; value: number }[];
  dueOn: string | null;
  dueSoon: TaskRow[];
  overdueList: TaskRow[];
}
export interface SearchResults { projects: ProjectSummary[]; tasks: TaskRow[] }

// ---- optional project views, collections, gallery, activity feed (server/ops/resources.ts) ----
export type OptionalViewKind = 'gallery' | 'activity' | 'docs' | 'collection';
export const OPTIONAL_VIEW_KINDS: OptionalViewKind[] = ['gallery', 'activity', 'docs', 'collection'];
export type ResourceKind = 'file' | 'link' | 'embed';
/** A folder. parentId null = top level. count = items directly inside, childCount = folders directly inside. */
export interface Collection { id: string; name: string; position: number; parentId: string | null; count: number; childCount: number; updatedAt: string }
/** Every view tab that can be renamed per project: the defaults plus the optional ones (route ids). */
export const VIEW_IDS = ['overview', 'list', 'board', 'calendar', 'timeline', 'report', 'docs', 'gallery', 'activity', 'pages', 'collection'] as const;
export type ViewId = (typeof VIEW_IDS)[number];
export interface ViewsInfo { kinds: OptionalViewKind[]; labels: Partial<Record<ViewId, string>> }
export interface CollectionList { collections: Collection[]; unsortedCount: number; totalCount: number; trashCount: number }
export interface Resource {
  id: string; projectId: string; collectionId: string | null; kind: ResourceKind; title: string; description: string;
  /** link / embed: the https address. */
  url: string | null;
  /** youtube, vimeo, loom, google_docs, google_sheets, google_slides, google_calendar, figma, website. */
  provider: string | null;
  /** Computed by the server from `url`; never accepted from the client. */
  embedUrl: string | null;
  /** file: original name, type, size and a signed address (valid for 10 to 20 minutes). */
  fileId: string | null; fileName: string | null; mime: string | null; sizeBytes: number | null; fileUrl: string | null;
  position: number; createdBy: Person | null; createdAt: string; updatedAt: string; deletedAt: string | null;
}
export interface LinkDetection {
  url: string; host: string; provider: string; providerLabel: string;
  embeddable: boolean; embedUrl: string | null; embedError: string | null;
  /** works: loads for anyone. needs_sharing: only if the file is shared / published. may_refuse: the site may block framing. */
  embedAccess: 'works' | 'needs_sharing' | 'may_refuse' | null;
  note: string | null; suggestedTitle: string;
}
export interface SignedUrl { url: string; expiresAt: string }
export interface StorageUsage { usedBytes: number; limitBytes: number; attachmentsBytes: number; resourcesBytes: number }
export interface GalleryItem {
  id: string; source: 'task' | 'collection'; media: 'image' | 'video'; name: string; mime: string; sizeBytes: number; url: string | null; fileId?: string;
  createdAt: string; uploadedBy: Person | null;
  taskId: string | null; taskTitle: string | null; collectionId: string | null; collectionName: string | null;
}
export type FeedType = 'tasks' | 'comments' | 'status' | 'assignments' | 'files' | 'project';
export const FEED_TYPES: FeedType[] = ['tasks', 'comments', 'status', 'assignments', 'files', 'project'];
export interface FeedItem { id: number; actor: Person | null; kind: string; data: Record<string, unknown>; createdAt: string; taskId: string | null; taskTitle: string | null }

// op name -> [args, result]
export interface Ops {
  'views.list': [{ projectId: string }, ViewsInfo];
  'views.add': [{ projectId: string; kind: OptionalViewKind }, ViewsInfo];
  'views.remove': [{ projectId: string; kind: OptionalViewKind }, ViewsInfo];   // the view's data is kept
  /** Per-project name of a view tab (1-40 characters). label null resets it to the default name. Editors only. */
  'views.rename': [{ projectId: string; view: ViewId; label: string | null }, ViewsInfo];
  'collections.list': [{ projectId: string }, CollectionList];
  'collections.create': [{ projectId: string; name: string; parentId?: string | null }, Collection];
  'collections.rename': [{ id: string; name: string }, Collection];
  /** Reorder (position) and/or put the folder inside another one (parentId; null = top level). Cycles are refused. */
  'collections.move': [{ id: string; position?: number; parentId?: string | null }, Collection];
  'collections.delete': [{ id: string }, { ok: true; moved: number }];                   // resources move to Unsorted
  /** collectionId omitted = every resource, null = Unsorted. */
  'resources.list': [{ projectId: string; collectionId?: string | null }, Resource[]];
  'resources.detect': [{ url: string }, LinkDetection];
  'resources.addLink': [{ projectId: string; collectionId?: string | null; url: string; title?: string; asEmbed: boolean }, Resource];
  'resources.update': [{ id: string; title?: string; description?: string; collectionId?: string | null; position?: number }, Resource];
  'resources.remove': [{ id: string }, { ok: true }];
  'resources.restore': [{ id: string }, { ok: true }];
  'resources.purge': [{ id: string }, { ok: true }];                                       // only from the trash
  'resources.trashList': [{ projectId: string }, Resource[]];
  /** Files go through Drive: upload with drive.uploads.sign + drive.files.create (project set), then link here. */
  'resources.addFile': [{ projectId: string; collectionId?: string | null; fileId: string; title?: string }, Resource];
  'resources.fileUrl': [{ id: string }, SignedUrl];
  'attachments.fileUrl': [{ id: string }, SignedUrl];
  'storage.usage': [{}, StorageUsage];
  'gallery.list': [{ projectId: string }, GalleryItem[]];
  /** from / to are UTC dates (YYYY-MM-DD, inclusive); before = id of the last item already shown. */
  'activity.feed': [{ projectId: string; type?: FeedType; personId?: string; from?: string; to?: string; before?: number; limit?: number }, { items: FeedItem[]; next: number | null }];

  'session.me': [{}, { user: Person; orgs: Org[] }];
  'people.list': [{}, OrgMember[]];
  'clients.list': [{}, Client[]];
  'tags.list': [{}, Tag[]];
  'tags.create': [{ name: string; color?: string }, Tag];

  'projects.list': [{ scope?: ProjectScope }, ProjectSummary[]];
  'projects.get': [{ id: string }, ProjectDetail];
  'projects.create': [{ name: string; personal?: boolean; clientId?: string | null; description?: string; color?: string; startOn?: string | null; dueOn?: string | null; visibility?: 'members' | 'organization'; fromTemplateId?: string | null }, ProjectDetail];
  'projects.update': [{ id: string; patch: ProjectPatch }, ProjectDetail];
  'projects.duplicate': [{ id: string; name: string; asTemplate?: boolean }, ProjectDetail];
  'projects.archive': [{ id: string }, { ok: true }];
  'projects.unarchive': [{ id: string }, { ok: true }];
  'projects.trash': [{ id: string }, { ok: true }];
  'projects.restore': [{ id: string }, { ok: true }];
  'projects.purge': [{ id: string }, { ok: true }];               // owner/admin, only from trash
  'projects.setMember': [{ id: string; userId: string; role: ProjectRole | null }, ProjectMember[]];
  /** Adds several people in one transaction (manager only; not for personal projects). People who are already members are skipped, not changed. */
  'projects.addMembers': [{ id: string; userIds: string[]; role: ProjectRole }, { members: ProjectMember[]; added: number; skipped: number }];

  'sections.create': [{ projectId: string; name: string }, Section];
  'sections.update': [{ id: string; name?: string; position?: number }, Section];
  'sections.delete': [{ id: string }, { ok: true }];            // tasks keep living, without a section

  // Custom fields (managers write; everyone who can open the project reads). includeArchived: managers only.
  'fields.list': [{ projectId: string; includeArchived?: boolean }, CustomField[]];
  'fields.create': [{ projectId: string; name: string; type: FieldType; options?: FieldOptionInput[]; currency?: string; decimals?: number }, CustomField];
  /** Type cannot change. `options` replaces the whole list (select / multiselect); options left out are deleted and removed from every task value. */
  'fields.update': [{ id: string; name?: string; options?: FieldOptionInput[]; currency?: string; decimals?: number; position?: number }, CustomField];
  'fields.archive': [{ id: string }, { ok: true }];             // hides the field; its values are kept
  'fields.restore': [{ id: string }, CustomField];
  'fields.purge': [{ id: string }, { ok: true }];               // only archived fields; removes every value
  'fields.reorder': [{ projectId: string; ids: string[] }, CustomField[]];   // ids = all active fields in the new order

  'tasks.list': [{ projectId: string; includeDone?: boolean }, TaskRow[]];   // includes subtasks (parentId set); excludes trashed
  'tasks.get': [{ id: string }, TaskDetail];
  'tasks.statusHistory': [{ id: string }, StatusSpan[]];     // oldest first; the last span is the current status (to = null)
  'tasks.create': [{ projectId: string; title: string; sectionId?: string | null; parentId?: string | null; status?: TaskStatus; priority?: Priority; assigneeIds?: string[]; startOn?: string | null; dueOn?: string | null; position?: number }, TaskRow];
  'tasks.update': [{ id: string; patch: TaskPatch; version?: number }, TaskRow];          // conflict if version given and stale
  /** Sets (or with value null clears) one custom field value on a task. Does not change the task's version. Editors only. */
  'tasks.setField': [{ taskId: string; fieldId: string; value: FieldValue | null }, TaskRow];
  'tasks.addAssignees': [{ id: string; userIds: string[] }, TaskRow];     // adds to the set; people already assigned are ignored
  'tasks.removeAssignee': [{ id: string; userId: string }, TaskRow];
  'tasks.move': [{ id: string; sectionId?: string | null; status?: TaskStatus; position: number }, TaskRow];
  'tasks.bulkUpdate': [{ ids: string[]; patch: BulkTaskPatch }, { updated: number }];
  'tasks.duplicate': [{ id: string }, TaskRow];
  'tasks.trash': [{ ids: string[] }, { ok: true }];
  'tasks.restore': [{ ids: string[] }, { ok: true }];
  'tasks.purge': [{ ids: string[] }, { ok: true }];              // only trashed tasks
  'tasks.trashList': [{ projectId: string }, TaskRow[]];

  'checklist.add': [{ taskId: string; label: string }, ChecklistItem];
  'checklist.update': [{ id: string; label?: string; done?: boolean; position?: number }, ChecklistItem];
  'checklist.remove': [{ id: string }, { ok: true }];
  'deps.add': [{ taskId: string; dependsOnId: string }, { ok: true }];
  'deps.remove': [{ taskId: string; dependsOnId: string }, { ok: true }];
  'tasks.setTags': [{ id: string; tagIds: string[] }, Tag[]];
  'follow.set': [{ taskId: string; on: boolean }, { following: boolean }];

  'comments.add': [{ taskId: string; body: string; mentions?: string[] }, Comment];
  'comments.edit': [{ id: string; body: string; mentions?: string[] }, Comment];
  'comments.remove': [{ id: string }, { ok: true }];
  'attachments.remove': [{ id: string }, { ok: true }];
  /** Link a Drive file (new upload or existing) to a task. */
  'attachments.add': [{ taskId: string; fileId: string }, Attachment];

  'time.start': [{ taskId: string }, RunningTimer];
  'time.stop': [{}, { ok: true }];
  'time.running': [{}, RunningTimer | null];
  'time.log': [{ taskId: string; minutes: number; date: string; note?: string; billable?: boolean }, TimeEntry];
  'time.remove': [{ id: string }, { ok: true }];

  'links.add': [{ projectId: string; kind: ProjectLinkKind; title: string; url: string }, ProjectLink];
  'links.update': [{ id: string; title?: string; url?: string }, ProjectLink];
  'links.remove': [{ id: string }, { ok: true }];
  // Links on a task (https only).
  'links.task.add': [{ taskId: string; title: string; url: string }, TaskLink];
  'links.task.update': [{ id: string; title?: string; url?: string }, TaskLink];
  'links.task.remove': [{ id: string }, { ok: true }];

  // Open tasks that have me among their assignees in the active org; with doneSince (ISO timestamp, e.g. local midnight) also my tasks completed since then.
  'mywork.list': [{ doneSince?: string }, TaskRow[]];
  'workload.get': [{ weeks?: number; projectId?: string | null }, Workload];
  'portfolio.get': [{}, ProjectSummary[]];
  'report.get': [{ projectId: string }, ProjectReport];
  /** Viewer access. from / to default to the project's span (see ProjectAnalytics); at most 2 years apart. */
  'analytics.project': [{ projectId: string; from?: string; to?: string; assigneeIds?: string[]; includeSubtasks?: boolean }, ProjectAnalytics];
  'search.query': [{ q: string }, SearchResults];
  'activity.project': [{ projectId: string; limit?: number }, (ActivityItem & { taskId: string | null; taskTitle: string | null })[]];

  'notifications.list': [{}, { items: Notification[]; unread: number }];
  'notifications.read': [{ ids?: string[]; all?: boolean }, { ok: true }];
  'viewprefs.get': [{ projectId: string }, ViewPrefs];
  'viewprefs.set': [{ projectId: string; prefs: ViewPrefs }, ViewPrefs];
}
export type OpName = keyof Ops;
export type OpArgs<K extends OpName> = Ops[K][0];
export type OpResult<K extends OpName> = Ops[K][1];

