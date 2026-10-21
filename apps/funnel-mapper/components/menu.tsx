"use client";
import { useEffect, useId, useRef, useState } from "react";

/** Small accessible dropdown menu: button + popover, closes on outside click, Escape, or picking an item. */
export function Menu({ label, children, align = "left", className = "btn", buttonContent }: { label: string; children: (close: () => void) => React.ReactNode; align?: "left" | "right"; className?: string; buttonContent?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        (ref.current?.querySelector("button[aria-haspopup]") as HTMLButtonElement | null)?.focus();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const items = [...(ref.current?.querySelectorAll<HTMLElement>("[role=menu] button:not(:disabled), [role=menu] a, [role=menu] input") ?? [])];
        const i = items.indexOf(document.activeElement as HTMLElement);
        const n = items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
        n?.focus();
        e.preventDefault();
      }
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" className={className} aria-label={buttonContent ? label : undefined} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        {buttonContent ?? label}
      </button>
      {open && (
        <div id={id} role="menu" aria-label={label} className={`menu-pop${align === "right" ? " right" : ""}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
