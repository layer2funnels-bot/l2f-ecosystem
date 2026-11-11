import { links } from '../router.ts';
import { Button } from '../ui/Button.tsx';
import { EmptyState } from '../ui/Feedback.tsx';

export function NotFoundPage({ kind = 'page' }: { kind?: 'page' | 'project' | 'forbidden' }) {
  const copy = {
    page: { icon: 'search' as const, title: "We can't find that page", text: 'The link may be mistyped or the page may have moved.' },
    project: { icon: 'folder' as const, title: "That project doesn't exist", text: 'It may have been deleted, or it belongs to a different organization. Try switching organization from the sidebar.' },
    forbidden: { icon: 'lock' as const, title: "You don't have access to this", text: 'Ask a project manager or an organization admin to add you.' },
  }[kind];
  return (
    <div className="pm-page pm-page--center">
      <EmptyState
        icon={copy.icon}
        title={copy.title}
        text={copy.text}
        action={<div className="pm-row"><Button variant="primary" onClick={() => { window.location.hash = links.projects; }}>Go to projects</Button><Button onClick={() => { window.location.hash = links.home; }}>Home</Button></div>}
      />
    </div>
  );
}
