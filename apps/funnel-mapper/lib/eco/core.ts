/**
 * Funnel Mapper ↔ ecosystem API (stage 2). Funnel Mapper signs in with the ecosystem account (Supabase Auth of the ecosystem project)
 * and reads and writes only through the ecosystem API operations (`fmp.*`, `clients.*`, `org.list`). Every call carries the person's
 * own access token and the organization they work in; the API and database decide what they may see and do (default deny).
 * Shared by the server (lib/eco/server.ts) and the browser relay (app/api/eco/[op]/route.ts).
 */
export type EcoResult<T> = { ok: true; data: T[] } | { ok: false; status: number; code: string; message: string; fields?: string[] };

/** Operations Funnel Mapper may relay from the browser. Everything else is refused before it leaves Funnel Mapper. */
/** The ecosystem API's marker for "no organization yet" (packages/core/api.mjs NO_ORG). */
export const NO_ORG = "00000000-0000-0000-0000-000000000000";

export const BROWSER_OPS = /^(fmp\.[a-z_.]+|org\.list)$/;

export async function ecoFetch<T = Record<string, unknown>>(base: string, op: string, input: unknown, token: string, orgId: string | null, timeoutMs = 15000): Promise<EcoResult<T>> {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/${op}`, {
      method: "POST", signal: ctl.signal, cache: "no-store",
      // calls made before an organization is chosen (org.list) carry the API's "no organization" marker
      headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-org-id": orgId ?? NO_ORG },
      body: JSON.stringify(input ?? {}),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; data?: T[]; error?: { code: string; message: string; fields?: string[] } } | null;
    if (res.ok && body?.ok) return { ok: true, data: body.data ?? [] };
    return { ok: false, status: res.status, code: body?.error?.code ?? "failed", message: body?.error?.message ?? "Something went wrong. Nothing was changed.", fields: body?.error?.fields };
  } catch {
    return { ok: false, status: 0, code: "unavailable", message: "The service could not be reached. Try again in a minute." };
  } finally { clearTimeout(timer); }
}

export const ECO_API = () => process.env.ECOSYSTEM_API_URL || process.env.NEXT_PUBLIC_ECOSYSTEM_API_URL || "";
