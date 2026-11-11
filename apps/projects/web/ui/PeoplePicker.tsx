// The one people picker. Multi-select (default): search, selected people as removable chips, "Select all matching",
// checkbox list with avatar + name + email, keyboard (↑ ↓ move, Space / Enter toggle, Ctrl+Enter = Done, Esc = Cancel) and
// Done / Cancel. Below 768 px it opens as a full-screen sheet. `mode="single"` keeps the classic one-person select (project owner).
//   <PeoplePicker people value={ids} onChange={(ids) => …} />                         default trigger
//   <PeoplePicker … trigger={(t, open, selected) => <button {...t}>…</button>} />     your own trigger
//   <PeoplePickerPanel anchor open onClose onCommit … />                              controlled, no trigger
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import type { Person } from '../../shared/api.ts';
import { useMedia } from '../lib/hooks.ts';
import { cx } from '../lib/util.ts';
import { Avatar, AvatarStack } from './Badges.tsx';
import { Button } from './Button.tsx';
import { Icon } from './icons.tsx';
import { Popover, Portal, useFocusTrap, useScrollLock } from './Overlay.tsx';
import type { Anchor } from './Overlay.tsx';
import { PersonPicker } from './PersonPicker.tsx';
import { byId as elById } from '../lib/dom.ts';

const byName = (a: Person, b: Person) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** A person as a chip, optionally removable. */
export function PersonChip({ person, onRemove, disabled }: { person: Person; onRemove?: () => void; disabled?: boolean }) {
  return (
    <span className="pp-chip" title={person.email}>
      <Avatar person={person} size={18} />
      <span className="pp-chip__name pm-truncate">{person.name}</span>
      {onRemove && (
        <button type="button" className="pp-chip__x" aria-label={`Remove ${person.name}`} title={`Remove ${person.name}`} disabled={disabled} onClick={onRemove}>
          <Icon name="x" size={12} />
        </button>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Panel (popover on desktop, full-screen sheet on phones)
// ---------------------------------------------------------------------------------------------
export interface PeoplePickerPanelProps {
  anchor: Anchor;
  open: boolean;
  /** Closes without applying (Cancel, Esc) or after applying (Done). */
  onClose: () => void;
  /** Called once with the final selection when it differs from `value` (Done, or a click outside). */
  onCommit: (ids: string[]) => void;
  people: Person[];
  value: string[];
  title?: string;
  /** Most people that can be selected. */
  max?: number;
  commitLabel?: string;
  emptyText?: string;
}

export function PeoplePickerPanel(p: PeoplePickerPanelProps) {
  return p.open ? <PickerBody {...p} /> : null;
}

function PickerBody({ anchor, onClose, onCommit, people, value, title = 'Select people', max, commitLabel = 'Done', emptyText = 'No people found' }: PeoplePickerPanelProps) {
  const mobile = useMedia('(max-width: 767px)');
  const [draft, setDraft] = useState<string[]>(() => [...new Set(value)]);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [note, setNote] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const uid = useId();

  // Callers include people who are already selected but no longer offered (left the project, say), so they stay visible and removable.
  const sorted = useMemo(() => [...new Map(people.map((x) => [x.id, x])).values()].sort(byName), [people]);
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? sorted.filter((x) => `${x.name} ${x.email}`.toLowerCase().includes(n)) : sorted;
  }, [sorted, q]);
  const byId = useMemo(() => new Map(people.map((x) => [x.id, x])), [people]);
  const chosen = draft.map((id) => byId.get(id)).filter((x): x is Person => !!x);

  useEffect(() => { setActive((a) => Math.max(0, Math.min(a, filtered.length - 1))); }, [filtered.length]);
  useEffect(() => { const id = requestAnimationFrame(() => input.current?.focus({ preventScroll: true })); return () => cancelAnimationFrame(id); }, []);
  useEffect(() => { elById(`${uid}-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active, uid]);

  const full = max !== undefined && draft.length >= max;
  const toggle = (id: string) => {
    setNote('');
    if (draft.includes(id)) { setDraft(draft.filter((x) => x !== id)); return; }
    if (full) { setNote(`You can pick up to ${max} people.`); return; }
    setDraft([...draft, id]);
  };
  const selectAllMatching = () => {
    const add = filtered.map((x) => x.id).filter((id) => !draft.includes(id));
    const room = max === undefined ? add.length : Math.max(0, max - draft.length);
    setDraft([...draft, ...add.slice(0, room)]);
    setNote(add.length > room ? `Only ${room} more fit: up to ${max} people.` : '');
  };
  const commit = () => { if (!sameSet(draft, value)) onCommit(draft); onClose(); };
  const allMatchingSelected = filtered.length > 0 && filtered.every((x) => draft.includes(x.id));

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    const inInput = e.target === input.current;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (filtered.length ? (a + 1) % filtered.length : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (filtered.length ? (a - 1 + filtered.length) % filtered.length : 0)); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); }
    else if (e.key === 'Enter') { if ((e.target as HTMLElement).tagName === 'BUTTON') return; e.preventDefault(); if (filtered[active]) toggle(filtered[active].id); }
    else if (e.key === ' ' && inInput && q === '') { e.preventDefault(); if (filtered[active]) toggle(filtered[active].id); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
  };

  const body = (
    <div className="pp" onKeyDown={onKey}>
      <div className="pm-menu__search">
        <Icon name="search" size={14} />
        <input
          ref={input}
          value={q}
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          placeholder="Search people…"
          aria-label="Search people"
          role="combobox"
          aria-expanded
          aria-controls={`${uid}-list`}
          aria-activedescendant={filtered.length ? `${uid}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      {chosen.length > 0 && (
        <div className="pp-chosen" aria-label={`Selected: ${chosen.length}`}>
          {chosen.map((x) => <PersonChip key={x.id} person={x} onRemove={() => toggle(x.id)} />)}
          <button type="button" className="pp-link" onClick={() => { setDraft([]); setNote(''); }}>Clear all</button>
        </div>
      )}
      <div className="pp-tools">
        <button type="button" className="pp-link" onClick={selectAllMatching} disabled={filtered.length === 0 || allMatchingSelected}>
          Select all matching{q.trim() ? ` (${filtered.length})` : ''}
        </button>
        <span className="pp-count" aria-live="polite">{draft.length} selected{max !== undefined ? ` of ${max}` : ''}</span>
      </div>
      {note && <p className="pp-note" role="status">{note}</p>}
      <div className="pp-list" role="listbox" aria-multiselectable="true" aria-label={title} id={`${uid}-list`}>
        {filtered.length === 0 && <div className="pm-menu__empty">{q.trim() ? emptyText : 'Nobody to choose from'}</div>}
        {filtered.map((x, i) => {
          const on = draft.includes(x.id);
          return (
            <div
              key={x.id}
              id={`${uid}-${i}`}
              role="option"
              aria-selected={on}
              className={cx('pp-opt', i === active && 'is-active', on && 'is-on')}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => toggle(x.id)}
            >
              <span className={cx('pp-box', on && 'is-on')} aria-hidden="true">{on && <Icon name="check" size={12} strokeWidth={2.4} />}</span>
              <Avatar person={x} size={26} />
              <span className="pp-opt__text">
                <span className="pp-opt__name pm-truncate">{x.name}</span>
                <span className="pp-opt__mail pm-truncate">{x.email}</span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="pp-foot">
        <Button size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" variant="primary" onClick={commit}>{commitLabel}</Button>
      </div>
    </div>
  );

  if (mobile) return <Sheet title={title} onCancel={onClose} onCommit={commit} commitLabel={commitLabel}>{body}</Sheet>;
  return (
    <Popover anchor={anchor} open onClose={(r) => { if (r === 'outside') commit(); else onClose(); }} className="pp-pop" label={title}>
      {body}
    </Popover>
  );
}

function Sheet({ title, children, onCancel, onCommit, commitLabel }: { title: string; children: ReactNode; onCancel: () => void; onCommit: () => void; commitLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);
  useScrollLock(true);
  return (
    <Portal>
      <div ref={ref} className="pp-sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <header className="pp-sheet__head">
          <button type="button" className="pp-sheet__btn" onClick={onCancel}>Cancel</button>
          <h2 className="pp-sheet__title">{title}</h2>
          <button type="button" className="pp-sheet__btn pp-sheet__btn--primary" onClick={onCommit}>{commitLabel}</button>
        </header>
        {children}
      </div>
    </Portal>
  );
}

// ---------------------------------------------------------------------------------------------
// PeoplePicker = trigger + panel
// ---------------------------------------------------------------------------------------------
export interface PickerTrigger {
  ref: RefObject<HTMLButtonElement>;
  onClick: () => void;
  'aria-haspopup': 'dialog';
  'aria-expanded': boolean;
}

interface CommonProps {
  people: Person[];
  ariaLabel?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  placeholder?: string;
  className?: string;
}
export interface MultiPickerProps extends CommonProps {
  mode?: 'multi';
  value: string[];
  onChange: (ids: string[]) => void;
  max?: number;
  title?: string;
  commitLabel?: string;
  /** Replace the default button. */
  trigger?: (t: PickerTrigger, open: boolean, selected: Person[]) => ReactNode;
}
export interface SinglePickerProps extends CommonProps {
  mode: 'single';
  value: string | null;
  onChange: (id: string | null) => void;
  allowNone?: boolean;
  noneLabel?: string;
  invalid?: boolean;
}

export function PeoplePicker(props: MultiPickerProps | SinglePickerProps) {
  if (props.mode === 'single') {
    const { mode: _m, ...rest } = props;
    void _m;
    return <PersonPicker {...rest} />;
  }
  return <MultiPicker {...props} />;
}

function MultiPicker({ people, value, onChange, max, title, commitLabel, trigger, ariaLabel = 'People', disabled, size = 'md', placeholder = 'Nobody', className }: MultiPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const selected = useMemo(() => value.map((id) => people.find((x) => x.id === id)).filter((x): x is Person => !!x), [value, people]);
  const t: PickerTrigger = { ref: ref as RefObject<HTMLButtonElement>, onClick: () => { if (!disabled) setOpen((o) => !o); }, 'aria-haspopup': 'dialog', 'aria-expanded': open };
  const label = selected.length === 0 ? placeholder : selected.length <= 2 ? selected.map((x) => x.name).join(', ') : `${selected.length} people`;
  return (
    <>
      {trigger ? trigger(t, open, selected) : (
        <button
          type="button" {...t} disabled={disabled} aria-label={`${ariaLabel}: ${selected.length ? selected.map((x) => x.name).join(', ') : placeholder}. Change`}
          className={cx('pm-select', size === 'sm' && 'pm-select--sm', open && 'is-open', className)}
        >
          {selected.length ? <AvatarStack people={selected} max={3} size={size === 'sm' ? 16 : 20} /> : <Avatar person={null} size={size === 'sm' ? 16 : 20} />}
          <span className={cx('pm-select__value pm-truncate', !selected.length && 'is-placeholder')}>{label}</span>
          <Icon name="chevronsUpDown" size={14} className="pm-select__caret" />
        </button>
      )}
      <PeoplePickerPanel
        anchor={ref.current}
        open={open}
        onClose={() => { setOpen(false); ref.current?.focus({ preventScroll: true }); }}
        onCommit={onChange}
        people={people}
        value={value}
        title={title ?? `Select ${ariaLabel.toLowerCase()}`}
        max={max}
        commitLabel={commitLabel}
      />
    </>
  );
}
