import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { SESSION_COOKIE, parseSession } from "./shared-session";
import { ECO_API, ecoFetch, type EcoResult } from "./core";

export type Org = { org_id: string; name: string; slug: string; role: "owner" | "admin" | "editor" | "viewer"; member_kind: string; is_active: boolean };
const RANK: Record<string, number> = { owner: 0, admin: 1, editor: 2, viewer: 3 };

/** The signed-in person's token from the ecosystem's shared session cookie (the proxy has renewed it if needed), or null. */
export const accessToken = cache(async (): Promise<string | null> => parseSession((await cookies()).get(SESSION_COOKIE)?.value)?.access ?? null);

/**
 * The organization Funnel Mapper works in: the one the ecosystem remembers as the person's current organization (the same for every
 * app; switching in any app switches it everywhere), else the same default the ecosystem web app uses (highest role, then name).
 */
export const currentOrg = cache(async (): Promise<{ org: Org | null; orgs: Org[]; failed?: string; failedCode?: string }> => {
  const token = await accessToken();
  if (!token) return { org: null, orgs: [] };
  const r = await ecoFetch<Org>(ECO_API(), "org.list", {}, token, null);
  // the list could not be loaded (busy, offline): say so, never "you have no access"
  if (!r.ok) return { org: null, orgs: [], failed: r.message, failedCode: r.code };
  const orgs = r.data.filter((o) => o.member_kind === "staff");
  const fallback = [...orgs].sort((a, b) => (RANK[a.role] ?? 9) - (RANK[b.role] ?? 9) || a.name.localeCompare(b.name))[0];
  return { org: orgs.find((o) => o.is_active) ?? fallback ?? null, orgs };
});

/** Calls one ecosystem operation as the signed-in person in the current organization. */
export async function eco<T = Record<string, unknown>>(op: string, input: unknown = {}): Promise<EcoResult<T>> {
  const token = await accessToken();
  if (!token) return { ok: false, status: 401, code: "session_expired", message: "Your session has ended. Sign in again." };
  const { org } = await currentOrg();
  return ecoFetch<T>(ECO_API(), op, input, token, org?.org_id ?? null);
}

/** Rows of a successful call, or throw (pages show their error state). */
export async function ecoRows<T = Record<string, unknown>>(op: string, input: unknown = {}): Promise<T[]> {
  const r = await eco<T>(op, input);
  if (!r.ok) throw new Error(r.message);
  return r.data;
}
