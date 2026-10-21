"use client";
import { TimeAgo } from "@/components/time-ago";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { StatusPill } from "@/components/status-pill";
import { PRICING_LABEL, PRICING_MODELS, pricingModel, pricingShort, pricingSummary, pricingValue } from "@/lib/pricing";
import { CLIENT_STATUSES, STATUS_LABEL, type ClientRow } from "@/lib/schemas";

export type ClientListItem = ClientRow & { funnels: number; liveFunnels: number };
type Sort = "updated" | "name" | "value" | "created" | "funnels";

function useViewPref() {
  // The server and the first browser render both use the table (a different first render is a hydration error); the saved choice,
  // or cards on a phone where a wide table does not fit, is applied right after.
  const [view, setView] = useState<"cards" | "table">("table");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("fm-clients-view");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the device's saved preference
      if (saved === "cards" || saved === "table") setView(saved);
      else if (window.matchMedia("(max-width: 767px)").matches) setView("cards");
    } catch {}
  }, []);
  const set = (v: "cards" | "table") => {
    setView(v);
    try {
      localStorage.setItem("fm-clients-view", v);
    } catch {}
  };
  return [view, set] as const;
}

function Avatar({ c, size = 44 }: { c: ClientRow; size?: number }) {
  return c.logo_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={c.logo_url} alt="" className="shrink-0 rounded-xl border border-line bg-white object-contain" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-xl bg-brand-soft font-display font-bold text-brand" style={{ width: size, height: size }}>
      {c.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function ClientsBrowser({ clients, initialStatus = "", initialQuery = "" }: { clients: ClientListItem[]; initialStatus?: string; initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [niche, setNiche] = useState("");
  const [tag, setTag] = useState("");
  const [pricing, setPricing] = useState("");
  const [sort, setSort] = useState<Sort>("updated");
  const [archived, setArchived] = useState(false);
  const [showF, setShowF] = useState(false); // phones: the extra filters sit behind a Filters button
  const archivedCount = clients.filter((c) => c.archived_at).length;
  const [view, setView] = useViewPref();
  const niches = useMemo(() => [...new Set(clients.map((c) => c.niche).filter(Boolean))].sort(), [clients]);
  const tags = useMemo(() => [...new Set(clients.flatMap((c) => c.tags))].sort(), [clients]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const out = clients.filter(
      (c) =>
        (!s || [c.name, c.business_name, c.email, c.niche, c.country, ...c.tags].some((v) => v.toLowerCase().includes(s))) &&
        (!status || c.status === status) &&
        (!niche || c.niche === niche) &&
        (!tag || c.tags.includes(tag)) &&
        (!pricing || pricingModel(c) === pricing) &&
        !!c.archived_at === archived,
    );
    const cmp: Record<Sort, (a: ClientListItem, b: ClientListItem) => number> = {
      updated: (a, b) => b.updated_at.localeCompare(a.updated_at),
      created: (a, b) => b.created_at.localeCompare(a.created_at),
      name: (a, b) => a.name.localeCompare(b.name),
      value: (a, b) => pricingValue(b) - pricingValue(a),
      funnels: (a, b) => b.funnels - a.funnels,
    };
    return out.sort(cmp[sort]);
  }, [clients, q, status, niche, tag, pricing, sort, archived]);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 max-sm:-mx-4 max-sm:max-w-[calc(100%+2rem)] max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:px-4 sm:flex-wrap" role="group" aria-label="Filter by status">
          <button type="button" className="fm-chip" aria-pressed={!status && !archived} onClick={() => (setStatus(""), setArchived(false))}>
            All <b>{clients.filter((c) => !c.archived_at).length}</b>
          </button>
          {CLIENT_STATUSES.map((st) => (
            <button key={st} type="button" className="fm-chip" aria-pressed={status === st && !archived} onClick={() => (setStatus(st), setArchived(false))}>
              {STATUS_LABEL[st]} <b>{clients.filter((c) => !c.archived_at && c.status === st).length}</b>
            </button>
          ))}
          {(archivedCount > 0 || archived) && (
            <button type="button" className="fm-chip" aria-pressed={archived} onClick={() => setArchived((a) => !a)}>
              Archived {archivedCount > 0 && <b>{archivedCount}</b>}
            </button>
          )}
        </div>
        <span className="flex-1" />
        <div className="seg" role="group" aria-label="View">
          <button type="button" aria-pressed={view === "cards"} onClick={() => setView("cards")} aria-label="Card view" className="px-3!">
            <Icon name="grid" size={15} />
          </button>
          <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")} aria-label="Table view" className="px-3!">
            <Icon name="list" size={15} />
          </button>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search clients</span>
          <Icon name="search" size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input className="input pl-9" type="search" placeholder="Search name, email, niche, tag…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button type="button" className="btn md:hidden" aria-expanded={showF} onClick={() => setShowF((v) => !v)}>
          Filters
        </button>
        <div className={`${showF ? "flex" : "hidden"} w-full flex-wrap gap-2 md:contents`}>
        <select className="input w-auto" aria-label="Filter by niche" value={niche} onChange={(e) => setNiche(e.target.value)}>
          <option value="">All niches</option>
          {niches.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <select className="input w-auto" aria-label="Filter by pricing" value={pricing} onChange={(e) => setPricing(e.target.value)}>
          <option value="">All pricing</option>
          {PRICING_MODELS.map((m) => (
            <option key={m} value={m}>
              {PRICING_LABEL[m]}
            </option>
          ))}
        </select>
        <select className="input w-auto" aria-label="Filter by tag" value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select className="input w-auto" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="updated">Recently updated</option>
          <option value="created">Newest</option>
          <option value="name">Name A–Z</option>
          <option value="value">Highest value</option>
          <option value="funnels">Most funnels</option>
        </select>
        </div>
      </div>

      {list.length === 0 ? (
        clients.length ? (
          <div className="card px-6 py-14 text-center text-muted">No clients match those filters.</div>
        ) : (
          <Link href="/clients/new" className="fm-addprompt">
            <span className="ic">
              <Icon name="plus" size={18} />
            </span>
            <span>
              <b>Add a client in four fields</b>
              <small>Name, status, currency and pricing model. Contact details, website and notes can wait until you need them.</small>
            </span>
          </Link>
        )
      ) : view === "cards" ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Clients">
          {list.map((c) => (
            <li key={c.id}>
              <Link href={`/clients/${c.id}`} className="card flex h-full flex-col gap-3 p-4 text-ink no-underline transition hover:border-brand">
                <div className="flex items-center gap-3">
                  <Avatar c={c} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-[17px] font-bold">{c.name}</div>
                    <div className="truncate text-[13px] text-muted">{c.business_name || c.niche || "—"}</div>
                  </div>
                  <StatusPill status={c.status} />
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-xl bg-bg px-3 py-2 text-xs text-muted">
                  <div>
                    Funnels<b className="block font-display text-[15px] text-ink">{c.funnels}</b>
                  </div>
                  <div>
                    Live<b className="block font-display text-[15px] text-ink">{c.liveFunnels}</b>
                  </div>
                  <div>
                    Pricing
                    <b className="block truncate font-display text-[15px] text-ink" title={pricingSummary(c, c.currency) || undefined}>
                      {pricingShort(c, c.currency)}
                    </b>
                  </div>
                </div>
                {c.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {c.tags.map((t) => (
                      <span key={t} className="pill bg-brand-soft text-brand">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-auto text-xs text-muted">
                  {c.niche && <>{c.niche} · </>}Updated <TimeAgo iso={c.updated_at} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="card overflow-x-auto">
          <table className="tbl text-sm">
            <thead>
              <tr>
                <th className="pl-4">Client</th>
                <th>Status</th>
                <th>Niche</th>
                <th className="fm-hide-lg">Tags</th>
                <th className="r">Pricing</th>
                <th className="r">Live / funnels</th>
                <th className="r pr-4 fm-hide-lg">Updated</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td className="pl-4">
                    <Link href={`/clients/${c.id}`} className="flex items-center gap-2.5 font-bold text-ink hover:text-brand">
                      <Avatar c={c} size={30} />
                      <span>
                        {c.name}
                        {c.business_name && <span className="block text-xs font-normal text-muted">{c.business_name}</span>}
                      </span>
                    </Link>
                  </td>
                  <td>
                    <StatusPill status={c.status} />
                  </td>
                  <td>{c.niche}</td>
                  <td className="fm-hide-lg text-muted">{c.tags.map((t) => `#${t}`).join(" ")}</td>
                  <td className="r" title={pricingSummary(c, c.currency) || undefined}>
                    <b className="font-semibold text-ink">{pricingShort(c, c.currency)}</b>
                    <span className="block text-xs text-muted">{PRICING_LABEL[pricingModel(c)]}</span>
                  </td>
                  <td className="r">
                    <b className="font-semibold">{c.liveFunnels}</b> <span className="text-muted">/ {c.funnels}</span>
                  </td>
                  <td className="fm-hide-lg r pr-4 text-muted">
                    <TimeAgo iso={c.updated_at} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
