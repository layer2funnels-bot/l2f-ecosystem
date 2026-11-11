import { useSyncExternalStore } from 'react';
import { Icon } from './icons.tsx';

export interface ToastAction { label: string; onClick: () => void }
export interface ToastItem { id: number; kind: 'success' | 'error' | 'info'; message: string; action?: ToastAction; duration: number }
interface ToastOpts { action?: ToastAction; duration?: number }

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => { for (const l of [...listeners]) l(); };

function push(kind: ToastItem['kind'], message: string, opts: ToastOpts = {}): number {
  const id = ++seq;
  const duration = opts.duration ?? (opts.action ? 7000 : kind === 'error' ? 6000 : 3800);
  items = [...items.slice(-3), { id, kind, message, action: opts.action, duration }];
  emit();
  if (duration > 0) setTimeout(() => dismiss(id), duration);
  return id;
}
function dismiss(id: number) {
  if (!items.some((t) => t.id === id)) return;
  items = items.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (m: string, o?: ToastOpts) => push('success', m, o),
  error: (m: string, o?: ToastOpts) => push('error', m, o),
  info: (m: string, o?: ToastOpts) => push('info', m, o),
  dismiss,
};

export function ToastHost() {
  const list = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => items,
  );
  return (
    <div className="pm-toasts" role="region" aria-label="Notifications" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`pm-toast pm-toast--${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          <Icon name={t.kind === 'success' ? 'checkCircle' : t.kind === 'error' ? 'alert' : 'info'} className="pm-toast__icon" />
          <span className="pm-toast__msg">{t.message}</span>
          {t.action && (
            <button type="button" className="pm-toast__action" onClick={() => { t.action?.onClick(); dismiss(t.id); }}>
              {t.action.label}
            </button>
          )}
          <button type="button" className="pm-toast__close" aria-label="Dismiss notification" title="Dismiss notification" onClick={() => dismiss(t.id)}>
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
