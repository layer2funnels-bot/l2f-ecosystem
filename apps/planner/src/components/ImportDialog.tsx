// Import goals from a CSV. Every line is checked first; only valid lines are ever created, one at a time, parents first.
import { useMemo, useState } from 'react';
import { PlannerError } from '../api/types.ts';
import { usePlanner } from '../state/PlannerContext.tsx';
import { Dialog } from '../ui/overlay.tsx';
import { Button, TextArea, TextField } from '../ui/primitives.tsx';
import { EXPORT_HEADERS, parseCsv, parseGoalImport, toCsv, type ImportRow } from '../lib/csv.ts';
import { plural } from '../lib/format.ts';

/** Saves text as a CSV file (with a byte-order mark so spreadsheet apps read accents correctly). */
export function downloadCsv(filename: string, text: string) {
  const blob = new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const fileSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'plan';

type Data = NonNullable<ImportRow['data']>;
interface Planned { row: ImportRow; data: Data; existingParent: string | null; importParent: number | null; note: string | null }
interface Outcome { line: number; title: string; state: 'created' | 'failed' | 'not-tried'; note: string | null }
const norm = (s: string) => s.trim().toLowerCase();

export default function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <ImportInner onClose={onClose} /> : null;
}

function ImportInner({ onClose }: { onClose: () => void }) {
  const { plan, planId, members, client, run } = usePlanner();
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'choose' | 'importing' | 'done'>('choose');
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [stoppedBecause, setStoppedBecause] = useState<string | null>(null);

  const parsed = useMemo(() => {
    if (!plan || !text.trim()) return null;
    return parseGoalImport(text, { focusAreas: plan.focus_areas.filter((f) => !f.archived_at), types: plan.goal_types, members });
  }, [plan, text, members]);

  const raw = useMemo(() => {
    const table = parseCsv(text);
    const head = (table[0] ?? []).map(norm);
    const cell = (line: number, name: string) => { const c = head.indexOf(norm(name)); return c < 0 ? '' : (table[line - 1]?.[c] ?? '').trim(); };
    return cell;
  }, [text]);

  if (!plan || !planId) return null;
  const valid = parsed?.rows.filter((r) => r.ok) ?? [];
  const invalid = (parsed?.rows.length ?? 0) - valid.length;
  const busy = phase === 'importing';

  const onFile = async (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    if (file.size > 2_000_000) { setFileError('That file is too large. Split it into smaller files of up to 500 rows.'); return; }
    try { setText(await file.text()); setFileName(file.name); } catch { setFileError('That file could not be read. Try pasting its text below.'); }
  };

  const template = () => {
    const fa = plan.focus_areas.find((f) => !f.archived_at)?.name ?? 'Growth';
    const ty = plan.goal_types[0]?.name ?? 'Objective';
    downloadCsv('planner-goals-template.csv', toCsv([[...EXPORT_HEADERS], ['Launch the new onboarding', ty, fa, '', members[0]?.name ?? '', 'Not started', 'Medium', 0, 1, '', '', 'onboarding; launch', 'One example row. Delete it and add your own.']]));
  };

  const start = async () => {
    if (!parsed) return;
    const rows = parsed.rows.filter((r) => r.ok && r.data);
    const planned: Planned[] = rows.map((row, i) => {
      const data = row.data!;
      let existingParent: string | null = null, importParent: number | null = null, note: string | null = null;
      if (data.parent_title) {
        const want = norm(data.parent_title);
        const j = rows.findIndex((o, k) => k !== i && o.data!.focus_area_id === data.focus_area_id && norm(o.data!.title) === want);
        if (j >= 0) importParent = j;
        else {
          const ex = plan.goals.find((g) => !g.archived_at && g.focus_area_id === data.focus_area_id && norm(g.title) === want);
          if (ex) existingParent = ex.id;
          else note = `Parent “${data.parent_title}” was not found in this focus area, so it was added at the top level.`;
        }
      }
      return { row, data, existingParent, importParent, note };
    });
    // parents first; a loop of parents cannot be ordered, so those lines go in at the top level
    const order: number[] = []; const placed = new Set<number>();
    for (let moved = true; moved && placed.size < planned.length;) {
      moved = false;
      planned.forEach((p, i) => { if (!placed.has(i) && (p.importParent === null || placed.has(p.importParent))) { order.push(i); placed.add(i); moved = true; } });
    }
    planned.forEach((p, i) => { if (!placed.has(i)) { p.importParent = null; p.note = 'Its parent refers back to itself, so it was added at the top level.'; order.push(i); } });

    setPhase('importing'); setOutcomes([]); setStoppedBecause(null);
    await run(async () => {
      const made = new Map<number, string>();
      const done: Outcome[] = [];
      for (let k = 0; k < order.length; k++) {
        const idx = order[k]!; const p = planned[idx]!; const d = p.data;
        const parent = p.existingParent ?? (p.importParent !== null ? made.get(p.importParent) ?? null : null);
        try {
          const g = await client.saveGoal(planId, null, {
            title: d.title, description: d.description, goal_type_id: d.goal_type_id, owner_id: d.owner_id, status: d.status, priority: d.priority,
            weight: d.weight, start_date: d.start_date, due_date: d.due_date, tags: d.tags, progress_mode: 'manual', progress: d.progress,
            ...(parent ? { parent_goal_id: parent } : { focus_area_id: d.focus_area_id }),
          });
          made.set(idx, g.id);
          done.push({ line: p.row.line, title: d.title, state: 'created', note: p.note });
        } catch (e) {
          const why = e instanceof PlannerError ? e.message : 'Something went wrong.';
          done.push({ line: p.row.line, title: d.title, state: 'failed', note: why });
          for (const r of order.slice(k + 1)) done.push({ line: planned[r]!.row.line, title: planned[r]!.data.title, state: 'not-tried', note: 'Not attempted because the import stopped.' });
          setStoppedBecause(why);
          setOutcomes([...done]);
          break;
        }
        setOutcomes([...done]);
      }
      setOutcomes([...done]);
    });
    setPhase('done');
  };

  const created = outcomes.filter((o) => o.state === 'created').length;
  const attempted = outcomes.length;

  return (
    <Dialog open wide title="Import objectives from a CSV" onClose={() => { if (!busy) onClose(); }}
      description="Each line is checked before anything is created. Lines with problems are never imported."
      footer={phase === 'done' ? <Button variant="primary" onClick={onClose}>Close</Button> : <>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="primary" busy={busy} disabled={valid.length === 0 || !!parsed?.fatal && valid.length === 0} onClick={start}>
          {busy ? `Importing ${created} of ${valid.length}…` : `Import ${plural(valid.length, 'valid row')}`}
        </Button></>}>
      {phase !== 'done' && (
        <div className="stack">
          <div className="import-source">
            <TextField label="Choose a .csv file" type="file" accept=".csv,text/csv,text/plain" disabled={busy} error={fileError}
              hint={fileName ? `Loaded ${fileName}` : 'The first row must name the columns. “Title” and “Focus area” are needed.'} onChange={(e) => void onFile(e.target.files?.[0])} />
            <Button size="sm" onClick={template} disabled={busy}>Download a template</Button>
          </div>
          <TextArea label="Or paste the CSV text here" rows={4} value={text} disabled={busy} onChange={(e) => { setText(e.target.value); setFileName(null); }} />
          {parsed?.fatal && <p className={valid.length ? 'muted' : 'field__error'} role="alert">{parsed.fatal}</p>}
          {parsed && parsed.rows.length > 0 && (
            <>
              <p role="status" className="import-summary"><strong>{valid.length} can be imported</strong>, {invalid} {invalid === 1 ? 'has a problem' : 'have problems'}.
                {valid.length > 0 && invalid > 0 && ' Only the valid rows will be imported.'}</p>
              <div className="table-wrap import-preview">
                <table className="table">
                  <caption className="sr-only">Check of each line in the file</caption>
                  <thead><tr><th scope="col">Line</th><th scope="col">Objective</th><th scope="col">Focus area</th><th scope="col">Check</th><th scope="col">What to fix</th></tr></thead>
                  <tbody>
                    {parsed.rows.map((r) => (
                      <tr key={r.line} className={r.ok ? undefined : 'import-bad'}>
                        <td className="num">{r.line}</td>
                        <td>{raw(r.line, 'Title') || <span className="muted">(empty)</span>}</td>
                        <td>{raw(r.line, 'Focus area') || <span className="muted">—</span>}</td>
                        <td><span className={r.ok ? 'badge badge--good' : 'badge badge--bad'}><span aria-hidden="true">{r.ok ? '✓' : '!'}</span>{r.ok ? 'OK' : 'Problem'}</span></td>
                        <td>{r.ok ? <span className="muted">—</span> : <ul className="import-problems">{r.problems.map((p) => <li key={p}>{p}</li>)}</ul>}</td>
                      </tr>))}
                  </tbody>
                </table>
              </div>
            </>)}
          {busy && <p role="status" aria-live="polite">Creating goals one at a time… {attempted} of {valid.length} done. Please keep this window open.</p>}
        </div>)}
      {phase === 'done' && (
        <div className="stack">
          <p role="status" className="import-summary">
            <strong>{created} of {valid.length} {valid.length === 1 ? 'goal' : 'goals'} created.</strong>
            {invalid > 0 && ` ${plural(invalid, 'line')} with problems ${invalid === 1 ? 'was' : 'were'} not imported.`}
          </p>
          {stoppedBecause && <p className="field__error" role="alert">The import stopped: {stoppedBecause} Objectives listed as created are saved. The others were not created, so you can fix the problem and import the remaining lines again.</p>}
          <div className="table-wrap import-preview">
            <table className="table">
              <caption className="sr-only">Result of the import</caption>
              <thead><tr><th scope="col">Line</th><th scope="col">Objective</th><th scope="col">Result</th></tr></thead>
              <tbody>
                {outcomes.map((o) => (
                  <tr key={o.line}>
                    <td className="num">{o.line}</td><td>{o.title}</td>
                    <td><span className={o.state === 'created' ? 'badge badge--good' : o.state === 'failed' ? 'badge badge--bad' : 'badge'}>
                      <span aria-hidden="true">{o.state === 'created' ? '✓' : o.state === 'failed' ? '!' : '–'}</span>{o.state === 'created' ? 'Created' : o.state === 'failed' ? 'Failed' : 'Not created'}</span>
                      {o.note && <span className="muted import-note"> {o.note}</span>}</td>
                  </tr>))}
              </tbody>
            </table>
          </div>
        </div>)}
    </Dialog>
  );
}
