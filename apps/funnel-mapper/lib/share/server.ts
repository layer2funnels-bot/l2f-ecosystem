import "server-only";
import { z } from "zod";
import { isAnnot } from "@/lib/catalog";
import { ECO_API } from "@/lib/eco/core";
import { parseGraph, parseSettings } from "@/lib/graph";

/**
 * Public share links go to the ecosystem's public share endpoint (no sign-in): the database checks the token by its hash, the expiry,
 * the link's rights and that nothing is in the trash, and strips internal notes, screenshots and checklists (and numbers when hidden).
 */
export async function sharePublic(action: "get" | "save" | "comment", token: string, body?: Record<string, unknown>, ip?: string | null) {
  const base = `${ECO_API().replace(/\/$/, "")}/api/public/fmp-share`;
  const headers: Record<string, string> = { "content-type": "application/json", ...(ip ? { "x-forwarded-for": ip } : {}) };
  try {
    const res = action === "get"
      ? await fetch(`${base}?t=${encodeURIComponent(token)}`, { cache: "no-store", headers })
      : await fetch(base, { method: "POST", cache: "no-store", headers, body: JSON.stringify({ t: token, action, ...(body ?? {}) }) });
    const out = (await res.json().catch(() => null)) as { ok?: boolean; data?: unknown[] } | null;
    return { status: res.status, ok: res.ok && !!out?.ok, data: out?.data?.[0] ?? null };
  } catch {
    return { status: 503, ok: false, data: null };
  }
}

export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/);

const sharedSchema = z.object({
  funnel: z.object({ id: z.string(), name: z.string(), description: z.string(), status: z.string(), graph: z.unknown(), settings: z.unknown(), updated_at: z.string() }),
  client: z.object({ name: z.string(), business_name: z.string().nullable(), logo_url: z.string().nullable().default(null) }),
  agency: z.object({ name: z.string().nullable(), logo_url: z.string().nullable().default(null) }),
  link: z.object({ can_edit: z.boolean(), hide_numbers: z.boolean(), allow_comments: z.boolean(), expires_at: z.string().nullable() }),
  comments: z.array(z.object({ id: z.string(), node_id: z.string().nullable(), author_name: z.string(), body: z.string(), resolved: z.boolean(), created_at: z.string() })),
});
export type SharedFunnel = z.infer<typeof sharedSchema>;

/** Resolve a share token (checks existence + expiry in the DB). Returns null when invalid. */
export async function getShared(token: string) {
  if (!tokenSchema.safeParse(token).success) return null;
  const r = await sharePublic("get", token);
  const data = r.data;
  if (!r.ok || !data) return null;
  const p = sharedSchema.safeParse(data);
  if (!p.success) return null;
  const d = p.data;
  let graph = parseGraph(d.funnel.graph);
  let settings = parseSettings(d.funnel.settings);
  // funnel notes are internal unless shared on purpose (the RPC already strips them; never trust that alone)
  if (!settings.notes.shared) settings = { ...settings, notes: { body: "", shared: false } };
  if (d.link.hide_numbers || settings.hideNumbers) {
    // Numbers hidden: never send prices, rates or costs to the browser, only the journey.
    graph = { ...graph, nodes: graph.nodes.map((n) => (isAnnot(n.type) ? n : { ...n, p: {} })) };
    settings = { ...settings, fixed: 0, target: 0, expenses: [], scenarios: [], goals: [], whatif: { traffic: 1, conv: 1, price: 1, cost: 1 }, hideNumbers: true };
    d.link.hide_numbers = true;
  }
  return { ...d, graph, settings };
}
