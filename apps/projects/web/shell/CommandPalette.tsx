import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ApiError, call } from '../api/client.ts';
import type { SearchResults } from '../../shared/api.ts';
import { useDebounced } from '../lib/hooks.ts';
import { kindCaption } from '../lib/projectKind.ts';
import { cx, fmtDate, TASK_STATUS_META } from '../lib/util.ts';
import { links, navigate } from '../router.ts';
import { Icon } from '../ui/icons.tsx';
import type { IconName } from '../ui/icons.tsx';
import { Kbd, Skeleton } from '../ui/Feedback.tsx';
import { Portal, useFocusTrap, useScrollLock } from '../ui/Overlay.tsx';
import { useShell } from './ShellContext.tsx';
import { KeyCombo } from './ShortcutsHelp.tsx';
import { SHORTCUTS } from './shortcuts.ts';
import type { ShortcutDef } from './shortcuts.ts';

interface Row { id: string; icon?: IconName; dot?: string; title: string; sub?: string; group: string; keys?: string[]; run: () => void }
const ACTION_ORDER = ['quick-add', 'new-project', 'theme', 'help'];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 220);
  const [res, setRes] = useState<SearchResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const uid = useId();
  const shell = useShell();
  useFocusTrap(box, open);
  useScrollLock(open);

  useEffect(() => { if (open) { setQ(''); setRes(null); setErr(null); setActive(0); } }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!dq) { setRes(null); setBusy(false); setErr(null); return; }
    let cancelled = false;
    setBusy(true);
    setErr(null);
    call('search.query', { q: dq })
      .then((r) => { if (!cancelled) { setRes(r); setActive(0); } })
      .catch((e: unknown) => { if (!cancelled) { setRes(null); setErr(e instanceof ApiError ? e.message : 'Search failed'); } })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [dq, open]);

  const go = (fn: () => void) => () => { onClose(); fn(); };
  const searchRows = useMemo<Row[]>(() => {
    if (!res || dq !== q.trim()) return [];
    return [
      ...res.projects.map<Row>((p) => ({ id: `p-${p.id}`, dot: p.color, title: p.name, sub: kindCaption(p), group: 'Projects', run: go(() => navigate(links.project(p.id))) })),
      ...res.tasks.map<Row>((t) => ({
        id: `t-${t.id}`, icon: 'checkCircle', title: t.title,
        sub: `${t.projectName} \u00b7 ${TASK_STATUS_META[t.status].label}${t.dueOn ? ` \u00b7 due ${fmtDate(t.dueOn)}` : ''}`,
        group: 'Tasks', run: go(() => navigate(links.project(t.projectId, null, t.id))),
      })),
    ];
    // eslint-disable-next-line
  }, [q, dq, res]);

  // Actions come straight from the shortcut registry, with their shortcut shown on the right.
  const actionRows = useMemo<Row[]>(() => {
    const needle = q.trim().toLowerCase();
    return SHORTCUTS
      .filter((s) => s.palette && s.run && s.when?.(shell.ctx) !== false)
      .filter((s) => !needle || (s.palette as NonNullable<ShortcutDef['palette']>).title.toLowerCase().includes(needle))
      .sort((a, b) => {
        const ga = a.palette?.group === 'Go to' ? 0 : 1, gb = b.palette?.group === 'Go to' ? 0 : 1;
        return ga - gb || ACTION_ORDER.indexOf(a.id) - ACTION_ORDER.indexOf(b.id);
      })
      .map<Row>((s) => ({
        id: `a-${s.id}`, icon: s.palette?.icon, title: s.palette?.title ?? s.label, group: s.palette?.group ?? 'Actions',
        keys: s.keys[0], run: go(() => { s.run?.(shell.ctx); }),
      }));
    // eslint-disable-next-line
  }, [q, shell.ctx]);

  const rows = useMemo<Row[]>(() => [...actionRows, ...searchRows], [actionRows, searchRows]);
  if (!open) return null;
  const searching = q.trim() !== '' && (busy || dq !== q.trim());
  const noResults = q.trim() !== '' && !searching && !err && rows.length === 0;

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(rows.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (rows[active]) rows[active].run();
      else if (q.trim()) { onClose(); navigate(links.search(q.trim())); }
    }
  };

  let lastGroup = '';
  return (
    <Portal>
      <div className="pm-overlay pm-overlay--top" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div ref={box} className="pm-palette" role="dialog" aria-modal="true" aria-label="Command palette" tabIndex={-1} onKeyDown={onKey}>
          <div className="pm-palette__input">
            <Icon name="search" />
            <input
              data-autofocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search projects and tasks, or run a command…"
              aria-label="Search projects and tasks, or run a command"
              role="combobox"
              aria-expanded="true"
              aria-controls={`${uid}-list`}
              aria-activedescendant={rows[active] ? `${uid}-${active}` : undefined}
              autoComplete="off"
              spellCheck={false}
            />
            <Kbd>Esc</Kbd>
          </div>
          <div className="pm-palette__body" id={`${uid}-list`} role="listbox" aria-label="Results">
            {searching && searchRows.length === 0 && <div className="pm-palette__skeleton"><Skeleton height={36} /><Skeleton height={36} /><Skeleton height={36} /></div>}
            {err && <div className="pm-palette__msg" role="alert">{err}</div>}
            {noResults && (
              <div className="pm-palette__msg">
                <strong>No results for “{q.trim()}”</strong>
                <span className="pm-faint">Check the spelling or try a shorter word.</span>
              </div>
            )}
            {rows.map((r, i) => {
              const header = r.group !== lastGroup ? r.group : null;
              lastGroup = r.group;
              return (
                <div key={r.id}>
                  {header && <div className="pm-palette__group" role="presentation">{header}</div>}
                  <div
                    id={`${uid}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className={cx('pm-palette__row', i === active && 'is-active')}
                    onMouseMove={() => setActive(i)}
                    onClick={r.run}
                  >
                    {r.dot ? <span className="pm-dot pm-dot--lg" style={{ background: r.dot }} /> : <Icon name={r.icon ?? 'folder'} />}
                    <span className="pm-palette__title pm-truncate">{r.title}</span>
                    {r.sub && <span className="pm-palette__sub pm-faint pm-truncate">{r.sub}</span>}
                    {r.keys ? <span className="pm-palette__keys"><KeyCombo keys={r.keys} /></span> : i === active && <Icon name="arrowRight" size={14} className="pm-faint" />}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="pm-palette__foot pm-faint">
            <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> navigate</span>
            <span><Kbd>↵</Kbd> open</span>
            {q.trim() && <span>Press <Kbd>↵</Kbd> with nothing selected for full search</span>}
          </div>
        </div>
      </div>
    </Portal>
  );
}
