"use client";
import { TimeAgo } from "@/components/time-ago";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { GraphThumb } from "@/components/graph-thumb";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { LogoUpload } from "@/components/logo-upload";
import { StatusPill } from "@/components/status-pill";
import type { FunnelSummary } from "@/lib/funnel-math";
import { money, ratio } from "@/lib/format";
import { Menu } from "@/components/menu";
import { typeOf } from "@/lib/catalog";
import { parseGraph } from "@/lib/graph";
import { healthChecks } from "@/lib/health";
import { FUNNEL_STATUSES, STATUS_LABEL } from "@/lib/schemas";
import { archiveClientAction, duplicateFunnelAction, setFunnelStatusAction, trashClientAction, trashFunnelAction, updateClientFields } from "../../actions";
import { useConfirm } from "@/components/confirm-dialog";

export function ClientLogo({ id, url }: { id: string; url: string | null }) {
  const [u, setU] = useState(url);
  return (
    <LogoUpload
      url={u}
      name={`client-${id}`}
      onChange={async (next) => {
        await updateClientFields(id, { logo_url: next });
        setU(next);
      }}
    />
  );
}

export function ClientNotes({ id, notes }: { id: string; notes: string }) {
  const [v, setV] = useState(notes);
  const [st, setSt] = useState<"" | "saving" | "saved" | "error">("");
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  const nid = `client-notes${useId().replace(/:/g, "")}`;
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <div className="field mb-0">
      <label htmlFor={nid} className="sr-only">
        Notes
      </label>
      <textarea
        id={nid}
        className="input min-h-[140px]!"
        value={v}
        placeholder="Goals, offers, call notes, access details…"
        onChange={(e) => {
          setV(e.target.value);
          setSt("saving");
          clearTimeout(t.current);
          const val = e.target.value;
          t.current = setTimeout(() => {
            updateClientFields(id, { notes: val })
              .then(() => setSt("saved"))
              .catch(() => setSt("error"));
          }, 800);
        }}
      />
      <span className="help" role="status">
        {st === "saving" ? "Saving…" : st === "saved" ? "Saved" : st === "error" ? "Couldn’t save. Check your connection." : "Saves automatically."}
      </span>
    </div>
  );
}

export function ArchiveClient({ id, archived }: { id: string; archived: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn" disabled={pending} onClick={() => start(() => archiveClientAction(id, !archived))} title={archived ? "Back to the active portfolio" : "Hide from the active portfolio and dashboard (nothing is deleted)"}>
      <Icon name="archive" /> {archived ? "Restore client" : "Archive client"}
    </button>
  );
}

export function DeleteClient({ id, name, funnels }: { id: string; name: string; funnels: number }) {
  const [pending, start] = useTransition();
  const [dialog, ask] = useConfirm();
  return (
    <section className="card p-5">
      <h2 className="mb-2 font-display text-lg font-bold">Move to Trash</h2>
      <p className="mb-3 text-sm text-muted">
        The client and their {funnels} funnel{funnels === 1 ? "" : "s"} go to Trash, where they stay until someone restores them or deletes them forever. Share links stop working while they are in Trash.
      </p>
      <button
        type="button"
        className="btn danger"
        disabled={pending}
        onClick={async () => {
          const ok = await ask({
            title: "Move this client to Trash?",
            body: (
              <p>
                “{name}” and their {funnels} funnel{funnels === 1 ? "" : "s"} move to Trash. Nothing is lost: you can restore them from Trash at any time.
              </p>
            ),
            confirm: "Move to Trash",
            typeToConfirm: name,
          });
          if (ok) start(() => trashClientAction(id));
        }}
      >
        <Icon name="trash" /> Move client to Trash
      </button>
      {dialog}
    </section>
  );
}

type FunnelItem = { id: string; name: string; description: string; status: string; summary: unknown; settings: unknown; graph: unknown; thumbnail_url: string | null; updated_at: string };

const FILTERS: [string, string][] = [
  ["all", "All"],
  ["live", "Live"],
  ["draft", "Draft"],
  ["archived", "Archived"],
];

export function FunnelList({ funnels, currency, canEdit = true, hidden = 0, total = funnels.length, allHref, newCard, emptyAction }: { funnels: FunnelItem[]; currency: string; canEdit?: boolean; hidden?: number; total?: number; allHref?: string; newCard?: React.ReactNode; emptyAction?: React.ReactNode }) {
  const [filter, setFilter] = useState("all");
  const count = (k: string) => (k === "all" ? funnels.filter((f) => f.status !== "archived").length : funnels.filter((f) => f.status === k).length);
  const list = funnels.filter((f) => (filter === "all" ? f.status !== "archived" : f.status === filter));
  if (!funnels.length) return canEdit ? <EmptyState title="No funnels yet" actions={emptyAction}>Start from a template or a blank map.</EmptyState> : <EmptyState title="No funnels yet" compact>Nothing has been mapped for this client.</EmptyState>;
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter funnels">
        {FILTERS.map(([k, l]) => (
          <button key={k} type="button" className="fm-chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {l} <b>{count(k)}</b>
          </button>
        ))}
      </div>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3" aria-label="Funnels">
        {list.map((f) => (
          <FunnelCard key={f.id} f={f} canEdit={canEdit} currency={(f.settings as { currency?: string })?.currency ?? currency} />
        ))}
        {canEdit && newCard && filter === "all" && <li className="min-h-[200px]">{newCard}</li>}
      </ul>
      {hidden > 0 && allHref && (
        <p className="mt-4 text-sm text-muted">
          Showing the {funnels.length} most recently updated of {total} funnels.{" "}
          <Link href={allHref} className="font-semibold text-brand hover:underline">
            Show all {total}
          </Link>
        </p>
      )}
    </>
  );
}

function FunnelCard({ f, currency, canEdit }: { f: FunnelItem; currency: string; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [dialog, ask] = useConfirm();
  const s = (f.summary ?? {}) as Partial<FunnelSummary>;
  const graph = parseGraph(f.graph);
  const blocks = graph.nodes.filter((n) => typeOf(n.type)?.cat !== "annot").length;
  const checks = healthChecks(graph).length;
  const scenarios = ((f.settings as { scenarios?: unknown[] })?.scenarios?.length ?? 0) + 1;
  const dim = f.status === "archived";
  return (
    <li className={`fm-pcard${dim ? " dim" : ""}${pending ? " busy" : ""}`}>
      <Link href={`/funnels/${f.id}`} className="fm-fthumb" aria-label={`Open ${f.name}`}>
        {/* live map thumbnail: always current, works in light and dark */}
        <GraphThumb graph={f.graph} settings={f.settings} name={f.name} archived={dim} className="h-[118px] w-full" />
        <span className="fm-fchip">{blocks} blocks</span>
      </Link>
      <div className="fm-frow">
        <Link href={`/funnels/${f.id}`} className="fm-pname" title={f.name}>
          {f.name}
        </Link>
        <StatusPill status={f.status} />
        {canEdit && (
          <Menu label={`Actions for ${f.name}`} align="right" className="btn icon ghost sm" buttonContent={<Icon name="more" size={16} />}>
            {(close) => (
              <>
                <div className="menu-label">Status</div>
                {FUNNEL_STATUSES.map((st) => (
                  <button key={st} type="button" role="menuitemradio" aria-checked={f.status === st} disabled={pending} onClick={() => (close(), start(() => setFunnelStatusAction(f.id, st)))}>
                    {STATUS_LABEL[st]}
                    {f.status === st && <Icon name="check" size={14} />}
                  </button>
                ))}
                <hr />
                <button type="button" role="menuitem" disabled={pending} onClick={() => (close(), start(() => duplicateFunnelAction(f.id)))}>
                  Duplicate
                </button>
                {f.status !== "archived" && (
                  <button type="button" role="menuitem" disabled={pending} onClick={() => (close(), start(() => setFunnelStatusAction(f.id, "archived")))}>
                    Archive
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  disabled={pending}
                  onClick={async () => {
                    close();
                    const ok = await ask({ title: "Move to Trash?", body: <p>“{f.name}” moves to Trash. You can restore it from Trash at any time. Its share links stop working until then.</p>, confirm: "Move to Trash" });
                    if (ok) start(() => trashFunnelAction(f.id));
                  }}
                >
                  Move to Trash
                </button>
              </>
            )}
          </Menu>
        )}
      </div>
      <dl className="fm-fnum">
        <div>
          <dt>Revenue / mo</dt>
          <dd>{money(s.rev, currency)}</dd>
        </div>
        <div>
          <dt>Profit / mo</dt>
          <dd className={(s.profit ?? 0) >= 0 ? "pos" : "neg"}>{money(s.profit, currency)}</dd>
        </div>
        <div>
          <dt>ROAS</dt>
          <dd>{ratio(s.roas)}</dd>
        </div>
      </dl>
      <div className="fm-ffoot">
        <span>
          {scenarios} scenario{scenarios === 1 ? "" : "s"}
        </span>
        {checks > 0 ? (
          <Link href={`/funnels/${f.id}`} className="fm-health-pill warn" title="Open the funnel to see the checks">
            <Icon name="alert" size={13} /> {checks} to fix
          </Link>
        ) : (
          <span className="fm-health-pill ok">
            <Icon name="check" size={13} /> All clear
          </span>
        )}
        <Link href={`/funnels/${f.id}?view=reports`} className="fm-rep" aria-label={`Reports for ${f.name}`}>
          Reports <Icon name="arrow" size={12} />
        </Link>
      </div>
      {dialog}
    </li>
  );
}
