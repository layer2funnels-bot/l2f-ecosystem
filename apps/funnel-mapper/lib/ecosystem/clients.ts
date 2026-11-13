/**
 * Shared clients (Design V7 03 §3, docs/implementation/FUNNEL_MAPPER_PLAN.md): Funnel Mapper reads and creates clients through the
 * ecosystem Client service (operations `fmp.clients.*` in packages/core/fmp-operations.mjs), so a client made here appears in the
 * Clients app and the other way round.
 *
 * Since stage 2 this is always the path (Funnel Mapper signs in with the ecosystem). Every read and write is authorised by the
 * ecosystem API and database for the signed-in person (app access, client scope, organization).
 *
 * Duplicates are never linked automatically. The service answers "needs_decision" with candidates; the person chooses
 * "link" (to one candidate) or "new". If the service cannot be reached nothing is created locally ("never a local-only client").
 */
export type SharedClient = { id: string; name: string; email: string | null; business_name: string | null; status: string | null; match?: "email_exact" | "name" | "business_name" };
export type CreateOutcome =
  | { kind: "created" | "linked"; client: SharedClient }
  | { kind: "needs_decision"; reason: "email_exact" | "ambiguous" | "possible_duplicate" | "choose_client"; candidates: SharedClient[] }
  | { kind: "denied" }
  | { kind: "unavailable"; message: string };
export type CreateInput = { name: string; email?: string | null; business_name?: string | null; status?: string | null; decision?: "new" | "link"; link_to?: string | null };
export type ServiceConfig = { url: string; token: string; orgId: string; fetchImpl?: typeof fetch; timeoutMs?: number };


const UNAVAILABLE = "The Clients app could not be reached, so nothing was saved. Try again in a minute.";

async function call<T>(cfg: ServiceConfig, operation: string, input: Record<string, unknown>): Promise<{ ok: true; data: T[] } | { ok: false; status: number }> {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), cfg.timeoutMs ?? 10000);
  try {
    const res = await (cfg.fetchImpl ?? fetch)(`${cfg.url.replace(/\/$/, "")}/api/${operation}`, {
      method: "POST", signal: ctl.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.token}`, "x-org-id": cfg.orgId },
      body: JSON.stringify(input),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const body = (await res.json()) as { ok?: boolean; data?: T[] };
    return body?.ok === false ? { ok: false, status: 500 } : { ok: true, data: body?.data ?? [] };
  } catch {
    return { ok: false, status: 0 };
  } finally { clearTimeout(timer); }
}

/** Creates (or links) a client in the shared list. Never retries a "create" on its own (a retry could make a second client). */
export async function createSharedClient(cfg: ServiceConfig, input: CreateInput): Promise<CreateOutcome> {
  const body: Record<string, unknown> = { name: input.name.trim() };
  for (const k of ["email", "business_name", "status", "decision", "link_to"] as const) { const v = input[k]; if (v) body[k] = typeof v === "string" ? v.trim() : v; }
  const r = await call<{ outcome: string; client?: SharedClient; reason?: string; candidates?: SharedClient[] }>(cfg, "fmp.clients.create", body);
  if (!r.ok) return r.status === 0 || r.status >= 500 || r.status === 429 ? { kind: "unavailable", message: UNAVAILABLE } : { kind: "denied" };
  const row = r.data[0];
  if (!row) return { kind: "denied" };   // the API answers "not found" for anything the person may not do
  if ((row.outcome === "created" || row.outcome === "linked") && row.client) return { kind: row.outcome, client: row.client };
  if (row.outcome === "needs_decision") return { kind: "needs_decision", reason: (row.reason ?? "possible_duplicate") as "email_exact", candidates: row.candidates ?? [] };
  return { kind: "unavailable", message: UNAVAILABLE };
}

/** The shared list (same rows as the Clients app). An empty list on failure is reported as unavailable, never as "no clients". */
export async function listSharedClients(cfg: ServiceConfig, opts: { archived?: boolean; q?: string } = {}): Promise<{ ok: true; clients: SharedClient[] } | { ok: false; message: string }> {
  const r = await call<SharedClient>(cfg, "fmp.clients.list", { ...(opts.archived ? { archived: true } : {}), ...(opts.q ? { q: opts.q } : {}) });
  return r.ok ? { ok: true, clients: r.data } : { ok: false, message: "The shared client list could not be loaded. Showing nothing new; try again in a minute." };
}

/** Plain-language prompt for the "needs decision" step. */
export function decisionMessage(o: Extract<CreateOutcome, { kind: "needs_decision" }>): string {
  if (o.reason === "ambiguous") return "Several clients already use this e-mail address. Choose the right one, or create a new client.";
  if (o.reason === "email_exact") return "A client with this e-mail address already exists. Link to it, or create a new client.";
  if (o.reason === "choose_client") return "Choose the client to link to.";
  return "A client with a similar name already exists. Check it before you create a new one.";
}
