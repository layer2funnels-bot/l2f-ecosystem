"use client";
import { useEffect, useState } from "react";

/**
 * Client detail tabs (V2): Funnels, Products, Notes, Details. All panels are rendered by the server page, so nothing
 * loads on tab change; the inactive ones are hidden. The tab is kept in the address (?tab=) so it can be linked.
 */
export function ClientTabs({ tabs, initial }: { tabs: { key: string; label: string; count?: number; content: React.ReactNode }[]; initial: string }) {
  const [cur, setCur] = useState(tabs.some((t) => t.key === initial) ? initial : tabs[0].key);
  useEffect(() => {
    const u = new URL(window.location.href);
    if (cur === tabs[0].key) u.searchParams.delete("tab");
    else u.searchParams.set("tab", cur);
    window.history.replaceState(window.history.state, "", u);
  }, [cur, tabs]);
  const move = (e: React.KeyboardEvent, i: number) => {
    const n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
    if (n == null) return;
    e.preventDefault();
    const t = tabs[(n + tabs.length) % tabs.length];
    setCur(t.key);
    document.getElementById(`ctab-${t.key}`)?.focus();
  };
  return (
    <>
      <div role="tablist" aria-label="Client sections" className="fm-ctabs">
        {tabs.map((t, i) => (
          <button key={t.key} id={`ctab-${t.key}`} type="button" role="tab" aria-selected={cur === t.key} aria-controls={`cpanel-${t.key}`} tabIndex={cur === t.key ? 0 : -1} onClick={() => setCur(t.key)} onKeyDown={(e) => move(e, i)}>
            {t.label}
            {t.count != null && <span className="n">{t.count}</span>}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} id={`cpanel-${t.key}`} role="tabpanel" aria-labelledby={`ctab-${t.key}`} hidden={cur !== t.key} className="min-w-0">
          {t.content}
        </div>
      ))}
    </>
  );
}
