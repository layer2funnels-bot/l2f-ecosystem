"use client";
// Editor chrome pieces: the Clean | People | Money switch, Layers, and the left tool rail (the Plan control is in plan-control.tsx).
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { setMapView, setOpt, setSideTab, useEditor } from "@/lib/editor/store";

/**
 * Clean | People | Money (editor-calm brief): Clean = names, types and lines, no numbers at all. People (default) = one people
 * number per block and one rate per line. Money = one money number per block (revenue on offers, spend on sources) and the
 * same rates. "Layers" keeps notes, checklists and the forecast badges.
 */
export function ViewSwitch() {
  const view = useEditor((s) => s.opts.view);
  return (
    <div className="seg fm-viewswitch" role="group" aria-label="Map view">
      <button type="button" aria-pressed={view === "clean"} onClick={() => setMapView("clean")} title="Names, types and lines. No numbers">
        Clean
      </button>
      <button type="button" aria-pressed={view === "people"} onClick={() => setMapView("people")} title="One people number on each block, one rate on each line">
        People
      </button>
      <button type="button" aria-pressed={view === "money"} onClick={() => setMapView("money")} title="Revenue on offers, spend on sources, and the same rates">
        Money
      </button>
    </div>
  );
}

/** 48px left rail: Library, Outline, Workspace blocks, Funnel notes, then Shortcuts and Help. */
export function EditorRail({ readOnly, sideCollapsed, onToggleSide, showNotes, notesActive, onNotes, onHelp, onShortcuts }: { readOnly: boolean; sideCollapsed: boolean; onToggleSide: () => void; showNotes: boolean; notesActive: boolean; onNotes: () => void; onHelp: () => void; onShortcuts: () => void }) {
  const what = readOnly ? "side panel" : "block library";
  const tab = useEditor((s) => s.sideTab);
  const shared = useEditor((s) => s.shared);
  // a tab button either shows its panel, or (when it already is showing) collapses the side panel
  const pick = (t: "library" | "outline" | "blocks" | "templates" | "math") => (tab === t && !sideCollapsed ? onToggleSide() : setSideTab(t));
  const on = (t: string) => tab === t && !sideCollapsed;
  return (
    <nav className="fm-rail" aria-label="Editor tools">
      <button type="button" className={on("library") ? "on" : ""} aria-label={`${on("library") ? "Collapse" : "Expand"} ${what}`} title={`${on("library") ? "Hide" : "Show"} ${what}`} aria-expanded={on("library")} aria-controls="fm-side" onClick={() => pick("library")}>
        <Icon name="panelLeft" />
      </button>
      {!readOnly && (
        <>
          <button type="button" className={on("outline") ? "on" : ""} aria-label="Outline" title="Outline: every object on the map" aria-pressed={on("outline")} aria-controls="fm-side" onClick={() => pick("outline")}>
            <Icon name="list" />
          </button>
          {!shared && (
            <button type="button" className={on("templates") ? "on" : ""} aria-label="Templates" title="Templates: add one of the 13 to this map" aria-pressed={on("templates")} aria-controls="fm-side" onClick={() => pick("templates")}>
              <Icon name="file" />
            </button>
          )}
          {!shared && (
            <button type="button" className={on("math") ? "on" : ""} aria-label="How the math works" title="How the math works: the selected step in words" aria-pressed={on("math")} aria-controls="fm-side" onClick={() => pick("math")}>
              <Icon name="calc" />
            </button>
          )}
          {!shared && (
            <button type="button" className={on("blocks") ? "on" : ""} aria-label="Workspace blocks" title="Workspace blocks: saved groups of blocks" aria-pressed={on("blocks")} aria-controls="fm-side" onClick={() => pick("blocks")}>
              <Icon name="layers" />
            </button>
          )}
        </>
      )}
      {showNotes && (
        <button type="button" className={notesActive ? "on" : ""} aria-label="Funnel notes" title="Funnel notes" aria-pressed={notesActive} onClick={onNotes}>
          <Icon name="note" />
        </button>
      )}
      <span className="flex-1" />
      <button type="button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={onShortcuts}>
        <Icon name="settings" />
      </button>
      <button type="button" aria-label="Help" title="Help" onClick={onHelp}>
        <Icon name="help" />
      </button>
    </nav>
  );
}

/** Layers: Map is always on; Forecast, Notes and Checklist switch view options. Numbers and line weight follow the Clean / People / Money view. */
export function LayersMenu() {
  const notes = useEditor((s) => s.opts.notes);
  const checks = useEditor((s) => s.opts.checks);
  const build = useEditor((s) => s.opts.build);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div className="fm-layers" ref={ref}>
      <button type="button" className="btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="layers" size={15} /> Layers
      </button>
      {open && (
        <div className="fm-layers-pop" role="group" aria-label="Layers">
          <label>
            <input type="checkbox" checked disabled /> Map
          </label>
          <label>
            <input type="checkbox" checked={notes} onChange={(e) => setOpt("notes", e.target.checked)} /> Notes
          </label>
          <label>
            <input type="checkbox" checked={checks} onChange={(e) => setOpt("checks", e.target.checked)} /> Checklist
          </label>
          <label title="Planned, in progress or live on each block. Select several blocks to set them together.">
            <input type="checkbox" checked={build} onChange={(e) => setOpt("build", e.target.checked)} /> Build status
          </label>
        </div>
      )}
    </div>
  );
}
