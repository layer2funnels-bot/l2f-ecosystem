import { taskMenuProps } from '../task/taskMenu.tsx';
import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import type { ProjectRole, TaskRow } from '../../shared/api.ts';
import { cx, fmtDate, todayYmd } from '../lib/util.ts';
import { daysLate } from '../lib/oversight.tsx';
import { links, openTask } from '../router.ts';
import { AssigneeStack, PriorityFlag } from '../ui/Badges.tsx';
import { Icon } from '../ui/icons.tsx';
import { Menu } from '../ui/Menu.tsx';
import type { MenuItem } from '../ui/Menu.tsx';

export type BoardColId = 'overdue' | 'today' | 'week' | 'later' | 'none';
export const BOARD_COLS: { id: BoardColId; label: string; hint: string }[] = [
  { id: 'overdue', label: 'Overdue', hint: 'Past due. Pick a new date by moving a card to another column.' },
  { id: 'today', label: 'Today', hint: 'Dropping here sets the due date to today' },
  { id: 'week', label: 'This week', hint: 'Dropping here sets the due date to this Friday (today if Friday has passed)' },
  { id: 'later', label: 'Later', hint: 'Dropping here sets the due date to 14 days from today' },
  { id: 'none', label: 'No date', hint: 'Dropping here clears the due date' },
];

/** Columns you can move a card into (Overdue is a result of time passing, never a target). */
const TARGETS = BOARD_COLS.filter((c) => c.id !== 'overdue');

/** Kanban over due-date buckets. Dragging a card (or using its "Move to" menu) changes its due date. */
export function MyWorkBoard({ buckets, roles, onMove, onComplete }: {
  buckets: Record<BoardColId, TaskRow[]>;
  roles: Map<string, ProjectRole>;
  onMove: (t: TaskRow, to: BoardColId) => void;
  onComplete: (t: TaskRow) => void;
}) {
  const dragRef = useRef<TaskRow | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<BoardColId | null>(null);
  const editable = (t: TaskRow) => roles.get(t.projectId) !== 'viewer';
  const end = () => { dragRef.current = null; setDragId(null); setOver(null); };

  return (
    <div className="pm-mwb" role="list" aria-label="My tasks by due date">
      {BOARD_COLS.map((c) => {
        const target = c.id !== 'overdue';
        const list = buckets[c.id];
        return (
          <section
            key={c.id}
            role="listitem"
            aria-label={`${c.label}, ${list.length} ${list.length === 1 ? 'task' : 'tasks'}`}
            className={cx('pm-mwb__col', c.id === 'overdue' && 'is-overdue', over === c.id && 'is-over')}
            title={c.hint}
            onDragOver={(e: DragEvent) => {
              if (!target || !dragRef.current) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setOver(c.id);
            }}
            onDragLeave={(e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === c.id ? null : o)); }}
            onDrop={(e: DragEvent) => {
              if (!target) return;
              e.preventDefault();
              const t = dragRef.current;
              end();
              if (t) onMove(t, c.id);
            }}
          >
            <h2 className="pm-mwb__head">
              <span>{c.label}</span>
              <span className="pm-mw-count pm-num">{list.length}</span>
            </h2>
            <ul className="pm-mwb__list">
              {list.length === 0 && <li className="pm-mwb__empty pm-faint">{target ? 'Drop a task here' : 'Nothing overdue'}</li>}
              {list.map((t) => (
                <Card
                  key={t.id}
                  t={t}
                  col={c.id}
                  canEdit={editable(t)}
                  dragging={dragId === t.id}
                  onDragStart={(e) => {
                    dragRef.current = t;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', t.title);
                    window.setTimeout(() => setDragId(t.id), 0);
                  }}
                  onDragEnd={end}
                  onMove={(to) => onMove(t, to)}
                  onComplete={() => onComplete(t)}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Card({ t, col, canEdit, dragging, onDragStart, onDragEnd, onMove, onComplete }: {
  t: TaskRow; col: BoardColId; canEdit: boolean; dragging: boolean;
  onDragStart: (e: DragEvent) => void; onDragEnd: () => void; onMove: (to: BoardColId) => void; onComplete: () => void;
}) {
  const today = todayYmd();
  const lateText = daysLate(t.dueOn, false);
  const items: MenuItem[] = TARGETS.map((c) => ({ id: c.id, label: c.label, selected: c.id === col, disabled: c.id === col, onSelect: () => onMove(c.id) }));
  return (
    <li
      className={cx('pm-mwb__card', dragging && 'is-dragging', !canEdit && 'is-locked')}
      {...taskMenuProps(t)}
      draggable={canEdit}
      onDragStart={canEdit ? onDragStart : undefined}
      onDragEnd={onDragEnd}
    >
      <div className="pm-mwb__top">
        {canEdit ? (
          <button type="button" role="checkbox" aria-checked={false} aria-label={`Mark “${t.title}” complete`} title="Mark complete" className="pm-circle" onClick={onComplete} />
        ) : (
          <span className="pm-mwb__lock" title="View-only in this project"><Icon name="lock" size={12} /></span>
        )}
        <button type="button" className="pm-mwb__title" onClick={() => openTask(t.id)} title={t.title}>{t.title}</button>
        {canEdit && (
          <Menu
            items={items}
            align="end"
            label={`Move “${t.title}” to`}
            trigger={(tp) => <button type="button" className="pm-mwb__more" aria-label={`Move “${t.title}” to another column`} title="Move to…" {...tp}><Icon name="more" size={14} /></button>}
          />
        )}
      </div>
      <a className="pm-mwb__proj pm-truncate" href={links.project(t.projectId)} title={`Open project ${t.projectName}`}>
        <span className="pm-dot" style={{ background: t.projectColor }} aria-hidden="true" />
        <span className="pm-truncate">{t.projectName}</span>
      </a>
      <div className="pm-mwb__meta">
        <span className={cx('pm-num', col === 'overdue' && 'pm-mwb__late')}>
          {t.dueOn ? (t.dueOn === today ? 'Today' : fmtDate(t.dueOn)) : <span className="pm-faint">No date</span>}
          {lateText && <span className="pm-mw-row__late">{lateText}</span>}
        </span>
        {t.priority !== 'none' && <PriorityFlag priority={t.priority} showLabel={false} />}
        {t.assignees.length > 1 && <AssigneeStack people={t.assignees} max={3} size={20} empty={false} />}
      </div>
    </li>
  );
}
