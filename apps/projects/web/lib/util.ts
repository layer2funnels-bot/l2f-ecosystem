import type { Priority, ProjectStatus, TaskStatus } from '../../shared/api.ts';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// ---- safe localStorage ----
export function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function lsSet(key: string, value: string | null): void {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

// ---- dates (all 'YYYY-MM-DD' strings in local time) ----
const pad2 = (n: number) => String(n).padStart(2, '0');
export function toYmd(d: Date): string { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
export function parseYmd(s: string): Date { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function todayYmd(): string { return toYmd(new Date()); }
export function addDays(s: string, n: number): string { const d = parseYmd(s); d.setDate(d.getDate() + n); return toYmd(d); }
export function startOfWeek(s: string): string { const d = parseYmd(s); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return toYmd(d); }
/** The one date formatter: "Nov 6" in the current year, "Nov 6, 2027" in any other year. */
export function fmtDate(s: string | null | undefined): string {
  if (!s) return '';
  const d = parseYmd(s);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' }).format(d);
}
export function isOverdue(due: string | null | undefined, finished = false): boolean {
  return !!due && !finished && due < todayYmd();
}
export function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return fmtDate(iso.slice(0, 10));
}
export function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(sec)}` : `${m}:${pad2(sec)}`;
}
export function fmtMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// ---- status / priority metadata ----
export const TASK_STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  todo: { label: 'To do', color: 'var(--pm-st-todo)' },
  in_progress: { label: 'In progress', color: 'var(--pm-st-in_progress)' },
  in_review: { label: 'In review', color: 'var(--pm-st-in_review)' },
  blocked: { label: 'Blocked', color: 'var(--pm-st-blocked)' },
  done: { label: 'Done', color: 'var(--pm-st-done)' },
};
export const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  urgent: { label: 'Urgent', color: 'var(--pm-pr-urgent)' },
  high: { label: 'High', color: 'var(--pm-pr-high)' },
  medium: { label: 'Medium', color: 'var(--pm-pr-medium)' },
  low: { label: 'Low', color: 'var(--pm-pr-low)' },
  none: { label: 'No priority', color: 'var(--pm-pr-none)' },
};
export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; color: string }> = {
  on_track: { label: 'On track', color: 'var(--pm-ps-on_track)' },
  at_risk: { label: 'At risk', color: 'var(--pm-ps-at_risk)' },
  off_track: { label: 'Off track', color: 'var(--pm-ps-off_track)' },
  on_hold: { label: 'On hold', color: 'var(--pm-ps-on_hold)' },
  complete: { label: 'Complete', color: 'var(--pm-ps-complete)' },
};
export const PROJECT_COLORS = ['#5b5bd6', '#3b82f6', '#0ea5b7', '#2fa56c', '#84a80f', '#e5a50a', '#f2711c', '#e5484d', '#d6409f', '#8b5cf6', '#64748b'];
export const ROLE_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Admin', editor: 'Editor', viewer: 'Viewer', manager: 'Manager' };
