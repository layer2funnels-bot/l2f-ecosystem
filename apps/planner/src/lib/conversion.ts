// Turning strategy into work: from the objectives you pick, propose tasks (actions) for the person to review.
// Nothing here talks to the database. The dialog shows the proposal, and only the confirmed rows are saved.
import type { Action, Goal } from '../api/types.ts';

export interface ProposedTask { key: string; title: string; notes: string; skip: 'exists' | null }
export interface Proposal { goal: Goal; existing: Pick<Action, 'title' | 'status'>[]; tasks: ProposedTask[]; reason: string | null }

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Objectives that can take new tasks: open, not archived. An objective made of sub-objectives is planned through its children. */
export function convertible(goals: Goal[]): Goal[] {
  return goals.filter((g) => !g.archived_at && g.status !== 'completed' && g.child_count === 0);
}

/** The starting tasks we suggest for one objective. They are editable in the dialog, so they are only a draft. */
export function suggestTasks(goal: Goal): { title: string; notes: string }[] {
  const out: { title: string; notes: string }[] = [];
  const from = `Created from the objective “${goal.title}”.`;
  if (goal.measure && Number(goal.measure.current) === Number(goal.measure.start)) {
    out.push({ title: `Record the first reading for ${goal.measure.name}`, notes: from });
  }
  out.push({ title: `Plan the first steps for ${goal.title}`, notes: from });
  if (!goal.owner_id) out.push({ title: `Choose an owner for ${goal.title}`, notes: from });
  return out;
}

/** Builds the proposal for one objective; a task with the same title as an existing one is marked so it is not created twice. */
export function proposeFor(goal: Goal, existing: Pick<Action, 'title' | 'status'>[]): Proposal {
  const have = new Set(existing.map((a) => norm(a.title)));
  const tasks = suggestTasks(goal).map((t, i) => ({ key: `${goal.id}:${i}`, title: t.title, notes: t.notes, skip: have.has(norm(t.title)) ? 'exists' as const : null }));
  const reason = goal.archived_at ? 'Archived' : goal.status === 'completed' ? 'Already completed' : goal.child_count > 0 ? 'Planned through its sub-objectives' : null;
  return { goal, existing, tasks, reason };
}

/** The rows that will really be created: kept by the person, not blank, and not already present. */
export function tasksToCreate(titles: Record<string, string>, off: Set<string>, proposal: Proposal): ProposedTask[] {
  const seen = new Set(proposal.existing.map((a) => norm(a.title)));
  const out: ProposedTask[] = [];
  for (const t of proposal.tasks) {
    const title = (titles[t.key] ?? t.title).trim();
    if (!title || off.has(t.key) || t.skip) continue;
    if (seen.has(norm(title))) continue;   // also guards a title the person edited into an existing one
    seen.add(norm(title));
    out.push({ ...t, title });
  }
  return out;
}