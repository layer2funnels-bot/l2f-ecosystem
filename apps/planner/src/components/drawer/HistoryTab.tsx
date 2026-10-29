import type { HistoryEntry, Status } from '../../api/types.ts';
import { usePlanner } from '../../state/PlannerContext.tsx';
import { MODE_LABEL, PRIORITY_META, STATUS_META } from '../../lib/status.ts';
import { formatDate, formatDateTime, formatNumber, relativeTime } from '../../lib/format.ts';
import { EmptyState } from '../../ui/primitives.tsx';
import type { TabProps } from './shared.tsx';

const NOUN: Record<string, string> = {
  goals: 'goal', measures: 'measure', measure_readings: 'reading', updates: 'update', actions: 'action', risks: 'risk', comments: 'comment',
  focus_areas: 'focus area', plans: 'plan', reviews: 'review',
};
const FIELD: Record<string, string> = {
  title: 'title', name: 'name', owner_id: 'owner', assignee_id: 'assignee', status: 'status', progress: 'progress', progress_mode: 'progress mode', priority: 'priority',
  focus_area_id: 'focus area', parent_goal_id: 'parent objective', goal_type_id: 'type', start_date: 'start date', due_date: 'due date', project_id: 'linked project',
  target_value: 'target', start_value: 'starting value', direction: 'direction', severity: 'severity', value: 'value', recorded_on: 'date',
};
const WORDS: Record<string, string> = {
  todo: 'To do', doing: 'In progress', on_hold: 'On hold', done: 'Done', wont_do: 'Won’t do', open: 'Open', mitigating: 'Mitigating', closed: 'Closed', increase: 'higher is better', decrease: 'lower is better',
};
const DATE_FIELDS = new Set(['start_date', 'due_date', 'recorded_on']);

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function HistoryTab({ d }: TabProps) {
  const { members, plan } = usePlanner();

  const who = (id: unknown) => (id ? members.find((m) => m.user_id === id)?.name ?? 'a former member' : 'nobody');
  const show = (field: string, v: unknown, entity: string): string => {
    if (v === null || v === undefined || v === '') return 'none';
    const s = String(v);
    switch (field) {
      case 'owner_id': case 'assignee_id': return who(v);
      case 'status': return STATUS_META[s as Status]?.label ?? WORDS[s] ?? s;
      case 'progress': return `${Math.round(Number(v))}%`;
      case 'progress_mode': return (MODE_LABEL[s] ?? s).toLowerCase();
      case 'priority': return PRIORITY_META[s as keyof typeof PRIORITY_META]?.label ?? s;
      case 'focus_area_id': return plan?.focus_areas.find((f) => f.id === s)?.name ?? 'another focus area';
      case 'goal_type_id': return plan?.goal_types.find((t) => t.id === s)?.name ?? 'another type';
      case 'parent_goal_id': return plan?.goals.find((g) => g.id === s)?.title ?? d.breadcrumb.find((g) => g.id === s)?.title ?? 'another goal';
      case 'project_id': return 'a project';
      case 'value': case 'target_value': case 'start_value': return formatNumber(v as number);
      default:
        if (DATE_FIELDS.has(field)) return formatDate(s, { year: true });
        if (entity !== 'goals' || field === 'direction') return WORDS[s] ?? s;
        return s;
    }
  };

  const sentence = (h: HistoryEntry): string => {
    const who_ = h.actor_name ?? 'Someone';
    const noun = NOUN[h.entity] ?? h.entity;
    const detail = h.detail ?? {};
    const isGoal = h.entity === 'goals';
    const label = (detail.title?.[1] ?? detail.name?.[1]) as string | undefined;
    const target = isGoal ? 'this objective' : `the ${noun}`;
    if (h.action === 'archived') return `${who_} archived ${target}`;
    if (h.action === 'restored') return `${who_} restored ${target}`;
    if (h.action === 'deleted') return `${who_} deleted ${target}`;
    if (h.action === 'created') {
      if (h.entity === 'measure_readings') return `${who_} recorded a reading of ${show('value', detail.value?.[1], h.entity)} for ${show('recorded_on', detail.recorded_on?.[1], h.entity)}`;
      if (h.entity === 'updates') {
        const st = detail.status?.[1] as string | undefined;
        const pr = detail.progress?.[1];
        return `${who_} posted an update${st ? ` (${show('status', st, h.entity)}${pr !== null && pr !== undefined ? `, ${show('progress', pr, h.entity)}` : ''})` : ''}`;
      }
      return `${who_} created ${isGoal ? 'this goal' : `a ${noun}`}${label && !isGoal ? ` “${label}”` : ''}`;
    }
    const parts = Object.entries(detail).map(([field, pair]) => {
      const [from, to] = pair;
      const name = `${isGoal ? '' : 'the ' + noun + '’s '}${FIELD[field] ?? field.replace(/_/g, ' ')}`;
      if (field === 'title' || field === 'name') return `renamed ${isGoal ? 'this goal' : 'the ' + noun} from “${String(from)}” to “${String(to)}”`;
      if (from === null || from === undefined || from === '') return `set ${name} to ${show(field, to, h.entity)}`;
      if (to === null || to === undefined || to === '') return `cleared ${name} (was ${show(field, from, h.entity)})`;
      return `changed ${name} from ${show(field, from, h.entity)} to ${show(field, to, h.entity)}`;
    });
    return parts.length ? `${who_} ${parts.join('; ')}` : `${who_} updated ${target}`;
  };

  if (!d.history.length) return <EmptyState title="No history yet">Every change to this objective is recorded here, permanently.</EmptyState>;
  return (
    <div className="gd-stack">
      <h3 className="gd-h">History</h3>
      <p className="muted gd-small">This log is permanent and cannot be changed. The most recent {d.history.length} changes are shown.</p>
      <ol className="gd-history">
        {d.history.map((h) => (
          <li key={h.id}>
            <span>{cap(sentence(h))}.</span>
            <time className="muted gd-small" dateTime={h.created_at} title={formatDateTime(h.created_at)}>{relativeTime(h.created_at)} · {formatDateTime(h.created_at)}</time>
          </li>
        ))}
      </ol>
    </div>
  );
}
