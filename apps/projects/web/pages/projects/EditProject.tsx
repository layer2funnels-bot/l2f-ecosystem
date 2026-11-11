import { useEffect } from 'react';
import { useProject } from '../../lib/data.ts';
import { toast } from '../../ui/Toast.tsx';
import { ProjectFormModal } from './ProjectFormModal.tsx';

/** Loads the full project, then shows the Edit details modal. */
export function EditProject({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useProject(id);
  useEffect(() => { if (q.error) { toast.error(q.error.message); onClose(); } }, [q.error, onClose]);
  if (!q.data) return null;
  return <ProjectFormModal open project={q.data} onClose={onClose} />;
}
