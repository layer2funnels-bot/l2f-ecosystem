"use client";
import { RichText, RichTextField } from "@/components/rich-text";
import { Icon } from "@/components/icon";
import { setPanel, setSettings, useEditor } from "@/lib/editor/store";

/** Canvas-level notes: strategy, context, to-dos for the whole funnel. Internal unless shared on purpose. */
export function CanvasNotes() {
  const notes = useEditor((s) => s.settings.notes);
  const ro = useEditor((s) => s.readOnly);
  const shared = useEditor((s) => s.shared);
  const canEdit = !ro && !shared;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="m-0">Funnel notes</h3>
        <button type="button" className="btn icon ghost" aria-label="Close notes" title="Close" onClick={() => setPanel("inspector")}>
          <Icon name="close" size={16} />
        </button>
      </div>
      {canEdit ? (
        <>
          <p className="sub">Strategy, context and decisions for the whole funnel. For notes about one step, use its Plan tab.</p>
          <RichTextField label="Notes" value={notes.body} rows={14} placeholder={"## Strategy\n- Who it's for\n- The offer\n\n## Next steps\n- [ ] Write the ads"} onChange={(body) => setSettings({ notes: { ...notes, body } })} />
          <label className="check">
            <input type="checkbox" checked={notes.shared} onChange={(e) => setSettings({ notes: { ...notes, shared: e.target.checked } })} />
            Show these notes on client share links
          </label>
          <p className="text-xs text-muted">{notes.shared ? "Clients with a share link can read these notes (not edit them)." : "Internal: clients never see these notes, in share links, presentations or PDF reports."}</p>
        </>
      ) : notes.body.trim() ? (
        <RichText className="text-sm leading-relaxed" text={notes.body} />
      ) : (
        <p className="sub">No notes yet.</p>
      )}
    </div>
  );
}
