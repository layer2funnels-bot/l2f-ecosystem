// One command registry (V2 §16): every action list (quick add today; menus and shortcut help can read it too) takes
// its id, label, scope and shortcut from here. The editor registers the commands whose handlers live in components
// (tidy up, fit, save a version, simulate); store-level ones are registered below. Nothing here is AI.
import type { IconName, UiIconName } from "../icons";
import {
  copySelection,
  deleteSelection,
  duplicateSelection,
  paste,
  redo,
  undo,
  useEditor,
} from "./store";

export interface Command {
  id: string;
  label: string;
  /** "map" acts on the whole funnel, "selection" on the selected objects, "view" changes only what is shown. */
  scope: "map" | "selection" | "view";
  shortcut?: string;
  icon?: IconName | UiIconName;
  /** Extra words people may type for it. */
  words?: string;
  run: () => void;
  enabled?: () => boolean;
}

const registry = new Map<string, Command>();

/** Add commands; returns a function that removes exactly these again (for a component's effect cleanup). */
export function registerCommands(list: Command[]): () => void {
  for (const c of list) registry.set(c.id, c);
  return () =>
    list.forEach((c) => registry.get(c.id) === c && registry.delete(c.id));
}

export const allCommands = () => [...registry.values()];

/** Commands whose label or words contain every typed word, enabled ones only. */
export function searchCommands(q: string): Command[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return allCommands().filter((c) => {
    if (c.enabled && !c.enabled()) return false;
    const hay = `${c.label} ${c.words ?? ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

const editable = () => !useEditor.getState().readOnly;
const hasSel = () => editable() && useEditor.getState().selNodes.length > 0;

registerCommands([
  {
    id: "undo",
    label: "Undo",
    scope: "map",
    shortcut: "Mod+Z",
    icon: "undo",
    run: undo,
    enabled: editable,
  },
  {
    id: "redo",
    label: "Redo",
    scope: "map",
    shortcut: "Mod+Shift+Z",
    icon: "redo",
    run: redo,
    enabled: editable,
  },
  {
    id: "duplicate",
    label: "Duplicate selection",
    scope: "selection",
    shortcut: "Mod+D",
    icon: "copy",
    words: "copy clone",
    run: duplicateSelection,
    enabled: hasSel,
  },
  {
    id: "copy",
    label: "Copy selection",
    scope: "selection",
    shortcut: "Mod+C",
    icon: "copy",
    run: copySelection,
    enabled: hasSel,
  },
  {
    id: "paste",
    label: "Paste",
    scope: "map",
    shortcut: "Mod+V",
    run: paste,
    enabled: editable,
  },
  {
    id: "delete",
    label: "Delete selection",
    scope: "selection",
    shortcut: "Mod+Backspace",
    icon: "trash",
    words: "remove",
    run: deleteSelection,
    enabled: hasSel,
  },
]);
