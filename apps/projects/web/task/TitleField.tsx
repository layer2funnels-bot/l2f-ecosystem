import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useTask } from './context.ts';
import { consumeTitleEdit } from './panelNav.ts';
import { activeEl } from '../lib/dom.ts';

/** Large inline-editable title. Saves on blur / Enter, Escape reverts. */
export function TitleField() {
  const { task, readOnly, update } = useTask();
  const [val, setVal] = useState(task.title);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const cancel = useRef(false);
  const errId = useId();

  useEffect(() => {
    if (consumeTitleEdit(task.id) && !readOnly) { ref.current?.focus({ preventScroll: true }); ref.current?.select(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeEl() !== ref.current) { setVal(task.title); setErr(null); }
  }, [task.title]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [val]);

  const commit = (): boolean => {
    const t = val.trim();
    if (t === task.title) { setVal(task.title); setErr(null); return true; }
    if (!t) { setErr('The title can’t be empty.'); return false; }
    if (t.length > 300) { setErr(`The title is ${t.length} characters; the limit is 300.`); return false; }
    setErr(null);
    setVal(t);
    void update({ title: t }, { title: t });
    return true;
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (commit()) ref.current?.blur(); }
    else if (e.key === 'Escape') {
      e.preventDefault();
      cancel.current = true;
      setVal(task.title);
      setErr(null);
      ref.current?.blur();
    }
  };

  return (
    <div className="pm-title">
      <textarea
        ref={ref}
        className="pm-title__input"
        value={val}
        rows={1}
        readOnly={readOnly}
        aria-label="Task title"
        aria-invalid={!!err || undefined}
        aria-describedby={err ? errId : undefined}
        spellCheck
        onChange={(e) => { setVal(e.target.value.replace(/\n/g, ' ')); if (err) setErr(null); }}
        onKeyDown={onKey}
        onFocus={() => { cancel.current = false; }}
        onBlur={() => { if (cancel.current) { cancel.current = false; return; } if (!readOnly) commit(); }}
      />
      {err && <p id={errId} className="pm-tf__error" role="alert">{err}</p>}
    </div>
  );
}
