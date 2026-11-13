import type { Metadata } from "next";
import { FunnelPreview } from "@/components/funnel-preview";
import { PageHeader } from "@/components/page-header";
import type { FunnelSummary } from "@/lib/funnel-math";
import { parseGraph, parseSettings } from "@/lib/graph";
import { healthChecks } from "@/lib/health";
import { requireUser } from "@/lib/supabase/server";
import { listClients, listFunnels } from "@/lib/eco/data";
import { FunnelsBrowser, type FunnelListItem } from "./funnels-browser";

export const metadata: Metadata = { title: "Funnels" };

export default async function FunnelsPage({ searchParams }: PageProps<"/funnels">) {
  const { workspace, canEdit } = await requireUser();
  const sp = await searchParams;
  const [funnels, clients] = await Promise.all([
    listFunnels({ withGraph: true }),
    listClients(),
  ]);
  const byClient = Object.fromEntries((clients ?? []).map((c) => [c.id, c]));
  const items: FunnelListItem[] = (funnels ?? [])
    .filter((f) => byClient[f.client_id])
    .map((f) => {
      const settings = parseSettings(f.settings);
      const sum = (f.summary ?? {}) as Partial<FunnelSummary>;
      return {
        id: f.id,
        name: f.name,
        status: f.status,
        clientId: f.client_id,
        client: byClient[f.client_id].name,
        currency: settings.currency || byClient[f.client_id].currency || workspace.default_currency,
        rev: sum.rev ?? null,
        profit: sum.profit ?? null,
        roas: sum.roas ?? null,
        checks: healthChecks(parseGraph(f.graph)).length,
        updated: f.updated_at,
        preview: <FunnelPreview graph={f.graph} settings={f.settings} name={f.name} width={112} height={60} pad={4} archived={f.status === "archived"} />,
      };
    });
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  return (
    <>
      <PageHeader title="Funnels" sub="Every funnel in the workspace, with its numbers and health." />
      <FunnelsBrowser items={items} canEdit={canEdit} initialStatus={first(sp.status)} initialClient={first(sp.client)} initialAttention={first(sp.attention) === "1"} />
    </>
  );
}
