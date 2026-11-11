// Optional "Docs" view: the project's ecosystem documents, whiteboards and spreadsheets, grouped. Everything is a reference
// (a project link); the ecosystem editors own the content. Creating new ones needs the ecosystem adapter (web/lib/ecosystemDocs.ts).
import { useState } from 'react';
import type { ProjectDetail, ProjectLink, ProjectLinkKind } from '../../../../shared/api.ts';
import { call } from '../../../api/client.ts';
import { invalidate } from '../../../api/store.ts';
import { ecosystemDocs } from '../../../lib/ecosystemDocs.ts';
import type { EcosystemDocKind } from '../../../lib/ecosystemDocs.ts';
import { relTime } from '../../../lib/util.ts';
import { Button } from '../../../ui/Button.tsx';
import { contextMenuProps, openMenuFrom } from '../../../ui/ContextMenu.tsx';
import type { CtxItem } from '../../../ui/ContextMenu.tsx';
import { ConfirmDialog, Modal } from '../../../ui/Dialog.tsx';
import { EmptyState } from '../../../ui/Feedback.tsx';
import { Field, Input } from '../../../ui/Form.tsx';
import { Icon } from '../../../ui/icons.tsx';
import type { IconName } from '../../../ui/icons.tsx';
import { Select } from '../../../ui/Menu.tsx';
import { askForm } from '../../../ui/Prompt.tsx';
import { toast } from '../../../ui/Toast.tsx';
import { copyText } from '../../../lib/clipboard.ts';

type DocKind = Exclude<ProjectLinkKind, 'link'>;
const GROUPS: { kind: DocKind; label: string; plural: string; icon: IconName }[] = [
  { kind: 'doc', label: 'Doc', plural: 'Docs', icon: 'doc' },
  { kind: 'whiteboard', label: 'Whiteboard', plural: 'Whiteboards', icon: 'whiteboard' },
  { kind: 'sheet', label: 'Spreadsheet', plural: 'Spreadsheets', icon: 'sheet' },
];

function urlProblem(raw: string): string | null {
  const v = raw.trim();
  if (!v) return 'Paste the address of the document.';
  let u: URL;
  try { u = new URL(v); } catch { return 'That doesn’t look like a web address. Start it with https://'; }
  if (u.protocol !== 'https:') return 'Addresses must start with https://';
  if (!u.hostname.includes('.')) return 'Enter a full address, like https://example.com/doc';
  return null;
}

export function DocsPagesView({ project: p }: { project: ProjectDetail }) {
  const canEdit = p.myRole !== 'viewer' && !p.deletedAt;
  const [linking, setLinking] = useState<DocKind | null>(null);
  const [removing, setRemoving] = useState<ProjectLink | null>(null);
  const [busyNew, setBusyNew] = useState<DocKind | null>(null);
  const items = p.links.filter((l) => l.kind !== 'link');

  const createNew = async (kind: EcosystemDocKind) => {
    setBusyNew(kind);
    try {
      const made = await ecosystemDocs.create(kind, p.id, `Untitled ${GROUPS.find((g) => g.kind === kind)!.label.toLowerCase()}`);
      await call('links.add', { projectId: p.id, kind, title: made.title, url: made.url });
      invalidate('project');
      ecosystemDocs.open(made.url);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not create it'); }
    setBusyNew(null);
  };

  const menu = (l: ProjectLink): CtxItem[] => {
    const out: CtxItem[] = [
      { id: 'open', icon: 'external', label: 'Open in new tab', onSelect: () => ecosystemDocs.open(l.url) },
      { id: 'copy', icon: 'link', label: 'Copy link', onSelect: () => void copyText(l.url, 'Link copied') },
    ];
    if (canEdit) {
      out.push(
        {
          id: 'rename', icon: 'edit', label: 'Rename…', separatorBefore: true,
          onSelect: () => void askForm({ title: 'Rename', fields: [{ name: 'title', label: 'Title', initial: l.title, required: true, maxLength: 200 }], confirmLabel: 'Rename' }).then(async (r) => {
            if (!r || r.title === l.title) return;
            try { await call('links.update', { id: l.id, title: r.title }); invalidate('project'); toast.success('Renamed'); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not rename'); }
          }),
        },
        { id: 'remove', icon: 'trash', label: 'Remove from project…', danger: true, onSelect: () => setRemoving(l) },
      );
    }
    return out;
  };

  return (
    <div className="pm-docs pm-dp">
      <div className="pm-dp__head">
        <p className="pm-muted"><Icon name="info" size={14} /> These are documents, whiteboards and spreadsheets from the ecosystem, linked by reference. Nothing is copied into this project.</p>
        {canEdit && (
          <div className="pm-dp__actions">
            {ecosystemDocs.available ? GROUPS.map((g) => (
              <Button key={g.kind} icon="plus" size="sm" loading={busyNew === g.kind} onClick={() => void createNew(g.kind)}>New {g.label.toLowerCase()}</Button>
            )) : <Button variant="primary" icon="plus" size="sm" onClick={() => setLinking('doc')}>Link a document</Button>}
          </div>
        )}
      </div>
      {!ecosystemDocs.available && (
        <p className="pm-dp__note" role="note">Creating new docs, whiteboards and sheets opens the ecosystem editors after integration.</p>
      )}

      {items.length === 0 ? (
        <EmptyState icon="doc" title="No documents linked yet" text={canEdit ? 'Link a Doc, Whiteboard or Spreadsheet so the team finds everything in one place.' : 'Nothing has been linked to this project yet.'} />
      ) : GROUPS.map((g) => {
        const list = items.filter((l) => l.kind === g.kind);
        return (
          <section key={g.kind} className="pm-docs__group" aria-label={g.plural}>
            <h2 className="pm-docs__heading">{g.plural}<span className="pm-faint"> · {list.length}</span></h2>
            {list.length === 0 ? <p className="pm-faint pm-dp__none">No {g.plural.toLowerCase()} linked.</p> : (
              <ul className="pm-linklist">
                {list.map((l) => (
                  <li key={l.id} className="pm-linkrow" {...contextMenuProps(() => menu(l), { label: `Actions for ${l.title}` })}>
                    <span className="pm-linkrow__icon"><Icon name={g.icon} /></span>
                    <a className="pm-linkrow__text" href={l.url} target="_blank" rel="noopener noreferrer">
                      <span className="pm-linkrow__title pm-truncate">{l.title}</span>
                      <span className="pm-faint pm-truncate">Added {l.addedBy ? `by ${l.addedBy} ` : ''}{relTime(l.createdAt)}</span>
                    </a>
                    <a className="pm-linkrow__open" href={l.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${l.title} in a new tab`} title="Open in new tab"><Icon name="external" /></a>
                    <button type="button" className="pm-mini" aria-label={`More actions for ${l.title}`} title="More actions" onClick={(e) => openMenuFrom(e.currentTarget)}><Icon name="more" size={14} /></button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {linking && <LinkDocModal projectId={p.id} initial={linking} onClose={() => setLinking(null)} />}
      <ConfirmDialog
        open={!!removing}
        danger
        title="Remove this document from the project?"
        message={<>“{removing?.title}” is only unlinked here. The original is not deleted or changed.</>}
        confirmLabel="Remove"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          try { await call('links.remove', { id: removing.id }); invalidate('project'); toast.success('Removed from project'); setRemoving(null); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not remove it'); }
        }}
      />
    </div>
  );
}

function LinkDocModal({ projectId, initial, onClose }: { projectId: string; initial: DocKind; onClose: () => void }) {
  const [kind, setKind] = useState<DocKind>(initial);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const titleErr = touched && !title.trim() ? 'Give it a title.' : null;
  const urlErr = touched ? urlProblem(url) : null;
  const submit = async () => {
    setTouched(true);
    if (!title.trim() || urlProblem(url)) return;
    setBusy(true);
    try {
      await call('links.add', { projectId, kind, title: title.trim(), url: url.trim() });
      invalidate('project');
      toast.success('Document linked');
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not link it'); setBusy(false); }
  };
  return (
    <Modal
      open size="sm" title="Link a document" description="Add an existing ecosystem document, whiteboard or spreadsheet by its address." onClose={onClose}
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
      footer={<><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Link</Button></>}
    >
      <div className="pm-prompt">
        <Field label="Type"><Select<DocKind> value={kind} options={GROUPS.map((g) => ({ value: g.kind, label: g.label === 'Doc' ? 'Doc' : g.label }))} onChange={setKind} ariaLabel="Type" /></Field>
        <Field label="Title" required error={titleErr}><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} invalid={!!titleErr} placeholder="e.g. Campaign brief" data-autofocus /></Field>
        <Field label="Address" required error={urlErr}><Input value={url} onChange={(e) => setUrl(e.target.value)} maxLength={2000} invalid={!!urlErr} placeholder="https://" inputMode="url" autoComplete="off" /></Field>
      </div>
    </Modal>
  );
}
