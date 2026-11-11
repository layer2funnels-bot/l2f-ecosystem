import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { OrgMember } from '../../shared/api.ts';
import { call } from '../api/client.ts';
import { cx } from '../lib/util.ts';
import { Avatar, Button, Kbd, Textarea } from '../ui/index.ts';
import { useTask } from './context.ts';
import { extractMentions } from './format.ts';

const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform);

/** Sticky comment box with an @mention picker. */
export function Composer({ onSent }: { onSent: () => void }) {
  const { task, people, me, act, trashed } = useTask();
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const uid = useId();

  // The "@query" being typed right before the caret, if any.
  const token = useMemo(() => {
    const m = /(?:^|\s)@([^\n@]{0,30})$/.exec(text.slice(0, caret));
    return m ? { query: m[1], start: caret - m[1].length - 1 } : null;
  }, [text, caret]);

  const matches = useMemo<OrgMember[]>(() => {
    if (!token) return [];
    const q = token.query.toLowerCase();
    return people
      .filter((p) => p.id !== me.id && (p.name.toLowerCase().includes(q) || p.email.toLowerCase().startsWith(q)))
      .sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name))
      .slice(0, 6);
  }, [token, people, me.id]);

  const open = !!token && !dismissed && matches.length > 0;
  useEffect(() => { setActive(0); }, [token?.query]);

  const sync = () => { if (ta.current) setCaret(ta.current.selectionStart); };

  const pick = (p: OrgMember) => {
    if (!token) return;
    const insert = `@${p.name} `;
    const next = text.slice(0, token.start) + insert + text.slice(caret);
    const pos = token.start + insert.length;
    setText(next);
    setCaret(pos);
    setDismissed(false);
    requestAnimationFrame(() => { ta.current?.focus(); ta.current?.setSelectionRange(pos, pos); });
  };

  const body = text.trim();
  const send = async () => {
    if (!body || busy || trashed) return;
    setBusy(true);
    const mentions = extractMentions(body, people.filter((p) => p.id !== me.id));
    const r = await act(() => call('comments.add', { taskId: task.id, body, mentions }));
    setBusy(false);
    if (r.ok) { setText(''); setCaret(0); onSent(); ta.current?.focus(); }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % matches.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + matches.length) % matches.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(matches[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); setDismissed(true); }
  };

  return (
    <div className="pm-composer">
      {open && (
        <ul className="pm-mentions" role="listbox" id={`${uid}-list`} aria-label="Mention a teammate">
          {matches.map((p, i) => (
            <li
              key={p.id}
              id={`${uid}-${i}`}
              role="option"
              aria-selected={i === active}
              className={cx('pm-mentions__item', i === active && 'is-active')}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(p); }}
            >
              <Avatar person={p} size={22} />
              <span className="pm-truncate">{p.name}</span>
              <span className="pm-faint pm-truncate">{p.email}</span>
            </li>
          ))}
        </ul>
      )}
      <Avatar person={me} size={28} className="pm-composer__me" />
      <div className="pm-composer__box">
        <Textarea
          ref={ta}
          value={text}
          rows={1}
          maxRows={6}
          disabled={trashed}
          placeholder={trashed ? 'Restore this task to comment' : 'Add a comment or @mention a teammate'}
          aria-label="Add a comment"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? `${uid}-list` : undefined}
          aria-activedescendant={open ? `${uid}-${active}` : undefined}
          maxLength={10000}
          onChange={(e) => { setText(e.target.value); setCaret(e.target.selectionStart); setDismissed(false); }}
          onKeyDown={onKey}
          onKeyUp={sync}
          onClick={sync}
          onSelect={sync}
        />
        <div className="pm-composer__foot">
          <span className="pm-faint pm-composer__hint"><Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd> <Kbd>Enter</Kbd> to send</span>
          <Button variant="primary" size="sm" icon="arrowRight" loading={busy} disabled={!body || trashed} onClick={() => void send()}>Comment</Button>
        </div>
      </div>
    </div>
  );
}
