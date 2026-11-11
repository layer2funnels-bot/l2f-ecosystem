import { useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { call } from '../api/client.ts';
import { invalidate, useMutation, useQuery } from '../api/store.ts';
import { useMedia } from '../lib/hooks.ts';
import { useSession } from '../lib/session.tsx';
import { links, navigate } from '../router.ts';
import { IconButton } from '../ui/Button.tsx';
import { Menu, MenuPanel } from '../ui/Menu.tsx';
import type { MenuItem } from '../ui/Menu.tsx';
import { toast } from '../ui/Toast.tsx';
import { useShell } from './ShellContext.tsx';
import { KeyCombo } from './ShortcutsHelp.tsx';
import { shortcutById } from './shortcuts.ts';

/** Tooltip body: the action's name plus its shortcut from the registry. */
function tip(name: string, shortcutId?: string): ReactNode {
  const def = shortcutId ? shortcutById(shortcutId) : undefined;
  return (
    <span className="pm-tip">
      {name}
      {def && <KeyCombo keys={def.keys[0]} />}
    </span>
  );
}

function TimerPicker({ anchor, open, onClose }: { anchor: HTMLElement | null; open: boolean; onClose: () => void }) {
  const tasks = useQuery('mywork', () => call('mywork.list', {}), [], { enabled: open });
  const start = useMutation((taskId: string) => call('time.start', { taskId }), {
    invalidate: [],
    onSuccess: () => invalidate('timer', 'task', 'tasks', 'mywork', 'workload'),
  });
  const items = useMemo<MenuItem[]>(() => (tasks.data ?? []).map((t) => ({
    id: t.id,
    label: t.title,
    text: `${t.title} ${t.projectName}`,
    hint: <span className="pm-faint pm-truncate">{t.projectName}</span>,
    leading: <span className="pm-dot pm-dot--lg" style={{ background: t.projectColor }} />,
    onSelect: () => { void start.mutate(t.id).then((r) => { if (r) toast.success(`Timer started on “${t.title}”`); }); },
  })), [tasks.data, start]);
  return (
    <MenuPanel
      anchor={anchor}
      open={open}
      onClose={onClose}
      items={items}
      searchable
      searchPlaceholder="Start timer on one of my tasks…"
      emptyText={tasks.loading ? 'Loading your tasks…' : tasks.error ? 'Could not load your tasks' : 'No open tasks assigned to you'}
      align="end"
      role="listbox"
      label="Start a timer on one of my open tasks"
      className="pm-timerpick"
    />
  );
}

/** Row of icon buttons in the top bar (like ClickUp). Collapses into one "+" menu below 768px. */
export function QuickActions() {
  const mobile = useMedia('(max-width: 767px)');
  const { canCreate } = useSession();
  const { openQuickAdd, openNewProject, openShortcuts } = useShell();
  const timer = useQuery('timer', () => call('time.running', {}), [], { refetchInterval: 30_000 });
  const running = timer.data ?? null;
  const stop = useMutation(() => call('time.stop', {}), {
    invalidate: [],
    onSuccess: () => invalidate('timer', 'task', 'tasks', 'mywork', 'workload'),
    success: 'Timer stopped',
  });
  const [picker, setPicker] = useState(false);
  const timerBtn = useRef<HTMLButtonElement>(null);
  const plusRef = useRef<RefObject<HTMLButtonElement> | null>(null);

  const timerAction = () => { if (running) void stop.mutate(undefined); else setPicker((o) => !o); };

  if (mobile) {
    const items: MenuItem[] = [
      { id: 'task', icon: 'taskAdd', label: 'New task', onSelect: () => openQuickAdd() },
      ...(canCreate ? [{ id: 'project', icon: 'folderPlus' as const, label: 'New project', onSelect: () => openNewProject() }] : []),
      running
        ? { id: 'timer', icon: 'stop', label: 'Stop timer', onSelect: () => void stop.mutate(undefined) }
        : { id: 'timer', icon: 'play', label: 'Start timer…', onSelect: () => setPicker(true) },
      { id: 'mywork', icon: 'checkCircle', label: 'My Work', onSelect: () => navigate(links.myWork) },
      { id: 'keys', icon: 'keyboard', label: 'Keyboard shortcuts', onSelect: () => openShortcuts() },
    ];
    return (
      <>
        <Menu
          items={items}
          align="end"
          label="Quick actions"
          trigger={(t) => {
            plusRef.current = t.ref;
            return <IconButton icon="plus" label="Quick actions" tooltip="Quick actions" {...t} />;
          }}
        />
        <TimerPicker anchor={plusRef.current?.current ?? null} open={picker} onClose={() => setPicker(false)} />
      </>
    );
  }

  return (
    <>
      <span className="pm-topbar__divider" aria-hidden="true" />
      <div className="pm-quick" role="group" aria-label="Quick actions">
        <IconButton icon="taskAdd" label="New task" tooltip={tip('New task', 'quick-add')} aria-keyshortcuts="Q T" onClick={() => openQuickAdd()} />
        {canCreate && <IconButton icon="folderPlus" label="New project" tooltip={tip('New project', 'new-project')} aria-keyshortcuts="Shift+P" onClick={() => openNewProject()} />}
        <IconButton
          ref={timerBtn}
          icon={running ? 'stop' : 'play'}
          label={running ? `Stop timer on ${running.taskTitle}` : 'Start timer'}
          tooltip={tip(running ? 'Stop timer' : 'Start timer')}
          aria-haspopup={running ? undefined : 'listbox'}
          aria-expanded={running ? undefined : picker}
          onClick={timerAction}
          loading={stop.loading}
        />
        <IconButton icon="checkCircle" label="My Work" tooltip={tip('My Work', 'go-mywork')} aria-keyshortcuts="G M" onClick={() => navigate(links.myWork)} />
        <IconButton icon="keyboard" label="Keyboard shortcuts" tooltip={tip('Keyboard shortcuts', 'help')} aria-keyshortcuts="?" onClick={() => openShortcuts()} />
      </div>
      <TimerPicker anchor={timerBtn.current} open={picker} onClose={() => setPicker(false)} />
    </>
  );
}
