import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "../roles";
import { currentOrg, eco, ecoRows, accessToken } from "../eco/server";
import { signInUrl, tokenClaims } from "../eco/shared-session";

/** Back to the ecosystem sign-in (one sign-in for every app), returning to Funnel Mapper afterwards. */
function toSignIn(): never {
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  redirect(signInUrl(`${site}/`) ?? "/unavailable");
}

/** Funnel Mapper's view of the organization it works in (the ecosystem organization; default currency is Funnel Mapper's own setting). */
export type Workspace = { id: string; agency_name: string; agency_logo_url: string | null; default_currency: string; kind: "team"; slug: string };
export type WorkspaceOption = { id: string; name: string; slug: string; kind: string; role: string };
export type Profile = { id: string; full_name: string; email: string };

/**
 * The signed-in person (ecosystem account, one sign-in for every app), the organization they work in and the ones they can switch to;
 * or the ecosystem sign-in page.
 * When Funnel Mapper is not available to them in this organization, /unavailable explains why (no data is shown).
 * The role here only shapes the interface: every read and write is decided by the ecosystem API and database.
 */
export const requireUser = cache(async () => {
  const token = await accessToken();
  if (!token) toSignIn();
  const claims = tokenClaims(token);
  const { org, orgs, failed, failedCode } = await currentOrg();
  if (failedCode === "session_expired") toSignIn();
  if (failed) throw new Error(failed);   // the page's error state with "Try again"; nothing is shown from a guess
  if (!org) redirect("/unavailable");
  // Funnel Mapper not switched on here (or not in this person's access): the API answers "not found" or nothing; show /unavailable
  const st = await eco<{ id: string; name: string; slug: string; default_currency: string; is_admin: boolean }>("fmp.settings.get");
  if (!st.ok && st.code === "session_expired") toSignIn();
  if (!st.ok && st.code !== "not_found" && st.code !== "forbidden") throw new Error(st.message);   // busy or offline, not "no access"
  const settings = st.ok ? st.data[0] : undefined;
  if (!settings) redirect("/unavailable");
  const me = (await ecoRows<{ id: string; display_name: string; email: string }>("profile.get"))[0];
  const role = org.role as Role;
  const workspace: Workspace = { id: org.org_id, agency_name: org.name, agency_logo_url: null, default_currency: settings.default_currency, kind: "team", slug: org.slug };
  const user = { id: me?.id || claims.sub || "", email: me?.email || claims.email || "" };
  const profile: Profile = { id: user.id, full_name: me?.display_name || "", email: user.email };
  const workspaces: WorkspaceOption[] = orgs.map((o) => ({ id: o.org_id, name: o.name, slug: o.slug, kind: "team", role: o.role }));
  return {
    user,
    profile,
    workspace,
    workspaces,
    role,
    /** Owner or admin: manages organization settings. */
    isAdmin: role === "owner" || role === "admin",
    isOwner: role === "owner",
    /** Everyone but viewers may change data (the database enforces the same rule). */
    canEdit: role !== "viewer",
    isTeam: true,
  };
});
