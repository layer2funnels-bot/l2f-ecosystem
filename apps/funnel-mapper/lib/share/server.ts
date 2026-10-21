import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { isAnnot } from "@/lib/catalog";
import { parseGraph, parseSettings } from "@/lib/graph";
import type { Database } from "@/lib/supabase/database.types";

/** Anonymous Supabase client: share pages only ever call the token-checking RPCs. */
export const anonClient = () =>
  createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/);

const sharedSchema = z.object({
  funnel: z.object({ id: z.string(), name: z.string(), description: z.string(), status: z.string(), graph: z.unknown(), settings: z.unknown(), updated_at: z.string() }),
  client: z.object({ name: z.string(), business_name: z.string().nullable(), logo_url: z.string().nullable() }),
  agency: z.object({ name: z.string().nullable(), logo_url: z.string().nullable() }),
  link: z.object({ can_edit: z.boolean(), hide_numbers: z.boolean(), allow_comments: z.boolean(), expires_at: z.string().nullable() }),
  comments: z.array(z.object({ id: z.string(), node_id: z.string().nullable(), author_name: z.string(), body: z.string(), resolved: z.boolean(), created_at: z.string() })),
});
export type SharedFunnel = z.infer<typeof sharedSchema>;

/** Resolve a share token (checks existence + expiry in the DB). Returns null when invalid. */
export async function getShared(token: string) {
  if (!tokenSchema.safeParse(token).success) return null;
  const { data, error } = await anonClient().rpc("get_shared_funnel", { p_token: token });
  if (error || !data) return null;
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
