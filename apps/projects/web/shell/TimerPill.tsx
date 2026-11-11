import { call } from '../api/client.ts';
import { invalidate, useMutation, useQuery } from '../api/store.ts';
import { useNow } from '../lib/hooks.ts';
import { fmtElapsed } from '../lib/util.ts';
import { links } from '../router.ts';
import { Icon } from '../ui/icons.tsx';
import { Tooltip } from '../ui/Overlay.tsx';

/** Running-timer pill: live elapsed time; the stop button stops it. */
export function TimerPill() {
  const timer = useQuery('timer', () => call('time.running', {}), [], { refetchInterval: 30_000 });
  const t = timer.data ?? null;
  const now = useNow(!!t);
  const stop = useMutation(() => call('time.stop', {}), {
    invalidate: [],
    onSuccess: () => invalidate('timer', 'task', 'tasks', 'mywork', 'workload'),
    success: 'Timer stopped',
  });
  if (!t) return null;
  const elapsed = fmtElapsed(now - new Date(t.startedAt).getTime());
  return (
    <div className="pm-timer">
      <Tooltip label={`Open "${t.taskTitle}"`}>
        <a className="pm-timer__task" href={links.project(t.projectId, null, t.taskId)}>
          <span className="pm-timer__dot" aria-hidden="true" />
          <span className="pm-timer__title pm-truncate">{t.taskTitle}</span>
          <span className="pm-timer__time pm-num" role="timer" aria-label={`Elapsed ${elapsed}`}>{elapsed}</span>
        </a>
      </Tooltip>
      <Tooltip label="Stop timer">
        <button type="button" className="pm-timer__stop" aria-label="Stop timer" onClick={() => void stop.mutate(undefined)} disabled={stop.loading}>
          <Icon name="stop" size={12} />
        </button>
      </Tooltip>
    </div>
  );
}
