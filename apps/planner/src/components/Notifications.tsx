import { useMemo } from 'react';
import { usePlanner } from '../state/PlannerContext.tsx';
import { Popover } from '../ui/overlay.tsx';
import { Icon } from '../ui/icons.tsx';
import { daysBetween, nextUpdateDue } from '../lib/schedule.ts';
import { plural } from '../lib/format.ts';

interface Note { key: string; text: string; goalId?: string; href?: string }

/** What needs you right now, worked out from the open plan: late updates, overdue objectives and overdue reviews. Nothing is stored or sent. */
export function Notifications() {
  const { plan, me, today, openGoal, navigate, planId } = usePlanner();
  const notes = useMemo<Note[]>(() => {
    if (!plan) return [];
    const out: Note[] = [];
    for (const g of plan.goals) {
      if (g.archived_at || g.status === 'completed' || g.status === 'on_hold') continue;
      const mine = g.owner_id === me.id;
      const due = nextUpdateDue(g);
      if (mine && due && due < today) out.push({ key: `u${g.id}`, goalId: g.id, text: `Update due: “${g.title}” (${plural(daysBetween(due, today), 'day')} late)` });
      if (mine && g.due_date && g.due_date < today) out.push({ key: `o${g.id}`, goalId: g.id, text: `Overdue: “${g.title}” (${plural(daysBetween(g.due_date, today), 'day')})` });
    }
    for (const rv of plan.reviews) if (rv.status === 'scheduled' && rv.due_on < today) out.push({ key: `r${rv.id}`, href: 'reviews', text: `Review overdue: ${rv.title}` });
    return out.slice(0, 20);
  }, [plan, me.id, today]);
  if (!plan) return null;
  return (
    <Popover align="end" count={notes.length} label={<><Icon name="bell" /><span className="sr-only">Notifications</span></>}>
      <div className="notes">
        <h3 className="ps-sub">Needs you</h3>
        {notes.length === 0 ? <p className="muted">You’re all caught up.</p> : (
          <ul className="notes__list">
            {notes.map((n) => <li key={n.key}><button type="button" className="link-btn" onClick={() => n.goalId ? openGoal(n.goalId) : navigate('reviews', { plan: planId })}>{n.text}</button></li>)}
          </ul>)}
      </div>
    </Popover>
  );
}