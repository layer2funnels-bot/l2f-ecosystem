import { useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
import { cx } from '../lib/util.ts';
import { Button, IconButton } from './Button.tsx';
import { Input } from './Form.tsx';
import { Portal, useFocusTrap, useScrollLock } from './Overlay.tsx';

interface ShellProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** When provided the dialog is a <form> and Enter submits. */
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  /** Click on the backdrop closes (default true). */
  dismissible?: boolean;
  variant: 'modal' | 'drawer';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  headerExtra?: ReactNode;
}

function DialogShell({ open, onClose, title, description, children, footer, onSubmit, dismissible = true, variant, size = 'md', className, headerExtra }: ShellProps) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  const descId = useId();
  const down = useRef(false);
  useFocusTrap(ref, open);
  useScrollLock(open);
  if (!open) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape' && !e.defaultPrevented && ref.current?.contains(e.target as Node)) {
      e.preventDefault();
      onClose();
    }
  };
  const common = {
    ref: ref as never,
    role: 'dialog' as const,
    'aria-modal': true as const,
    'aria-labelledby': titleId,
    'aria-describedby': description ? descId : undefined,
    tabIndex: -1,
    onKeyDown,
    className: cx('pm-dialog', `pm-dialog--${variant}`, `pm-dialog--${size}`, className),
  };
  const inner = (
    <>
      <header className="pm-dialog__head">
        <div className="pm-dialog__titles">
          <h2 id={titleId} className="pm-dialog__title">{title}</h2>
          {description && <p id={descId} className="pm-dialog__desc">{description}</p>}
        </div>
        {headerExtra}
        <IconButton icon="x" label="Close" size="sm" onClick={onClose} />
      </header>
      <div className="pm-dialog__body">{children}</div>
      {footer && <footer className="pm-dialog__foot">{footer}</footer>}
    </>
  );
  return (
    <Portal>
      <div
        className={cx('pm-overlay', variant === 'drawer' && 'pm-overlay--drawer')}
        onMouseDown={(e) => { down.current = e.target === e.currentTarget; }}
        onClick={(e) => { if (dismissible && down.current && e.target === e.currentTarget) onClose(); }}
      >
        {onSubmit ? <form {...common} onSubmit={onSubmit} noValidate>{inner}</form> : <div {...common}>{inner}</div>}
      </div>
    </Portal>
  );
}

export type ModalProps = Omit<ShellProps, 'variant'>;
export function Modal(props: ModalProps) { return <DialogShell {...props} variant="modal" />; }

/** Right-side panel; full-screen on mobile. */
export function Drawer(props: Omit<ModalProps, 'size'>) {
  return <DialogShell {...props} variant="drawer" />;
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger, confirmText, onConfirm, onClose }: {
  open: boolean;
  title: ReactNode;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** When set the user must type this exact text to enable the confirm button. */
  confirmText?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = !confirmText || typed.trim() === confirmText;
  const close = () => { if (!busy) { setTyped(''); onClose(); } };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    try { await onConfirm(); setTyped(''); } finally { setBusy(false); }
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      size="sm"
      onSubmit={submit}
      footer={
        <>
          <Button onClick={close} disabled={busy}>{cancelLabel}</Button>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} loading={busy} disabled={!ready}>{confirmLabel}</Button>
        </>
      }
    >
      {message && <div className="pm-confirm__msg">{message}</div>}
      {confirmText && (
        <label className="pm-field pm-confirm__typed">
          <span className="pm-field__label">Type <strong>{confirmText}</strong> to confirm</span>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} data-autofocus aria-label={`Type ${confirmText} to confirm`} />
        </label>
      )}
    </Modal>
  );
}
