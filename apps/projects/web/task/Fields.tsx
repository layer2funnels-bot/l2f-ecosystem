import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { Priority, RepeatRule, Tag } from '../../shared/api.ts';
import { call } from '../api/client.ts';
import { useQuery } from '../api/store.ts';
import { useProject } from '../lib/data.ts';
import { MAX_ASSIGNEES, patchAssignees, useAssignable } from '../lib/people.ts';
import { cx, fmtMinutes, isOverdue } from '../lib/util.ts';
import { Button, Chip, DatePicker, Icon, Input, PeoplePicker, PersonChip, Popover, PriorityMenu, Select, StatusMenu, toast } from '../ui/index.ts';
import type { SelectOption } from '../ui/index.ts';
import { CustomFieldRows } from '../fields/DrawerFields.tsx';
import { useTask } from './context.ts';
import { parseDuration, REPEAT_LABEL } from './format.ts';
import { byId } from '../lib/dom.ts';

// When "Collapse empty fields" is on, rows marked empty are hidden (an error on the row keeps it visible).
const HideEmpty = createContext(false);
const COLLAPSE_KEY = 'pm.task.collapseEmpty';

function Row({ label, children, error, hint, wide, field, empty }: { label: string; children: ReactNode; error?: string | null; hint?: ReactNode; wide?: boolean; field?: string; empty?: boolean }) {
  const id = useId();
  const hideEmpty = useContext(HideEmpty);
  if (hideEmpty && empty && !error) return null;
  return (
    <div className="pm-tf" role="group" aria-labelledby={id} data-field={field}>
      <div className="pm-tf__label" id={id}>{label}</div>
      <div className={cx('pm-tf__value', wide && 'is-wide')}>
        {children}
        {error && <p className="pm-tf__error" role="alert">{error}</p>}
        {hint && !error && <p className="pm-tf__hint">{hint}</p>}
      </div>
    </div>
  );
}

const REPEAT_OPTIONS: SelectOption<RepeatRule | 'none'>[] = (['none', 'daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'yearly'] as const)
  .map((v) => ({ value: v, label: REPEAT_LABEL[v] }));

export function Fields() {
  const { task, readOnly, update, setStatus } = useTask();
  const project = useProject(task.projectId);
  const sections = project.data?.sections ?? [];
  const [dateErr, setDateErr] = useState<{ start?: string; due?: string }>({});
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } });
  const toggleCollapsed = () => setCollapsed((c) => { const n = !c; try { localStorage.setItem(COLLAPSE_KEY, n ? '1' : '0'); } catch { /* storage unavailable */ } return n; });
  const customEmpty = (project.data?.fields ?? []).filter((f) => { const v = task.fields[f.id]; return v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && v.length === 0); }).length;
  const emptyCount = [task.assignees.length === 0, !task.startOn, !task.dueOn, task.estimateMinutes == null, !task.repeatRule,
    !task.parentId && !task.sectionId, task.tags.length === 0].filter(Boolean).length + customEmpty;

  const setDate = async (which: 'startOn' | 'dueOn', v: string | null) => {
    const start = which === 'startOn' ? v : task.startOn;
    const due = which === 'dueOn' ? v : task.dueOn;
    if (start && due && due < start) {
      setDateErr(which === 'dueOn' ? { due: 'The due date must be on or after the start date.' } : { start: 'The start date must be on or before the due date.' });
      return;
    }
    setDateErr({});
    const r = which === 'startOn' ? await update({ startOn: v }, { startOn: v }) : await update({ dueOn: v }, { dueOn: v });
    if (!r.ok && r.error.field) setDateErr(which === 'dueOn' ? { due: r.error.message } : { start: r.error.message });
  };

  const sectionOptions = useMemo<SelectOption<string>[]>(
    () => [{ value: 'none', label: 'No section' }, ...sections.map((s) => ({ value: s.id, label: s.name }))],
    [sections],
  );

  return (
    <HideEmpty.Provider value={collapsed}>
    <div className="pm-tfs">
      <Row label="Status" field="status">
        <StatusMenu value={task.status} onChange={setStatus} disabled={readOnly} />
      </Row>
      <Row label="Priority" field="priority">
        <PriorityMenu value={task.priority} disabled={readOnly} onChange={(p: Priority) => void update({ priority: p }, { priority: p })} />
      </Row>
      <Row label="Assignees" field="assignee" wide empty={task.assignees.length === 0}><AssigneesField /></Row>
      <Row label="Start date" error={dateErr.start} empty={!task.startOn}>
        <div className="pm-tf__ctl">
          <DatePicker value={task.startOn} onChange={(v) => void setDate('startOn', v)} disabled={readOnly} invalid={!!dateErr.start} ariaLabel="Start date" placeholder="No start date" />
        </div>
      </Row>
      <Row label="Due date" error={dateErr.due} field="due" empty={!task.dueOn}>
        <div className="pm-tf__ctl">
          <DatePicker value={task.dueOn} onChange={(v) => void setDate('dueOn', v)} disabled={readOnly} invalid={!!dateErr.due} ariaLabel="Due date" placeholder="No due date" overdue={isOverdue(task.dueOn, task.status === 'done')} />
        </div>
      </Row>
      <EstimateRow />
      <Row label="Repeat" hint="Next copy is created when this is completed" empty={!task.repeatRule}>
        <div className="pm-tf__ctl">
          <Select<RepeatRule | 'none'>
            value={task.repeatRule ?? 'none'}
            options={REPEAT_OPTIONS}
            ariaLabel="Repeat"
            disabled={readOnly}
            onChange={(v) => void update({ repeatRule: v === 'none' ? null : v }, { repeatRule: v === 'none' ? null : v })}
          />
        </div>
      </Row>
      {!task.parentId && (
        <Row label="Section" empty={!task.sectionId}>
          <div className="pm-tf__ctl">
            <Select<string>
              value={task.sectionId ?? 'none'}
              options={sectionOptions}
              ariaLabel="Section"
              disabled={readOnly}
              onChange={(v) => void update({ sectionId: v === 'none' ? null : v }, { sectionId: v === 'none' ? null : v })}
            />
          </div>
        </Row>
      )}
      <Row label="Tags" wide field="tags" empty={task.tags.length === 0}><TagsField /></Row>
      <CustomFieldRows Row={Row} />
      {(emptyCount > 0 || collapsed) && (
        <button type="button" className="pm-tf__collapse" aria-pressed={collapsed} onClick={toggleCollapsed}>
          <Icon name={collapsed ? 'chevronDown' : 'chevronUp'} size={13} />
          {collapsed ? `Show ${emptyCount} empty field${emptyCount === 1 ? '' : 's'}` : 'Collapse empty fields'}
        </button>
      )}
    </div>
    </HideEmpty.Provider>
  );
}

// ---------- Assignees ----------
function AssigneesField() {
  const { task, readOnly, me, update } = useTask();
  const project = useProject(task.projectId);
  const assignable = useAssignable(project.data, task.assignees);
  const ids = task.assignees.map((a) => a.id);
  const mine = ids.includes(me.id);
  const canAssignMe = assignable.some((p) => p.id === me.id);

  const set = (next: string[]) => {
    void update({ assigneeIds: next }, { assignees: patchAssignees(task.assignees, { assigneeIds: next }, assignable) });
  };

  return (
    <div className="pp-assignees">
      {task.assignees.length === 0 && <span className="pp-assignees__none">{readOnly ? 'Nobody is assigned' : 'Unassigned'}</span>}
      {task.assignees.map((a) => (
        <PersonChip key={a.id} person={a} onRemove={readOnly ? undefined : () => set(ids.filter((x) => x !== a.id))} />
      ))}
      {!readOnly && (
        <PeoplePicker
          people={assignable}
          value={ids}
          onChange={set}
          max={MAX_ASSIGNEES}
          ariaLabel="Assignees"
          title="Assign people"
          trigger={(t) => (
            <button type="button" {...t} className="pp-addbtn" data-primary="" title="Add assignees">
              <Icon name="plus" size={13} />Add
            </button>
          )}
        />
      )}
      {!readOnly && canAssignMe && (
        <button type="button" className="pm-linkbtn" aria-pressed={mine} onClick={() => set(mine ? ids.filter((x) => x !== me.id) : [...ids, me.id])}>
          {mine ? 'Unassign me' : 'Assign to me'}
        </button>
      )}
    </div>
  );
}

// ---------- Estimate ----------
function EstimateRow() {
  const { task, readOnly, update } = useTask();
  const shown = task.estimateMinutes ? fmtMinutes(task.estimateMinutes) : '';
  const [text, setText] = useState(shown);
  const [err, setErr] = useState<string | null>(null);
  const cancel = useRef(false);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) { setText(shown); setErr(null); } }, [shown]);

  const commit = () => {
    const v = parseDuration(text);
    if (v === 'invalid') { setErr('Enter a duration like 2h 30m, 90m or 1.5h.'); return false; }
    if (v !== null && v > 100000) { setErr('That estimate is too large.'); return false; }
    setErr(null);
    const next = v === null || v === 0 ? null : v;
    if (next === (task.estimateMinutes ?? null)) { setText(shown); return true; }
    setText(next ? fmtMinutes(next) : '');
    void update({ estimateMinutes: next }, { estimateMinutes: next });
    return true;
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel.current = true; setText(shown); setErr(null); (e.target as HTMLInputElement).blur(); }
  };
  const logged = task.totalMinutes > 0 ? `Logged ${fmtMinutes(task.totalMinutes)}${task.estimateMinutes ? ` of ${fmtMinutes(task.estimateMinutes)}` : ''}` : 'e.g. 2h 30m';
  return (
    <Row label="Estimate" error={err} hint={logged} empty={task.estimateMinutes == null}>
      <div className="pm-tf__ctl">
        <Input
          value={text}
          placeholder="No estimate"
          aria-label="Estimate"
          disabled={readOnly}
          invalid={!!err}
          leading={<Icon name="clock" size={14} />}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => { focused.current = true; cancel.current = false; }}
          onBlur={() => { focused.current = false; if (cancel.current) { cancel.current = false; return; } commit(); }}
          onKeyDown={onKey}
          autoComplete="off"
        />
      </div>
    </Row>
  );
}

// ---------- Tags ----------
function TagsField() {
  const { task, readOnly, act } = useTask();
  const all = useQuery('tags', () => call('tags.list', {}));
  const tags = task.tags;

  const save = async (next: Tag[]) => {
    await act(() => call('tasks.setTags', { id: task.id, tagIds: next.map((t) => t.id) }), (d) => ({ ...d, tags: next }));
  };
  const add = (t: Tag) => { if (!tags.some((x) => x.id === t.id)) void save([...tags, t]); };
  const remove = (t: Tag) => void save(tags.filter((x) => x.id !== t.id));
  const create = async (name: string) => {
    const r = await act(() => call('tags.create', { name }), undefined);
    if (r.ok) { void all.refetch(); add(r.value); }
  };

  return (
    <div className="pm-tags">
      {tags.length === 0 && readOnly && <span className="pm-faint">No tags</span>}
      {tags.map((t) => (
        <Chip key={t.id} color={t.color} selected onRemove={readOnly ? undefined : () => remove(t)}>{t.name}</Chip>
      ))}
      {!readOnly && <TagPicker all={all.data ?? []} attached={tags} onPick={add} onCreate={create} />}
    </div>
  );
}

function TagPicker({ all, attached, onPick, onCreate }: { all: Tag[]; attached: Tag[]; onPick: (t: Tag) => void; onCreate: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const uid = useId();

  const query = q.trim();
  const items = useMemo(() => {
    const free = all.filter((t) => !attached.some((a) => a.id === t.id) && t.name.toLowerCase().includes(query.toLowerCase()));
    const out: { id: string; label: string; tag?: Tag; create?: boolean }[] = free.map((t) => ({ id: t.id, label: t.name, tag: t }));
    const exists = all.some((t) => t.name.toLowerCase() === query.toLowerCase());
    if (query && !exists) out.push({ id: '__create', label: `Create tag ‘${query}’`, create: true });
    return out;
  }, [all, attached, query]);

  useEffect(() => { if (open) { setQ(''); setActive(0); requestAnimationFrame(() => input.current?.focus({ preventScroll: true })); } }, [open]);
  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => { if (open) byId(`${uid}-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active, open, uid]);

  const close = (restore = true) => { setOpen(false); if (restore) btn.current?.focus({ preventScroll: true }); };
  const choose = (i: number) => {
    const it = items[i];
    if (!it) return;
    if (it.create) {
      if (query.length > 40) { toast.error('Tag names can be at most 40 characters.'); return; }
      onCreate(query);
    } else if (it.tag) onPick(it.tag);
    close();
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (items.length ? (a + 1) % items.length : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (items.length ? (a - 1 + items.length) % items.length : 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
    else if (e.key === 'Tab') close(false);
  };

  return (
    <>
      <Button ref={btn} size="sm" icon="plus" data-primary="" title="Add tag (Shift+T)" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>Add tag</Button>
      <Popover anchor={btn.current} open={open} onClose={(r) => close(r !== 'outside')} className="pm-menu-pop" label="Add a tag">
        <div className="pm-menu">
          <div className="pm-menu__search">
            <Icon name="search" size={14} />
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKey}
              placeholder="Search or create a tag…"
              aria-label="Search or create a tag"
              role="combobox"
              aria-expanded
              aria-controls={`${uid}-list`}
              aria-activedescendant={items.length ? `${uid}-${active}` : undefined}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="pm-menu__list" role="listbox" id={`${uid}-list`} aria-label="Tags">
            {items.length === 0 && <div className="pm-menu__empty">{all.length ? 'No more tags' : 'Type a name to create a tag'}</div>}
            {items.map((it, i) => (
              <div
                key={it.id}
                id={`${uid}-${i}`}
                role="option"
                aria-selected={i === active}
                className={cx('pm-menu__item', i === active && 'is-active')}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
              >
                {it.create ? <Icon name="plus" size={14} /> : <span className="pm-dot" style={{ background: it.tag?.color }} />}
                <span className="pm-menu__label pm-truncate">{it.label}</span>
              </div>
            ))}
          </div>
        </div>
      </Popover>
    </>
  );
}
