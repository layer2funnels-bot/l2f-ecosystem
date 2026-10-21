"use client";
import { forwardRef, useSyncExternalStore } from "react";
import { isApple, kbd } from "@/lib/platform";

/** Shortcut specs: "Mod" = ⌘ on Apple devices and Ctrl elsewhere. */
const KEYS: [string, string][] = [
  ["Mod+Backspace", "Delete the selection (Delete also works)"],
  ["Mod+Z", "Undo"],
  ["Mod+Shift+Z", "Redo"],
  ["Mod+C", "Copy blocks"],
  ["Mod+V", "Paste blocks"],
  ["Mod+D", "Duplicate the selection"],
  ["Mod+Alt+C", "Copy style"],
  ["Mod+Alt+V", "Paste style"],
  ["Mod+Alt+L", "Lock or unlock the selection"],
  ["Mod+]", "Bring forward (add Shift: to front)"],
  ["Mod+[", "Send backward (add Shift: to back)"],
  ["Mod+A", "Select all"],
  ["F2", "Rename the selected block"],
  ["Arrows", "Nudge the selection (Shift for bigger steps)"],
  ["Shift+drag", "Box select"],
  ["Mod+Shift+L", "Tidy up the layout"],
  ["Mod+S", "Save a version"],
  ["[", "Hide or show the blocks panel"],
  ["]", "Hide or show the details panel"],
  ["S", "Start or leave Simulate"],
  ["Space", "Play or pause the people flow while simulating"],
  ["/", "Search the Blocks sidebar (double-click the canvas to quick-add a block)"],
  ["Esc", "Cancel, close, or clear the selection"],
  ["?", "This list"],
];

const TIPS: [string, string][] = [
  ["Build the journey", "Add a traffic source, then pages and offers. Drag from any of the four side dots to connect two steps, then choose what the line means: people who continue, people who don’t, or another meaning."],
  ["Drag into empty space", "Release a connection on an empty spot and Quick Add opens there. The block you pick is placed and connected in one step."],
  ["Select to see tools", "One block: a toolbar above it, details in the panel on the right, everything in the right-click menu. Nothing selected: the panel shows the whole funnel."],
  ["Clean or Performance", "Clean shows the structure. Performance adds numbers, line weight by people, stage totals and the key leak. Same map, a different layer."],
  ["Numbers are one engine", "Every figure on the map, in Reports, in the PDF and in exports comes from the same calculation. Change an assumption in What-if or Scenarios to see it move."],
  ["Share safely", "Share links hide internal notes, checklists and screenshots. Turn numbers off per link when the client should see the journey only."],
];

const useApple = () =>
  useSyncExternalStore(
    () => () => {},
    () => isApple(),
    () => false,
  );

export const HelpDialog = forwardRef<HTMLDialogElement, { mode?: "shortcuts" | "help" }>(function HelpDialog({ mode = "shortcuts" }, ref) {
  useApple(); // re-render with ⌘ / Ctrl once the platform is known on the client
  const help = mode === "help";
  return (
    <dialog ref={ref} className="modal" aria-labelledby={`help-title-${mode}`}>
      <h3 id={`help-title-${mode}`}>{help ? "Help" : "Keyboard shortcuts"}</h3>
      {help ? (
        <dl className="grid gap-3 text-sm">
          {TIPS.map(([k, v]) => (
            <div key={k}>
              <dt className="font-semibold">{k}</dt>
              <dd className="m-0 text-muted">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {KEYS.map(([k, v]) => (
            <div key={k} className="contents">
              <dt>
                <span className="kb">{kbd(k)}</span>
              </dt>
              <dd className="m-0">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <form method="dialog" className="mt-5 text-right">
        <button className="btn primary">Close</button>
      </form>
    </dialog>
  );
});
