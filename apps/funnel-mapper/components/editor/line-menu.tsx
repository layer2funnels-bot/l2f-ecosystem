"use client";
// "Connect as" (V2 four ports): right after a line is drawn from a block that can lead to Yes or No, a small menu asks
// what the line means. The default (Yes, or No when drawn from the bottom side) is already applied, so Esc, a click
// elsewhere or simply carrying on keeps it. The meaning can be changed later by selecting the line.
import { useEffect, useRef } from "react";
import { closeLineMenu, meaningOf, setMeaning, useEditor, type LineMeaning } from "@/lib/editor/store";

export const MEANINGS: [LineMeaning, string, string][] = [
  ["yes", "Yes", "people who continue"],
  ["no", "No", "people who leave"],
  ["skip", "Skip step", "go past a block"],
  ["nodata", "No data", "path without numbers"],
];

/** Small line sample per meaning, so the choice is never made by colour alone. */
export function MeaningSwatch({ m }: { m: LineMeaning }) {
  const dash = m === "no" ? "6 4" : m === "skip" ? "1.5 3" : m === "nodata" ? "7 3 1.5 3" : undefined;
  const c = m === "no" ? "var(--lost)" : m === "nodata" ? "var(--muted)" : "var(--edge)";
  return (
    <svg width="26" height="8" viewBox="0 0 26 8" aria-hidden="true" className="fm-mswatch">
      <path d="M1 4H25" stroke={c} strokeWidth="2.2" strokeDasharray={dash} strokeLinecap="round" />
    </svg>
  );
}

export function LineMenu() {
  const m = useEditor((s) => s.lineMenu);
  const e = useEditor((s) => (s.lineMenu ? s.edges.find((x) => x.id === s.lineMenu!.id) : undefined));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!m) return;
    ref.current?.querySelector<HTMLButtonElement>("button[aria-checked='true']")?.focus();
    const down = (ev: PointerEvent) => !ref.current?.contains(ev.target as Node) && closeLineMenu();
    const key = (ev: KeyboardEvent) => ev.key === "Escape" && closeLineMenu();
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key);
    };
  }, [m]);
  if (!m || !e) return null;
  const cur = meaningOf(e);
  const stage = typeof document !== "undefined" ? document.querySelector(".fm-stage")?.getBoundingClientRect() : undefined;
  const W = 220,
    H = 196;
  const left = Math.max(8, Math.min((stage?.width ?? 800) - W - 8, m.sx + 12));
  const top = Math.max(8, Math.min((stage?.height ?? 600) - H - 8, m.sy - 20));
  return (
    <div ref={ref} className="fm-linemenu" role="radiogroup" aria-label="Connect as" style={{ left, top, width: W }}>
      <b>Connect as</b>
      {MEANINGS.map(([k, label, help]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={cur === k}
          aria-label={`${label}: ${help}`}
          onClick={() => {
            setMeaning(e.id, k);
            closeLineMenu();
          }}
        >
          <MeaningSwatch m={k} />
          <span>
            <span className="l">{label}</span>
            <small>{help}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
