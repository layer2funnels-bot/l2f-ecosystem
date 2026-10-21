import type { ReactNode } from "react";

/** States board: every empty state names what is missing, what to do about it, and offers the next step as a button. */
export function EmptyState({ title, children, actions, compact }: { title: string; children?: ReactNode; actions?: ReactNode; compact?: boolean }) {
  return (
    <div className={`fm-empty${compact ? " compact" : ""}`}>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {actions ? <div className="fm-empty-actions">{actions}</div> : null}
    </div>
  );
}
