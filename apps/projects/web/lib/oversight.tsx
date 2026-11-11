// Small helpers shared by the oversight pages (My Work, Workload, Portfolio, Search, Report).
import type { ReactNode } from 'react';
import { parseYmd, todayYmd } from './util.ts';

/** Hours with one decimal: 750 -> "12.5 h". */
export function fmtHours(minutes: number): string {
  return `${(Math.round(minutes / 6) / 10).toFixed(1)} h`;
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86_400_000);
}

/** "1 day late" / "5 days late" for a due date in the past, else null. */
export function daysLate(due: string | null | undefined, finished = false): string | null {
  if (!due || finished) return null;
  const n = daysBetween(due, todayYmd());
  if (n <= 0) return null;
  return `${n} ${n === 1 ? 'day' : 'days'} late`;
}

/** Wraps case-insensitive matches of `query` in <mark>. */
export function Highlight({ text, query }: { text: string; query: string }): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < text.length) {
    const at = lower.indexOf(needle, i);
    if (at < 0) { out.push(text.slice(i)); break; }
    if (at > i) out.push(text.slice(i, at));
    out.push(<mark key={k++} className="pm-mark">{text.slice(at, at + needle.length)}</mark>);
    i = at + needle.length;
  }
  return <>{out}</>;
}
