import { useState } from 'react';
import type { FormEvent } from 'react';
import type { TimeEntry } from '../../shared/api.ts';
import { call } from '../api/client.ts';
import { useQuery } from '../api/store.ts';
import { useNow } from '../lib/hooks.ts';
import { fmtDate, fmtElapsed, fmtMinutes, todayYmd } from '../lib/util.ts';
import { Avatar, Badge, Button, DatePicker, Icon, Input, Toggle, toast } from '../ui/index.ts';
import { useTask } from './context.ts';
import { entryDate, parseDuration } from './format.ts';
import { Section } from './Section.tsx';

// The server accepts up to UTC today + 1, which covers every timezone's local "today".
const safeToday = todayYmd;

export function TimeTracking() {
  const { task, trashed, act } = useTask();
  // Same key as the top-bar pill, so both always agree.
  const timer = useQuery('timer', () => call('time.running', {}), [], { refetchInterval: 30_000 });
  const running = timer.data ?? null;
  const mine = running?.taskId === task.id;
  const now = useNow(mine);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    const r = await act(() => call('time.start', { taskId: task.id }));
    if (r.ok) { void timer.refetch(); if (running && running.taskId !== task.id) toast.info(`Stopped the timer on “${running.taskTitle}”`); }
    setBusy(false);
  };
  const stop = async () => {
    setBusy(true);
    const r = await act(() => call('time.stop', {}));
    if (r.ok) { void timer.refetch(); toast.success('Timer stopped'); }
    setBusy(false);
  };

  const entries = [...task.time].reverse();
  const finished = task.time.filter((e) => e.endedAt);
  return (
    <Section title="Time" meta={fmtMinutes(task.totalMinutes)}>
      <div className="pm-time__top">
        <div className="pm-time__total">
          <span className="pm-time__big pm-num">{fmtMinutes(task.totalMinutes)}</span>
          <span className="pm-faint">
            logged{task.estimateMinutes ? ` of ${fmtMinutes(task.estimateMinutes)} estimated` : ''}
            {finished.length ? ` · ${finished.length} ${finished.length === 1 ? 'entry' : 'entries'}` : ''}
          </span>
        </div>
        {mine ? (
          <Button variant="danger" icon="stop" loading={busy} onClick={() => void stop()}>
            Stop timer <span className="pm-time__live pm-num" role="timer" aria-label={`Elapsed ${fmtElapsed(now - new Date(running.startedAt).getTime())}`}>{fmtElapsed(now - new Date(running.startedAt).getTime())}</span>
          </Button>
        ) : (
          <Button icon="play" loading={busy} disabled={trashed} onClick={() => void start()}>Start timer</Button>
        )}
      </div>
      {running && !mine && <p className="pm-tf__hint">A timer is running on “{running.taskTitle}”. Starting here stops it.</p>}
      {!trashed && <LogForm />}
      {entries.length > 0 && (
        <ul className="pm-entries" aria-label="Time entries">
          {entries.map((e) => <Entry key={e.id} e={e} />)}
        </ul>
      )}
    </Section>
  );
}

function Entry({ e }: { e: TimeEntry }) {
  const { act } = useTask();
  const live = !e.endedAt;
  const remove = () => void act(() => call('time.remove', { id: e.id }), (d) => ({ ...d, time: d.time.filter((x) => x.id !== e.id) }));
  return (
    <li className="pm-entry">
      <Avatar person={e.user} size={22} />
      <div className="pm-entry__text">
        <div className="pm-entry__line">
          <span className="pm-entry__who pm-truncate">{e.user.name}</span>
          <span className="pm-num pm-entry__dur">{live ? 'Running' : fmtMinutes(e.minutes)}</span>
          <span className="pm-faint">{fmtDate(entryDate(e.startedAt))}</span>
          {e.billable && <Badge tone="accent">Billable</Badge>}
        </div>
        {e.note && <div className="pm-entry__note">{e.note}</div>}
      </div>
      {e.mine && !live && <button type="button" className="pm-mini pm-mini--danger" aria-label={`Delete ${fmtMinutes(e.minutes)} entry`} title={`Delete ${fmtMinutes(e.minutes)} entry`} onClick={remove}><Icon name="trash" size={14} /></button>}
    </li>
  );
}

function LogForm() {
  const { task, act } = useTask();
  const [open, setOpen] = useState(false);
  const [dur, setDur] = useState('');
  const [date, setDate] = useState(safeToday());
  const [note, setNote] = useState('');
  const [billable, setBillable] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const m = parseDuration(dur);
    if (m === null) { setErr('Enter how long you worked, like 1h 15m.'); return; }
    if (m === 'invalid') { setErr('That duration isn’t clear. Try 1h 15m, 90m or 1.5h.'); return; }
    if (m < 1 || m > 1440) { setErr('A time entry must be between 1 minute and 24 hours.'); return; }
    if (date > safeToday()) { setErr('The date can’t be in the future.'); return; }
    setErr(null);
    setBusy(true);
    const r = await act(() => call('time.log', { taskId: task.id, minutes: m, date, note: note.trim() || undefined, billable }), undefined, { silent: true });
    setBusy(false);
    if (r.ok) { setDur(''); setNote(''); setBillable(false); setDate(safeToday()); setOpen(false); toast.success(`Logged ${fmtMinutes(m)}`); }
    else setErr(r.error.message);
  };

  if (!open) return <div><Button size="sm" icon="clock" onClick={() => setOpen(true)}>Log time</Button></div>;
  return (
    <form className="pm-logform" onSubmit={(e) => void submit(e)} noValidate aria-label="Log time">
      <div className="pm-logform__row">
        <label className="pm-field">
          <span className="pm-field__label">Duration</span>
          <Input value={dur} onChange={(e) => { setDur(e.target.value); setErr(null); }} placeholder="1h 15m" invalid={!!err && !note} autoComplete="off" data-autofocus />
        </label>
        <div className="pm-field">
          <span className="pm-field__label" id="pm-log-date">Date</span>
          <DatePicker value={date} onChange={(v) => setDate(v ?? safeToday())} max={safeToday()} clearable={false} ariaLabel="Date worked" />
        </div>
      </div>
      <label className="pm-field">
        <span className="pm-field__label">Note (optional)</span>
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="What did you work on?" autoComplete="off" />
      </label>
      <div className="pm-logform__foot">
        <span className="pm-logform__bill"><Toggle checked={billable} onChange={setBillable} label="Billable" /> <span>Billable</span></span>
        <span className="pm-spacer" />
        <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setErr(null); }}>Cancel</Button>
        <Button size="sm" variant="primary" type="submit" loading={busy}>Log time</Button>
      </div>
      {err && <p className="pm-tf__error" role="alert">{err}</p>}
    </form>
  );
}

