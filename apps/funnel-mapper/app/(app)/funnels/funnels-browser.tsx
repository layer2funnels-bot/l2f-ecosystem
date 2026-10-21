"use client";
import { TimeAgo } from "@/components/time-ago";
import Link from "next/link";
import { useConfirm } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/icon";
import { StatusPill } from "@/components/status-pill";
import { isNeg, money, ratio } from "@/lib/format";
import { FUNNEL_STATUSES, STATUS_LABEL } from "@/lib/schemas";
import { duplicateFunnelAction, moveFunnelAction, renameFunnelAction, setFunnelStatusAction, trashFunnelAction } from "../actions";

export interface FunnelListItem {
  id: string;
  name: string;
  status: string;
  clientId: string;
  client: string;
  currency: string;
  rev: number | null;
  profit: number | null;
  roas: number | null;
  checks: number;
  /** Live preview of the saved map (server-rendered SVG). */
  preview?: React.ReactNode;
  updated: string;
}

type Over = Partial<FunnelListItem> & { gone?: boolean };

/** All funnels (V2): status views, client filter, "needs attention", recently updated. Numbers are the saved engine summary. */
export function FunnelsBrowser({ items: all, canEdit = false, initialStatus = "", initialClient = "", initialAttention = false }: { items: FunnelListItem[]; canEdit?: boolean; initialStatus?: string; initialClient?: string; initialAttention?: boolean }) {
  // optimistic edits: a rename, status change or trash shows at once; the refreshed server list then agrees
  const [over, setOver] = useState<Record<string, Over>>({});
  const items = useMemo(() => all.map((f) => ({ ...f, ...over[f.id] })).filter((f) => !(over[f.id] as Over | undefined)?.gone), [all, over]);
  const patch = (ids: string[], p: Over) => setOver((o) => ({ ...o, ...Object.fromEntries(ids.map((id) => [id, { ...o[id], ...p }])) }));
  const [pending, start] = useTransition();
  const [dialog, ask] = useConfirm();
  const [picked, setPicked] = useState<string[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [moving, setMoving] = useState<string[] | null>(null);
  const [row, setRow] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const [status, setStatus] = useState(initialStatus === "all" ? "" : initialStatus);
  const [client, setClient] = useState(initialClient);
  const [attention, setAttention] = useState(initialAttention);
  const [recent, setRecent] = useState(false);
  const [q, setQ] = useState("");
  const clients = useMemo(() => [...new Map(all.map((f) => [f.clientId, f.client])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [all]);
  const count = (s: string) => items.filter((f) => !s || f.status === s).length;
  const [week] = useState(() => Date.now() - 7 * 86400000);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items
      .filter((f) => (!status || f.status === status) && (!client || f.clientId === client) && (!attention || f.checks > 0) && (!recent || Date.parse(f.updated) >= week) && (!s || `${f.name} ${f.client}`.toLowerCase().includes(s)))
      // archived funnels only show in their own view
      .filter((f) => status === "archived" || f.status !== "archived" || !!status);
  }, [items, status, client, attention, recent, q, week]);
  const views: [string, string][] = [["", "All"], ...FUNNEL_STATUSES.map((s) => [s, STATUS_LABEL[s]] as [string, string])];

  // the selection only ever holds funnels that are still on screen
  const shown = new Set(list.map((f) => f.id));
  const sel = picked.filter((id) => shown.has(id));
  const allOn = list.length > 0 && sel.length === list.length;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const nameOf = (id: string) => items.find((f) => f.id === id)?.name ?? "funnel";

  const run = (job: () => Promise<unknown>, done: string) =>
    start(async () => {
      try {
        await job();
        setNote(done);
      } catch (e) {
        setOver({});
        setNote(e instanceof Error ? e.message : "That didn’t work. Try again.");
      }
    });
  const setStatusOf = (ids: string[], st: string) => {
    patch(ids, { status: st });
    run(() => Promise.all(ids.map((id) => setFunnelStatusAction(id, st))), ids.length === 1 ? `${nameOf(ids[0])} is now ${STATUS_LABEL[st as keyof typeof STATUS_LABEL] ?? st}` : `${ids.length} funnels are now ${STATUS_LABEL[st as keyof typeof STATUS_LABEL] ?? st}`);
    setPicked([]);
  };
  const trash = async (ids: string[]) => {
    const one = ids.length === 1;
    const ok = await ask({
      title: one ? "Move to Trash?" : `Move ${ids.length} funnels to Trash?`,
      body: <p>{one ? <>“{nameOf(ids[0])}” moves to Trash. </> : "They move to Trash. "}You can restore {one ? "it" : "them"} from Trash at any time. Share links stop working until then.</p>,
      confirm: "Move to Trash",
    });
    if (!ok) return;
    const name = one ? nameOf(ids[0]) : "";
    patch(ids, { gone: true });
    run(() => Promise.all(ids.map((id) => trashFunnelAction(id))), one ? `${name} is in Trash` : `${ids.length} funnels are in Trash`);
    setPicked([]);
  };
  const rename = (id: string, name: string) => {
    setRenaming(null);
    const n = name.trim();
    if (!n || n === nameOf(id)) return;
    patch([id], { name: n });
    run(async () => {
      const r = await renameFunnelAction(id, n);
      if (r?.error) throw new Error(r.error);
    }, "Renamed");
  };
  const moveTo = (ids: string[], clientId: string) => {
    const c = clients.find(([id]) => id === clientId)?.[1] ?? "";
    setMoving(null);
    patch(ids, { clientId, client: c });
    run(async () => {
      for (const id of ids) {
        const r = await moveFunnelAction(id, clientId);
        if (r?.error) throw new Error(r.error);
      }
    }, ids.length === 1 ? `${nameOf(ids[0])} moved to ${c}` : `${ids.length} funnels moved to ${c}`);
    setPicked([]);
  };

  // F2 renames the funnel whose row you are in
  useEffect(() => {
    if (!canEdit) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "F2" || !row || renaming) return;
      e.preventDefault();
      setRenaming(row);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [canEdit, row, renaming]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="fm-scroll-x flex gap-1.5" role="group" aria-label="Funnel status">
          {views.map(([k, l]) => (
            <button key={k} type="button" className="fm-chip" aria-pressed={status === k} onClick={() => setStatus(k)}>
              {l} <b>{count(k)}</b>
            </button>
          ))}
        </div>
        <label className="relative min-w-[200px] flex-1">
          <span className="sr-only">Search funnels</span>
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input className="input pl-10" type="search" placeholder="Search funnels or clients…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="input w-auto" aria-label="Filter by client" value={client} onChange={(e) => setClient(e.target.value)}>
          <option value="">All clients</option>
          {clients.map(([id, n]) => (
            <option key={id} value={id}>
              {n}
            </option>
          ))}
        </select>
        <button type="button" className="btn sm" aria-pressed={attention} onClick={() => setAttention((a) => !a)}>
          <Icon name="alert" size={15} /> Needs attention
        </button>
        <button type="button" className="btn sm" aria-pressed={recent} onClick={() => setRecent((r) => !r)}>
          Updated this week
        </button>
      </div>
      {canEdit && sel.length > 0 && (
        <div className="fm-bulk" role="region" aria-label="Selected funnels">
          <b>{sel.length} selected</b>
          <label className="fm-bulk-st">
            <span className="sr-only">Set status</span>
            <select className="input" value="" disabled={pending} onChange={(e) => e.target.value && setStatusOf(sel, e.target.value)}>
              <option value="">Status…</option>
              {FUNNEL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn sm" disabled={pending} onClick={() => setMoving(sel)}>
            Move to client…
          </button>
          <button type="button" className="btn sm" disabled={pending} onClick={() => setStatusOf(sel, "archived")}>
            Archive
          </button>
          <button type="button" className="btn sm danger" disabled={pending} onClick={() => void trash(sel)}>
            Move to Trash
          </button>
          <button type="button" className="btn sm ghost fm-bulk-x" onClick={() => setPicked([])}>
            Clear
          </button>
        </div>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {note}
      </p>
      {list.length === 0 ? (
        items.length ? (
          <div className="card px-6 py-14 text-center text-muted">No funnels match those filters.</div>
        ) : (
          <EmptyState
            title="No funnels yet"
            actions={
              <>
                <Link href="/clients" className="btn primary">
                  Choose a client
                </Link>
                <Link href="/templates" className="btn">
                  Browse templates
                </Link>
              </>
            }
          >
            A funnel belongs to a client. Pick one, then start from a template or a blank map.
          </EmptyState>
        )
      ) : (
        <div className="overflow-x-auto fm-funnels-wrap">
          <table className="tbl fm-funnels">
            <thead>
              <tr>
                {canEdit && (
                  <th className="fm-c-pick pl-4">
                    <input
                      type="checkbox"
                      aria-label="Select all funnels"
                      checked={allOn}
                      ref={(el) => {
                        if (el) el.indeterminate = sel.length > 0 && !allOn;
                      }}
                      onChange={() => setPicked(allOn ? [] : list.map((f) => f.id))}
                    />
                  </th>
                )}
                <th className={`${canEdit ? "" : "pl-4 "}fm-c-map`}>
                  <span className="sr-only">Map</span>
                </th>
                <th>Funnel</th>
                <th className="fm-c-client">Client</th>
                <th className="fm-c-status">Status</th>
                <th className="r">Revenue / mo</th>
                <th className="r fm-c-profit">Profit / mo</th>
                <th className="r fm-c-roas">ROAS</th>
                <th>Checks</th>
                <th className={`r fm-c-upd${canEdit ? "" : " pr-4"}`}>Updated</th>
                {canEdit && (
                  <th className="fm-c-act pr-3">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {list.map((f) => (
                <tr key={f.id} aria-selected={canEdit ? sel.includes(f.id) : undefined} className={sel.includes(f.id) ? "picked" : undefined} onFocus={() => setRow(f.id)} onMouseEnter={() => setRow(f.id)}>
                  {canEdit && (
                    <td className="fm-c-pick pl-4">
                      <input type="checkbox" aria-label={`Select ${f.name}`} checked={sel.includes(f.id)} onChange={() => toggle(f.id)} />
                    </td>
                  )}
                  <td className={`${canEdit ? "" : "pl-4 "}fm-c-map`}>
                    <Link href={`/funnels/${f.id}`} className="fm-rowprev" tabIndex={-1} aria-hidden="true">
                      {f.preview}
                    </Link>
                  </td>
                  <td className="fm-c-name">
                    {renaming === f.id ? (
                      <RenameField value={f.name} onDone={(v) => rename(f.id, v)} />
                    ) : (
                      <Link href={`/funnels/${f.id}`} className="block max-w-[260px] truncate font-bold text-ink hover:text-brand" title={f.name}>
                        {f.name}
                      </Link>
                    )}
                    <span className="fm-c-client2 max-w-[260px] truncate text-xs text-muted">
                      {f.client}<span className="fm-c-st2"> · {f.status}</span>
                    </span>
                  </td>
                  <td className="fm-c-client">
                    <Link href={`/clients/${f.clientId}`} className="block max-w-[180px] truncate text-muted hover:text-brand" title={f.client}>
                      {f.client}
                    </Link>
                  </td>
                  <td className="fm-c-status">
                    <StatusPill status={f.status} />
                  </td>
                  <td className="r">{f.rev == null ? <span className="text-muted">No data yet</span> : money(f.rev, f.currency)}</td>
                  <td className={`r fm-c-profit${isNeg(f.profit) ? " neg" : ""}`}>{f.profit == null ? <span className="text-muted">No data yet</span> : money(f.profit, f.currency)}</td>
                  <td className="r fm-c-roas">{f.roas == null ? <span className="text-muted">–</span> : ratio(f.roas)}</td>
                  <td>
                    {f.checks > 0 ? (
                      <Link href={`/funnels/${f.id}`} className="fm-health-pill warn" title="Open the funnel to see the checks">
                        <Icon name="alert" size={13} /> {f.checks}<span className="fm-hp-label"> to fix</span>
                      </Link>
                    ) : (
                      <span className="fm-health-pill ok">
                        <Icon name="check" size={13} aria-hidden="true" /> <span className="fm-hp-label">All clear</span>
                      </span>
                    )}
                  </td>
                  <td className={`r fm-c-upd text-muted${canEdit ? "" : " pr-4"}`}><TimeAgo iso={f.updated} /></td>
                  {canEdit && (
                    <td className="fm-c-act pr-3">
                      <RowMenu
                        f={f}
                        busy={pending}
                        onRename={() => setRenaming(f.id)}
                        onDuplicate={() => run(() => duplicateFunnelAction(f.id), `${f.name} duplicated`)}
                        onMove={() => setMoving([f.id])}
                        onStatus={(st) => setStatusOf([f.id], st)}
                        onTrash={() => void trash([f.id])}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {moving && <MoveDialog count={moving.length} current={moving.length === 1 ? items.find((f) => f.id === moving[0])?.clientId : undefined} clients={clients} onCancel={() => setMoving(null)} onPick={(c) => moveTo(moving, c)} />}
      {dialog}
    </>
  );
}

function RenameField({ value, onDone }: { value: string; onDone: (v: string) => void }) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => ref.current?.select(), []);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    onDone(save ? v : value);
  };
  return (
    <input
      ref={ref}
      className="input fm-rename"
      aria-label="Funnel name"
      value={v}
      maxLength={120}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
    />
  );
}

/** Row actions. Fixed-position so the table's sideways scroll never clips it. */
function RowMenu({ f, busy, onRename, onDuplicate, onMove, onStatus, onTrash }: { f: FunnelListItem; busy: boolean; onRename: () => void; onDuplicate: () => void; onMove: () => void; onStatus: (s: string) => void; onTrash: () => void }) {
  const [at, setAt] = useState<{ x: number; y: number; up: boolean } | null>(null);
  const [sub, setSub] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const close = (focus = false) => {
    setAt(null);
    setSub(false);
    if (focus) btn.current?.focus();
  };
  useEffect(() => {
    if (!at) return;
    const down = (e: PointerEvent) => !pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node) && close();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const items = [...(pop.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a") ?? [])];
        const i = items.indexOf(document.activeElement as HTMLElement);
        items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
        e.preventDefault();
      }
    };
    const off = () => close();
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", off, true);
    window.addEventListener("resize", off);
    pop.current?.querySelector<HTMLElement>("a, button")?.focus();
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", off, true);
      window.removeEventListener("resize", off);
    };
  }, [at]);
  const pick = (fn: () => void) => () => (close(), fn());
  return (
    <>
      <button
        ref={btn}
        type="button"
        className="btn icon ghost sm"
        aria-label={`Actions for ${f.name}`}
        aria-haspopup="menu"
        aria-expanded={!!at}
        disabled={busy}
        onClick={() => {
          if (at) return close();
          const r = btn.current!.getBoundingClientRect();
          const up = r.bottom + 330 > window.innerHeight && r.top > 330;
          setAt({ x: Math.max(8, Math.min(window.innerWidth - 248, r.right - 240)), y: up ? r.top - 6 : r.bottom + 6, up });
        }}
      >
        <Icon name="more" size={16} />
      </button>
      {at && (
        <div ref={pop} role="menu" aria-label={`Actions for ${f.name}`} className="menu-pop fm-rowmenu" style={{ position: "fixed", left: at.x, top: at.up ? undefined : at.y, bottom: at.up ? window.innerHeight - at.y : undefined, right: "auto", minWidth: 240 }}>
          <Link href={`/funnels/${f.id}`} role="menuitem">
            Open map
          </Link>
          <Link href={`/funnels/${f.id}?view=reports`} role="menuitem">
            Open reports
          </Link>
          <hr />
          <button type="button" role="menuitem" onClick={pick(onRename)}>
            Rename <kbd>F2</kbd>
          </button>
          <button type="button" role="menuitem" onClick={pick(onDuplicate)}>
            Duplicate
          </button>
          <button type="button" role="menuitem" onClick={pick(onMove)}>
            Move to client…
          </button>
          <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={sub} onClick={() => setSub((s) => !s)}>
            Status <Icon name={sub ? "chevronDown" : "chevronRight"} size={14} />
          </button>
          {sub &&
            FUNNEL_STATUSES.map((st) => (
              <button key={st} type="button" role="menuitemradio" aria-checked={f.status === st} className="fm-sub" onClick={pick(() => f.status !== st && onStatus(st))}>
                {STATUS_LABEL[st]}
                {f.status === st && <Icon name="check" size={14} />}
              </button>
            ))}
          {f.status !== "archived" && (
            <button type="button" role="menuitem" onClick={pick(() => onStatus("archived"))}>
              Archive
            </button>
          )}
          <hr />
          <button type="button" role="menuitem" className="danger" onClick={pick(onTrash)}>
            Move to Trash
          </button>
        </div>
      )}
    </>
  );
}

function MoveDialog({ count, current, clients, onCancel, onPick }: { count: number; current?: string; clients: [string, string][]; onCancel: () => void; onPick: (clientId: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [to, setTo] = useState(clients.find(([id]) => id !== current)?.[0] ?? "");
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} className="modal fm-confirm" aria-labelledby="mv-title" onCancel={(e) => (e.preventDefault(), onCancel())}>
      <h3 id="mv-title">Move {count === 1 ? "funnel" : `${count} funnels`} to a client</h3>
      <label className="field mt-3">
        <span className="lbl">Client</span>
        <select className="input" value={to} onChange={(e) => setTo(e.target.value)} autoFocus>
          {clients.map(([id, n]) => (
            <option key={id} value={id} disabled={id === current}>
              {n}
              {id === current ? " (current)" : ""}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-2 text-xs text-muted">The map, numbers and share links stay as they are. Only the client they belong to changes.</p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={!to} onClick={() => onPick(to)}>
          Move
        </button>
      </div>
    </dialog>
  );
}
