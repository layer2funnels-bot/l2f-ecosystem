import { useMemo } from 'react';
import type { Person } from '../../shared/api.ts';
import { cx } from '../lib/util.ts';
import { Avatar } from './Badges.tsx';
import { Icon } from './icons.tsx';
import { Menu } from './Menu.tsx';
import type { MenuItem } from './Menu.tsx';

export function PersonPicker({ people, value, onChange, allowNone = true, noneLabel = 'Unassigned', placeholder, disabled, invalid, size = 'md', ariaLabel = 'Person', className }: {
  people: Person[];
  value: string | null;
  onChange: (id: string | null) => void;
  allowNone?: boolean;
  noneLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  size?: 'sm' | 'md';
  ariaLabel?: string;
  className?: string;
}) {
  const items = useMemo<MenuItem[]>(() => {
    const list: MenuItem[] = people.map((p) => ({
      id: p.id, label: p.name, text: `${p.name} ${p.email}`, hint: <span className="pm-faint">{p.email}</span>,
      leading: <Avatar person={p} size={20} />, selected: p.id === value, onSelect: () => onChange(p.id),
    }));
    if (allowNone) list.unshift({ id: '__none', label: noneLabel, text: noneLabel, leading: <Avatar person={null} size={20} />, selected: value === null, onSelect: () => onChange(null) });
    return list;
  }, [people, value, allowNone, noneLabel, onChange]);
  const current = people.find((p) => p.id === value) ?? null;
  return (
    <Menu
      role="listbox"
      items={items}
      searchable
      searchPlaceholder="Search people…"
      emptyText="No people found"
      label={ariaLabel}
      matchWidth
      trigger={(t, open) => (
        <button type="button" {...t} disabled={disabled} aria-label={`${ariaLabel}: ${current?.name ?? placeholder ?? noneLabel}`} className={cx('pm-select', size === 'sm' && 'pm-select--sm', open && 'is-open', invalid && 'is-invalid', className)}>
          <Avatar person={current} size={size === 'sm' ? 16 : 20} />
          <span className={cx('pm-select__value pm-truncate', !current && 'is-placeholder')}>{current?.name ?? placeholder ?? noneLabel}</span>
          <Icon name="chevronsUpDown" size={14} className="pm-select__caret" />
        </button>
      )}
    />
  );
}
