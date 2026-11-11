// Imperative small dialogs for menu actions: askForm() collects a few text fields, askConfirm() asks yes / no.
// <PromptHost /> is mounted once in App.
import { useState, useSyncExternalStore } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Button } from './Button.tsx';
import { ConfirmDialog, Modal } from './Dialog.tsx';
import { Field, Input } from './Form.tsx';

export interface AskField { name: string; label: string; initial?: string; type?: 'text' | 'url' | 'date'; placeholder?: string; required?: boolean; maxLength?: number }

interface FormReq {
  kind: 'form'; id: number; title: string; description?: ReactNode; fields: AskField[]; confirmLabel: string;
  validate?: (v: Record<string, string>) => string | null; resolve: (v: Record<string, string> | null) => void;
}
interface ConfirmReq { kind: 'confirm'; id: number; title: string; message?: ReactNode; confirmLabel: string; danger: boolean; resolve: (ok: boolean) => void }
type Req = FormReq | ConfirmReq;

let current: Req | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const set = (r: Req | null) => { current = r; for (const l of [...listeners]) l(); };

function cancelCurrent() {
  if (!current) return;
  if (current.kind === 'form') current.resolve(null); else current.resolve(false);
}

export function askForm(o: { title: string; description?: ReactNode; fields: AskField[]; confirmLabel?: string; validate?: (v: Record<string, string>) => string | null }): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    cancelCurrent();
    set({ kind: 'form', id: ++seq, title: o.title, description: o.description, fields: o.fields, confirmLabel: o.confirmLabel ?? 'Save', validate: o.validate, resolve });
  });
}

export function askConfirm(o: { title: string; message?: ReactNode; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    cancelCurrent();
    set({ kind: 'confirm', id: ++seq, title: o.title, message: o.message, confirmLabel: o.confirmLabel ?? 'Confirm', danger: !!o.danger, resolve });
  });
}

export function PromptHost() {
  const req = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => current);
  if (!req) return null;
  if (req.kind === 'confirm') {
    return (
      <ConfirmDialog
        key={req.id}
        open
        danger={req.danger}
        title={req.title}
        message={req.message}
        confirmLabel={req.confirmLabel}
        onClose={() => { req.resolve(false); if (current?.id === req.id) set(null); }}
        onConfirm={() => { req.resolve(true); if (current?.id === req.id) set(null); }}
      />
    );
  }
  return <FormDialog key={req.id} req={req} />;
}

function FormDialog({ req }: { req: FormReq }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(req.fields.map((f) => [f.name, f.initial ?? ''])));
  const [error, setError] = useState<string | null>(null);
  const done = (v: Record<string, string> | null) => { req.resolve(v); if (current?.id === req.id) set(null); };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const out: Record<string, string> = {};
    for (const f of req.fields) {
      const v = (values[f.name] ?? '').trim();
      if (f.required && !v) { setError(`${f.label} is required.`); return; }
      out[f.name] = v;
    }
    const problem = req.validate?.(out) ?? null;
    if (problem) { setError(problem); return; }
    done(out);
  };
  return (
    <Modal
      open
      size="sm"
      title={req.title}
      description={req.description}
      onClose={() => done(null)}
      onSubmit={submit}
      footer={<><Button onClick={() => done(null)}>Cancel</Button><Button type="submit" variant="primary">{req.confirmLabel}</Button></>}
    >
      <div className="pm-prompt">
        {req.fields.map((f, i) => (
          <Field key={f.name} label={f.label} required={f.required}>
            <Input
              type={f.type ?? 'text'}
              value={values[f.name] ?? ''}
              placeholder={f.placeholder}
              maxLength={f.maxLength}
              data-autofocus={i === 0 ? '' : undefined}
              onChange={(e) => { setValues((v) => ({ ...v, [f.name]: e.target.value })); setError(null); }}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        ))}
        {error && <p className="pm-field__error" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
