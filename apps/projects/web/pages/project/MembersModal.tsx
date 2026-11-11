import { useMemo, useState } from 'react';
import type { OrgMember, ProjectDetail, ProjectRole } from '../../../shared/api.ts';
import { call } from '../../api/client.ts';
import { invalidate, setQueryData, useMutation } from '../../api/store.ts';
import { usePeople } from '../../lib/data.ts';
import { ROLE_LABEL } from '../../lib/util.ts';
import { Avatar } from '../../ui/Badges.tsx';
import { Button, IconButton } from '../../ui/Button.tsx';
import { Modal } from '../../ui/Dialog.tsx';
import { Skeleton } from '../../ui/Feedback.tsx';
import { Select } from '../../ui/Menu.tsx';
import { PeoplePicker, PersonChip } from '../../ui/PeoplePicker.tsx';
import { toast } from '../../ui/Toast.tsx';

const ROLES: { value: ProjectRole; label: string }[] = [
  { value: 'manager', label: 'Manager' },
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
];

export function MembersModal({ open, onClose, project, canManage }: { open: boolean; onClose: () => void; project: ProjectDetail; canManage: boolean }) {
  const people = usePeople(open);
  const [addIds, setAddIds] = useState<string[]>([]);
  const [addRole, setAddRole] = useState<ProjectRole>('editor');
  const setMember = useMutation((a: { userId: string; role: ProjectRole | null }) => call('projects.setMember', { id: project.id, ...a }), {
    onSuccess: () => invalidate('project', 'projects'),
  });

  const memberIds = useMemo(() => new Set(project.members.map((m) => m.id)), [project.members]);
  const candidates = useMemo(() => (people.data ?? []).filter((p) => !memberIds.has(p.id)), [people.data, memberIds]);
  // Everyone joins at once with one role: the list shows them immediately and rolls back if the server refuses.
  const addMembers = useMutation((a: { userIds: string[]; role: ProjectRole }) => call('projects.addMembers', { id: project.id, ...a }), {
    onMutate: (a) => {
      const joining = candidates.filter((p) => a.userIds.includes(p.id)).map((p) => ({ id: p.id, name: p.name, email: p.email, color: p.color, role: a.role }));
      return setQueryData<ProjectDetail>(`project:${project.id}`, (old) => ({ ...old, members: [...old.members, ...joining] }));
    },
    onSuccess: (r) => {
      setAddIds([]);
      invalidate('project', 'projects');
      toast.success(r.added === 1 ? 'Added 1 person' : `Added ${r.added} people`);
      if (r.skipped > 0) toast.info(`${r.skipped} ${r.skipped === 1 ? 'was' : 'were'} already on the project and kept their role.`);
    },
  });
  const managers = project.members.filter((m) => m.role === 'manager').length;

  return (
    <Modal open={open} onClose={onClose} title="Project members" description={canManage ? 'Choose who can see and work on this project.' : 'Only project managers can change membership.'} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <ul className="pm-members" aria-label="Members">
        {project.members.map((m) => (
          <li key={m.id} className="pm-member">
            <Avatar person={m} size={28} />
            <div className="pm-member__text">
              <span className="pm-truncate">{m.name}</span>
              <span className="pm-faint pm-truncate">{m.email}</span>
            </div>
            {canManage ? (
              <>
                <div className="pm-member__role">
                  <Select<ProjectRole> size="sm" value={m.role} options={ROLES} ariaLabel={`Role for ${m.name}`} onChange={(r) => void setMember.mutate({ userId: m.id, role: r })} />
                </div>
                <IconButton
                  icon="x"
                  label={`Remove ${m.name}`}
                  size="sm"
                  disabled={m.role === 'manager' && managers <= 1}
                  tooltip={m.role === 'manager' && managers <= 1 ? 'A project needs at least one manager' : `Remove ${m.name}`}
                  onClick={() => void setMember.mutate({ userId: m.id, role: null })}
                />
              </>
            ) : <span className="pm-badge pm-badge--neutral">{ROLE_LABEL[m.role]}</span>}
          </li>
        ))}
      </ul>

      {canManage && (
        <div className="pm-addmember">
          <h3>Add people</h3>
          {people.loading ? <Skeleton height={32} /> : candidates.length === 0 ? (
            <p className="pm-muted">Everyone in the organization is already a member.</p>
          ) : (
            <>
              <div className="pm-addmember__row">
                <PeoplePicker people={candidates} value={addIds} onChange={setAddIds} placeholder="Choose people" ariaLabel="People to add" title="Add people to this project" max={50} />
                <div className="pm-addmember__role"><Select<ProjectRole> value={addRole} options={ROLES} onChange={setAddRole} ariaLabel="Role for everyone added" /></div>
                <Button variant="primary" disabled={addIds.length === 0} loading={addMembers.loading} onClick={() => void addMembers.mutate({ userIds: addIds, role: addRole })}>
                  {addIds.length > 1 ? `Add ${addIds.length} people` : 'Add'}
                </Button>
              </div>
              {addIds.length > 0 && (
                <div className="pp-assignees" aria-label="People to add" style={{ marginTop: 8 }}>
                  {addIds.map((id) => candidates.find((p) => p.id === id)).filter((p): p is OrgMember => !!p).map((p) => (
                    <PersonChip key={p.id} person={p} onRemove={() => setAddIds(addIds.filter((x) => x !== p.id))} />
                  ))}
                  <span className="pm-faint">will join as {ROLE_LABEL[addRole].toLowerCase()}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
