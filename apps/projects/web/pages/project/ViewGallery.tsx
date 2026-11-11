// "+ View" button at the end of the tab bar and the View Gallery popover it opens.
import { useEffect, useRef, useState } from 'react';
import type { OptionalViewKind } from '../../../shared/api.ts';
import { cx } from '../../lib/util.ts';
import { Icon } from '../../ui/icons.tsx';
import { Popover } from '../../ui/Overlay.tsx';
import { OPTIONAL_VIEWS } from './resourceKit.tsx';

export function ViewGalleryButton({ added, busy, onPick }: { added: OptionalViewKind[]; busy: boolean; onPick: (kind: OptionalViewKind) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const btn = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQ(''); requestAnimationFrame(() => search.current?.focus()); } }, [open]);
  const needle = q.trim().toLowerCase();
  const shown = OPTIONAL_VIEWS.filter((v) => !needle || `${v.label} ${v.description}`.toLowerCase().includes(needle));
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={cx('pm-tab pm-tab--add', open && 'is-open')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Add a view"
        title="Add a view"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Icon name="plus" size={14} /><span>View</span>
      </button>
      <Popover anchor={btn.current} open={open} onClose={() => setOpen(false)} className="pm-vg" label="View gallery">
        <div className="pm-vg__body" role="dialog" aria-label="View gallery">
          <div className="pm-vg__search">
            <Icon name="search" size={14} />
            <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search views…" aria-label="Search views" autoComplete="off" spellCheck={false} />
          </div>
          <h3 className="pm-vg__heading">Optional views</h3>
          {shown.length === 0 ? <p className="pm-vg__empty">No views match “{q}”.</p> : (
            <ul className="pm-vg__grid">
              {shown.map((v) => {
                const on = added.includes(v.kind);
                return (
                  <li key={v.kind}>
                    <button type="button" className={cx('pm-vg__card', on && 'is-added')} disabled={busy} onClick={() => { setOpen(false); onPick(v.kind); }}>
                      <span className="pm-vg__icon"><Icon name={v.icon} size={18} /></span>
                      <span className="pm-vg__text">
                        <span className="pm-vg__name">{v.label}{on && <span className="pm-vg__check" title="Already added"><Icon name="check" size={13} /><span className="pm-sr-only">Added</span></span>}</span>
                        <span className="pm-vg__desc">{v.description}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="pm-vg__foot">Views you add appear for everyone in this project only.</p>
        </div>
      </Popover>
    </>
  );
}
