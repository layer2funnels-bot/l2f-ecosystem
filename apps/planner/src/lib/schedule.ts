// Schedule awareness: a goal is judged against where it should be today, not only against a percentage.
import type { Goal } from '../api/types.ts';

export type ScheduleState = 'completed' | 'overdue' | 'behind' | 'on_pace' | 'ahead' | 'not_started' | 'no_dates';

const MS_DAY = 86_400_000;
export const toDay = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const todayIso = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
export const daysBetween = (fromIso: string, toIso: string) => Math.round((toDay(toIso) - toDay(fromIso)) / MS_DAY);

/** Where the goal should be today if progress were even from its start date to its due date (0-100). */
export function expectedProgress(g: Pick<Goal, 'start_date' | 'due_date'>, today: string): number | null {
  if (!g.start_date || !g.due_date) return null;
  const span = daysBetween(g.start_date, g.due_date);
  if (span <= 0) return today >= g.due_date ? 100 : 0;
  const elapsed = daysBetween(g.start_date, today);
  return Math.max(0, Math.min(100, Math.round((elapsed / span) * 100)));
}

export function scheduleState(g: Pick<Goal, 'start_date' | 'due_date' | 'progress' | 'status'>, today: string, tolerance = 10): ScheduleState {
  if (g.status === 'completed') return 'completed';
  if (g.due_date && g.due_date < today) return 'overdue';
  if (g.start_date && g.start_date > today) return 'not_started';
  const exp = expectedProgress(g, today);
  if (exp === null) return 'no_dates';
  if (Number(g.progress) < exp - tolerance) return 'behind';
  if (Number(g.progress) > exp + tolerance) return 'ahead';
  return 'on_pace';
}

export const SCHEDULE_LABEL: Record<ScheduleState, string> = {
  completed: 'Completed', overdue: 'Overdue', behind: 'Behind schedule', on_pace: 'On pace', ahead: 'Ahead of schedule', not_started: 'Starts later', no_dates: 'No dates set',
};

/** Days until the date (negative when past). */
export const daysUntil = (iso: string | null, today: string) => (iso ? daysBetween(today, iso) : null);

/** Whether a review is due now or overdue. */
export const reviewState = (dueOn: string, today: string): 'overdue' | 'due_soon' | 'upcoming' => {
  const d = daysBetween(today, dueOn);
  return d < 0 ? 'overdue' : d <= 7 ? 'due_soon' : 'upcoming';
};

/** Timeline geometry for a Gantt bar between two dates, as percentages of the visible window. */
export function barGeometry(startIso: string | null, dueIso: string | null, windowStart: string, windowEnd: string) {
  const a = startIso ?? dueIso, b = dueIso ?? startIso;
  if (!a || !b) return null;
  const total = Math.max(1, daysBetween(windowStart, windowEnd));
  const left = Math.max(0, Math.min(100, (daysBetween(windowStart, a) / total) * 100));
  const right = Math.max(0, Math.min(100, ((daysBetween(windowStart, b) + 1) / total) * 100));
  return { left, width: Math.max(1.2, right - left), clippedStart: a < windowStart, clippedEnd: b > windowEnd };
}

export const CADENCE_DAYS = { none: 0, weekly: 7, fortnightly: 14, monthly: 30, quarterly: 91 } as const;
export const UPDATE_CADENCE_LABEL: Record<keyof typeof CADENCE_DAYS, string> = { none: 'No reminders', weekly: 'Every week', fortnightly: 'Every 2 weeks', monthly: 'Every month', quarterly: 'Every quarter' };

/** The day the next progress update is due, or null when the objective has no update schedule. Counts from the last update (or creation). */
export function nextUpdateDue(g: Pick<Goal, 'update_cadence' | 'last_update_at' | 'created_at'>): string | null {
  const days = CADENCE_DAYS[g.update_cadence] ?? 0;
  if (!days) return null;
  const from = (g.last_update_at ?? g.created_at).slice(0, 10);
  return new Date(toDay(from) + days * MS_DAY).toISOString().slice(0, 10);
}
/** Where a focus area sits in time: not started, running, or finished. Null when it has no dates. */
export function focusTimeState(a: { start_date: string | null; end_date: string | null }, today: string): 'upcoming' | 'current' | 'ended' | null {
  if (!a.start_date && !a.end_date) return null;
  if (a.start_date && a.start_date > today) return 'upcoming';
  if (a.end_date && a.end_date < today) return 'ended';
  return 'current';
}
