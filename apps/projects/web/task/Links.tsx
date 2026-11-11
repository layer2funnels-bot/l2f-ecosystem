import type { TaskLink } from '../../shared/api.ts';
import { call } from '../api/client.ts';
import { copyText } from '../lib/clipboard.ts';
import { relTime } from '../lib/util.ts';
import { Button, Icon, contextMenuProps, toast } from '../ui/index.ts';
import type { CtxItem } from '../ui/index.ts';
import { toApiError, useTask } from './context.ts';
import { hostOf } from './links.ts';
import { Section } from './Section.tsx';
import { addTaskLink } from './taskMenu.tsx';

/** Links attached to this task (https only). */
export function Links() {
  const { task, readOnly, act } = useTask();
  const remove = async (l: TaskLink) => {
    const r = await act(() => call('links.task.remove', { id: l.id }), (d) => ({ ...d, links: d.links.filter((x) => x.id !== l.id) }), { silent: true });
    if (r.ok) toast.success('Link removed'); else toast.error(toApiError(r.error).message);
  };
  const menu = (l: TaskLink): CtxItem[] => [
    { id: 'open', icon: 'external', label: 'Open', onSelect: () => { window.open(l.url, '_blank', 'noopener,noreferrer'); } },
    { id: 'copy', icon: 'copy', label: 'Copy link', onSelect: () => void copyText(l.url, 'Link copied') },
    ...(readOnly ? [] : [
      { id: 'edit', icon: 'edit' as const, label: 'Edit…', separatorBefore: true, onSelect: () => void addTaskLink(task.id, l) },
      { id: 'remove', icon: 'trash' as const, label: 'Remove', danger: true, onSelect: () => void remove(l) },
    ]),
  ];
  return (
    <Section title="Links" meta={task.links.length || undefined} actions={!readOnly && (
      <Button size="sm" icon="plus" onClick={() => void addTaskLink(task.id)}>Add link</Button>
    )}>
      {task.links.length > 0 && (
        <ul className="pm-files pm-tlinks" aria-label="Links">
          {task.links.map((l) => (
            <li key={l.id} className="pm-file pm-tlink" {...contextMenuProps(() => menu(l), { label: `Actions for ${l.title}` })}>
              <span className="pm-file__icon is-doc"><Icon name="link" size={16} /></span>
              <div className="pm-file__text">
                <a className="pm-file__name pm-truncate pm-tlink__a" href={l.url} target="_blank" rel="noopener noreferrer" title={l.url}>{l.title}</a>
                <span className="pm-file__meta pm-truncate">{hostOf(l.url)}{l.createdBy ? ` · ${l.createdBy.name}` : ''} · <time dateTime={l.createdAt} title={new Date(l.createdAt).toLocaleString()}>{relTime(l.createdAt)}</time></span>
              </div>
              <a className="pm-mini" href={l.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${l.title} in a new tab`} title="Open in a new tab"><Icon name="external" size={14} /></a>
              <button type="button" className="pm-mini" aria-label={`Copy link ${l.title}`} title="Copy link" onClick={() => void copyText(l.url, 'Link copied')}><Icon name="copy" size={14} /></button>
              {!readOnly && <button type="button" className="pm-mini" aria-label={`Edit link ${l.title}`} title="Edit" onClick={() => void addTaskLink(task.id, l)}><Icon name="edit" size={14} /></button>}
              {!readOnly && <button type="button" className="pm-mini" aria-label={`Remove link ${l.title}`} title="Remove" onClick={() => void remove(l)}><Icon name="trash" size={14} /></button>}
            </li>
          ))}
        </ul>
      )}
      {task.links.length === 0 && (readOnly ? <p className="pm-faint">No links.</p> : <p className="pm-faint">Add links to docs, designs or pages that belong to this task.</p>)}
    </Section>
  );
}
