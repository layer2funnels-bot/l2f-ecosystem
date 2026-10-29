import { daysBetween, todayIso } from './schedule.ts';

export const initials = (name: string | null | undefined) =>
  (name ?? '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';

export function formatDate(iso: string | null | undefined, opts: { year?: boolean } = {}): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(opts.year ?? !sameYear ? { year: 'numeric' } : {}) });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

export function relativeDay(iso: string | null | undefined, today = todayIso()): string {
  if (!iso) return 'No date';
  const n = daysBetween(today, iso.slice(0, 10));
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return n > 0 ? `In ${n} days` : `${-n} days ago`;
}

export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const mins = Math.round((now - Date.parse(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function formatNumber(value: number | string | null | undefined, unit = ''): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const body = abs >= 1_000_000 ? `${trim(n / 1_000_000)}M` : abs >= 10_000 ? `${trim(n / 1_000)}k` : trim(n);
  if (unit === '$' || unit === '£' || unit === '€') return `${unit}${body}`;
  return unit ? `${body}${unit === '%' ? '%' : ' ' + unit}` : body;
}
const trim = (n: number) => String(Math.round(n * 100) / 100);

export const percent = (n: number | string | null | undefined) => `${Math.round(Number(n ?? 0))}%`;
export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
