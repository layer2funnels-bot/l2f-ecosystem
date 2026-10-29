// CSV export and import for goals. Import is validated row by row and never applied silently.
import type { Goal, FocusArea, GoalType, Member, Priority, Status } from '../api/types.ts';
import { PRIORITY_META, STATUS_META } from './status.ts';

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;                     // formula-injection guard for spreadsheet apps
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function parseCsv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = []; let cur = ''; let q = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (q) { if (c === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x.trim() !== '')) out.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some((x) => x.trim() !== '')) out.push(row);
  return out;
}

export const EXPORT_HEADERS = ['Title', 'Type', 'Focus area', 'Parent', 'Owner', 'Status', 'Priority', 'Progress %', 'Weight', 'Start', 'Due', 'Tags', 'Description'] as const;

export function goalsToCsv(goals: Goal[], ctx: { focusAreas: FocusArea[]; typeNames: Record<string, string> }): string {
  const title = new Map(goals.map((g) => [g.id, g.title] as const));
  return toCsv([[...EXPORT_HEADERS], ...goals.map((g) => [
    g.title, ctx.typeNames[g.goal_type_id] ?? '', ctx.focusAreas.find((f) => f.id === g.focus_area_id)?.name ?? '', g.parent_goal_id ? title.get(g.parent_goal_id) ?? '' : '',
    g.owner_name ?? '', STATUS_META[g.status].label, PRIORITY_META[g.priority].label, Math.round(Number(g.progress)), g.weight, g.start_date ?? '', g.due_date ?? '',
    g.tags.join('; '), g.description ?? ''])]);
}

export interface ImportRow { line: number; ok: boolean; problems: string[]; data?: { title: string; goal_type_id: string; focus_area_id: string; parent_title: string | null; owner_id: string | null;
  status: Status; priority: Priority; progress: number; weight: number; start_date: string | null; due_date: string | null; tags: string[]; description: string | null } }

const norm = (s: string) => s.trim().toLowerCase();
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** Validates an exported or hand-made CSV against the plan. Nothing is created here; the caller applies only valid rows. */
export function parseGoalImport(text: string, ctx: { focusAreas: FocusArea[]; types: GoalType[]; members: Member[] }): { rows: ImportRow[]; fatal: string | null } {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], fatal: 'The file has no rows to import.' };
  const head = table[0]!.map(norm);
  const col = (name: string) => head.indexOf(norm(name));
  if (col('Title') < 0) return { rows: [], fatal: 'The first row must contain a "Title" column.' };
  const statusByLabel = new Map(Object.entries(STATUS_META).flatMap(([k, v]) => [[norm(v.label), k as Status], [k, k as Status]] as [string, Status][]));
  const prioByLabel = new Map(Object.entries(PRIORITY_META).flatMap(([k, v]) => [[norm(v.label), k as Priority], [k, k as Priority]] as [string, Priority][]));
  const rows: ImportRow[] = table.slice(1, 501).map((r, i) => {
    const get = (n: string) => { const c = col(n); return c < 0 ? '' : (r[c] ?? '').trim(); };
    const problems: string[] = [];
    const title = get('Title'); if (!title) problems.push('Title is empty');
    if (title.length > 200) problems.push('Title is longer than 200 characters');
    const fa = ctx.focusAreas.find((f) => norm(f.name) === norm(get('Focus area')));
    if (!fa) problems.push(`Focus area "${get('Focus area')}" does not exist in this plan`);
    const type = ctx.types.find((t) => norm(t.name) === norm(get('Type'))) ?? ctx.types[0];
    const ownerName = get('Owner'); const owner = ownerName ? ctx.members.find((m) => norm(m.name) === norm(ownerName)) : undefined;
    if (ownerName && !owner) problems.push(`Owner "${ownerName}" is not a member of this organization`);
    const statusRaw = get('Status'); const status = statusRaw ? statusByLabel.get(norm(statusRaw)) : 'not_started';
    if (!status) problems.push(`Status "${statusRaw}" is not recognised`);
    const prioRaw = get('Priority'); const priority = prioRaw ? prioByLabel.get(norm(prioRaw)) : 'medium';
    if (!priority) problems.push(`Priority "${prioRaw}" is not recognised`);
    const progRaw = get('Progress %'); const progress = progRaw === '' ? 0 : Number(progRaw);
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) problems.push('Progress must be between 0 and 100');
    const weightRaw = get('Weight'); const weight = weightRaw === '' ? 1 : Number(weightRaw);
    if (!Number.isInteger(weight) || weight < 1 || weight > 100) problems.push('Weight must be a whole number from 1 to 100');
    const start = get('Start'), due = get('Due');
    if (start && !isDate(start)) problems.push('Start must look like 2026-03-31');
    if (due && !isDate(due)) problems.push('Due must look like 2026-03-31');
    if (start && due && isDate(start) && isDate(due) && due < start) problems.push('Due is before start');
    const ok = problems.length === 0;
    return { line: i + 2, ok, problems, data: ok ? { title, goal_type_id: type!.id, focus_area_id: fa!.id, parent_title: get('Parent') || null, owner_id: owner?.user_id ?? null,
      status: status!, priority: priority!, progress, weight, start_date: start || null, due_date: due || null,
      tags: get('Tags').split(/[;,]/).map((t) => t.trim()).filter(Boolean).slice(0, 20), description: get('Description') || null } : undefined };
  });
  return { rows, fatal: table.length > 501 ? 'Only the first 500 rows are read. Split the file to import more.' : null };
}
