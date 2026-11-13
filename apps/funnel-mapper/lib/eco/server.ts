import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { supabaseServer } from "@/lib/supabase/server";
import { ECO_API, ecoFetch, type EcoResult } from "./core";

export const ORG_COOKIE = "fm-org";
export type Org = { org_id: string; name: string; slug: string; role: "owner" | "admin" | "editor" | "viewer"; member_kind: string };

/** The signed-in person's token (ecosystem sign-in) or null. */
export const accessToken = cache(async (): Promise<string | null> => {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
});

/** The organization Funnel Mapper works in: the cookie's choice when it is one of the person's staff organizations, else the first one. */
export const currentOrg = cache(async (): Promise<{ org: Org | null; orgs: Org[] }> => {
  const token = await accessToken();
  if (!token) return { org: null, orgs: [] };
  const r = await ecoFetch<Org>(ECO_API(), "org.list", {}, token, null);
  const orgs = r.ok ? r.data.filter((o) => o.member_kind === "staff") : [];
  const want = (await cookies()).get(ORG_COOKIE)?.value;
  return { org: orgs.find((o) => o.org_id === want) ?? orgs.find((o) => o.slug === "layer2funnels") ?? orgs[0] ?? null, orgs };
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
