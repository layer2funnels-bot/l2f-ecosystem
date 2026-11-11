import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../lib/util.ts';
import { Button } from './Button.tsx';
import { Icon } from './icons.tsx';
import type { IconName } from './icons.tsx';

export function Skeleton({ width, height = 14, radius = 6, className, style }: { width?: number | string; height?: number | string; radius?: number; className?: string; style?: CSSProperties }) {
  return <span className={cx('pm-skeleton', className)} style={{ width: width ?? '100%', height, borderRadius: radius, ...style }} aria-hidden="true" />;
}

export function SkeletonRows({ rows = 5, height = 44 }: { rows?: number; height?: number }) {
  return (
    <div className="pm-skeleton-rows" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} height={height} radius={8} />)}
    </div>
  );
}

export function EmptyState({ icon = 'folder', title, text, action, compact }: { icon?: IconName; title: string; text?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cx('pm-empty', compact && 'pm-empty--compact')}>
      <div className="pm-empty__icon"><Icon name={icon} size={20} /></div>
      <h3 className="pm-empty__title">{title}</h3>
      {text && <p className="pm-empty__text">{text}</p>}
      {action && <div className="pm-empty__action">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, onRetry, compact }: { title?: string; message?: string; onRetry?: () => void; compact?: boolean }) {
  return (
    <div className={cx('pm-empty pm-empty--error', compact && 'pm-empty--compact')} role="alert">
      <div className="pm-empty__icon"><Icon name="alert" size={20} /></div>
      <h3 className="pm-empty__title">{title}</h3>
      {message && <p className="pm-empty__text">{message}</p>}
      {onRetry && <div className="pm-empty__action"><Button onClick={onRetry} icon="restore">Try again</Button></div>}
    </div>
  );
}

/** Placeholder for a surface another part of the app will fill in. Never a blank screen. */
export function ViewPending({ name }: { name: string }) {
  return <EmptyState icon="clock" title={`${name} is on its way`} text="This view is being built and will appear here shortly." />;
}

export function Kbd({ children }: { children: ReactNode }) { return <kbd className="pm-kbd">{children}</kbd>; }

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="pm-pagehead">
      <div className="pm-pagehead__text">
        <h1>{title}</h1>
        {subtitle && <p className="pm-muted">{subtitle}</p>}
      </div>
      {actions && <div className="pm-pagehead__actions">{actions}</div>}
    </header>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('pm-card', className)}>
      {(title || actions) && (
        <header className="pm-card__head">
          {title && <h2>{title}</h2>}
          {actions}
        </header>
      )}
      <div className="pm-card__body">{children}</div>
    </section>
  );
}
