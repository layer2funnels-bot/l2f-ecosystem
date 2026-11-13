import { AppNav } from "@/components/app-nav";
import { ThemeSync } from "@/components/theme-toggle";
import { TopStrip } from "@/components/top-strip";
import { templateOptions } from "@/lib/queries";
import { roleLabel } from "@/lib/roles";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { sb, user, profile, workspace, workspaces, role, isTeam, isAdmin, canEdit } = await requireUser();
  // everything the shell needs, fetched at once (it used to be nine round trips one after another, on every visit)
  const live = (t: "clients" | "funnels") => sb.from(t).select("id", { count: "exact", head: true });
  const [clients, templates, tc, tf, nr, pin, nClients, nFunnels] = await Promise.all([
    // data for the top strip's "New funnel" (viewers can't create, so they skip the queries)
    canEdit ? sb.from("clients").select("id, name").is("archived_at", null).is("deleted_at", null).order("name").then((r) => r.data ?? []) : Promise.resolve([]),
    canEdit ? templateOptions(sb, isTeam ? "Team templates" : "Your templates") : Promise.resolve([]),
    // items in Trash (clients + funnels), for the count next to Trash in the menu
    sb.from("clients").select("id", { count: "exact", head: true }).not("deleted_at", "is", null),
    sb.from("funnels").select("id", { count: "exact", head: true }).not("deleted_at", "is", null),
    canEdit ? sb.from("clients").select("niche") : Promise.resolve({ data: [] as { niche: string }[] }),
    // pinned clients in the sidebar: the first few that are in play
    sb.from("clients").select("id, name, status").is("archived_at", null).is("deleted_at", null).in("status", ["active", "proposal", "lead"]).order("name").limit(3),
    live("clients").is("archived_at", null).is("deleted_at", null),
    live("funnels").is("deleted_at", null).neq("status", "archived"),
  ]);
  const niches = [...new Set((nr.data ?? []).map((c) => c.niche).filter(Boolean))];
  return (
    <div className="min-h-full lg:flex">
      <ThemeSync saved={user.user_metadata?.theme === "light" || user.user_metadata?.theme === "dark" ? user.user_metadata.theme : null} at={Number(user.user_metadata?.theme_at) || 0} />
      <AppNav agency={workspace.agency_name || "Layer2Funnels"} user={profile.full_name || user.email || ""} role={roleLabel(role)} logo={workspace.agency_logo_url} team={isTeam} workspaceId={workspace.id} workspaces={workspaces} canCreate={isAdmin} trash={(tc.count ?? 0) + (tf.count ?? 0)} pinned={pin.data ?? []} counts={{ "/clients": nClients.count ?? 0, "/funnels": nFunnels.count ?? 0 }} />
      <div className="min-w-0 flex-1">
        <TopStrip canEdit={canEdit} clients={clients} templates={templates} defaultCurrency={workspace.default_currency} niches={niches} />
        <main id="main" className="px-4 py-6 pb-24 sm:px-6 sm:pb-6 lg:px-10 lg:pt-7 lg:pb-10">
          {children}
        </main>
      </div>
    </div>
  );
}
