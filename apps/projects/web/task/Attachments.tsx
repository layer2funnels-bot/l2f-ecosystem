import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import type { Attachment } from '../../shared/api.ts';
import { call, downloadFile, uploadFile } from '../api/client.ts';
import { invalidateWork } from '../api/store.ts';
import { cx, relTime } from '../lib/util.ts';
import { Button, ConfirmDialog, Icon, ProgressBar, toast } from '../ui/index.ts';
import type { IconName } from '../ui/index.ts';
import { toApiError, useTask } from './context.ts';
import { fmtBytes, MAX_UPLOAD_BYTES } from './format.ts';
import { Section } from './Section.tsx';

interface Upload { key: number; file: File; pct: number; error: string | null }

function fileIcon(mime: string, name: string): { icon: IconName; tone: string; ext: string } {
  const ext = (name.includes('.') ? name.split('.').pop() ?? '' : '').slice(0, 4).toUpperCase();
  if (mime.startsWith('image/')) return { icon: 'whiteboard', tone: 'image', ext };
  if (mime.startsWith('video/') || mime.startsWith('audio/')) return { icon: 'play', tone: 'media', ext };
  if (/zip|compressed|tar|gzip|7z|rar/.test(mime)) return { icon: 'archive', tone: 'archive', ext };
  if (mime === 'application/pdf') return { icon: 'doc', tone: 'pdf', ext: ext || 'PDF' };
  return { icon: 'doc', tone: 'doc', ext };
}

let seq = 0;

export function Attachments() {
  const { task, readOnly, act } = useTask();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState<Attachment | null>(null);
  const [busyDownload, setBusyDownload] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);

  const patch = (key: number, p: Partial<Upload>) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const start = async (u: Upload) => {
    patch(u.key, { pct: 0, error: null });
    try {
      await uploadFile(task.id, u.file, (pct) => patch(u.key, { pct }), task.projectId);
      setUploads((all) => all.filter((x) => x.key !== u.key));
      invalidateWork();
    } catch (e) {
      patch(u.key, { error: toApiError(e).message });
    }
  };

  const addFiles = (files: File[]) => {
    if (readOnly || !files.length) return;
    const bad: string[] = [];
    const ok: Upload[] = [];
    for (const f of files) {
      if (f.size > MAX_UPLOAD_BYTES) bad.push(`“${f.name}” is ${fmtBytes(f.size)}. Files must be 25 MB or smaller.`);
      else if (f.size === 0) bad.push(`“${f.name}” is empty.`);
      else ok.push({ key: ++seq, file: f, pct: 0, error: null });
    }
    setProblems(bad);
    if (ok.length) { setUploads((u) => [...u, ...ok]); ok.forEach((u) => void start(u)); }
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => { addFiles([...(e.target.files ?? [])]); e.target.value = ''; };
  const onDrop = (e: DragEvent) => { e.preventDefault(); depth.current = 0; setDragging(false); addFiles([...e.dataTransfer.files]); };
  const hasFiles = (e: DragEvent) => [...e.dataTransfer.types].includes('Files');

  const download = async (a: Attachment) => {
    setBusyDownload(a.id);
    try { await downloadFile(a.id, a.name); } catch (e) { toast.error(toApiError(e).message); }
    setBusyDownload(null);
  };

  const confirmRemove = async () => {
    if (!removing) return;
    const a = removing;
    await act(() => call('attachments.remove', { id: a.id }), (d) => ({ ...d, attachments: d.attachments.filter((x) => x.id !== a.id) }));
    setRemoving(null);
  };

  return (
    <Section title="Attachments" meta={task.attachments.length || undefined} actions={!readOnly && (
      <Button size="sm" icon="upload" onClick={() => input.current?.click()}>Upload</Button>
    )}>
      <input ref={input} type="file" multiple hidden tabIndex={-1} onChange={onPick} aria-label="Choose files to upload" />
      {!readOnly && (
        <div
          className={cx('pm-drop', dragging && 'is-over')}
          onDragEnter={(e) => { if (hasFiles(e)) { e.preventDefault(); depth.current++; setDragging(true); } }}
          onDragOver={(e) => { if (hasFiles(e)) e.preventDefault(); }}
          onDragLeave={() => { depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) setDragging(false); }}
          onDrop={onDrop}
        >
          <Icon name="upload" size={16} />
          <span>Drop files here, or <button type="button" className="pm-linkbtn" onClick={() => input.current?.click()}>browse</button> <span className="pm-faint">(up to 25 MB each)</span></span>
        </div>
      )}
      {problems.length > 0 && (
        <ul className="pm-tf__error pm-upload-problems" role="alert">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      {uploads.length > 0 && (
        <ul className="pm-files" aria-label="Uploads in progress">
          {uploads.map((u) => (
            <li key={u.key} className="pm-file pm-file--upload">
              <div className="pm-file__text">
                <span className="pm-file__name pm-truncate">{u.file.name}</span>
                {u.error ? (
                  <span className="pm-tf__error" role="alert">Upload failed: {u.error}</span>
                ) : (
                  <ProgressBar value={u.pct} height={4} label={`Uploading ${u.file.name}: ${u.pct}%`} />
                )}
              </div>
              {u.error ? (
                <>
                  <Button size="sm" icon="restore" onClick={() => void start(u)}>Retry</Button>
                  <button type="button" className="pm-mini" aria-label={`Dismiss ${u.file.name}`} title={`Dismiss ${u.file.name}`} onClick={() => setUploads((all) => all.filter((x) => x.key !== u.key))}><Icon name="x" size={14} /></button>
                </>
              ) : <span className="pm-faint pm-num">{u.pct}%</span>}
            </li>
          ))}
        </ul>
      )}
      {task.attachments.length > 0 && (
        <ul className="pm-files" aria-label="Attachments">
          {task.attachments.map((a) => {
            const f = fileIcon(a.mime, a.name);
            return (
              <li key={a.id} className="pm-file">
                <span className={cx('pm-file__icon', `is-${f.tone}`)} title={a.mime}><Icon name={f.icon} size={16} /></span>
                <div className="pm-file__text">
                  <span className="pm-file__name pm-truncate" title={a.name}>{a.name}</span>
                  <span className="pm-file__meta pm-truncate">{fmtBytes(a.sizeBytes)} · {a.uploadedBy.name} · <time dateTime={a.createdAt} title={new Date(a.createdAt).toLocaleString()}>{relTime(a.createdAt)}</time></span>
                </div>
                <Button size="sm" variant="ghost" icon="download" loading={busyDownload === a.id} aria-label={`Download ${a.name}`} onClick={() => void download(a)} />
                {!readOnly && <Button size="sm" variant="ghost" icon="trash" aria-label={`Remove ${a.name}`} onClick={() => setRemoving(a)} />}
              </li>
            );
          })}
        </ul>
      )}
      {task.attachments.length === 0 && uploads.length === 0 && readOnly && <p className="pm-faint">No attachments.</p>}
      <ConfirmDialog
        open={!!removing}
        title="Remove attachment?"
        message={<>“{removing?.name}” will be permanently deleted from this task.</>}
        confirmLabel="Remove"
        danger
        onConfirm={confirmRemove}
        onClose={() => setRemoving(null)}
      />
    </Section>
  );
}
