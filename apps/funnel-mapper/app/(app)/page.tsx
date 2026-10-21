import type { Metadata } from "next";
import Link from "next/link";
import { GraphThumb } from "@/components/graph-thumb";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import type { FunnelSummary } from "@/lib/funnel-math";
import { money, moneyShort, ratio, timeAgo } from "@/lib/format";
import { parseGraph } from "@/lib/graph";
import { healthChecks } from "@/lib/health";
import { monthlyValue, pricingValue } from "@/lib/pricing";
import { STATUS_LABEL } from "@/lib/schemas";
import { typeOf } from "@/lib/catalog";
import { byCurrencyRows, homeRange } from "@/lib/home-range";
import { HomeRangePicker } from "@/components/home-range-picker";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

const PIPE: Record<string, string> = {
  active: "#22c55e",
  proposal: "#60a5fa",
  lead: "#94a3b8",
  paused: "#fbbf24",
  past: "#64748b",
};

/** Money per currency, one row each (V2: never added across currencies). */
function byCurrency(rows: { cur: string; v: number }[], fallback = "GBP") {
  const list = byCurrencyRows(rows);
  if (!list.length) return money(0, fallback);
  return (
    <span className="fm-curlist">
      {list.map((r) => (
        <span key={r.cur} className="block">
          {moneyShort(r.v, r.cur)}
        </span>
      ))}
    </span>
  );
}
const byCurrencyText = (rows: { cur: string; v: number }[]) =>
  byCurrencyRows(rows)
    .map((r) => moneyShort(r.v, r.cur))
    .join(" · ") || "–";

export default async function Dashboard({ searchParams }: PageProps<"/">) {
  const { sb, profile, workspace } = await requireUser();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const range = homeRange(one(sp.range), one(sp.from), one(sp.to));
  // plan figures are per month: a range multiplies them by its number of months
  const k = range.months;
  const [{ data: clients }, { data: funnels }] = await Promise.all([
    // archived clients (and their funnels) are out of the active portfolio
    sb
      .from("clients")
      .select(
        "id, name, status, currency, logo_url, pricing_model, monthly_retainer, pricing_amount, billing_frequency, hours_per_month",
      )
      .is("archived_at", null)
      .is("deleted_at", null)
      .order("name"),
    sb
      .from("funnels")
      .select(
        "id, name, status, client_id, summary, settings, updated_at, thumbnail_url",
      )
      .is("deleted_at", null)
      .order("updated_at", { ascending: false }),
  ]);
  const cl = clients ?? [];
  const clientById = Object.fromEntries(cl.map((c) => [c.id, c]));
  const fs = (funnels ?? []).filter(
    (f) => clientById[f.client_id] && f.status !== "archived",
  );
  // saved maps for the few funnels the page draws or checks (the rest are listed from their saved numbers, which keeps this page light)
  const SHOWN = 12;
  const { data: maps } = fs.length
    ? await sb.from("funnels").select("id, graph").in("id", fs.slice(0, SHOWN).map((f) => f.id))
    : { data: [] as { id: string; graph: unknown }[] };
  const graphOf = Object.fromEntries((maps ?? []).map((m) => [m.id, m.graph]));
  // recorded actuals in the range (whole periods inside it), for live funnels
  const liveIds = fs.filter((f) => f.status === "live").map((f) => f.id);
  const { data: acts } = liveIds.length
    ? await sb
        .from("funnel_actuals")
        .select("funnel_id, revenue, spend, period_start, period_end")
        .in("funnel_id", liveIds)
        .gte("period_start", range.start)
        .lte("period_end", range.end)
    : {
        data: [] as {
          funnel_id: string;
          revenue: number | null;
          spend: number | null;
        }[],
      };
  const curOf = (f: (typeof fs)[number]) =>
    (f.settings as { currency?: string })?.currency ??
    clientById[f.client_id]?.currency ??
    workspace.default_currency;
  const sum = (f: (typeof fs)[number]) =>
    (f.summary ?? {}) as Partial<FunnelSummary>;
  const active = cl.filter((c) => c.status === "active");
  const live = fs.filter((f) => f.status === "live");
  const pipeline = cl.filter(
    (c) => c.status === "lead" || c.status === "proposal",
  );
  const proposed = fs.filter((f) => f.status === "proposed");
  const today = new Date();
  const hour = today.getHours();
  const greet =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = profile.full_name ? profile.full_name.split(" ")[0] : "";
  const latest = fs[0];
  // health for the funnels people touched most recently (parsed from the saved map, same checks as the editor)
  const checked = fs
    .slice(0, SHOWN)
    .map((f) => ({ f, checks: healthChecks(parseGraph(graphOf[f.id])) }));
  const attention = checked.filter((x) => x.checks.length > 0).slice(0, 3);
  const perClient = (
    ["active", "proposal", "lead", "paused", "past"] as const
  ).map((s) => ({ s, n: cl.filter((c) => c.status === s).length }));

  const weekday = today.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const blocks = (f: (typeof fs)[number]) =>
    parseGraph(graphOf[f.id]).nodes.filter((n) => typeOf(n.type)?.cat !== "annot")
      .length;
  // other things worth a look, from the saved numbers only: funnels losing money, clients with funnels and no price set
  const losing = fs
    .filter((f) => (sum(f).profit ?? 0) < 0 && f.status !== "draft")
    .slice(0, 2);
  const unpriced = cl
    .filter(
      (c) =>
        c.status !== "past" &&
        pricingValue(c) <= 0 &&
        fs.some((f) => f.client_id === c.id),
    )
    .slice(0, 2);

  const cont = fs[0];
  const contSum = cont ? sum(cont) : {};
  const tot = (rows: { cur: string; v: number }[]) => {
    const list = byCurrencyRows(rows).filter((r) => Math.abs(r.v) > 0.005);
    return list.length
      ? list.map((r) => moneyShort(r.v, r.cur)).join(" · ")
      : money(0, workspace.default_currency);
  };

  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader
        eyebrow={weekday}
        title={`${greet}${first ? `, ${first}` : ""}`}
      >
        <HomeRangePicker
          current={range.key}
          label={range.label}
          from={range.from}
          to={range.to}
        />
      </PageHeader>

      <section aria-label="Totals">
        <dl className="fm-tot">
          <div>
            <dt>Active clients</dt>
            <dd>{active.length}</dd>
            <dd className="sub">
              {pipeline.length} in the pipeline · {cl.length} total
            </dd>
          </div>
          <div>
            <dt>Live funnels</dt>
            <dd>{live.length}</dd>
            <dd className="sub">
              {proposed.length} proposed · {fs.length} total
            </dd>
          </div>
          <div>
            <dt>Planned revenue · {range.label}</dt>
            <dd>
              {tot(
                live.map((f) => ({ cur: curOf(f), v: (sum(f).rev ?? 0) * k })),
              )}
            </dd>
            <dd className="sub">
              <span className="fm-tag plan">Plan</span> profit{" "}
              {tot(
                live.map((f) => ({
                  cur: curOf(f),
                  v: (sum(f).profit ?? 0) * k,
                })),
              )}
              {(acts ?? []).length > 0 && (
                <>
                  {" "}
                  · <span className="fm-tag actual">Actual</span>{" "}
                  {byCurrencyText(
                    (acts ?? []).map((a) => ({
                      cur: curOf(fs.find((f) => f.id === a.funnel_id)!),
                      v: Number(a.revenue ?? 0),
                    })),
                  )}
                </>
              )}
            </dd>
          </div>
          <div>
            <dt>Agency fees · {range.label}</dt>
            <dd>
              {tot(
                active.map((c) => ({
                  cur: c.currency,
                  v: monthlyValue(c) * k,
                })),
              )}
            </dd>
            <dd className="sub">
              MRR{" "}
              {tot(
                active.map((c) => ({ cur: c.currency, v: monthlyValue(c) })),
              )}{" "}
              / mo
            </dd>
          </div>
        </dl>
      </section>

      {cont ? (
        <section aria-labelledby="resume-h" className="fm-hero">
          <Link
            href={`/funnels/${cont.id}`}
            className="fm-hero-thumb"
            aria-label={`Open ${cont.name}`}
          >
            <GraphThumb
              graph={graphOf[cont.id]}
              settings={cont.settings}
              name={cont.name}
              height={190}
              className="h-[190px] w-full"
            />
          </Link>
          <div className="fm-hero-body">
            <span className="fm-hero-eyebrow" id="resume-h">
              Continue where you left off
            </span>
            <div className="fm-hero-title">
              <h2 title={cont.name}>{cont.name}</h2>
              <StatusPill status={cont.status} />
            </div>
            <p className="fm-hero-sub">
              {clientById[cont.client_id]?.name} · {blocks(cont)} blocks ·
              edited {timeAgo(cont.updated_at)}
            </p>
            <dl className="fm-hero-kpis">
              <div>
                <dt>Revenue / mo</dt>
                <dd>{money(contSum.rev, curOf(cont))}</dd>
              </div>
              <div>
                <dt>Profit / mo</dt>
                <dd
                  className={
                    (contSum.profit ?? 0) < 0 ? "text-neg" : "text-good"
                  }
                >
                  {money(contSum.profit, curOf(cont))}
                </dd>
              </div>
              <div>
                <dt>ROAS</dt>
                <dd>{ratio(contSum.roas)}</dd>
              </div>
            </dl>
            <div className="fm-hero-actions">
              <Link href={`/funnels/${cont.id}`} className="btn primary">
                Continue mapping
                <Icon name="chevronRight" size={15} />
              </Link>
              <Link href={`/funnels/${cont.id}?view=reports`} className="btn">
                Reports
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <section className="fm-hero empty">
          <p className="fm-empty-line">
            No funnels yet. Create a client, then map their first funnel.
          </p>
        </section>
      )}

      <div className="fm-homegrid">
        <div className="min-w-0">
          <section aria-labelledby="recent-h">
            <div className="fm-secth">
              <h2 id="recent-h">Recent funnels</h2>
              <Link href="/funnels">View all {fs.length}</Link>
            </div>
            {fs.length === 0 ? null : (
              <div
                className="fm-tblwrap"
                tabIndex={0}
                role="region"
                aria-label="Recent funnels (scrolls sideways when it is wider than the screen)"
              >
                <table className="tbl fm-stackrows">
                  <thead>
                    <tr>
                      <th>Funnel</th>
                      <th>Status</th>
                      <th className="r">Revenue / mo</th>
                      <th className="r">Profit / mo</th>
                      <th className="r">ROAS</th>
                      <th className="r">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fs.slice(0, 6).map((f) => (
                      <tr key={f.id}>
                        <td>
                          <Link
                            href={`/funnels/${f.id}`}
                            className="font-semibold text-ink no-underline hover:text-brand"
                          >
                            {f.name}
                          </Link>
                          <span className="fm-subcell">
                            {clientById[f.client_id]?.name}
                          </span>
                        </td>
                        <td data-label="Status">
                          <StatusPill status={f.status} />
                        </td>
                        <td className="r" data-label="Revenue / mo">
                          {money(sum(f).rev, curOf(f))}
                        </td>
                        <td
                          className={`r ${(sum(f).profit ?? 0) < 0 ? "text-neg" : "text-good"}`}
                          data-label="Profit / mo"
                        >
                          {money(sum(f).profit, curOf(f))}
                        </td>
                        <td className="r" data-label="ROAS">
                          {ratio(sum(f).roas)}
                        </td>
                        <td className="r text-muted" data-label="Updated">
                          {timeAgo(f.updated_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="min-w-0 space-y-8">
          <section aria-labelledby="attn-h">
            <div className="fm-secth">
              <h2 id="attn-h">Needs attention</h2>
              <span className="text-xs text-muted">
                {attention.length + losing.length + unpriced.length}
              </span>
            </div>
            {attention.length + losing.length + unpriced.length === 0 ? (
              <p className="fm-empty-line">Every funnel passes its checks.</p>
            ) : (
              <ul className="fm-attn">
                {attention.map(({ f, checks }) => (
                  <li key={`c-${f.id}`}>
                    <span className="fm-aic warn">
                      <Icon name="alert" size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <b>
                        {f.name} has {checks.length}{" "}
                        {checks.length === 1 ? "check" : "checks"}
                      </b>
                      <small>
                        {clientById[f.client_id]?.name} · {checks[0].text}
                      </small>
                    </span>
                    <Link href={`/funnels/${f.id}`} className="btn sm">
                      Fix
                    </Link>
                  </li>
                ))}
                {losing.map((f) => (
                  <li key={`l-${f.id}`}>
                    <span className="fm-aic lost">
                      <Icon name="chart" size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <b>
                        {f.name} loses{" "}
                        {money(Math.abs(sum(f).profit ?? 0), curOf(f))} / mo
                      </b>
                      <small>
                        {clientById[f.client_id]?.name} · ROAS{" "}
                        {ratio(sum(f).roas)}
                      </small>
                    </span>
                    <Link href={`/funnels/${f.id}`} className="btn sm">
                      Open
                    </Link>
                  </li>
                ))}
                {unpriced.map((c) => (
                  <li key={`p-${c.id}`}>
                    <span className="fm-aic">
                      <Icon name="users" size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <b>
                        {c.name} has{" "}
                        {fs.filter((f) => f.client_id === c.id).length} funnels,
                        no pricing set
                      </b>
                      <small>{STATUS_LABEL[c.status] ?? c.status}</small>
                    </span>
                    <Link
                      href={`/clients/${c.id}?tab=details`}
                      className="btn sm"
                    >
                      Set pricing
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="clients-h">
            <div className="fm-secth">
              <h2 id="clients-h">Client pipeline</h2>
              <Link href="/clients">Clients</Link>
            </div>
            <div className="fm-pipebar" aria-hidden="true">
              {perClient
                .filter((x) => x.n > 0)
                .map((x) => (
                  <i key={x.s} style={{ flex: x.n, background: PIPE[x.s] }} />
                ))}
            </div>
            <ul className="fm-pipe">
              {perClient.map(({ s, n }) => (
                <li key={s}>
                  <Link href={`/clients?status=${s}`}>
                    <span className="stp">
                      <i style={{ background: PIPE[s] }} aria-hidden="true" />
                      {STATUS_LABEL[s] ?? s}
                    </span>
                    <b>{n}</b>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
