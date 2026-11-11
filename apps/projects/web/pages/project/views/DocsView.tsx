import { useState } from 'react';
import type { ProjectDetail, ProjectLink } from '../../../../shared/api.ts';
import { call } from '../../../api/client.ts';
import { invalidate, useMutation } from '../../../api/store.ts';
import { relTime } from '../../../lib/util.ts';
import { Button, IconButton } from '../../../ui/Button.tsx';
import { ConfirmDialog } from '../../../ui/Dialog.tsx';
import { Card, EmptyState } from '../../../ui/Feedback.tsx';
import { Field, Input } from '../../../ui/Form.tsx';
import { Icon } from '../../../ui/icons.tsx';
import type { IconName } from '../../../ui/icons.tsx';
import { Select } from '../../../ui/Menu.tsx';
import { toast } from '../../../ui/Toast.tsx';
import { contextMenuProps } from '../../../ui/ContextMenu.tsx';
import type { CtxItem } from '../../../ui/ContextMenu.tsx';
import { askForm } from '../../../ui/Prompt.tsx';
import { copyText } from '../../../lib/clipboard.ts';

type Kind = ProjectLink['kind'];
const KINDS: { value: Kind; label: string; plural: string; icon: IconName }[] = [
  { value: 'doc', label: 'Doc', plural: 'Docs', icon: 'doc' },
  { value: 'whiteboard', label: 'Whiteboard', plural: 'Whiteboards', icon: 'whiteboard' },
  { value: 'link', label: 'Link', plural: 'Links', icon: 'link' },
];

function validateUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return 'Paste a link.';
  let u: URL;
  try { u = new URL(v); } catch { return 'That doesn’t look like a web address. Start it with https://'; }
  if (u.protocol !== 'https:') return 'Links must start with https://';
  if (!u.hostname.includes('.')) return 'Enter a full address, like https://example.com/page';
  return null;
}

export function DocsView({ project: p }: { project: ProjectDetail }) {
  const canEdit = p.myRole !== 'viewer' && !p.deletedAt;
  const [kind, setKind] = useState<Kind>('doc');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [touched, setTouched] = useState(false);
  const [removing, setRemoving] = useState<ProjectLink | null>(null);

  const add = useMutation(() => call('links.add', { projectId: p.id, kind, title: title.trim(), url: url.trim() }), {
    invalidate: ['project'],
    success: 'Added to project',
    onSuccess: () => { setTitle(''); setUrl(''); setTouched(false); },
  });
  const linkMenu = (l: ProjectLink): CtxItem[] => {
    const items: CtxItem[] = [
      { id: 'open', icon: 'external', label: 'Open', onSelect: () => { window.open(l.url, '_blank', 'noopener,noreferrer'); } },
      { id: 'copy', icon: 'link', label: 'Copy link', onSelect: () => void copyText(l.url, 'Link copied') },
    ];
    if (canEdit) {
      items.push(
        {
          id: 'edit', icon: 'edit', label: 'Edit title / URL…', separatorBefore: true,
          onSelect: () => void askForm({
            title: 'Edit link',
            fields: [{ name: 'title', label: 'Title', initial: l.title, required: true, maxLength: 160 }, { name: 'url', label: 'URL', initial: l.url, required: true, maxLength: 2000 }],
            confirmLabel: 'Save', validate: (v) => validateUrl(v.url),
          }).then(async (r) => {
            if (!r) return;
            try { await call('links.update', { id: l.id, title: r.title, url: r.url }); invalidate('project'); toast.success('Link updated'); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not update the link'); }
          }),
        },
        { id: 'remove', icon: 'trash', label: 'Remove', danger: true, onSelect: () => setRemoving(l) },
      );
    }
    return items;
  };
  const titleErr = touched && !title.trim() ? 'Give it a title.' : null;
  const urlErr = touched ? validateUrl(url) : null;

  const submit = () => {
    setTouched(true);
    if (!title.trim() || validateUrl(url)) return;
    void add.mutate(undefined);
  };

  return (
    <div className="pm-docs">
      <p className="pm-docs__intro pm-muted"><Icon name="info" size={14} /> These link to Docs and Whiteboards elsewhere in the ecosystem by reference. Nothing is copied into this project.</p>

      {canEdit && (
        <Card title="Add a link">
          <form className="pm-docs__form" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
            <Field label="Type"><Select<Kind> value={kind} options={KINDS.map((k) => ({ value: k.value, label: k.label }))} onChange={setKind} ariaLabel="Type" /></Field>
            <Field label="Title" error={titleErr} required><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Campaign brief" invalid={!!titleErr} maxLength={160} /></Field>
            <Field label="URL" error={urlErr} required><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" invalid={!!urlErr} inputMode="url" autoComplete="off" /></Field>
            <Button type="submit" variant="primary" icon="plus" loading={add.loading}>Add</Button>
          </form>
        </Card>
      )}

      {p.links.length === 0 ? (
        <EmptyState icon="link" title="No docs or links yet" text={canEdit ? 'Add a Doc, Whiteboard or any web link so the team finds everything in one place.' : 'Nothing has been linked to this project yet.'} />
      ) : (
        KINDS.map((k) => {
          const list = p.links.filter((l) => l.kind === k.value);
          if (!list.length) return null;
          return (
            <section key={k.value} className="pm-docs__group" aria-label={k.plural}>
              <h2 className="pm-docs__heading">{k.plural}<span className="pm-faint"> · {list.length}</span></h2>
              <ul className="pm-linklist">
                {list.map((l) => (
                  <li key={l.id} className="pm-linkrow" {...contextMenuProps(() => linkMenu(l), { label: `Actions for ${l.title}` })}>
                    <span className="pm-linkrow__icon"><Icon name={k.icon} /></span>
                    <a className="pm-linkrow__text" href={l.url} target="_blank" rel="noopener noreferrer">
                      <span className="pm-linkrow__title pm-truncate">{l.title}</span>
                      <span className="pm-faint pm-truncate">{l.url} · added {relTime(l.createdAt)}</span>
                    </a>
                    <a className="pm-linkrow__open" href={l.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${l.title} in a new tab`}><Icon name="external" /></a>
                    {canEdit && <IconButton icon="trash" label={`Remove ${l.title}`} size="sm" onClick={() => setRemoving(l)} />}
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}

      <ConfirmDialog
        open={!!removing}
        danger
        title="Remove this link?"
        message={<>“{removing?.title}” will be removed from this project. The original {removing?.kind === 'link' ? 'page' : removing?.kind} is not affected.</>}
        confirmLabel="Remove"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          try {
            await call('links.remove', { id: removing.id });
            invalidate('project');
            toast.success('Link removed');
            setRemoving(null);
          } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not remove the link'); }
        }}
      />
    </div>
  );
}
