// Social Planner (v4): plain rules the screens share. Nothing here talks to the server; the database decides what is allowed, this only decides what to offer.
export const STATES = {
  idea: { label: 'Idea', kind: '' }, draft: { label: 'Draft', kind: '' }, in_review: { label: 'In review', kind: 'warn' }, approved: { label: 'Approved', kind: 'ok' },
  scheduled: { label: 'Scheduled', kind: 'ok' }, published: { label: 'Posted', kind: 'ok' }, failed: { label: 'Failed', kind: 'err' }, cancelled: { label: 'Cancelled', kind: '' },
};
export const stateLabel = (s) => STATES[s]?.label ?? s;
export const CAMPAIGN_STATES = { draft: 'Draft', planned: 'Planned', active: 'Active', paused: 'Paused', completed: 'Completed' };

/** the moves a post offers from each state; `can` says which of the person's rights apply (edit, schedule). Review and approval come from the approval itself. */
export function postActions(post, can = {}) {
  if (!post || post.archived_at) return [];
  const a = []; const edit = !!can.edit; const sched = !!can.schedule;
  switch (post.status) {
    case 'idea': if (edit) a.push('to_draft', 'cancel'); break;
    case 'draft': if (edit) a.push('review', 'cancel'); break;
    case 'approved': if (sched) a.push('schedule', 'posted'); if (edit) a.push('to_draft', 'cancel'); break;
    case 'scheduled': if (sched) a.push('posted', 'failed'); if (edit) a.push('to_draft', 'cancel'); break;
    case 'failed': if (sched) a.push('retry', 'posted'); if (edit) a.push('to_draft', 'cancel'); break;
    case 'cancelled': if (edit) a.push('reopen'); break;
    default: break;   // in_review waits for its approval; published is final
  }
  return a;
}
/** words in the caption against what the channel takes; max null = no fixed limit */
export function counter(caption, channel) {
  const len = [...String(caption ?? '')].length; const max = channel?.max_text ?? null;
  return { len, max, over: max !== null && len > max, left: max === null ? null : max - len };
}
export const mediaWarning = (count, channel) => (channel && count > channel.max_media ? `${channel.label} takes at most ${channel.max_media} file${channel.max_media === 1 ? '' : 's'}; this post has ${count}.` : '');

export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** a month as whole weeks (Monday first): arrays of 7 dates, including the days of the neighbouring months that fill the first and last week */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1); const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  const weeks = []; const d = new Date(start);
  do { const w = []; for (let i = 0; i < 7; i += 1) { w.push(new Date(d)); d.setDate(d.getDate() + 1); } weeks.push(w); } while (d.getMonth() === month || d <= new Date(year, month + 1, 0));
  return weeks;
}
export function byDay(posts) {
  const m = new Map();
  for (const p of posts) { if (!p.scheduled_for) continue; const k = ymd(new Date(p.scheduled_for)); if (!m.has(k)) m.set(k, []); m.get(k).push(p); }
  for (const l of m.values()) l.sort((a, b) => new Date(a.scheduled_for) - new Date(b.scheduled_for));
  return m;
}
export const progress = (c) => (c && c.posts - c.cancelled > 0 ? Math.round((c.published / (c.posts - c.cancelled)) * 100) : 0);
/** the campaign moves offered from each state */
export const campaignMoves = (status) => ({ draft: [['planned', 'Mark as planned'], ['active', 'Start now']], planned: [['active', 'Start'], ['draft', 'Back to draft']], active: [['paused', 'Pause'], ['completed', 'Mark completed']], paused: [['active', 'Resume'], ['completed', 'Mark completed']], completed: [['active', 'Reopen']] }[status] ?? []);
/** `<input type=datetime-local>` value from a stored time, and back */
export const toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
