import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Database } from "./database.types";
import type { Role } from "../roles";

/** Server Supabase client bound to the request's auth cookies. */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there; proxy.ts refreshes the session instead.
        }
      },
    },
  });
}

export type Workspace = Database["public"]["Tables"]["workspaces"]["Row"];

export type WorkspaceOption = { id: string; name: string; kind: string; role: string };

/**
 * Current member, their profile, the workspace they're working in (the Layer2Funnels team workspace or another one
 * they belong to) and the workspaces they can switch to; or redirect to /login. Someone who is no longer an active
 * member of the workspace they were in is moved to another workspace they belong to, else signed out.
 * Cached per request. RLS scopes every query to the current workspace; `isTeam` only drives the UI.
 */
export const requireUser = cache(async () => {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const [{ data, error }, { data: memberships, error: mErr }] = await Promise.all([
    sb.from("profiles").select("*, workspace:workspaces!profiles_workspace_id_fkey(*)").eq("id", user.id).maybeSingle(),
    sb.from("workspace_members").select("workspace_id, role, active, workspace:workspaces(id, agency_name, kind)").eq("user_id", user.id).order("created_at"),
  ]);
  // a failed query (e.g. a migration not yet applied) is an error, not a removed member: never sign people out for it
  if (error || mErr) throw new Error(`Couldn't load your workspace: ${(error ?? mErr)!.message}`);
  if (!data) redirect("/auth/removed");
  const mine = (memberships ?? []).filter((m) => m.active && m.workspace);
  const current = mine.find((m) => m.workspace_id === data.workspace_id);
  const { workspace, ...profile } = data;
  if (!current || !workspace) {
    if (mine[0]) {
      await sb.rpc("switch_workspace", { p_workspace: mine[0].workspace_id });
      redirect("/");
    }
    redirect("/auth/removed");
  }
  const workspaces: WorkspaceOption[] = mine.map((m) => ({ id: m.workspace_id, name: m.workspace!.agency_name, kind: m.workspace!.kind, role: m.role }));
  // the role in the workspace being worked in (workspace_members.role; profiles.role is legacy)
  const role = current.role as Role;
  return {
    sb,
    user,
    profile,
    workspace,
    workspaces,
    role,
    /** Owner or admin: manages members and branding. */
    isAdmin: role === "owner" || role === "admin",
    isOwner: role === "owner",
    /** Everyone but viewers may change data (RLS enforces the same rule). */
    canEdit: role !== "viewer",
    isTeam: workspace.kind === "team",
  };
});
