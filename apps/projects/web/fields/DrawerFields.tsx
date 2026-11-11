// Custom field rows of the task drawer (after Tags). Saves each change at once (optimistic, rolled back with a message on failure).
import { useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { useProject } from '../lib/data.ts';
import { Button } from '../ui/Button.tsx';
import { useTask } from '../task/context.ts';
import { FieldEditor } from './FieldEditors.tsx';
import { setTaskField } from './fieldKit.tsx';
import { FieldsManagerModal } from './FieldsManager.tsx';

type RowComp = ComponentType<{ label: string; children: ReactNode; wide?: boolean; field?: string; hint?: ReactNode; empty?: boolean }>;
const isEmptyValue = (v: unknown) => v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && v.length === 0);

export function CustomFieldRows({ Row }: { Row: RowComp }) {
  const { task, readOnly } = useTask();
  const project = useProject(task.projectId);
  const [manage, setManage] = useState(false);
  const fields = project.data?.fields ?? [];
  const manager = task.myRole === 'manager';
  if (!project.data) return null;

  return (
    <>
      {fields.map((f) => (
        <Row key={f.id} label={f.name} field={`custom-${f.id}`} wide={f.type === 'multiselect' || f.type === 'select'} empty={isEmptyValue(task.fields[f.id])}>
          <div className="fv-drawer" data-type={f.type}>
            <FieldEditor
              field={f}
              value={task.fields[f.id]}
              readOnly={readOnly}
              variant="row"
              onChange={(v) => void setTaskField(task, f.id, v)}
            />
          </div>
        </Row>
      ))}
      {manager && !task.deletedAt && (
        <div className="fv-manage">
          <Button size="sm" variant="ghost" icon={fields.length ? 'edit' : 'plus'} onClick={() => setManage(true)} title="Add, edit or archive the custom fields of this project">
            {fields.length ? 'Manage fields' : 'Add field'}
          </Button>
        </div>
      )}
      {manage && <FieldsManagerModal projectId={task.projectId} open onClose={() => setManage(false)} />}
    </>
  );
}
