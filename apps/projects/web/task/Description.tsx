import { useEffect, useRef, useState } from 'react';
import { Textarea } from '../ui/index.ts';
import { useTask } from './context.ts';
import type { UpdateResult } from './context.ts';
import { Section } from './Section.tsx';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function Description() {
  const { task, readOnly, update } = useTask();
  const [draft, setDraft] = useState(task.description);
  const [state, setState] = useState<SaveState>('idle');
  const saved = useRef(task.description);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const focused = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const hideTimer = useRef<number | undefined>(undefined);
  const updateRef = useRef<(p: { description: string }, l: { description: string }) => Promise<UpdateResult>>(update);
  updateRef.current = update;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const saving = useRef(false);

  // Accept server changes while the user is not editing.
  useEffect(() => {
    if (focused.current || saving.current) return;
    setDraft(task.description);
    saved.current = task.description;
  }, [task.description]);

  const save = async (value: string) => {
    window.clearTimeout(timer.current);
    if (value === saved.current || readOnlyRef.current) return;
    saving.current = true;
    setState('saving');
    const r = await updateRef.current({ description: value }, { description: value });
    saving.current = false;
    if (r.ok) {
      saved.current = value;
      setState('saved');
      window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setState('idle'), 2200);
      if (draftRef.current !== value) timer.current = window.setTimeout(() => void save(draftRef.current), 400);
    } else setState('error');
  };

  const onChange = (v: string) => {
    setDraft(v);
    setState('idle');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(v), 900);
  };

  // Flush a pending edit when the drawer closes.
  useEffect(() => () => {
    window.clearTimeout(timer.current);
    window.clearTimeout(hideTimer.current);
    if (!readOnlyRef.current && draftRef.current !== saved.current) void updateRef.current({ description: draftRef.current }, { description: draftRef.current });
  }, []);

  const hint = state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : state === 'error' ? 'Not saved' : '';
  return (
    <Section title="Description" actions={
      <span className="pm-ts__hint" role="status" aria-live="polite">
        {hint}
        {state === 'error' && <> · <button type="button" className="pm-linkbtn" onClick={() => void save(draft)}>Retry</button></>}
      </span>
    }>
      {readOnly ? (
        task.description ? <div className="pm-prose pm-task__prose">{task.description}</div> : <p className="pm-faint">No description.</p>
      ) : (
        <Textarea
          className="pm-task__desc"
          value={draft}
          rows={3}
          maxRows={18}
          placeholder="What is this task about?"
          aria-label="Description"
          maxLength={50000}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => { focused.current = true; }}
          onBlur={() => { focused.current = false; void save(draftRef.current); }}
        />
      )}
    </Section>
  );
}
