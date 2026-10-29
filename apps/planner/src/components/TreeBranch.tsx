import type { ReactNode } from 'react';

/** One level of a left-to-right tree: a box, then its children in a column joined by lines (styles in views.css). */
export function TreeBranch({ id, box, children, collapsed, onToggle }: { id: string; box: ReactNode; children: ReactNode[]; collapsed: boolean; onToggle: (id: string) => void }) {
  const has = children.length > 0;
  return (
    <li className="az-li">
      <div className="az-box">
        {box}
        {has && <button type="button" className="az-toggle" aria-expanded={!collapsed} aria-label={collapsed ? `Show ${children.length} below` : 'Hide what is below'} onClick={() => onToggle(id)}>{collapsed ? children.length : '−'}</button>}
      </div>
      {has && !collapsed && <ul className="az-children">{children}</ul>}
    </li>
  );
}
