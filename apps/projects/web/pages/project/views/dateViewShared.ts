// Shared helpers for the Calendar and Timeline views: timezone-proof date math on 'YYYY-MM-DD' strings,
// and one scheduling mutation (optimistic, rolls back with a toast) so both views behave identically.
import type { ProjectDetail, TaskRow } from '../../../../shared/api.ts';
import { call } from '../../../api/client.ts';
import { invalidate, invalidateWork, setQueryData, useMutation } from '../../../api/store.ts';
import { toast } from '../../../ui/Toast.tsx';

// ---- date math -------------------------------------------------------------------------------
// A date string maps to an integer "day number" (days since 1970-01-01) via Date.UTC, which has no DST
// or local-offset component, so every difference/shift below is exact in any timezone.
const DAY_MS = 86_400_000;
const pad2 = (n: number) => String(n).padStart(2, '0');

export function dayNum(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}
export function fromDayNum(n: number): string {
  const d = new Date(n * DAY_MS);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
/** b - a in whole days (negative when b is earlier). */
export const diffDays = (a: string, b: string): number => dayNum(b) - dayNum(a);
export const shiftDays = (s: string, n: number): string => fromDayNum(dayNum(s) + n);
/** Monday = 0 … Sunday = 6. */
export const weekdayIdx = (s: string): number => (((dayNum(s) + 3) % 7) + 7) % 7; // 1970-01-01 was a Thursday = 3 when Monday = 0
export const weekStart = (s: string): string => shiftDays(s, -weekdayIdx(s));
export const isWeekend = (s: string): boolean => weekdayIdx(s) >= 5;
export const monthStart = (s: string): string => `${s.slice(0, 7)}-01`;
export function daysInMonth(s: string): number {
  const [y, m] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
/** First day of the month `n` months away (n may be negative). */
export function addMonths(s: string, n: number): string {
  const [y, m] = s.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad2((t % 12) + 1)}-01`;
}
export const monthEnd = (s: string): string => `${s.slice(0, 7)}-${pad2(daysInMonth(s))}`;

const utc = (s: string) => new Date(dayNum(s) * DAY_MS);
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, { ...o, timeZone: 'UTC' });
const F_MONTH_YEAR = fmt({ month: 'long', year: 'numeric' });
const F_MONTH_SHORT_YEAR = fmt({ month: 'short', year: '2-digit' });
const F_SHORT = fmt({ month: 'short', day: 'numeric' });
const F_SHORT_Y = fmt({ month: 'short', day: 'numeric', year: 'numeric' });
const F_LONG = fmt({ weekday: 'long', month: 'long', day: 'numeric' });
const F_AGENDA = fmt({ weekday: 'short', month: 'short', day: 'numeric' });
const F_WD_SHORT = fmt({ weekday: 'short' });
export const fmtMonthYear = (s: string) => F_MONTH_YEAR.format(utc(s));
export const fmtMonthShortYear = (s: string) => F_MONTH_SHORT_YEAR.format(utc(s));
export const fmtShort = (s: string) => F_SHORT.format(utc(s));
/** Short date that only shows the year when it is not the current year (same rule as lib/util fmtDate). */
export const fmtShortYear = (s: string) => (Number(s.slice(0, 4)) === new Date().getFullYear() ? F_SHORT.format(utc(s)) : F_SHORT_Y.format(utc(s)));
export const fmtLong = (s: string) => F_LONG.format(utc(s));
export const fmtAgenda = (s: string) => F_AGENDA.format(utc(s));
export const fmtWeekdayShort = (s: string) => F_WD_SHORT.format(utc(s));
export const dayOfMonth = (s: string): number => Number(s.slice(8, 10));

// ---- permissions + sorting -------------------------------------------------------------------
export const canEditProject = (p: ProjectDetail): boolean => p.myRole !== 'viewer' && !p.deletedAt;

const STATUS_ORDER: Record<string, number> = { blocked: 0, in_progress: 1, in_review: 2, todo: 3, done: 4 };
export function compareForDay(a: TaskRow, b: TaskRow): number {
  return (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || a.position - b.position || a.number - b.number;
}

// ---- scheduling mutation ---------------------------------------------------------------------
export interface SchedulePatch { startOn?: string | null; dueOn?: string | null }
export interface ScheduleArg { task: TaskRow; patch: SchedulePatch }

/** Update a task's dates: optimistic across every cached tasks:<project> entry, rollback + toast on error. */
export function useTaskScheduler(projectId: string) {
  return useMutation<ScheduleArg, TaskRow>(
    ({ task, patch }) => call('tasks.update', { id: task.id, patch }),
    {
      errorToast: false,
      onMutate: ({ task, patch }) =>
        setQueryData<TaskRow[]>(`tasks:${projectId}`, (old) => old.map((t) => (t.id === task.id ? { ...t, ...patch } : t))),
      onSuccess: () => invalidateWork(),
      onError: (e, { task }) => {
        toast.error(`Couldn't save “${task.title}”: ${e.message.replace(/\.$/, '')}. Change reverted.`);
        invalidate('tasks');
      },
    },
  );
}

/** Create a task with a due date (optional start). Appends the server row to the cache immediately. */
export function useTaskCreator(projectId: string) {
  return useMutation<{ title: string; dueOn: string | null; startOn?: string | null }, TaskRow>(
    (a) => call('tasks.create', { projectId, title: a.title, dueOn: a.dueOn, startOn: a.startOn ?? null }),
    {
      onSuccess: (row) => {
        setQueryData<TaskRow[]>(`tasks:${projectId}`, (old) => (old.some((t) => t.id === row.id) ? old : [...old, row]));
        invalidateWork();
      },
    },
  );
}
