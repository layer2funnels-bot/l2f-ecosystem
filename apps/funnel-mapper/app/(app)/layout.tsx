import { EcoHeader } from "@/components/eco-header";
import { templateOptions } from "@/lib/queries";
import { roleLabel } from "@/lib/roles";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { sb, user, profile, workspace, workspaces, role, isTeam, isAdmin, canEdit } = await requireUser();
  // everything the shell needs, fetched at once (it used to be nine round trips one after another, on every visit)
  const [clients, templates, tc, tf, nr] = await Promise.all([
    // data for the header's "New funnel" (viewers can't create, so they skip the queries)
    canEdit ? sb.from("clients").select("id, name").is("archived_at", null).is("deleted_at", null).order("name").then((r) => r.data ?? []) : Promise.resolve([]),
    canEdit ? templateOptions(sb, isTeam ? "Team templates" : "Your templates") : Promise.resolve([]),
    // items in Trash (clients + funnels), for the count next to Trash in the menu
    sb.from("clients").select("id", { count: "exact", head: true }).not("deleted_at", "is", null),
    sb.from("funnels").select("id", { count: "exact", head: true }).not("deleted_at", "is", null),
    canEdit ? sb.from("clients").select("niche") : Promise.resolve({ data: [] as { niche: string }[] }),
  ]);
  const niches = [...new Set((nr.data ?? []).map((c) => c.niche).filter(Boolean))];
  return (
    <div className="min-h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-panel focus:px-3 focus:py-2">
        Skip to content
      </a>
      <EcoHeader
        org={workspace.agency_name || "Layer2Funnels"}
        workspaceId={workspace.id}
        workspaces={workspaces}
        canCreateWorkspace={isAdmin}
        team={isTeam}
        logo={workspace.agency_logo_url}
        user={profile.full_name || user.email || ""}
        email={user.email ?? ""}
        role={roleLabel(role)}
        launcherUrl={process.env.ECOSYSTEM_LAUNCHER_URL ?? ""}
        trash={(tc.count ?? 0) + (tf.count ?? 0)}
        canEdit={canEdit}
        clients={clients}
        templates={templates}
        defaultCurrency={workspace.default_currency}
        niches={niches}
      />
      <main id="main" className="mx-auto w-full max-w-[1400px] px-4 py-6 pb-24 sm:px-6 sm:pb-6 lg:px-10 lg:pt-7 lg:pb-10">
        {children}
      </main>
    </div>
  );
}
