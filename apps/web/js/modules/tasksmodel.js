// Tasks (V8 04_TASKS) pure logic: the capture bar's natural language, dates, and "completed tasks hidden in place". No DOM, unit-tested in test/web.test.mjs.

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };

/**
 * "Call Harry tomorrow 3pm @Sana !high #Build team" → { title, due_date, due_time, priority, people: [ids], list }
 * people: [{ id, name }] (first name or full name after @), lists: [{ id, name }] (longest name after #). Unknown @/# words stay in the title.
 */
export function parseCapture(text, { now = new Date(), people = [], lists = [] } = {}) {
  let s = ` ${String(text ?? '').replace(/\s+/g, ' ').trim()} `; const out = { due_date: null, due_time: null, priority: 'normal', people: [], list: null };
  const cut = (re) => { const m = re.exec(s); if (m) s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length); return m; };
  if (cut(/\s!(high|urgent|important)\b/i) || cut(/\s!!+(?=\s)/)) out.priority = 'high';
  // #list: the longest list name that follows a #
  for (const l of [...lists].sort((a, b) => b.name.length - a.name.length)) { const i = s.toLowerCase().indexOf(`#${l.name.toLowerCase()}`); if (i >= 0 && /[\s]/.test(s[i + l.name.length + 1] ?? ' ')) { out.list = l.id; s = s.slice(0, i) + s.slice(i + l.name.length + 1); break; } }
  // @person: full name, else first name
  let m; const at = /\s@([\p{L}][\p{L}'-]*(?:\s[\p{L}][\p{L}'-]*)?)/u;
  while ((m = at.exec(s))) {
    const word = m[1].toLowerCase(); const full = people.find((p) => p.name.toLowerCase() === word); const first = people.find((p) => p.name.toLowerCase().split(' ')[0] === word.split(' ')[0]);
    const p = full ?? first; if (!p) break;
    const used = full ? m[0] : ` @${m[1].split(' ')[0]}`; const idx = s.indexOf(used); s = s.slice(0, idx) + ' ' + s.slice(idx + used.length);
    if (!out.people.includes(p.id)) out.people.push(p.id);
  }
  // time: 3pm, 3:30pm, 15:30, at 9
  const tm = cut(/\s(?:at\s)?(\d{1,2})(?::(\d{2}))?\s?(am|pm)(?=\s)/i) ?? cut(/\s(?:at\s)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/);
  if (tm) { let h = Number(tm[1]); const mi = Number(tm[2] ?? 0); const ap = tm[3]?.toLowerCase(); if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0; if (h < 24 && mi < 60) out.due_time = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`; }
  // date
  let d = null; let dm;
  if (cut(/\s(today|tonight)(?=\s)/i)) d = now;
  else if (cut(/\s(tomorrow|tmrw)(?=\s)/i)) d = addDays(now, 1);
  else if ((dm = cut(/\sin\s(\d{1,3})\s(day|days|week|weeks)(?=\s)/i))) d = addDays(now, Number(dm[1]) * (/week/i.test(dm[2]) ? 7 : 1));
  else if (cut(/\snext\sweek(?=\s)/i)) d = addDays(now, ((8 - now.getDay()) % 7) || 7);
  else if ((dm = cut(/\s(?:on\s)?(next\s)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:[a-z]*)(?=\s)/i))) { const t = DAYS.indexOf(dm[2].toLowerCase().slice(0, 3)); let n = (t - now.getDay() + 7) % 7; if (n === 0 || dm[1]) n = n || 7; d = addDays(now, n); }
  else if ((dm = cut(/\s(\d{4})-(\d{2})-(\d{2})(?=\s)/))) d = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]));
  else if ((dm = cut(/\s(\d{1,2})\s(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?=\s)/i)) || (dm = cut(/\s(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s(\d{1,2})(?=\s)/i))) {
    const [day, mon] = /\d/.test(dm[1]) ? [Number(dm[1]), dm[2]] : [Number(dm[2]), dm[1]]; d = new Date(now.getFullYear(), MONTHS.indexOf(mon.toLowerCase().slice(0, 3)), day); if (d < addDays(now, -1)) d.setFullYear(d.getFullYear() + 1);
  }
  if (d) out.due_date = iso(d); else if (out.due_time) out.due_date = iso(now);
  out.title = s.replace(/\s+/g, ' ').trim();
  return out;
}

/** The rows a list shows: completed tasks stay in their original place but are hidden unless "Show completed" is on. Sub-tasks follow their parent. */
export function visibleTree(items, { showDone = false } = {}) {
  const kids = new Map(); for (const it of items) { const k = it.parent_id ?? 'root'; if (!kids.has(k)) kids.set(k, []); kids.get(k).push(it); }
  for (const l of kids.values()) l.sort((a, b) => a.position - b.position || String(a.created_at).localeCompare(String(b.created_at)));
  const walk = (pid, depth) => (kids.get(pid) ?? []).flatMap((it) => (it.done_at && !showDone ? [] : [{ ...it, depth }, ...walk(it.id, depth + 1)]));
  return walk('root', 0);
}
export const doneCount = (items) => items.filter((i) => i.done_at).length;

/** Due chip text: Overdue · Today · Tomorrow · weekday (this week) · 12 Nov; time appended. */
export function dueChip(date, time, now = new Date()) {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`); const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()); const n = Math.round((d - t0) / 864e5);
  const day = n < 0 ? 'Overdue' : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n < 7 ? d.toLocaleDateString(undefined, { weekday: 'short' }) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return { text: time ? `${day} ${time.slice(0, 5)}` : day, tone: n < 0 ? 'od' : n === 0 ? 'soon' : '' };
}

/** Upcoming columns (V8: Today, then the next days, then Next week): [{ key, label, from, to }] */
export function upcomingColumns(now = new Date()) {
  const cols = [{ key: 'today', label: 'Today', from: iso(now), to: iso(now) }];
  for (let i = 1; i <= 5; i++) { const d = addDays(now, i); cols.push({ key: iso(d), label: i === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short' }), from: iso(d), to: iso(d) }); }
  cols.push({ key: 'later', label: 'Next week', from: iso(addDays(now, 6)), to: iso(addDays(now, 13)) });
  return cols;
}
