"use client";
import { useState } from "react";
import { GraphThumb } from "@/components/graph-thumb";
import { Icon } from "@/components/icon";
import { NewFunnelButton, type TemplateOption } from "@/components/new-funnel-dialog";
import { DeleteTemplate } from "./delete-template";

export interface TemplateCard {
  id: string;
  name: string;
  category: string;
  description: string;
  value: string;
  mine: boolean;
  graph: unknown;
  settings?: unknown;
  blocks: number;
  revenue: string;
  roas: string;
  steps: string[];
}

/** Templates (V2): built-in and workspace templates, a preview panel, "Use template" and "Use for client". */
export function TemplatesBrowser({ cards, clients, options, canEdit, mineTitle }: { cards: TemplateCard[]; clients: { id: string; name: string }[]; options: TemplateOption[]; canEdit: boolean; mineTitle: string }) {
  const [sel, setSel] = useState<string>(cards[0]?.id ?? "");
  const [find, setFind] = useState("");
  const [open, setOpen] = useState(false); // below 1280px the preview is a drawer that opens on tap
  const [filter, setFilter] = useState<"all" | "builtin" | "mine">("all");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const cur = cards.find((c) => c.id === sel) ?? cards[0] ?? null;
  const builtins = cards.filter((c) => !c.mine),
    mine = cards.filter((c) => c.mine);
  const base = filter === "builtin" ? builtins : filter === "mine" ? mine : cards;
  const needle = find.trim().toLowerCase();
  const shown = needle ? base.filter((t) => `${t.name} ${t.description} ${t.category}`.toLowerCase().includes(needle)) : base;
  const item = (t: TemplateCard) => (
    <li key={t.id}>
      <button type="button" className={`fm-tcard${cur?.id === t.id ? " on" : ""}`} aria-label={`Preview ${t.name}`} aria-pressed={cur?.id === t.id} onClick={() => (setSel(t.id), setOpen(true))}>
        <span className="fm-fthumb">
          <GraphThumb graph={t.graph} settings={t.settings} name={t.name} height={106} className="h-[106px] w-full" />
          <span className="fm-fchip">{t.blocks} blocks</span>
        </span>
        <b className="fm-tname">{t.name}</b>
        {t.description && <span className="fm-tdesc">{t.description}</span>}
        <span className="fm-tfoot">
          <span>{t.blocks} blocks</span>
          <span>{t.mine ? mineTitle : `Built-in ${t.category}`}</span>
        </span>
      </button>
    </li>
  );
  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-0">
      <div className="min-w-0 xl:pr-8">
        <label className="relative mb-3 block">
          <span className="sr-only">Search templates</span>
          <Icon name="search" size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input className="input pl-9" type="search" placeholder={`Search ${cards.length} templates`} value={find} onChange={(e) => setFind(e.target.value)} />
        </label>
        <div className="mb-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter templates">
          <button type="button" className="fm-chip" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
            All <b>{cards.length}</b>
          </button>
          <button type="button" className="fm-chip" aria-pressed={filter === "builtin"} onClick={() => setFilter("builtin")}>
            Built-in <b>{builtins.length}</b>
          </button>
          <button type="button" className="fm-chip" aria-pressed={filter === "mine"} onClick={() => setFilter("mine")}>
            {mineTitle} <b>{mine.length}</b>
          </button>
        </div>
        {shown.length === 0 && needle ? (
          <p className="fm-empty-line">No templates match “{find}”.</p>
        ) : filter === "mine" && mine.length === 0 ? (
          <p className="fm-empty-line">{mineTitle === "Team templates" ? "No team templates yet. Open any funnel, then File → Save as template. Everyone on the team can use them." : "No saved templates yet. Open any funnel, then File → Save as template."}</p>
        ) : (
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 2xl:grid-cols-3" aria-label="Templates">
            {shown.map(item)}
          </ul>
        )}
      </div>
      {cur && (
        <aside className="fm-tplpanel" data-open={open} aria-label={`Preview: ${cur.name}`}>
          <button type="button" className="btn icon ghost fm-tplclose" aria-label="Close preview" onClick={() => setOpen(false)}>
            ✕
          </button>
          <GraphThumb graph={cur.graph} settings={cur.settings} name={cur.name} height={190} className="h-[190px] w-full rounded-xl border border-side-line" />
          <h2 className="mt-5 mb-2 font-display text-[22px] font-semibold tracking-tight">{cur.name}</h2>
          {cur.description && <p className="mb-4 text-sm leading-relaxed text-muted">{cur.description}</p>}
          <dl className="fm-kn mb-5">
            <div>
              <dt>Example revenue</dt>
              <dd>{cur.revenue}</dd>
            </div>
            <div>
              <dt>Example ROAS</dt>
              <dd>{cur.roas}</dd>
            </div>
            <div>
              <dt>Blocks</dt>
              <dd>{cur.blocks}</dd>
            </div>
          </dl>
          <h3 className="mb-1 text-[10.5px] font-semibold tracking-[0.09em] text-muted uppercase">Steps</h3>
          <ol className="m-0 mb-5 max-h-[170px] list-decimal overflow-y-auto pl-5 text-[13px]">
            {cur.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          {canEdit && (
            <div className="grid gap-3">
              {clients.length > 0 && (
                <label className="field mb-0">
                  <span className="lbl">Use for client</span>
                  <select className="input" aria-label="Client for this template" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <NewFunnelButton key={`${cur.id}-${clientId}`} clients={clients} clientId={clientId || undefined} templates={options} defaultSource={cur.value} label="Use template" className="btn primary w-full" />
              <p className="m-0 text-center text-xs text-muted">Opens tidied and fitted to screen.</p>
              {cur.mine && <DeleteTemplate id={cur.id} name={cur.name} />}
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
