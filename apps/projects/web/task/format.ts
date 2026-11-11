// Pure helpers for the task drawer: duration parsing, mentions, byte sizes, activity sentences.
import type { ActivityItem, Person, RepeatRule, TaskStatus, Priority } from '../../shared/api.ts';
import { fmtDate, fmtMinutes, PRIORITY_META, TASK_STATUS_META } from '../lib/util.ts';

/** "2h 30m", "1.5h", "90m", "2:30", "45" (bare number = minutes) -> minutes. null = empty input, 'invalid' = not understood. */
export function parseDuration(input: string): number | null | 'invalid' {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  const colon = /^(\d{1,4}):([0-5]?\d)$/.exec(s);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
  if (/^\d+$/.test(s)) return Number(s);
  if (/^\d*\.\d+\s*(h|hr|hrs|hour|hours)$/.test(s)) return Math.round(parseFloat(s) * 60);
  const re = /^(?:(\d+)\s*(?:h|hr|hrs|hour|hours))?\s*(?:(\d+)\s*(?:m|min|mins|minute|minutes))?$/;
  const m = re.exec(s);
  if (!m || (m[1] === undefined && m[2] === undefined)) return 'invalid';
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const REPEAT_LABEL: Record<RepeatRule | 'none', string> = {
  none: 'Does not repeat', daily: 'Daily', weekdays: 'Weekdays', weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly', yearly: 'Yearly',
};

/** Date a time entry belongs to: logged entries are stored at 09:00 UTC of the chosen date, timers use the local start day. */
export function entryDate(startedAt: string): string {
  const d = new Date(startedAt);
  if (d.getUTCHours() === 9 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) return startedAt.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- mentions ----------
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Ids of people whose "@Name" appears in the text. */
export function extractMentions(body: string, people: Person[]): string[] {
  const out: string[] = [];
  for (const p of people) {
    if (new RegExp(`(^|[^\\w])@${escapeRe(p.name)}(?![\\w])`, 'i').test(body)) out.push(p.id);
  }
  return out;
}

export type BodyPart = { text: string; mention: boolean };
/** Splits a comment body into plain / @mention parts. Only the mentioned people are highlighted. */
export function splitMentions(body: string, mentioned: Person[]): BodyPart[] {
  if (!mentioned.length) return [{ text: body, mention: false }];
  const names = [...mentioned].map((p) => p.name).sort((a, b) => b.length - a.length).map(escapeRe);
  const re = new RegExp(`(@(?:${names.join('|')}))(?![\\w])`, 'gi');
  const parts: BodyPart[] = [];
  let last = 0;
  for (const m of body.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) parts.push({ text: body.slice(last, i), mention: false });
    parts.push({ text: m[1], mention: true });
    last = i + m[0].length;
  }
  if (last < body.length) parts.push({ text: body.slice(last), mention: false });
  return parts;
}

// ---------- activity sentences ----------
const statusLabel = (v: unknown) => TASK_STATUS_META[v as TaskStatus]?.label ?? String(v ?? 'none');
const prioLabel = (v: unknown) => PRIORITY_META[v as Priority]?.label ?? String(v ?? 'none');
const dateLabel = (v: unknown) => (typeof v === 'string' && v ? fmtDate(v.slice(0, 10)) : '');
const quote = (v: unknown) => `“${String(v ?? '')}”`;
const mins = (v: unknown) => (typeof v === 'number' ? fmtMinutes(v) : '');

/** Human sentence for one history entry, without the actor's name ("changed status from To do to In progress"). */
export function activityText(a: ActivityItem): string {
  const d = a.data;
  switch (a.kind) {
    case 'task.created':
      if (d.duplicatedFrom) return 'duplicated a task to create this one';
      if (d.repeatedFrom) return 'created this task as the next repeat';
      return 'created this task';
    case 'task.repeated': return d.dueOn ? `created the next repeat, due ${dateLabel(d.dueOn)}` : 'created the next repeat';
    case 'task.trashed': return 'moved this task to the trash';
    case 'task.restored': return 'restored this task from the trash';
    case 'task.attachment': return `attached ${quote(d.name)}`;
    case 'task.attachment_removed': return `removed the attachment ${quote(d.name)}`;
    case 'task.tags': return 'updated the tags';
    case 'task.link_added': return `added the link ${quote(d.title)}`;
    case 'task.link_removed': return `removed the link ${quote(d.title)}`;
    case 'task.commented': return 'added a comment';
    case 'task.updated': {
      const from = d.from, to = d.to;
      switch (d.field) {
        case 'status': return `changed status from ${statusLabel(from)} to ${statusLabel(to)}`;
        case 'priority': return `changed priority from ${prioLabel(from)} to ${prioLabel(to)}`;
        case 'assignee': // history written before tasks could have several assignees
          if (!to) return from ? `unassigned ${String(from)}` : 'cleared the assignee';
          return `assigned ${String(to)}`;
        case 'assignees': {
          const names = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
          const list = (n: string[]) => (n.length < 2 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`);
          const added = names(d.added), removed = names(d.removed);
          const parts = [added.length ? `assigned ${list(added)}` : '', removed.length ? `unassigned ${list(removed)}` : ''].filter(Boolean);
          return parts.join(' and ') || 'changed the assignees';
        }
        case 'startOn': case 'dueOn': {
          const label = d.field === 'startOn' ? 'start date' : 'due date';
          if (!to) return `cleared the ${label}`;
          return from ? `changed the ${label} from ${dateLabel(from)} to ${dateLabel(to)}` : `set the ${label} to ${dateLabel(to)}`;
        }
        case 'title': return `renamed this task from ${quote(from)} to ${quote(to)}`;
        case 'description': return 'updated the description';
        case 'estimateMinutes':
          if (to === null || to === undefined) return 'cleared the estimate';
          return from ? `changed the estimate from ${mins(from)} to ${mins(to)}` : `set the estimate to ${mins(to)}`;
        case 'repeatRule':
          return to ? `set the task to repeat ${REPEAT_LABEL[to as RepeatRule]?.toLowerCase() ?? String(to)}` : 'turned off repeating';
        case 'parent':
          if (to) return `made this a subtask of ${quote(to)}`;
          return from ? `made this a top-level task (was a subtask of ${quote(from)})` : 'made this a top-level task';
        case 'section': return to ? `moved this task to ${String(to)}` : 'removed this task from its section';
        default: {
          const f = String(d.field ?? '');
          if (f.startsWith('custom:')) { // custom field: the server writes readable values
            const name = f.slice(7);
            const was = typeof from === 'string' && from ? from : null, now = typeof to === 'string' && to ? to : null;
            if (now && was) return `changed ${name} from ${quote(was)} to ${quote(now)}`;
            if (now) return `set ${name} to ${quote(now)}`;
            return was ? `cleared ${name} (was ${quote(was)})` : `cleared ${name}`;
          }
          return `changed ${String(d.field ?? 'a field')}`;
        }
      }
    }
    default: return a.kind.replace(/^task\./, '').replace(/[._]/g, ' ');
  }
}
