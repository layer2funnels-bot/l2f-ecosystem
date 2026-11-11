import type { ProjectKind, ProjectSummary } from '../../shared/api.ts';
import type { IconName } from '../ui/icons.tsx';

export const KIND_META: Record<ProjectKind, { label: string; icon: IconName; helper: string }> = {
  client: { label: 'Client', icon: 'users', helper: 'Work you do for a client. Pick the client.' },
  internal: { label: 'Internal', icon: 'building', helper: 'Your own organization’s work, with no client.' },
  personal: { label: 'Personal', icon: 'lock', helper: 'Just for you. Nobody else can see it, not even admins.' },
};
export const KINDS: ProjectKind[] = ['client', 'internal', 'personal'];

export const isPersonal = (p: Pick<ProjectSummary, 'kind'>) => p.kind === 'personal';

/** Second line shown under a project name in lists. */
export function kindCaption(p: Pick<ProjectSummary, 'kind' | 'clientName'>): string {
  if (p.kind === 'personal') return 'Personal · private';
  return p.clientName ?? 'Internal';
}

export const PERSONAL_TIP = 'Personal projects are private to you, so they have no other members and no visibility setting.';
