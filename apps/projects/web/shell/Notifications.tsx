import { useRef, useState } from 'react';
import { call } from '../api/client.ts';
import { invalidate, useMutation, useQuery } from '../api/store.ts';
import { cx, relTime } from '../lib/util.ts';
import { links, navigate } from '../router.ts';
import { Avatar } from '../ui/Badges.tsx';
import { Button, IconButton } from '../ui/Button.tsx';
import { EmptyState, ErrorState, SkeletonRows } from '../ui/Feedback.tsx';
import { Icon } from '../ui/icons.tsx';
import { Popover } from '../ui/Overlay.tsx';

export function Notifications() {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const q = useQuery('notifications', () => call('notifications.list', {}), [], { refetchInterval: 60_000 });
  const read = useMutation((arg: { ids?: string[]; all?: boolean }) => call('notifications.read', arg), { onSuccess: () => invalidate('notifications') });
  const unread = q.data?.unread ?? 0;

  return (
    <>
      <span className="pm-bell">
        <IconButton
          ref={btn}
          icon="bell"
          label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => { setOpen((o) => !o); if (!open) void q.refetch(); }}
        />
        {unread > 0 && <span className="pm-bell__badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
      </span>
      <Popover anchor={btn.current} open={open} onClose={() => setOpen(false)} align="end" className="pm-notifpop" label="Notifications">
        <div className="pm-notif" role="dialog" aria-label="Notifications">
          <div className="pm-notif__head">
            <h2>Notifications</h2>
            <Button size="sm" variant="ghost" disabled={unread === 0 || read.loading} onClick={() => void read.mutate({ all: true })}>Mark all read</Button>
          </div>
          <div className="pm-notif__list">
            {q.loading && <SkeletonRows rows={3} height={52} />}
            {q.error && !q.data && <ErrorState compact title="Can't load notifications" message={q.error.message} onRetry={() => void q.refetch()} />}
            {q.data && q.data.items.length === 0 && <EmptyState compact icon="bell" title="You're all caught up" text="Mentions, assignments and comments will show up here." />}
            {q.data?.items.map((n) => (
              <button
                key={n.id}
                type="button"
                className={cx('pm-notif__item', !n.readAt && 'is-unread')}
                onClick={() => {
                  setOpen(false);
                  if (!n.readAt) void read.mutate({ ids: [n.id] });
                  navigate(n.taskId ? links.project(n.projectId, null, n.taskId) : links.project(n.projectId));
                }}
              >
                <Avatar person={n.actor} size={28} />
                <span className="pm-notif__text">
                  <span className="pm-notif__summary">{n.summary}</span>
                  <span className="pm-faint">{relTime(n.createdAt)}</span>
                </span>
                {!n.readAt ? <span className="pm-notif__dot" aria-label="Unread" /> : <Icon name="check" size={12} className="pm-faint" />}
              </button>
            ))}
          </div>
        </div>
      </Popover>
    </>
  );
}
