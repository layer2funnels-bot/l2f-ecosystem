import "server-only";
import { eco, ecoRows } from "./server";

/**
 * Server helpers that return Funnel Mapper's records in the shapes its screens already use, from the ecosystem API.
 * Field mapping: client/funnel `deleted_at` = Funnel Mapper's trash (`trashed_at`); `logo_path` / `thumbnail_url` hold storage paths and
 * `logo_url` is a short-lived (1 hour) address for showing the client logo.
 */
export type EcoClient = {
  id: string; name: string; business_name: string; niche: string; email: string; phone: string; website: string; country: string; currency: string;
  status: string; tags: string[]; monthly_retainer: number; pricing_model: string; pricing_amount: number; billing_frequency: string; hours_per_month: number;
  commission_pct: number; project_start: string | null; project_end: string | null; pricing_notes: string; notes: string; logo_path: string | null; logo_url: string | null;
  archived_at: string | null; deleted_at: string | null; created_at: string; updated_at: string;
};
export type EcoFunnel = {
  id: string; client_id: string; name: string; description: string; status: string; summary: Record<string, unknown>; settings: Record<string, unknown>;
  graph?: unknown; thumbnail_url: string | null; created_at: string; updated_at: string; deleted_at: string | null;
};

type RawClient = Omit<EcoClient, "logo_url" | "deleted_at"> & { trashed_at: string | null };
const num = (v: unknown) => (v == null ? 0 : Number(v));
const toClient = (c: RawClient): EcoClient => ({
  ...c, monthly_retainer: num(c.monthly_retainer), pricing_amount: num(c.pricing_amount), hours_per_month: num(c.hours_per_month), commission_pct: num(c.commission_pct),
  logo_url: null, deleted_at: c.trashed_at, updated_at: c.updated_at ?? c.created_at,
});
type RawFunnel = Omit<EcoFunnel, "thumbnail_url" | "deleted_at"> & { thumbnail_path: string | null; trashed_at: string | null };
const toFunnel = (f: RawFunnel): EcoFunnel => ({ ...f, thumbnail_url: f.thumbnail_path, deleted_at: f.trashed_at });

/** Clients Funnel Mapper may show: not in its trash unless asked; `archived` filters the Clients-app archive. */
/** Short-lived addresses for stored Funnel Mapper images, by path (paths the person may not see are left out). */
export async function signPaths(paths: (string | null | undefined)[]): Promise<Record<string, string>> {
  const todo = [...new Set(paths.filter((p): p is string => !!p && !/^(https?:|data:)/.test(p)))];
  const out: Record<string, string> = {};
  for (let i = 0; i < todo.length; i += 100) {
    const r = await eco<{ path: string; url: string }>("fmp.files.url", { paths: todo.slice(i, i + 100) });
    if (r.ok) for (const x of r.data) out[x.path] = x.url;
  }
  return out;
}
async function withLogos(list: EcoClient[]): Promise<EcoClient[]> {
  const urls = await signPaths(list.map((c) => c.logo_path));
  return list.map((c) => ({ ...c, logo_url: c.logo_path ? (/^(https?:|data:)/.test(c.logo_path) ? c.logo_path : urls[c.logo_path] ?? null) : null }));
}
export async function listClients(opts: { trashed?: boolean; archived?: boolean } = {}) {
  return withLogos((await ecoRows<RawClient>("fmp.clients.full", { ...(opts.trashed ? { trashed: true } : {}), ...(opts.archived !== undefined ? { archived: opts.archived } : {}) })).map(toClient));
}
export async function getClient(id: string): Promise<EcoClient | null> {
  const r = await eco<RawClient>("fmp.clients.full", { id });
  return r.ok && r.data[0] ? (await withLogos([toClient(r.data[0])]))[0] : null;
}
export async function listFunnels(opts: { client?: string; trashed?: boolean; ids?: string[]; withGraph?: boolean } = {}) {
  if (opts.ids && !opts.ids.length) return [];
  return (await ecoRows<RawFunnel>("fmp.funnels.list", { ...(opts.client ? { client: opts.client } : {}), ...(opts.trashed ? { trashed: true } : {}),
    ...(opts.ids ? { ids: opts.ids.slice(0, 500) } : {}), ...(opts.withGraph ? { with_graph: true } : {}) })).map(toFunnel);
}
export async function getFunnel(id: string): Promise<EcoFunnel | null> {
  const r = await eco<RawFunnel>("fmp.funnels.get", { id });
  return r.ok && r.data[0] ? toFunnel(r.data[0]) : null;
}
export type EcoTemplate = { id: string; builtin_key: string | null; name: string; category: string; description: string; own: boolean; created_at: string; graph?: unknown; settings?: unknown };
export const listTemplates = (own?: boolean, withGraph?: boolean) => ecoRows<EcoTemplate>("fmp.templates.list", { ...(own !== undefined ? { own } : {}), ...(withGraph ? { with_graph: true } : {}) });
export type EcoProduct = { id: string; client_id: string | null; name: string; type: string; params: Record<string, unknown>; notes: string; created_at: string; updated_at: string };
export const listProducts = (client?: string) => ecoRows<EcoProduct>("fmp.products.list", client ? { client } : {});
export const listActuals = (funnels: string[]) => (funnels.length ? ecoRows<Record<string, unknown>>("fmp.actuals.list", { funnels: funnels.slice(0, 500) }) : Promise.resolve([]));
export const funnelCounts = async () => (await ecoRows<{ active: number; trashed: number; trashed_clients: number }>("fmp.funnels.counts"))[0] ?? { active: 0, trashed: 0, trashed_clients: 0 };
