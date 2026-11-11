import { forwardRef, useMemo } from 'react';
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import type { Person, Priority, ProjectStatus, TaskStatus } from '../../shared/api.ts';
import { PRIORITIES, PROJECT_STATUSES, TASK_STATUSES } from '../../shared/api.ts';
import { cx, initials, PRIORITY_META, PROJECT_STATUS_META, TASK_STATUS_META } from '../lib/util.ts';
import { Icon } from './icons.tsx';
import { Menu } from './Menu.tsx';
import type { MenuItem } from './Menu.tsx';

// ---------- Avatar ----------
export function Avatar({ person, size = 24, className }: { person: Pick<Person, 'name' | 'color'> | null; size?: number; className?: string }) {
  const style: CSSProperties = { width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.4)), background: person?.color ?? 'var(--pm-border-strong)' };
  return (
    <span className={cx('pm-avatar', !person && 'is-empty', className)} style={style} title={person?.name} aria-hidden={person ? undefined : true}>
      {person ? initials(person.name) : <Icon name="user" size={Math.round(size * 0.6)} />}
    </span>
  );
}

export function AvatarStack({ people, max = 4, size = 24 }: { people: Pick<Person, 'name' | 'color' | 'id'>[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="pm-avatars" role="img" aria-label={`${people.length} ${people.length === 1 ? 'person' : 'people'}: ${people.map((p) => p.name).join(', ')}`}>
      {shown.map((p) => <Avatar key={p.id} person={p} size={size} className="pm-avatars__item" />)}
      {extra > 0 && <span className="pm-avatar pm-avatars__item pm-avatars__more" style={{ width: size, height: size, fontSize: 10 }} title={people.slice(max).map((p) => p.name).join(', ')}>+{extra}</span>}
    </span>
  );
}

/** Everyone assigned to a task: up to `max` overlapping avatars and "+N". With nobody assigned: a dashed empty avatar (`empty`) or nothing. */
export function AssigneeStack({ people, max = 3, size = 22, empty = true }: { people: Pick<Person, 'name' | 'color' | 'id'>[]; max?: number; size?: number; empty?: boolean }) {
  if (people.length === 0) return empty ? <span className="pm-avatars" role="img" aria-label="Unassigned"><Avatar person={null} size={size} /></span> : null;
  return <AvatarStack people={people} max={max} size={size} />;
}

// ---------- Chip / Badge ----------
export function Chip({ children, selected, onClick, onRemove, icon, color, className }: {
  children: ReactNode; selected?: boolean; onClick?: () => void; onRemove?: () => void; icon?: ReactNode; color?: string; className?: string;
}) {
  const style = color ? ({ '--chip': color } as CSSProperties) : undefined;
  const body = (<>{icon}<span className="pm-truncate">{children}</span></>);
  return (
    <span className={cx('pm-chip', selected && 'is-selected', color && 'has-color', onClick && 'is-interactive', className)} style={style}>
      {onClick ? <button type="button" className="pm-chip__btn" aria-pressed={selected} onClick={onClick}>{body}</button> : body}
      {onRemove && <button type="button" className="pm-chip__remove" aria-label="Remove" title="Remove" onClick={onRemove}><Icon name="x" size={12} /></button>}
    </span>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'danger' }) {
  return <span className={cx('pm-badge', `pm-badge--${tone}`)}>{children}</span>;
}

// ---------- Status pill ----------
export type PillKind = 'task' | 'project';
function pillMeta(kind: PillKind, status: string) {
  const m = kind === 'task' ? TASK_STATUS_META[status as TaskStatus] : PROJECT_STATUS_META[status as ProjectStatus];
  return m ?? { label: status, color: 'var(--pm-st-todo)' };
}

interface PillProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> { status: string; kind?: PillKind; interactive?: boolean; compact?: boolean }

export const StatusPill = forwardRef<HTMLButtonElement, PillProps>(function StatusPill({ status, kind = 'task', interactive, compact, className, ...rest }, ref) {
  const m = pillMeta(kind, status);
  const style = { '--pill': m.color } as CSSProperties;
  const inner = (<><span className="pm-pill__dot" /><span>{m.label}</span>{interactive && <Icon name="chevronDown" size={12} className="pm-pill__caret" />}</>);
  if (interactive) {
    return <button ref={ref} type="button" className={cx('pm-pill pm-pill--button', compact && 'pm-pill--sm', className)} style={style} {...rest}>{inner}</button>;
  }
  return <span className={cx('pm-pill', compact && 'pm-pill--sm', className)} style={style}>{inner}</span>;
});

export function StatusMenu<T extends string>({ kind = 'task', value, onChange, disabled, compact }: { kind?: PillKind; value: T; onChange: (v: T) => void; disabled?: boolean; compact?: boolean }) {
  const list = (kind === 'task' ? TASK_STATUSES : PROJECT_STATUSES) as string[];
  const items = useMemo<MenuItem[]>(() => list.map((s) => ({
    id: s, label: pillMeta(kind, s).label, selected: s === value,
    leading: <span className="pm-dot" style={{ background: pillMeta(kind, s).color }} />,
    onSelect: () => { if (s !== value) onChange(s as T); },
  })), [list, kind, value, onChange]);
  if (disabled) return <StatusPill status={value} kind={kind} compact={compact} />;
  return <Menu role="listbox" items={items} label="Status" trigger={(t) => <StatusPill status={value} kind={kind} interactive compact={compact} aria-label={`Status: ${pillMeta(kind, value).label}. Change`} {...t} />} />;
}

// ---------- Priority ----------
export function PriorityFlag({ priority, showLabel = true }: { priority: Priority; showLabel?: boolean }) {
  const m = PRIORITY_META[priority];
  return (
    <span className="pm-prio" style={{ '--prio': m.color } as CSSProperties} title={showLabel ? undefined : m.label}>
      <Icon name="flag" size={14} />
      {showLabel && <span>{m.label}</span>}
    </span>
  );
}

export function PriorityMenu({ value, onChange, disabled, showLabel = true }: { value: Priority; onChange: (v: Priority) => void; disabled?: boolean; showLabel?: boolean }) {
  const items = useMemo<MenuItem[]>(() => [...PRIORITIES].reverse().map((p) => ({
    id: p, label: PRIORITY_META[p].label, selected: p === value,
    leading: <Icon name="flag" size={14} style={{ color: PRIORITY_META[p].color }} />,
    onSelect: () => { if (p !== value) onChange(p); },
  })), [value, onChange]);
  if (disabled) return <PriorityFlag priority={value} showLabel={showLabel} />;
  return (
    <Menu role="listbox" items={items} label="Priority" trigger={(t) => (
      <button type="button" className="pm-prio-btn" aria-label={`Priority: ${PRIORITY_META[value].label}. Change`} {...t}><PriorityFlag priority={value} showLabel={showLabel} /></button>
    )} />
  );
}

// ---------- Progress ----------
export function ProgressBar({ value, color, height = 6, label }: { value: number; color?: string; height?: number; label?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="pm-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-label={label ?? 'Progress'} style={{ height }}>
      <div className="pm-progress__bar" style={{ width: `${v}%`, background: color ?? 'var(--pm-accent)' }} />
    </div>
  );
}
