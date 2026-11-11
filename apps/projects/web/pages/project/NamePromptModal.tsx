import { useState } from 'react';
import { Button } from '../../ui/Button.tsx';
import { Modal } from '../../ui/Dialog.tsx';
import { Field, Input } from '../../ui/Form.tsx';

/** Small "give it a name" dialog used by Duplicate and Save as template. */
export function NamePromptModal({ open, title, description, initial, confirmLabel, onClose, onSubmit }: {
  open: boolean; title: string; description?: string; initial: string; confirmLabel: string; onClose: () => void; onSubmit: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(initial);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const error = touched && !name.trim() ? 'Enter a name.' : null;
  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) onClose(); }}
      title={title}
      description={description}
      size="sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setTouched(true);
        if (!name.trim()) return;
        setBusy(true);
        const ok = await onSubmit(name.trim());
        setBusy(false);
        if (ok) onClose();
      }}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>{confirmLabel}</Button></>}
    >
      <Field label="Name" required error={error}>
        <Input data-autofocus value={name} onChange={(e) => setName(e.target.value)} invalid={!!error} maxLength={140} />
      </Field>
    </Modal>
  );
}
