"use client";
import { useEffect, useState } from "react";

/**
 * Left section navigation of Settings (V2): one section at a time, as drawn. The page container carries `data-pane`; the CSS
 * hides the other sections. Below 1024px it becomes a select. The hash (#team) opens a section directly.
 */
export function SettingsNav({ sections }: { sections: { id: string; label: string }[] }) {
  const [cur, setCur] = useState(sections[0]?.id ?? "");
  const show = (id: string, push = true) => {
    if (!sections.some((s) => s.id === id)) return;
    setCur(id);
    document.getElementById("fm-settings")?.setAttribute("data-pane", id);
    if (push) history.replaceState(null, "", `#${id}`);
  };
  useEffect(() => {
    const h = location.hash.slice(1);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the address once on arrival
    show(sections.some((s) => s.id === h) ? h : (sections[0]?.id ?? ""), false);
    const on = () => show(location.hash.slice(1), false);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <label className="mb-4 block lg:hidden">
        <span className="sr-only">Choose a settings section</span>
        <select className="input" value={cur} onChange={(e) => show(e.target.value)}>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <nav aria-label="Settings sections" className="hidden self-start lg:block">
        <ul className="m-0 grid list-none gap-0.5 p-0">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={cur === s.id ? "true" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  show(s.id);
                }}
                className={`block rounded-lg px-3 py-2 text-[13.5px] font-medium no-underline ${cur === s.id ? "bg-side-item text-ink" : "text-muted hover:bg-side-item hover:text-ink"}`}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
