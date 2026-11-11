import { useId } from 'react';
import type { ReactNode } from 'react';

/** A titled block in the drawer body. */
export function Section({ title, meta, actions, children, className }: { title: string; meta?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <section className={`pm-ts ${className ?? ''}`} aria-labelledby={id}>
      <header className="pm-ts__head">
        <h3 id={id} className="pm-ts__title">{title}</h3>
        {meta !== undefined && <span className="pm-ts__meta pm-num">{meta}</span>}
        {actions && <div className="pm-ts__actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}
