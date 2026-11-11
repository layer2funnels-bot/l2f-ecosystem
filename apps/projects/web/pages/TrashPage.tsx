import { useState } from 'react';
import type { ProjectSummary } from '../../shared/api.ts';
import { call } from '../api/client.ts';
import { invalidate, useMutation } from '../api/store.ts';
import { useProjects } from '../lib/data.ts';
import { useSession } from '../lib/session.tsx';
import { isPersonal, kindCaption } from '../lib/projectKind.ts';
import { LockMark } from '../ui/LockMark.tsx';
import { fmtDate, toYmd } from '../lib/util.ts';
import { Button } from '../ui/Button.tsx';
import { ConfirmDialog } from '../ui/Dialog.tsx';
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from '../ui/Feedback.tsx';
import { toast } from '../ui/Toast.tsx';

export function TrashPage() {
  const { isAdmin } = useSession();
  const trash = useProjects('trash');
  const [purge, setPurge] = useState<ProjectSummary | null>(null);
  const restore = useMutation((id: string) => call('projects.restore', { id }), {
    invalidate: ['projects', 'project', 'portfolio', 'workload'],
    success: 'Project restored',
  });

  return (
    <div className="pm-page">
      <PageHeader title="Trash" subtitle="Deleted projects can be restored. Deleting forever cannot be undone." />
      {trash.loading && <SkeletonRows rows={3} height={60} />}
      {trash.error && !trash.data && <ErrorState title="Couldn't load the trash" message={trash.error.message} onRetry={() => void trash.refetch()} />}
      {trash.data && trash.data.length === 0 && <EmptyState icon="trash" title="Trash is empty" text="Projects you move to the trash will wait here until you restore or delete them." />}
      {trash.data && trash.data.length > 0 && (
        <ul className="pm-trashlist" aria-label="Trashed projects">
          {trash.data.map((p) => (
            <li key={p.id} className="pm-trashrow">
              <span className="pm-prow__swatch" style={{ background: p.color }} aria-hidden="true" />
              <div className="pm-trashrow__text">
                <span className="pm-trashrow__name pm-truncate">{p.name}{isPersonal(p) && <> <LockMark /></>}</span>
                <span className="pm-faint pm-truncate">{kindCaption(p)} · {p.stats.total} tasks{p.deletedAt ? ` · deleted ${fmtDate(toYmd(new Date(p.deletedAt)))}` : ''}</span>
              </div>
              <div className="pm-trashrow__actions">
                <Button size="sm" icon="restore" loading={restore.loading} onClick={() => void restore.mutate(p.id)}>Restore</Button>
                {isAdmin && <Button size="sm" variant="danger" icon="trash" onClick={() => setPurge(p)}>Delete forever</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {!isAdmin && trash.data && trash.data.length > 0 && <p className="pm-faint pm-trash__note">Only organization owners and admins can delete projects forever.</p>}
      <ConfirmDialog
        open={!!purge}
        danger
        title="Delete project forever?"
        message={<>“{purge?.name}” and all of its tasks, files and history will be permanently deleted. <strong>This cannot be undone.</strong></>}
        confirmLabel="Delete forever"
        confirmText={purge?.name}
        onClose={() => setPurge(null)}
        onConfirm={async () => {
          if (!purge) return;
          try {
            await call('projects.purge', { id: purge.id });
            invalidate('projects', 'portfolio', 'workload');
            toast.success(`Deleted “${purge.name}” forever`);
            setPurge(null);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not delete the project');
          }
        }}
      />
    </div>
  );
}
