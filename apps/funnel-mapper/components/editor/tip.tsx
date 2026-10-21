"use client";
/** Tooltip that lives inside its own wrapper (so it stays in the toolbar layer and is never clipped by the canvas). */
export function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="fm-tip" data-tip={label}>
      {children}
    </span>
  );
}
